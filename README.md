# commander-static-completion

Generate standalone shell completions from an existing Commander command tree.
Node runs once during generation. Tab completion runs entirely in the shell,
without invoking your CLI or Node.

Supports **Bash 3.2+**, **Zsh 5.9+**, and **Fish 4+**, with Commander 14/15
and Node 22.12+. Library source is strict TypeScript; the package exports compiled
JavaScript and generated TypeScript declarations.

## Installation and runnable example

After the initial release, install the package alongside Commander:

```sh
npm install commander commander-static-completion
```

Until then, build a tarball from this checkout with `npm ci` and
`npm pack`. In your CLI project, install that tarball alongside Commander:

```sh
npm install commander /absolute/path/to/commander-static-completion-0.1.0.tgz
```

Use `import { generateCompletion } from "commander-static-completion"` in ESM
or `const { generateCompletion } = require("commander-static-completion")` in
CommonJS on the supported Node versions. TypeScript declarations are included.

A minimal ESM generator (`generate.mjs`, or `.js` in a `"type": "module"` project):

```js
import { Command, Option } from "commander";
import { generateCompletion } from "commander-static-completion";

const program = new Command("mycli");
program.addOption(new Option("--target <name>").choices(["dev", "production"]));
process.stdout.write(generateCompletion(program, { shell: "bash" }));
```

The same API works from CommonJS (`generate.cjs`):

```js
const { Command, Option } = require("commander");
const { generateCompletion } = require("commander-static-completion");

const program = new Command("mycli");
program.addOption(new Option("--target <name>").choices(["dev", "production"]));
process.stdout.write(generateCompletion(program, { shell: "bash" }));
```

The installed-tarball checks exercise both import styles and all three generators.

