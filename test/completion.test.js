import { complete as completeShell } from './helpers.js';
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

const complete = (program, words, options) => completeShell('bash', program, words, options);

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
    new Command('csc-test-cli').combineFlagAndOptionalValue(false),
    new Command('csc-test-cli').command('external', 'External executable'),
  ]) assert.throws(() => generateCompletion(program, { shell: 'bash' }), /support|requires|definition/);
  assert.throws(() => generateCompletion(fixture(), { shell: 'powershell' }), /Unsupported shell/);
  assert.throws(() => generateCompletion(fixture(), { shell: 'bash', executable: '' }), /executable/);
  assert.throws(() => completionHint(new Option('--foo'), { kind: 'choices', values: [1] }), /strings/);
});
