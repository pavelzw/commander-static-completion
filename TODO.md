# TODO

The TypeScript library currently generates standalone Bash, Zsh, and Fish
completions. Choices, file/directory hints, nested commands, aliases, and common
option forms work. The checklist below separates release preparation, missing
behavior, and optional extensions. Investigations are not confirmed bugs.

## 1. Release readiness

- [x] Add CI for type checking, builds, shell syntax, and behavioral tests on
      Linux and macOS. Exercise Commander 14/15, the minimum supported Node version,
      and supported newer Node versions.
- [x] Test the documented shell baseline and newer versions: Bash 3.2 and 5.x,
      Zsh 5.9+, and Fish 4+. Provision these explicitly in CI.
- [x] Make builds clean `dist/` before compilation so renamed or deleted modules
      cannot remain in a published package.
- [x] Automate the installed-tarball smoke test: ESM import, CommonJS require,
      all three generators, and TypeScript consumption through package exports.
      Confirm declaration/source maps resolve to the packaged TypeScript source.
- [x] Add Oxlint for library source, tooling, tests, and examples; fail CI on warnings.
- [x] Add Oxfmt and format the TypeScript source and test harnesses; check formatting in CI.
- [ ] Add package repository, homepage, bugs, and discovery metadata; document
      installation and the supported ESM/CommonJS usage.
- [ ] Establish a release checklist, changelog, versioning policy, and npm
      publishing workflow. Verify package ownership and contents before publishing.

## 2. Commander semantics

- [ ] Add focused extraction tests, including hidden entries, renamed/disabled
      help and version flags, custom help configuration, and option shadowing.
- [x] Compare scanner behavior with Commander on a shared set of token sequences:
      required/optional values, negative numbers, short clusters, empty assignments,
      variadic values, repeated flags, and `--`.
- [ ] Verify parent-option handling before and after subcommands, including
      overlapping short/long aliases and hidden options typed explicitly.
- [x] Complete nested help using Commander's actual syntax (`mycli remote help add`)
      and stop suggesting additional targets after `mycli help remote`.
- [ ] Expand coverage of explicit/custom help commands and help configuration.
- [x] Support `enablePositionalOptions()` with the correct option scope.
- [x] Support `passThroughOptions()` and stop suggesting owned options at the
      correct boundary.
- [x] Support default subcommands without misclassifying positional arguments.
- [x] Support `combineFlagAndOptionalValue(false)`.
- [ ] Design an explicit way to supply definitions for executable subcommands;
      do not launch those executables during completion or scrape their help text.
- [ ] Audit all Commander parsing settings that affect completion. For settings
      we cannot model, provide a specific diagnostic instead of silently guessing.
- [ ] Decide how conflicts and repeatability should affect suggestions. Keep
      implied/default values distinct from tokens actually present on the command line.
- [ ] Define how custom help overrides affect extraction, and minimize reliance
      on Commander private fields. Cover remaining private access in compatibility tests.

## 3. Shell behavior and regression coverage

- [x] Add native Bash Readline insertion tests alongside direct function tests.
      Verify spaces, quoting, directory suffixes, and trailing-space behavior.
- [x] Consolidate a shared behavior matrix across shells so new cases exercise
      Bash, Zsh, and Fish consistently.
- [ ] Exercise cursor-in-the-middle completion, existing suffixes, unfinished
      quotes, escaped spaces, empty values, and tokens after the cursor.
- [ ] Expand Bash word-break tests for `=`, `:`, assignment boundaries, and custom
      `COMP_WORDBREAKS`; establish which configurations are supported.
- [ ] Expand path coverage: relative/absolute paths, `~/`, hidden files, symlinks,
      directories, attached option values, Unicode, and metacharacters.
- [ ] Define consistent handling of empty choices and control characters. Cover
      NUL rejection and Fish's tab/newline restrictions; document filename limitations.
- [ ] Add literal-name regressions for wildcard characters, quotes, backslashes,
      and shell substitution syntax in names, aliases, choices, and executable names.
- [ ] Test multiple generated CLIs loaded together, sourcing scripts repeatedly,
      existing completion registrations, and common user shell options. Avoid stale
      or duplicate completions after regeneration.
- [ ] Add Zsh autoload support (`#compdef`/`fpath`) alongside the current sourced
      script workflow, with installation tests.
- [ ] Verify shell state is preserved after completion and command/Node execution
      remains unnecessary in every native integration test.
- [ ] Make remaining harness failures portable and actionable: timeouts, shell availability,
      executable overrides (including Bash), and pseudo-terminal cleanup.
- [x] Add native interactive screen snapshots for Bash, Zsh, and Fish, with shared
      keystroke inputs, cursor positions, visible suggestions, and explicit local updates.
- [ ] Add representative generated-output snapshots alongside behavioral tests
      to review output changes and guard deterministic generation in every shell.

## 4. Completion experience and integration

- [ ] Carry descriptions through the model and display them in Zsh and Fish.
- [ ] Decide whether to add richer static hints, such as filename extensions or
      choice descriptions, while preserving Commander `.choices()` by default.
- [x] Add a complete runnable CLI example with a `completions <shell>` command.
      Ensure required root options and application hooks do not prevent generation.
- [x] Document build-time generation, package-manager installation locations,
      executable-name overrides, and regeneration when the command tree changes.
- [ ] Document static plugin loading and explicit hints for custom parsers.
      Runtime services and arbitrary parser functions cannot be inferred.
- [ ] Add TypeScript examples and type tests for `Argument` hints, subclasses,
      and `@commander-js/extra-typings` interoperability.
- [ ] Consider a file-writing or command-registration convenience helper only
      after exercising the existing string-returning API in real CLIs.

## 5. After the core is stable

- [ ] Benchmark generation time, output size, and Tab latency on large/deep
      command trees. Deduplicate repeated value metadata if measurements justify it.
- [ ] Try the library with several real Commander CLIs and turn compatibility
      findings into small reproducible fixtures.
- [ ] Decide whether older Commander/shell versions merit support; broaden the
      advertised range only after adding version-specific tests.
- [ ] Evaluate PowerShell and other shell backends based on actual demand.

Keep the core static: generated completions must work without invoking Node or
the CLI. Dynamic provider callbacks and automatic shell-profile editing are
outside the current scope.
