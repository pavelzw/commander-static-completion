import { Command, Option } from 'commander';
import { completionHint } from '../src/index.js';

export const program = new Command('mycli').description('Example deployment CLI');
program.command('deploy')
  .addOption(new Option('-t, --target <target>').choices(['dev', 'staging', 'production']))
  .addOption(completionHint(new Option('--config <path>'), { kind: 'file' }));
