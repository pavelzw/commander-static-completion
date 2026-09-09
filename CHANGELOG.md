# Changelog

## [Unreleased]

### Fixed

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
