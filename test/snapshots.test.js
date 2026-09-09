import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { assertSnapshot, assertShellSnapshot } from "./snapshot-assert.js";
import { executables } from "./helpers.js";
import {
  fixture,
  defaultSnapshotFixture,
  optionalClusterSnapshotFixture,
  descriptionFixture,
  wordBreakFixture,
  pathSnapshotFixture,
  literalFixture,
} from "./fixture.js";
import { capture } from "./snapshot-harness.js";

const literalSuffixes = [
  ["star", "*"],
  ["question", "?"],
  ["brackets", "[ab]"],
  ["quote", "'"],
  ["backslash", "\\"],
  ["backslash-star", "\\*"],
  ["substitution", "$(echo>PWNED)"],
  ["backticks", "`echo>PWNED`"],
];
const escapeWord = (value) => value.replace(/[^a-zA-Z0-9_.-]/gu, "\\$&");
for (const kind of ["command", "alias", "option", "choice", "executable"]) {
  for (const [name, suffix] of literalSuffixes) {
    const program = literalFixture(kind, suffix);
    const input =
      kind === "command"
        ? "csc-test-cli cmd<TAB>--value pr<TAB>"
        : kind === "alias"
          ? "csc-test-cli ali<TAB>--value pr<TAB>"
          : kind === "option"
            ? "csc-test-cli " + escapeWord(`--flag${suffix}`) + " pr<TAB>"
            : kind === "choice"
              ? "csc-test-cli --value val<TAB>"
              : escapeWord(program.name()) + " --value pr<TAB>";
    test(`interactive snapshot: literal-${kind}-${name}`, async () => {
      const sections = [];
      const versioned = kind === "option" && name === "backticks";
      for (const shell of ["bash", "fish", "zsh"]) {
        const output = await capture(shell, literalFixture(kind, suffix), input);
        // Bash may not invoke a registered function for quoted executables, or
        // (in 5.x) when the previous word contains backticks. Snapshot that too.
        const nativeBashLimitation =
          shell === "bash" && (kind === "executable" || (versioned && bashVersion !== "3"));
        if (kind !== "choice" && !nativeBashLimitation) {
          assert.match(
            output,
            /production/,
            `${shell} must recognize the committed literal ${kind}`,
          );
        }
        const label =
          shell === "bash" && versioned ? `bash (${bashVersion === "3" ? "3.2" : "4+"})` : shell;
        sections.push(`Shell: ${label}\n\n${output}`);
      }
      const path = new URL(`./snapshots/literal-${kind}-${name}.snap`, import.meta.url);
      if (versioned) assertShellSnapshot(path, input, sections);
      else assertSnapshot(path, `Input: ${input}\n\n${sections.join("\n---\n\n")}`);
    });
  }
}

