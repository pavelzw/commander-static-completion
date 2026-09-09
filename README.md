# commander-static-completion

Generate standalone shell completions from an existing Commander command tree.
Node runs once during generation. Tab completion runs entirely in the shell,
without invoking your CLI or Node.

Supports **Bash 3.2+**, **Zsh 5.9+**, and **Fish 4+**, with Commander 14/15
and Node 22.12+. Library source is strict TypeScript; the package exports compiled
JavaScript and generated TypeScript declarations.

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

For Zsh, generate with `shell: 'zsh'` and source the result after initializing
the completion system in `.zshrc`:

```zsh
autoload -Uz compinit
compinit
source /path/to/mycli.zsh
```

For Fish, generate with `shell: 'fish'` and save the output as
`~/.config/fish/completions/mycli.fish` (or the `completions` directory beneath
your custom Fish configuration directory). Fish loads it automatically.

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
File completion examines the filesystem at Tab time using the shell's native
completion facilities.

## Supported behavior and limits

Nested commands, aliases, parent options, hidden entries, help/version flags,
negated flags, positional choices, optional and variadic values, short flag
clusters, attached values, `--option=value`, and `--` are supported. Hidden
entries are recognized when typed explicitly but are not suggested. Suggestions
preserve definition order; options remain available after being used.

The generators currently reject positional-option mode, pass-through mode, default
subcommands, `combineFlagAndOptionalValue(false)`, and executable subcommands.
Supply ordinary in-process subcommand definitions for generation instead.
These checks use a small isolated Commander compatibility adapter.

Implicit `help` suggests immediate subcommands; nested help paths are not yet
modeled. Custom help overrides can affect visible suggestions. Custom argument
parsers, option conflicts/implied values, and runtime plugin discovery are not
interpreted. The scanner offers completion on incomplete input and is not a
replacement for Commander validation. Descriptions are not yet displayed beside
suggestions. Filenames containing newlines and unusual custom Bash word-break
configurations are not covered. Fish rejects static completion strings containing
tabs or newlines because its candidate format uses those as delimiters. Fish
applies its own matching and ordering rules to candidates.

## Development

```sh
npm ci
npm run build
npm test
npm run check
node examples/generate.js bash > /tmp/mycli.bash
node examples/generate.js zsh > /tmp/mycli.zsh
node examples/generate.js fish > /tmp/mycli.fish
```

`npm run build` emits JavaScript, declarations, and source maps into `dist/`.
`npm run check` checks both library source and public API type tests. `npm pack`
builds automatically. The JavaScript examples and tests use the compiled library.

Tests require Bash, Zsh, and Fish on PATH. Set `TEST_ZSH` or `TEST_FISH` to override
their executable paths. Tests cover generated shell syntax, command context,
quoting, choices, and filesystem hints. Scanner tests disable external commands
and provide a CLI stub that reports any invocation. Fish tests use `complete -C`;
Zsh also has an interactive ZLE test for actual Tab insertion.

The internal pipeline separates typed Commander extraction from rendering.
Bash and Zsh share a scanner with shell-specific completion output; Fish has a
native scanner over the same model. All generator code and embedded shell
templates live in TypeScript under `src/`.
