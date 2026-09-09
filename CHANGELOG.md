# Changelog

## [Unreleased]

### Added

- `completionDefinition()` attaches standalone Commander parser definitions to
  executable subcommands without changing dispatch or running their executables.
  Includes validation, native Bash/Fish/Zsh snapshots, and a TypeScript example.

### Fixed

- Fish reloads replace the target command's registration without accumulating
  duplicate entries or retaining completion rules from a previous provider.
- Bash completion tolerates `nounset` and preserves caller options, while
  keeping command matching case-sensitive with `nocasematch` enabled.
- Bash 3.2 no longer attempts to run an external `compopt` command.
- Negative-number checks preserve caller regex-match variables in Bash and Zsh.

- Bash and Zsh recognize previously inserted quoted command names, aliases, and flags.
- Fish preserves literal backslashes in command dispatch and registers executable
  names without interpreting them as shell patterns.
- Generation rejects empty choice values and C0/C1 control characters in insertable
  text consistently across shells; empty choice lists remain valid.
- Bash completion handles byte cursor offsets before 4.3 and character offsets
  in newer versions, fixing completion after non-ASCII input in UTF-8 locales.
- Fish completes unquoted `~/` paths while preserving literal quoted/escaped tildes.
- Bash treats quoted/escaped tildes as literal paths instead of expanding home.
- Zsh directory hints no longer fall back to regular files or broken symlinks.
- Bash completion reconstructs adjacent word-break fragments and trims the prefix
  Readline preserves, fixing colon-containing values/paths and repeated equals signs.
- Whitespace around `=` no longer turns separate arguments into an option assignment.
- Bash completion scans only the current token's prefix before the cursor,
  avoiding incorrect quoting caused by an existing closing quote after the cursor.

### Added

- Static Bash 3.2+, Fish 4+, and Zsh 5.9+ completions for Commander 14/15.
- Command aliases, nested/default commands, option values, and positional choices.
- File and directory hints through `completionHint()`.
- Fish and Zsh descriptions, plus Zsh autoload installation.
- TypeScript declarations and ESM/CommonJS consumption on Node 22.12+.
- Interactive and generated-script snapshots, compatibility tests, and package validation.