const cases = [
  ["descriptions-commands", "csc-test-cli s<TAB><TAB>", descriptionFixture],
  [
    "descriptions-options",
    "csc-test-cli --<TAB><TAB>",
    () => {
      // Two entries avoid version-specific Fish alignment of multi-row descriptions.
      const program = descriptionFixture().helpOption(false);
      program.commands[0].helpOption(false);
      return program;
    },
  ],
  ["descriptions-values", "csc-test-cli serve --format <TAB><TAB>", descriptionFixture],
  ["descriptions-arguments", "csc-test-cli serve a<TAB><TAB>", descriptionFixture],
  ["optional-cluster-boolean", "csc-test-cli -ov ap<TAB>", optionalClusterSnapshotFixture],
  ["optional-cluster-last", "csc-test-cli -vo al<TAB>", optionalClusterSnapshotFixture],
  ["optional-cluster-required", "csc-test-cli -orprod<TAB>", optionalClusterSnapshotFixture],
  ["optional-cluster-no-value", "csc-test-cli -oal<TAB>", optionalClusterSnapshotFixture],
  ["optional-long-assignment", "csc-test-cli --optional=al<TAB>", optionalClusterSnapshotFixture],
  ["default-ambiguous", "csc-test-cli a<TAB><TAB>", defaultSnapshotFixture],
  ["default-option", "csc-test-cli --port 8<TAB>", defaultSnapshotFixture],
  ["default-attached", "csc-test-cli --port=8<TAB>", defaultSnapshotFixture],
  ["default-positional", "csc-test-cli ap<TAB>", defaultSnapshotFixture],
  ["default-explicit", "csc-test-cli admin --format j<TAB>", defaultSnapshotFixture],
  ["default-terminator", "csc-test-cli -- ap<TAB>", defaultSnapshotFixture],
  ["default-committed", "csc-test-cli app --port 8<TAB>", defaultSnapshotFixture],
  ["default-nested", "csc-test-cli --interval 5<TAB>", () => defaultSnapshotFixture(true)],
  ["ambiguous-subcommands", "csc-test-cli ta<TAB><TAB>"],
  ["no-match", "csc-test-cli zzz<TAB>"],
  ["nested-command", "csc-test-cli remote a<TAB>"],
  ["help-target", "csc-test-cli help rem<TAB>"],
  ["subcommand", "csc-test-cli dep<TAB>"],
  ["choice", "csc-test-cli deploy --target pr<TAB>"],
  ["assignment", "csc-test-cli deploy --target=pr<TAB>"],
  ["space", "csc-test-cli deploy --target two<TAB>"],
  ["file", "csc-test-cli deploy --config two<TAB>"],
  ["attached-file", "csc-test-cli deploy --config=two<TAB>"],
  ["quoted-choice", 'csc-test-cli deploy --target "two<TAB>'],
  ["escaped-choice", "csc-test-cli deploy --target two\\ w<TAB>"],
  ["quoted-file", 'csc-test-cli deploy --config "two<TAB>'],
  ["cursor-middle", "csc-test-cli deploy --target pr --no-cache<LEFT:11><TAB>"],
  ["editing-command-suffix", "csc-test-cli deploy<LEFT:4><TAB>"],
  ["editing-choice-suffix", "csc-test-cli deploy --target production<LEFT:8><TAB>"],
  ["editing-unmatched-suffix", "csc-test-cli deploy --target prXYZ<LEFT:3><TAB>"],
  ["editing-assignment-suffix", "csc-test-cli deploy --target=production<LEFT:8><TAB>"],
  ["editing-later-command", "csc-test-cli rem add<LEFT:4><TAB>"],
  ["editing-later-value", "csc-test-cli deploy --target pr --color blue<LEFT:13><TAB>"],
  ["editing-empty-assignment", "csc-test-cli deploy --color=<TAB><TAB>"],
  ["editing-empty-quoted-value", 'csc-test-cli deploy --color ""<LEFT><TAB><TAB>'],
  ["editing-single-quote", "csc-test-cli deploy --target 'two<TAB>"],
  ["editing-closed-quote", 'csc-test-cli deploy --target "two"<LEFT><TAB>'],
  ["editing-quoted-suffix", 'csc-test-cli deploy --target "two words"<LEFT:6><TAB>'],
  ["editing-escaped-file", "csc-test-cli deploy --config two\\ w<TAB>"],
  ["editing-file-suffix", "csc-test-cli deploy --config two\\ words.json<LEFT:8><TAB>"],
  ["directory", "csc-test-cli deploy --config nest<TAB>"],
  ["ambiguous", "csc-test-cli deploy --color <TAB><TAB>"],
];
const versionedCases = new Set(["editing-empty-quoted-value", "editing-closed-quote"]);
const bashVersion = execFileSync(executables.bash, ["-c", 'printf "%s" "$BASH_VERSINFO"'], {
  encoding: "utf8",
  timeout: 5000,
}).trim();
for (const [name, input, makeProgram] of cases) {
  test(`interactive snapshot: ${name}`, async () => {
    const sections = [];
    for (const shell of ["bash", "fish", "zsh"]) {
      const program = makeProgram ? makeProgram() : fixture();
      if (!makeProgram) {
        program.command("tasks");
        program.command("tags");
      }
      const label =
        shell === "bash" && versionedCases.has(name)
          ? `bash (${bashVersion === "3" ? "3.2" : "4+"})`
          : shell;
      sections.push(`Shell: ${label}\n\n${await capture(shell, program, input)}`);
    }
    const actual = `Input: ${input}\n\n${sections.join("\n---\n\n")}`;
    const path = new URL(`./snapshots/${name}.snap`, import.meta.url);
    if (versionedCases.has(name)) assertShellSnapshot(path, input, sections);
    else assertSnapshot(path, actual);
  });
}