The [runnable example and installation guide](https://github.com/pavelzw/commander-static-completion/blob/main/examples/README.md)
shows a `mycli completions <shell>` command, per-user installation in all three
shells, and build-time/package-manager distribution. Try it from this checkout:

```sh
npm ci
npm run build
node examples/cli.js completions bash > /tmp/mycli.bash
node examples/cli.js --token demo deploy --target staging
```

The completion route bypasses the example's required token and application hook;
normal application commands still enforce them.

## Usage

```js
// cli-definition.js — configure commands without calling parse().
import { Command, Option } from "commander";
import { completionHint } from "commander-static-completion";

export const program = new Command("mycli");
program
  .command("deploy")
  .addOption(new Option("-t, --target <target>").choices(["dev", "production"]))
  .addOption(completionHint(new Option("--config <path>"), { kind: "file" }));
```

```js
// generate-completion.js
import { generateCompletion } from "commander-static-completion";
import { program } from "./cli-definition.js";

process.stdout.write(
  generateCompletion(program, {
    shell: "bash",
    executable: "mycli", // defaults to program.name()
  }),
);
```

```sh
node generate-completion.js > mycli.bash
source ./mycli.bash
```

Then `mycli deploy --target <Tab>` suggests `dev` and `production`.
Source the generated file from your Bash startup configuration to persist it.
Package authors can ship this file alongside the CLI. Regenerate it whenever
the command definition changes.

For Zsh, generate with `shell: 'zsh'` and save the output as `_mycli` in a
completion directory. Add that directory to `fpath` **before** `compinit` in
`.zshrc`:

```zsh
fpath=("$HOME/.local/share/zsh/site-functions" $fpath)
autoload -Uz compinit
compinit
```

Zsh discovers the file's `#compdef` header and loads it on the first completion.
Use `_<executable>` as the filename when overriding the executable name. The same
output also supports `source /path/to/mycli.zsh` after `compinit`, if preferred.
See the [installation example](examples/README.md#zsh-installation) for commands
and existing shell-framework setup.

For Fish, generate with `shell: 'fish'` and save the output as
`~/.config/fish/completions/mycli.fish` (or the `completions` directory beneath
your custom Fish configuration directory). Fish loads it automatically.

Generated scripts own the exact registration for their executable. Sourcing one
replaces that registration, including a pre-existing completion from another
provider for the same name. Registrations for other executables are preserved.
Repeated sourcing is safe and does not accumulate Fish completion entries.
On Fish 4.0, native erase retains explicit wrapper relationships (`complete -w`)
and separate wildcard rules, so their suggestions can still apply. Remove those
explicitly when migrating away from a wrapping provider. Fish 4.8 removes the
target's wrappers on erase and treats `-c` names literally. Definitions for other
commands, including wrapper targets, remain unchanged on both versions.
After changing your command tree, regenerate and source the new script in an
existing shell; new shells load the updated installed file normally. Zsh caches
autoloaded functions, so merely overwriting an installed file does not refresh
an already loaded completion in the current shell.

Bash temporarily disables `nounset` and `nocasematch` while scanning, then restores
them even on early returns. Commander names remain case-sensitive. Other tested
settings include `extglob`, `nullglob`, `noglob`, custom `IFS`, and Zsh's
`SH_WORD_SPLIT`, `KSH_ARRAYS`, and `NO_UNSET`. Regex checks preserve the caller's
match variables. The shell's completion outputs (such as Bash's `COMPREPLY`)
remain part of its normal completion protocol.

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

Fish and Zsh display Commander descriptions beside command names, aliases, and
option flags. Static option and argument choices use their declaration's
description; descriptions never become part of the inserted value. Bash keeps
its existing suggestions without descriptions. Native filesystem suggestions
keep the shell's own display behavior.

Descriptions are plain single-line text: terminal formatting is removed and
whitespace/control characters are collapsed to spaces. Shell punctuation is
literal. Fish's native matching can also find suggestions by description text,
so its results can differ from Zsh's prefix matching. No additional API or
runtime CLI invocation is required.
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

Default subcommands (`{ isDefault: true }`) are supported, including aliases and
nested defaults. Before an operand selects a route, completions include explicit
subcommands plus the default command's options and argument hints. An explicit
command name takes priority once followed by a space; otherwise unmatched input
is passed to the default without consuming its first argument. Parent option
values still take precedence, and positional/pass-through settings determine
where the parent stops parsing.

`combineFlagAndOptionalValue(false)` is supported. An optional flag before
another short flag is treated as a boolean (`-ov`), while an optional flag at
the end can consume the next word (`-vo auto`). Required attached values
(`-orproduction`) and long assignments (`--optional=auto`) still work. Each
option retains its owning command's setting when inherited by a subcommand.

Executable subcommands require an explicit `completionDefinition()` (see below).
Legacy `*` fallback commands are rejected; use `{ isDefault: true }` for default
dispatch. These checks use a small isolated Commander compatibility adapter.

### Executable subcommands

Attach the standalone parser definition to Commander's executable declaration:

```ts
import { Command, Option } from "commander";
import { completionDefinition, generateCompletion } from "commander-static-completion";

const program = new Command("mycli").enablePositionalOptions();
program.command("deploy", "Deploy remotely", { executableFile: "mycli-deploy" });
// This overload returns the parent, not the new subcommand.
const external = program.commands[0].alias("d");
const deploy = new Command("mycli-deploy").addOption(
  new Option("--target <target>").choices(["staging", "production"]),
);
completionDefinition(external, deploy);
process.stdout.write(generateCompletion(program, { shell: "bash" }));
```

`completionDefinition(target, definition)` returns `target` and leaves its
executable dispatch unchanged. The declaration supplies its name, aliases,
visibility, description, and default-command status. The independent definition
supplies options, positional arguments, nested commands, help, and parser settings.
Its root name may differ from the dispatch name. An argument signature on the
executable declaration is display metadata; define the actual arguments on the
supplied parser. Options or child commands on the declaration are rejected as
conflicting definitions.

Definitions are read when generating, so finish configuring them before calling
`generateCompletion()`. A definition can be shared between declarations; calling
`completionDefinition()` again replaces its attachment. The supplied root must
remain unattached to any Commander parent. Missing definitions, invalid targets,
and cycles produce diagnostics, including in nested executable subcommands.
Generation never imports executable paths, scrapes help, calls `parse()`, or runs
actions. Share a side-effect-free definition factory with the executable to keep
its parser and completions in sync.

Use `enablePositionalOptions()` on the parent to give the external parser its own
option scope. Without it, parent options remain active, as in Commander. Active
ancestor digit flags such as `-1` across an executable boundary are diagnosed:
the independent parsers disagree about negative-number values, which the current
scanner cannot represent. Positional option boundaries avoid this ambiguity.
Custom argument rewriting by a launcher still cannot be inferred.

The runnable TypeScript example in [`examples/executable/`](examples/executable/)
shares a definition factory between the child executable and completion builder:

```sh
npm run build
npx tsx examples/executable/cli.ts d --target production
npx tsx examples/executable/cli.ts completions bash > mycli.bash
```

Implicit `help` suggests one immediate subcommand, including aliases. Use
`mycli remote help add` for a nested command; Commander does not interpret
`mycli help remote add` as a nested help path. Custom help overrides can affect
visible suggestions. The help visibility callbacks must return registered
commands/options or Commander's built-in help entries; presentation-only
invented definitions produce a diagnostic. See the
[Commander compatibility audit](docs/commander-compatibility.md) for supported
settings, help behavior, and the private adapter.

Custom argument parsers, option conflicts/implied values, and runtime plugin discovery are not
interpreted. The scanner offers completion on incomplete input and is not a
replacement for Commander validation.

Insertable command names, aliases, flags, and choice values must be nonempty and
contain no C0/C1 control characters (including NUL, tabs, newlines, and DEL).
Generation rejects invalid text with a diagnostic identifying the definition.
An empty choice list (`.choices([])` or a `choices` hint with `values: []`) is
valid and supplies no values; an empty string inside a list is rejected.
Descriptions keep their existing sanitization. Executable names additionally
cannot contain whitespace, as Zsh's `#compdef` header separates names with it.
Fish diagnoses tabs and newlines explicitly because they delimit completion records.
Runtime filenames containing control characters are outside the supported path
coverage; the static-text validation cannot inspect filesystem candidates.
Fish applies its own matching and ordering rules to candidates.

Wildcard characters, quotes, backslashes, and shell substitution syntax in
static names and choices are treated literally. Bash and Zsh decode committed
quoted tokens without evaluating them, so completion continues after inserting
such a command name or alias. Fish registers executable names literally as well.
Bash 3.2/5.x looks up a completion registration using the executable's written
quoting: a registration for `cli*` is not invoked for `cli\*` or `"cli*"`.
The executable-name snapshots preserve that native limitation. For Bash, use a
shell-safe executable or alias and generate for that name with `executable`.
Mixed quoting of ordinary executable names has the same Bash limitation.
Bash 5.2 also skips the registered function when the immediately preceding word
contains escaped backticks, for example after an option named
``--flag`literal` ``. The `literal-option-backticks` snapshot records this
separately from Bash 3.2 and 5.3, which complete it correctly. Avoid backticks
in option names when targeting Bash 5.2.

Bash supports its default `COMP_WORDBREAKS`, removing `=` and/or `:`, and adding
`,` as a delimiter. Completion preserves that setting. For example,
`--endpoint=api:pr<TAB>` inserts `--endpoint=api:production` without duplicating
`api:`. Literal equals signs inside values also work, such as
`--define=key==va<TAB>` completing to `--define=key==value`.
Spaces remain argument boundaries: `--endpoint = value` supplies `=` as the
option's value, while `--endpoint= value` supplies an empty option value followed
by a separate argument. Quotes and escaped punctuation remain part of the same
argument. Other custom word-break settings, especially changes to whitespace or
shell syntax delimiters, are outside the tested configurations. The adapter uses
the literal command line and does not evaluate expansions to find candidates.

Directory hints retain `/` even when Readline replaces only a suffix. Bash 3.2
may still append a space when the returned suffix alone does not identify an
existing directory (for example after `server:`). Remove that space to continue
the path. Bash 4+ suppresses it using `compopt`; Bash 3.2 has no equivalent
per-completion control. This difference is recorded in the directory snapshot.

Path hints support relative and absolute paths, `~/`, hidden files, and symlinks.
Directory hints include symlinks to directories and exclude regular files and
broken links. File hints can include broken links. The shell controls hidden-file
visibility, ordering, and insertion details; explicitly typed dot prefixes work
in all three shells.

An unquoted `~/` selects the home directory. Quoted or escaped tildes select a
literal directory named `~`. Bash may insert `./~/…` for a literal tilde to keep
it literal. Filenames with spaces, quotes, brackets, backslashes, and shell
substitution characters are escaped during insertion. Unicode path tests run in
a UTF-8 locale; other locale/encoding combinations are not covered.

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

`npm run format` applies Oxfmt formatting. Generated `dist/` files are excluded,
and automatic import sorting is disabled.

`npm run validate` runs all checks in the same order as CI:

- `npm run format:check`: verify formatting without changing files.

- `npm run lint`: Oxlint over TypeScript, tests, tooling, and examples; warnings fail.
- `npm run check`: strict TypeScript checks.
- `npm test`: build and shell behavior tests.
- `npm run test:package`: build a tarball and install it in a temporary consumer.
  Check ESM/CommonJS imports, all generators, published types in both module
  formats, package contents, and source/declaration maps. This also seeds stale
  build files to verify that packing removes them. It needs npm registry access
  to install the Commander version under test and cleans up afterward. It also
  runs the example against the installed tarball and verifies generated-script
  loading in Bash, Zsh, and Fish.

Tests use `/bin/bash`, plus Zsh and Fish on PATH. Set `TEST_BASH`, `TEST_ZSH`, or
`TEST_FISH` to override their executable paths. Tests cover generated shell syntax, command context,
quoting, choices, and filesystem hints. Scanner tests disable external commands
and provide CLI and Node stubs that report any invocation. Fish tests use `complete -C`;
Bash Readline and Zsh ZLE tests use pseudo-terminals to verify actual Tab
insertion, including quoting and attached file values. Bash also covers directory
suffixes, unfinished quotes, escaped spaces, and completion before later arguments. A shared behavior
matrix runs in all three shells. A second matrix instruments fresh Commander
definitions with probe value parsers and compares the declaration receiving the
next token with the shell's suggestions. These probes test value ownership and
parsing boundaries; they intentionally replace value-validation callbacks and
do not establish equivalence for every possible CLI definition or input.

Shell subprocesses have a 15-second deadline and bounded output. Failures report
executable/version, test input, exit status/signal, and captured output. PTY drivers
stream startup output so timeouts retain diagnostics. Cleanup kills driver and
worker process groups, including descendants. The npm test commands run test files
serially to limit simultaneous shells on CI; there are no automatic retries. To
investigate concurrency, run `node --test --test-concurrency=4 test/*.test.js`
after building. Serial execution reduces contention but does not establish the
cause of earlier intermittent Fish timeouts.

Interactive snapshots live in `test/snapshots/`, with shared input cases in
`test/snapshots.test.js`. Each case has one `.snap` file containing Bash, Fish,
and Zsh sections separated by `---`. Run `npm run test:snapshots` to compare them, or
`npm run test:snapshots:update` to regenerate them locally, then review the diff.
Missing snapshots fail normal tests; updates are disabled in CI. `npm test`
includes snapshot comparisons automatically.

Some quoting cases have separate Bash 3.2 and Bash 4+ sections in the same file
because their editors produce different output. A local update preserves
the other Bash version's section; run with `TEST_BASH=/path/to/bash` to check or
update that version. CI exercises both. When changing a versioned case's input,
remove its old snapshot and regenerate with both Bash versions.

The `word-break-*` snapshots each contain five Bash configurations: the default
`COMP_WORDBREAKS`, removing `=`, removing `:`, removing both, and adding `,`.
They cover option assignments, literal/repeated equals signs, colon-containing
values and filenames, quoting, consumed values, and whitespace boundaries.
Every Bash capture checks that completion leaves `COMP_WORDBREAKS` unchanged.

The `path-*` snapshots cover separate and attached option values in Bash, Fish,
and Zsh. Their isolated fixtures include relative paths, home files, hidden files,
valid/broken symlinks, directory hints, accented and wide Unicode characters, and
filenames containing shell syntax. Absolute-path cases use `/dev/null`. These
cases use `en_US.UTF-8` on macOS and `C.UTF-8` on Linux. A marker check catches
accidental execution of the shell syntax embedded in a fixture filename.

Full generated-script snapshots live in `test/snapshots/generated/`: `bash.snap`,
`fish.snap`, and `zsh.snap`. Each file contains the exact, unmodified output from
`generateCompletion`, including metadata, scanner functions, and shell registration.
They use `generatedSnapshotFixture()` in `test/fixture.js` and also check deterministic
output from fresh equivalent definitions. These comparisons need only Node, with
no installed shells required:

```sh
npm run build
node --test test/generated-snapshots.test.js
```

The `test:snapshots` and `test:snapshots:update` commands also cover the persistent
shell and `loading-*` snapshot tests in `test/loading.test.js`, as well as generated
scripts and interactive screens. To update only the generated scripts:

```sh
npm run build
UPDATE_SNAPSHOTS=1 node --test test/generated-snapshots.test.js
```

Review generated-script diffs whenever the generator or fixture changes. Like the
interactive snapshots, these files are marked as generated by `.gitattributes`;
expand their diffs on GitHub when reviewing them.

Inputs use `<TAB>`, `<LEFT>`, `<RIGHT>`, `<HOME>`, `<END>`, and `<BACKSPACE>`;
`<LEFT:11>` repeats a key eleven times. For example:

```text
Input: csc-test-cli ta<TAB><TAB>

Shell: bash

> csc-test-cli ta
tags   tasks
> csc-test-cli ta▏

---

Shell: fish

> csc-test-cli tasks ▏
tasks  tags

---

Shell: zsh

> csc-test-cli ta▏
tags   tasks
```

The `▏` marker records the screen cursor. Snapshots contain the rendered screen,
including suggestion lists, rather than raw escape sequences or reconstructed
candidate arrays. Each case starts a fresh interactive shell in an 80×24 PTY with
isolated configuration/history and a fixed file fixture. Zsh's `zpty` provides the
PTY for all three shells; `@xterm/headless` interprets terminal redraws and replies
to terminal capability queries through a bidirectional connection. The harness
waits for a capture acknowledgement and drains pending redraws, enforces a
15-second deadline, and kills the worker on failure. Colors and terminal control
sequences are not serialized; trailing screen padding is trimmed. Shell-specific
ordering, inserted quoting, and cursor differences remain visible. These snapshots
cover the configured terminal and fixtures, not every possible shell customization.

The `editing-*` cases exercise completion inside commands, choices, assignments,
and filenames; existing closing quotes; empty values; escaped spaces; and later
arguments that must not change the completion context. Together with the original
quoted-value cases, they cover both unfinished quotes and editing quoted words.

These snapshots also record native editing limitations, not just desirable output.
With the default Readline settings used here, Bash completes the prefix before the
cursor and leaves the suffix in place: `de▏ploy` becomes `deploy▏ploy`. Readline's
[`skip-completed-text` setting](https://www.gnu.org/software/bash/manual/html_node/Readline-Init-File-Syntax.html)
can change this behavior; generated scripts do not change editor settings.
Zsh's native `compadd` can insert a space inside an existing closing quote:
`"two▏"` becomes `"two words ▏"`. Fish replaces the complete token, and its menu
can display existing quotes alongside candidate text. These behaviors were also
checked with minimal native completion definitions, independently of the generated
scanners. Moving to the end of the word before completing avoids the suffix cases.

GitHub Actions runs validation on Linux and macOS with Commander 14 and 15,
Node 22.12.0, Node 24, and current Node. The matrix includes Bash 3.2 and 5.x,
Zsh 5.9+, an exact Fish 4.0.0 source build, and current Fish 4+ packages. Every
job checks its shell versions before testing. CI runs on pull requests, pushes
to `main`, and manual dispatch; it does not publish to npm.

The internal pipeline separates typed Commander extraction from rendering.
Bash and Zsh share a scanner with shell-specific completion output; Fish has a
native scanner over the same model. All generator code and embedded shell
templates live in TypeScript under `src/`.

## Releases

See the [changelog](CHANGELOG.md) and
[release checklist](https://github.com/pavelzw/commander-static-completion/blob/main/docs/releasing.md).
Pushing a `v<version>` tag validates and stages the package on npm. A maintainer
reviews and approves it with 2FA before it becomes public. Stable releases use
`latest`; prereleases use `next`. npm trusted-publisher setup is required before
automated staging.
