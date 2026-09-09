import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackResult {
  filename: string;
  files: { path: string }[];
}

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'csc-package-'));
const npm = process.env.npm_execpath;
assert.ok(npm, 'Run this check with npm run test:package.');

function runNpm(args: string[], cwd: string): string {
  return execFileSync(process.execPath, [npm!, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 180_000,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

try {
  // npm pack must rebuild, even if dist contains output from deleted source files.
  mkdirSync(join(root, 'dist'), { recursive: true });
  for (const extension of ['js', 'd.ts', 'js.map', 'd.ts.map']) {
    writeFileSync(join(root, 'dist', `__stale.${extension}`), 'stale build output');
  }
  const [packed] = JSON.parse(runNpm(['pack', '--json', '--pack-destination', temporary], root)) as PackResult[];
  assert.ok(packed, 'npm pack did not return package metadata.');
  const files = new Set(packed.files.map(file => file.path));
  for (const required of ['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/index.d.ts', 'src/index.ts']) {
    assert.ok(files.has(required), `Missing packaged file: ${required}`);
  }
  for (const file of files) {
    assert.ok(!file.includes('__stale'), `Stale output was packaged: ${file}`);
    assert.ok(/^(dist\/|src\/.*\.ts$|package\.json$|README\.md$|LICENSE$)/u.test(file), `Unexpected packaged file: ${file}`);
    if (file.startsWith('dist/') && file.endsWith('.js')) {
      assert.ok(files.has(file.replace(/^dist\//u, 'src/').replace(/\.js$/u, '.ts')), `No TypeScript source for ${file}`);
    }
  }

  const consumer = join(temporary, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const commander = JSON.parse(readFileSync(join(root, 'node_modules/commander/package.json'), 'utf8')) as { version: string };
  // Install the exact Commander version under test instead of resolving a different peer version.
  runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temporary, packed.filename), `commander@${commander.version}`], consumer);
  cpSync(join(root, 'test/fixtures/package'), consumer, { recursive: true });

  const installed = join(consumer, 'node_modules/commander-static-completion');
  assert.ok(existsSync(join(installed, 'dist/index.js')));
  for (const file of files) {
    if (!file.endsWith('.map')) continue;
    const mapPath = join(installed, file);
    const map = JSON.parse(readFileSync(mapPath, 'utf8')) as { file: string; sourceRoot?: string; sources: string[] };
    assert.ok(existsSync(resolve(dirname(mapPath), map.file)), `Map points to missing output: ${file}`);
    assert.ok(map.sources.length > 0, `Map has no sources: ${file}`);
    for (const source of map.sources) {
      const resolved = resolve(dirname(mapPath), map.sourceRoot ?? '', source);
      const path = relative(installed, resolved);
      assert.ok(!path.startsWith(`..${sep}`) && path !== '..', `Map escapes the package: ${file}`);
      assert.ok(files.has(path.split(sep).join('/')), `Map source is not packaged: ${file} -> ${source}`);
      assert.ok(existsSync(resolved), `Missing map source: ${source}`);
    }
  }
  assert.ok(files.has('dist/index.js.map') && files.has('dist/index.d.ts.map'), 'JavaScript and declaration maps must be published.');

  for (const fixture of ['esm.mjs', 'commonjs.cjs']) {
    execFileSync(process.execPath, [fixture], { cwd: consumer, stdio: 'inherit', timeout: 30_000 });
  }
  // Resolve types from the installed package, using the project's pinned compiler.
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', 'api.mts', 'api.cts'], {
    cwd: consumer,
    stdio: 'inherit',
    timeout: 30_000,
  });
  console.log(`Package validation passed with Commander ${commander.version}: clean build, file list, ESM, CommonJS, types, and source maps.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