const pathCases = [
  ["relative", "./two"],
  ["parent", "linked-directory/../two"],
  ["absolute", "/dev/nul"],
  ["home", "~/home.j"],
  ["quoted-tilde", '"~/lit'],
  ["escaped-tilde", "\\~/lit"],
  ["hidden", ".hid"],
  ["hidden-menu", "vis/", "--f", "<TAB><TAB>"],
  ["symlink-file", "linked-f"],
  ["symlink-directory", "linked-d"],
  ["symlink-child", "linked-directory/ch"],
  ["broken-symlink", "broken-l"],
  ["unicode", "caf"],
  ["unicode-prefix", "café"],
  ["wide-unicode", "東"],
  ["apostrophe", "quo"],
  ["substitution", "meta"],
  ["brackets", "bracket"],
  ["backslash", "back"],
  ["directory-only", "linked-", "--directory"],
  ["directory-excludes-file", "linked-f", "--directory"],
  ["directory-excludes-broken-link", "broken-l", "--directory"],
  ["directory-home", "~/home-d", "--directory"],
];
for (const [name, prefix, option = "--config", keys = "<TAB>"] of pathCases) {
  for (const separator of [" ", "="]) {
    test(`interactive snapshot: path-${name}${separator === "=" ? "-attached" : ""}`, async () => {
      const input = `csc-test-cli deploy ${option}${separator}${prefix}${keys}`;
      const sections = [];
      for (const shell of ["bash", "fish", "zsh"]) {
        sections.push(
          `Shell: ${shell}\n\n${await capture(shell, pathSnapshotFixture(), input, { pathFixture: true })}`,
        );
      }
      assertSnapshot(
        new URL(
          `./snapshots/path-${name}${separator === "=" ? "-attached" : ""}.snap`,
          import.meta.url,
        ),
        `Input: ${input}\n\n${sections.join("\n---\n\n")}`,
      );
    });
  }
}

const defaultBreaks = " \t\n\"'@><=;|&(:";
const breakSettings = [
  ["default", defaultBreaks],
  ["without equals", defaultBreaks.replace("=", "")],
  ["without colon", defaultBreaks.replace(":", "")],
  ["without equals or colon", defaultBreaks.replace(/[=:]/g, "")],
  ["with comma", defaultBreaks + ","],
];
const wordBreakCases = [
  ["colon-value", "--endpoint api:pr<TAB>"],
  ["colon-empty-suffix", "--endpoint api:<TAB>"],
  ["colon-no-match", "--endpoint other:pr<TAB>"],
  ["colon-assignment", "--endpoint=api:pr<TAB>"],
  ["literal-equals", "--define key=va<TAB>"],
  ["repeated-equals", "--define=key==va<TAB>"],
  ["consumed-colon", "--endpoint api:production e<TAB>"],
  ["consumed-equals", "--define=key=value e<TAB>"],
  ["spaced-equals", "--endpoint = api:pr<TAB>"],
  ["empty-before-space", "--endpoint= api:pr<TAB>"],
  ["empty-assignment", "--endpoint=<TAB>"],
  ["quoted-colon", '--endpoint "api:pr<TAB>'],
  ["escaped-colon", "--endpoint api\\:pr<TAB>"],
  ["colon-file", "--config server:co<TAB>"],
  ["colon-attached-file", "--config=server:co<TAB>"],
  ["colon-directory", "--config=server:di<TAB>"],
  ["comma-value", "--pair key,va<TAB>"],
];
const versionedWordBreakCases = new Set([
  "empty-assignment",
  "escaped-colon",
  "comma-value",
  "colon-directory",
]);
for (const [name, suffix] of wordBreakCases) {
  test(`interactive snapshot: word-break-${name}`, async () => {
    const input = `csc-test-cli ${suffix}`;
    const sections = [];
    for (const [setting, bashWordBreaks] of breakSettings) {
      const output = await capture("bash", wordBreakFixture(), input, { bashWordBreaks });
      const version = versionedWordBreakCases.has(name)
        ? `${bashVersion === "3" ? "3.2" : "4+"}; `
        : "";
      sections.push(`Shell: bash (${version}${setting})\n\n${output}`);
    }
    const path = new URL(`./snapshots/word-break-${name}.snap`, import.meta.url);
    if (versionedWordBreakCases.has(name)) assertShellSnapshot(path, input, sections);
    else assertSnapshot(path, `Input: ${input}\n\n${sections.join("\n---\n\n")}`);
  });
}
