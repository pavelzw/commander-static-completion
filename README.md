# commander-static-completion

Generate standalone shell completions from an existing Commander command tree.
Node runs once during generation. Tab completion runs entirely in the shell,
without invoking your CLI or Node.

The initial release supports **Bash 3.2+**, Commander 14/15, and Node 22.12+.
Zsh and Fish generators are planned.

## Usage

```js
// cli-definition.js — configure commands without calling parse().
import { Command, Option } from 'commander';
import { completionHint } from 'commander-static-completion';

export const program = new Command('mycli');
program.command('deploy')
  .addOption(new Option('-t, --target <target>').choices(['dev', 'production']))
  .addOption(completionHint(new Option('--config <path>'), { kind: 'file' }));
```

```js
// generate-completion.js
import { generateCompletion } from 'commander-static-completion';
import { program } from './cli-definition.js';

process.stdout.write(generateCompletion(program, {
  shell: 'bash',
  executable: 'mycli', // defaults to program.name()
}));
```

```sh
node generate-completion.js > mycli.bash
source ./mycli.bash
```

Then `mycli deploy --target <Tab>` suggests `dev` and `production`.
Source the generated file from your Bash startup configuration to persist it.
Package authors can ship this file alongside the CLI. Regenerate it whenever
the command definition changes.

The normal CLI entry point can import `program` and call `program.parse()`.
Generation never parses arguments or invokes action handlers. Defining the
command tree should itself avoid application startup side effects.

## Static hints

`completionHint(optionOrArgument, hint)` returns the same Commander object and
stores metadata separately, without altering parsing. Supported hints:

- `{ kind: 'file' }`: shell filesystem completion.
- `{ kind: 'directory' }`: directories only.
- `{ kind: 'choices', values: ['one', 'two'] }`: fixed suggestions.
- `{ kind: 'none' }`: suppress value suggestions.

Commander `.choices()` is used automatically unless a hint overrides it.
Unannotated values have no suggestions. Hints also work with `Argument` objects.
File completion examines the filesystem at Tab time using Bash builtins.

## Supported behavior and limits

Nested commands, aliases, parent options, hidden entries, help/version flags,
negated flags, positional choices, optional and variadic values, short flag
clusters, attached values, `--option=value`, and `--` are supported. Hidden
entries are recognized when typed explicitly but are not suggested. Suggestions
preserve definition order; options remain available after being used.

This first release rejects positional-option mode, pass-through mode, default
subcommands, `combineFlagAndOptionalValue(false)`, and executable subcommands.
Supply ordinary in-process subcommand definitions for generation instead.
These checks use a small isolated Commander compatibility adapter.

Implicit `help` suggests immediate subcommands; nested help paths are not yet
modeled. Custom help overrides can affect visible suggestions. Custom argument
parsers, option conflicts/implied values, and runtime plugin discovery are not
interpreted. The scanner offers completion on incomplete input and is not a
replacement for Commander validation. Filenames containing newlines and unusual
custom Bash word-break configurations are not covered in this release.

## Development

```sh
npm ci
npm test
npm run check
node examples/generate.js > /tmp/mycli.bash
```

Tests execute generated completion functions in Bash with external commands
unavailable and a CLI stub that reports any invocation. They cover shell syntax,
context selection, quoting, choices, and filesystem hints. The internal pipeline
separates Commander extraction from Bash rendering so other shells can reuse
the command model.
