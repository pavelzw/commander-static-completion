# Changelog

## [Unreleased]

### Fixed

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
