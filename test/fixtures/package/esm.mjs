import assert from 'node:assert/strict';
import { Argument, Command, Option } from 'commander';
import { completionHint, generateCompletion } from 'commander-static-completion';

const program = new Command('package-smoke');
program.command('deploy')
  .addOption(new Option('--target <target>').choices(['production', 'staging']))
  .addArgument(completionHint(new Argument('[config]'), { kind: 'file' }));
for (const shell of ['bash', 'zsh', 'fish']) {
  const script = generateCompletion(program, { shell });
  assert.ok(script.includes('production') && script.includes('deploy'));
  assert.equal(generateCompletion(program, { shell }), script);
}
