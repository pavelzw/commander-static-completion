import { fixture } from './fixture.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command, Option, Argument } from 'commander';
import { completionHint, generateCompletion } from '../dist/index.js';

const bash = process.env.TEST_BASH ?? '/bin/bash';
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";

function complete(program, words, { cwd, breaks = ' \t\n"\'@><=;|&(:' } = {}) {
  const script = generateCompletion(program, { shell: 'bash' });
  const fn = script.match(/complete -F (\w+)/)[1];
  const result = spawnSync(bash, ['--noprofile', '--norc'], {
    cwd,
    input: `${script}\ncsc-test-cli() { echo 'CLI WAS INVOKED' >&2; return 99; }\nPATH=/nonexistent\nCOMP_WORDS=(${words.map(quote).join(' ')})\nCOMP_CWORD=${words.length - 1}\nCOMP_WORDBREAKS=${quote(breaks)}\n${fn}\nif ((${ '${#COMPREPLY[@]}' })); then printf '%s\\0' "${ '${COMPREPLY[@]}' }"; fi\n`,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return result.stdout.split('\0').filter(Boolean);
}

test('root suggestions include visible commands, aliases, help and version', () => {
  const actual = complete(fixture(), ['csc-test-cli', '']);
  for (const word of ['deploy', 'd', 'remote', 'help', '--help', '--version']) assert.ok(actual.includes(word), word);
  assert.ok(!actual.includes('internal'));
  assert.ok(!actual.includes('--secret'));
});

test('nested command context and parent options', () => {
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'remote', 'a']), ['add']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'remote', 'add', '--u']), ['--url']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'd', '--v']), ['--version', '--verbose']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '--no']), ['--no-cache']);
});

test('option values, aliases, assignments and Bash word breaks', () => {
  for (const words of [
    ['csc-test-cli', 'deploy', '--target', 'pr'],
    ['csc-test-cli', 'd', '-t', 'pr'],
    ['csc-test-cli', 'deploy', '--target', '=', 'pr'],
  ]) assert.deepEqual(complete(fixture(), words), ['production']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '--target=pr']), ['--target=production']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '-tpr']), ['-tproduction']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '-vtpr']), ['-vtproduction']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', '--secret', 'h']), ['hidden-value']);
});

test('consumed values do not change command or positional context', () => {
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '--target', 'remote', 'e']), ['eu']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '-vtdev', 'e']), ['eu']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '--target=dev', 'e']), ['eu']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', 'eu', 'u']), []);
});

test('optional and variadic values stop at options', () => {
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '--color', 'r']), ['red']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '--color', '--t']), ['--target', '--tags']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '--tags', 'one', 't']), ['two']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '--tags=one', 't']), ['two']);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '--tags', 'one', '--no']), ['--no-cache']);
});

test('-- disables option and subcommand suggestions', () => {
  assert.deepEqual(complete(fixture(), ['csc-test-cli', '--', 'd']), []);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '--', '--']), []);
  assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '--', 'e']), ['eu']);
});

test('variadic positional choices remain available', () => {
  const program = new Command('csc-test-cli').addArgument(new Argument('[items...]').choices(['a', 'b']));
  assert.deepEqual(complete(program, ['csc-test-cli', 'a', 'b', 'a']), ['a']);
});

test('literal choices preserve spaces and shell metacharacters', () => {
  const actual = complete(fixture(), ['csc-test-cli', 'deploy', '--target', '']);
  assert.deepEqual(actual, ['dev', 'production', 'two words', "it's fine", '$(touch PWNED)', '`touch PWNED`']);
});

test('file and directory hints use the shell filesystem', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csc-'));
  try {
    writeFileSync(join(dir, 'two words.json'), '');
    assert.deepEqual(complete(fixture(), ['csc-test-cli', 'deploy', '--config', 'two'], { cwd: dir }), ['two words.json']);
    const program = new Command('csc-test-cli').addArgument(completionHint(new Argument('[dir]'), { kind: 'directory' }));
    assert.deepEqual(complete(program, ['csc-test-cli', 'two'], { cwd: dir }), []);
  } finally { rmSync(dir, { recursive: true }); }
});

test('generation is deterministic, syntactically valid, and does not parse', () => {
  const program = fixture().action(() => assert.fail('action ran'));
  const a = generateCompletion(program, { shell: 'bash' });
  assert.equal(generateCompletion(program, { shell: 'bash' }), a);
  assert.deepEqual(program.args, []);
  assert.equal(spawnSync(bash, ['-n'], { input: a }).status, 0);
});

test('unsupported configurations and invalid inputs produce diagnostics', () => {
  for (const program of [
    new Command('csc-test-cli').enablePositionalOptions(),
    new Command('csc-test-cli').combineFlagAndOptionalValue(false),
    new Command('csc-test-cli').command('external', 'External executable'),
  ]) assert.throws(() => generateCompletion(program, { shell: 'bash' }), /support|requires|definition/);
  assert.throws(() => generateCompletion(fixture(), { shell: 'powershell' }), /Unsupported shell/);
  assert.throws(() => generateCompletion(fixture(), { shell: 'bash', executable: '' }), /executable/);
  assert.throws(() => completionHint(new Option('--foo'), { kind: 'choices', values: [1] }), /strings/);
});
