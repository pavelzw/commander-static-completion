import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './fixture.js';
import { generateCompletion } from '../dist/index.js';

const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
const fishQuote = s => "'" + s.replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'";
const executables = { zsh: process.env.TEST_ZSH ?? 'zsh', fish: process.env.TEST_FISH ?? 'fish' };

function complete(shell, words, cwd) {
  const script = generateCompletion(fixture(), { shell });
  let input;
  if (shell === 'fish') {
    const line = words.map((word, index) => index === words.length - 1 && word === '' ? '' : fishQuote(word)).join(' ');
    input = `${script}\nfunction mycli; echo 'CLI WAS INVOKED' >&2; end\nset -gx PATH /nonexistent\ncomplete -C ${fishQuote(line)}\n`;
  } else {
    // Test scanner output directly; the separate ZLE test covers native registration.
    const fn = script.match(/compdef (\w+)/)[1];
    input = `compdef() { :; }\n${script}\ncompadd() { shift; printf '%s\\n' "$@"; }\nmycli() { echo 'CLI WAS INVOKED' >&2; }\nPATH=/nonexistent\nwords=(${words.map(quote).join(' ')})\nCURRENT=${words.length}\nPREFIX=${quote(words.at(-1))}\n${fn}\n`;
  }
  const result = spawnSync(executables[shell], shell === 'fish' ? ['--no-config'] : ['-f'], { input, encoding: 'utf8', cwd });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return result.stdout.trimEnd().split('\n').filter(Boolean).map(line => line.split('\t')[0]);
}

for (const shell of ['zsh', 'fish']) {
  test(`${shell}: syntax and completion context`, () => {
    const script = generateCompletion(fixture(), { shell });
    const result = spawnSync(executables[shell], ['-n'], { input: script, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const cases = [
      [['mycli', 'remote', 'a'], ['add']],
      [['mycli', 'remote', 'add', '--u'], ['--url']],
      [['mycli', 'd', '--target', 'pr'], ['production']],
      [['mycli', 'deploy', '--target=pr'], ['--target=production']],
      [['mycli', 'deploy', '-vtpr'], ['-vtproduction']],
      [['mycli', 'deploy', '--target', 'remote', 'e'], ['eu']],
      [['mycli', 'deploy', '--color', 'r'], ['red']],
      [['mycli', 'deploy', '--color', '--t'], ['--target', '--tags']],
      [['mycli', 'deploy', '--tags', 'one', 't'], ['two']],
      [['mycli', 'deploy', '--tags=one', 't'], ['two']],
      [['mycli', 'deploy', '--', '--'], []],
      [['mycli', 'deploy', '--', 'e'], ['eu']],
      [['mycli', '--', 'd'], []],
      [['mycli', '--secret', 'h'], ['hidden-value']],
    ];
    for (const [words, expected] of cases) {
      assert.deepEqual(complete(shell, words).sort(), expected.sort(), words.join(' '));
    }
  });

  test(`${shell}: visibility and literal choices`, () => {
    const root = complete(shell, ['mycli', '']);
    assert.ok(root.includes('deploy'));
    assert.ok(root.includes('--help'));
    assert.ok(!root.includes('internal'));
    assert.ok(!root.includes('--secret'));
    assert.deepEqual(complete(shell, ['mycli', 'deploy', '--target', '']).sort(),
      ['dev', 'production', 'two words', "it's fine", '$(touch PWNED)', '`touch PWNED`'].sort());
  });
}

test('fish: native filesystem completions, including assignments', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'csc-fish-'));
  try {
    writeFileSync(join(cwd, 'two words.json'), '');
    mkdirSync(join(cwd, 'two directories'));
    assert.deepEqual(complete('fish', ['mycli', 'deploy', '--config', 'two'], cwd).sort(), ['two directories/', 'two words.json']);
    assert.deepEqual(complete('fish', ['mycli', 'deploy', '--config=two'], cwd).sort(), ['--config=two directories/', '--config=two words.json']);
  } finally { rmSync(cwd, { recursive: true }); }
});

test('zsh: native Tab insertion through ZLE, including file quoting', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'csc-zle-'));
  try {
    writeFileSync(join(cwd, 'two words.json'), '');
    const cases = [
      ['mycli deploy --target pr', 'mycli deploy --target production '],
      ['mycli deploy --target=pr', 'mycli deploy --target=production '],
      ['mycli deploy -vtpr', 'mycli deploy -vtproduction '],
      ['mycli deploy --config two', 'mycli deploy --config two\\ words.json '],
      ['mycli deploy --config=two', 'mycli deploy --config=two\\ words.json '],
    ];
    for (const [line, expected] of cases) {
      rmSync(join(cwd, 'result'), { force: true });
      const setup = `autoload -Uz compinit\ncompinit -D -u\n${generateCompletion(fixture(), { shell: 'zsh' })}\nmycli() { print -r -- 'CLI WAS INVOKED' > invoked; }\n_capture() { zle expand-or-complete; print -rn -- "$BUFFER" > result; print -r -- CSC_DONE; }\nzle -N _capture\nbindkey '^I' _capture\nprint -r -- CSC_READY\n`;
      writeFileSync(join(cwd, 'setup.zsh'), setup);
      const driver = `zmodload zsh/zpty\nzpty worker ${quote(executables.zsh)} -f -i\nzpty -r worker output '*CSC_PROMPT*'\nzpty -w -n worker ${quote('source ./setup.zsh\r')}\nzpty -r worker output '*CSC_READY*'\nzpty -w -n worker ${quote(line + '\t')}\nzpty -r worker output '*CSC_DONE*'\nprint -r -- "$output"\nzpty -d worker\n[[ -f result && ! -f invoked ]]\n`;
      const result = spawnSync(executables.zsh, ['-f'], { input: driver, encoding: 'utf8', cwd, timeout: 15000, env: { ...process.env, TERM: 'xterm', PS1: 'CSC_PROMPT> ' } });
      assert.equal(result.status, 0, `${line}: ${result.stderr} ${result.stdout}`);
      assert.equal(readFileSync(join(cwd, 'result'), 'utf8'), expected);
    }
  } finally { rmSync(cwd, { recursive: true }); }
});
