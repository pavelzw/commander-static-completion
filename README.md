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

`enablePositionalOptions()` limits a command's options to the words before its
subcommand. `passThroughOptions()` stops interpreting options at the first
command argument. The scanners process parent options before child options,
matching Commander's parsing order even when option names overlap.

Negative numbers are accepted as optional/variadic values unless a digit is used
as a short option in the command hierarchy. Attached variadic values such as
`--tags=one` do not consume subsequent words. `--` ends option parsing, while
command names that follow it can still select a subcommand, as in Commander.

The generators currently reject default subcommands,
`combineFlagAndOptionalValue(false)`, and executable subcommands.
Supply ordinary in-process subcommand definitions for generation instead.
These checks use a small isolated Commander compatibility adapter.

Implicit `help` suggests one immediate subcommand, including aliases. Use
`mycli remote help add` for a nested command; Commander does not interpret
`mycli help remote add` as a nested help path. Custom help overrides can affect
visible suggestions. Custom argument
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
npm run validate
node examples/generate.js bash > /tmp/mycli.bash
node examples/generate.js zsh > /tmp/mycli.zsh
node examples/generate.js fish > /tmp/mycli.fish
```

`npm run build` emits JavaScript, declarations, and source maps into `dist/`.
The build cleans `dist/` first, so removed modules cannot survive into the package.
`npm run check` checks library source, tooling, and public API type tests.
`npm pack` builds automatically. The JavaScript examples and tests use the
compiled library.

`npm run validate` runs all checks in the same order as CI:

- `npm run lint`: Oxlint over TypeScript, tests, tooling, and examples; warnings fail.
- `npm run check`: strict TypeScript checks.
- `npm test`: build and shell behavior tests.
- `npm run test:package`: build a tarball and install it in a temporary consumer.
  Check ESM/CommonJS imports, all generators, published types in both module
  formats, package contents, and source/declaration maps. This also seeds stale
  build files to verify that packing removes them. It needs npm registry access
  to install the Commander version under test and cleans up afterward.

Tests use `/bin/bash`, plus Zsh and Fish on PATH. Set `TEST_BASH`, `TEST_ZSH`, or
`TEST_FISH` to override their executable paths. Tests cover generated shell syntax, command context,
quoting, choices, and filesystem hints. Scanner tests disable external commands
and provide a CLI stub that reports any invocation. Fish tests use `complete -C`;
Zsh also has an interactive ZLE test for actual Tab insertion. A shared behavior
matrix runs in all three shells. A second matrix instruments fresh Commander
definitions with probe value parsers and compares the declaration receiving the
next token with the shell's suggestions. These probes test value ownership and
parsing boundaries; they intentionally replace value-validation callbacks and
do not establish equivalence for every possible CLI definition or input.

GitHub Actions runs validation on Linux and macOS with Commander 14 and 15,
Node 22.12.0, Node 24, and current Node. The matrix includes Bash 3.2 and 5.x,
Zsh 5.9+, an exact Fish 4.0.0 source build, and current Fish 4+ packages. Every
job checks its shell versions before testing. CI runs on pull requests, pushes
to `main`, and manual dispatch; it does not publish to npm.

The internal pipeline separates typed Commander extraction from rendering.
Bash and Zsh share a scanner with shell-specific completion output; Fish has a
native scanner over the same model. All generator code and embedded shell
templates live in TypeScript under `src/`.
