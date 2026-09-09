import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { capture } from "./snapshot-harness.js";
import { assertSnapshot } from "./snapshot-assert.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command, Option } from "commander";
import { completionHint, generateCompletion } from "../dist/index.js";
import { executables, shells } from "./helpers.js";

const program = (name, value) =>
  new Command(name).helpOption(false).addOption(new Option("--value <value>").choices([value]));

// Each test keeps one shell alive through registration, completion and reload.
function session(shell, run) {
  const cwd = mkdtempSync(join(tmpdir(), "csc-loading-"));
  try {
    const scripts = {};
    for (const [file, name, value] of [
      ["old", "alpha-cli", "alpha-old"],
      ["new", "alpha-cli", "alpha-new"],
      ["beta", "beta-cli", "beta-only"],
    ]) {
      const definition = program(name, value);
      if (file === "old") definition.command("obsolete").alias("r").helpOption(false);
      if (file === "new") definition.command("current").helpOption(false);
      scripts[file] = generateCompletion(definition, { shell });
      writeFileSync(join(cwd, file), scripts[file]);
    }
    const input = run(scripts, cwd);
    const result = spawnSync(
      executables[shell],
      shell === "bash" ? ["--noprofile", "--norc"] : shell === "zsh" ? ["-f"] : ["--no-config"],
      {
        input,
        cwd,
        encoding: "utf8",
        timeout: 15000,
        killSignal: "SIGKILL",
        env: { ...process.env, LC_ALL: "C" },
      },
    );
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stderr}\n${result.stdout}`);
    assert.equal(result.stderr, "");
    assert.equal(existsSync(join(cwd, "invoked")), false, "Completion ran the CLI or Node");
    if (existsSync(join(cwd, "before")))
      assert.equal(
        readFileSync(join(cwd, "after"), "utf8"),
        readFileSync(join(cwd, "before"), "utf8"),
        "Shell state changed",
      );
    return result.stdout.trimEnd().split("\n");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

for (const shell of shells) {
  test(`${shell}: reload replaces only the target registration in a persistent shell`, () => {
    const output = session(shell, () => {
      if (shell === "fish")
        return `
set -g fish_complete_path
function alpha-cli; echo invoked > invoked; end
functions -c alpha-cli beta-cli
functions -c alpha-cli node
complete -f -a stale -- alpha-cli
complete -f -a untouched -- unrelated-cli
set before (complete unrelated-cli)
set -gx PATH /nonexistent
source old
source beta
set registration (complete alpha-cli)
test (count $registration) -eq 1; or exit 10
complete -C 'alpha-cli --value alpha-'
complete -C 'beta-cli --value beta-'
complete -C 'alpha-cli obs'
function _load; source old; end
_load
source old
 test "$registration" = "$(complete alpha-cli)"; or exit 11
complete -C 'alpha-cli --value alpha-'
source new
complete -C 'alpha-cli obs'
complete -C 'alpha-cli cur'
complete -C 'alpha-cli --value alpha-'
complete -C 'beta-cli --value beta-'
complete -C 'unrelated-cli un'
test "$before" = "$(complete unrelated-cli)"; or exit 12
`;
      const init =
        shell === "zsh"
          ? `autoload -Uz compinit; compinit -D -u
_unrelated() { :; }; compdef _unrelated unrelated-cli
_stale() { :; }; compdef _stale alpha-cli
before=$_comps[unrelated-cli]
compadd() { while [[ $1 != -- ]]; do shift; done; shift; printf '%s\\n' "$@"; }
_complete() { if (($# == 3)); then words=("$1" "$2"); CURRENT=2; else words=("$1" --value "$2"); CURRENT=3; fi; PREFIX=$2; "$_comps[$1]"; }
`
          : `complete -W stale alpha-cli
complete -W untouched unrelated-cli
before=$(complete -p unrelated-cli)
_complete() {
  local entry fn
  entry=$(complete -p "$1"); entry=\${entry#* -F }; fn=\${entry%% *}
  if (($# == 3)); then COMP_WORDS=("$1" "$2"); COMP_CWORD=1; else COMP_WORDS=("$1" --value "$2"); COMP_CWORD=2; fi
  "$fn"
  if ((\${#COMPREPLY[@]})); then printf '%s\\n' "\${COMPREPLY[@]}"; fi
}
`;
      const registration = shell === "zsh" ? "$_comps[alpha-cli]" : "$(complete -p alpha-cli)";
      return `${init}
alpha-cli() { echo invoked > invoked; }
beta-cli() { echo invoked > invoked; }
node() { echo invoked > invoked; }
PATH=/nonexistent
source ./old
source ./beta
registration="${registration}"
_complete alpha-cli alpha-
_complete beta-cli beta-
_complete alpha-cli obs root
_load() { source ./old; }; _load
source ./old
[[ "$registration" == "${registration}" ]] || exit 11
_complete alpha-cli alpha-
source ./new
_complete alpha-cli obs root
_complete alpha-cli cur root
_complete alpha-cli alpha-
_complete beta-cli beta-
${shell === "zsh" ? '[[ "$before" == "$_comps[unrelated-cli]" ]]' : '[[ "$before" == "$(complete -p unrelated-cli)" ]]'} || exit 12
printf 'untouched\\n'
`;
    });
    assert.deepEqual(output, [
      "alpha-old",
      "beta-only",
      "obsolete",
      "alpha-old",
      "current",
      "alpha-new",
      "beta-only",
      "untouched",
    ]);
  });
}

for (const shell of shells) {
  test(`${shell}: sourcing and completing preserve caller variables and shell settings`, () => {
    const output = session(shell, (scripts) => {
      if (shell === "fish")
        return `
set -g fish_complete_path
set -g state sentinel
set -g tokens keep these
set -gx IFS :
set -gx PATH /nonexistent
function node; echo invoked > invoked; end
function alpha-cli; echo invoked > invoked; end
function snapshot
  set --show state tokens IFS PATH fish_complete_path
  pwd
end
snapshot > before
source old
source beta
source old
complete -C 'alpha-cli --value alpha-'
complete -C 'beta-cli --value beta-'
snapshot > after
`;
      const fn = scripts.old.match(
        shell === "bash" ? /complete .*?-F (\w+)/ : /^\s*compdef (\w+)/m,
      )[1];
      const initialization =
        shell === "zsh"
          ? `autoload -Uz compinit; compinit -D -u
setopt SH_WORD_SPLIT KSH_ARRAYS NO_UNSET
compadd() { while [[ $1 != -- ]]; do shift; done; shift; printf '%s\\n' "$@"; }
words=(alpha-cli --value alpha-); CURRENT=3; PREFIX=alpha-
`
          : `shopt -s nocasematch extglob nullglob
set -u -f
COMP_WORDS=(alpha-cli --value alpha-); COMP_CWORD=2
COMP_LINE='alpha-cli --value alpha-'; COMP_POINT=24
COMP_WORDBREAKS=$' \\t\\n"\\047@><=;|&(:'
BASH_REMATCH=(keep these)
`;
      return `${initialization}
state=sentinel mode=sentinel next=sentinel decoded=sentinel quote_char=sentinel
 tokens=(keep these); candidates=(keep these); flags=(keep these)
IFS=:
node() { echo invoked > invoked; }
alpha-cli() { echo invoked > invoked; }
PATH=/nonexistent
snapshot() {
  ${shell === "zsh" ? "typeset -p state mode next decoded quote_char tokens candidates flags IFS PATH words CURRENT PREFIX; setopt" : "declare -p state mode next decoded quote_char tokens candidates flags IFS PATH COMP_WORDS COMP_CWORD COMP_LINE COMP_POINT COMP_WORDBREAKS BASH_REMATCH; set +o; shopt -p"}
  pwd
  trap ${shell === "bash" ? "-p" : ""}
}
snapshot > before
source ./old
source ./beta
source ./old
${fn}
${shell === "bash" ? 'printf "%s\\n" "${COMPREPLY[@]}"' : ""}
snapshot > after
`;
    });
    assert.deepEqual(output, shell === "fish" ? ["alpha-old", "beta-only"] : ["alpha-old"]);
  });
}

const stateSetup = (shell) =>
  shell === "fish"
    ? `
set -g state sentinel
set -g tokens keep these
set -gx IFS :
function alpha-cli; echo invoked > invoked; end
functions -c alpha-cli beta-cli
functions -c alpha-cli node
function _state
  set --show state tokens IFS PATH fish_complete_path
  complete alpha-cli
  complete beta-cli
  complete unrelated-cli
  pwd
end
complete -f -a untouched -- unrelated-cli
_state > state-before
`
    : `
state=sentinel; tokens=(keep these); IFS=:
alpha-cli() { echo invoked > invoked; }
beta-cli() { echo invoked > invoked; }
node() { echo invoked > invoked; }
${
  shell === "bash"
    ? `shopt -s nocasematch extglob nullglob
set -u -f
BASH_REMATCH=(keep these)
complete -W untouched unrelated-cli
_state() { declare -p state tokens IFS PATH COMP_WORDBREAKS BASH_REMATCH; set +o; shopt -p; complete -p alpha-cli beta-cli unrelated-cli; pwd; }`
    : `setopt SH_WORD_SPLIT KSH_ARRAYS NO_UNSET
MATCH=sentinel; match=(keep these); MBEGIN=42; MEND=43; mbegin=(42); mend=(43)
_unrelated() { :; }; compdef _unrelated unrelated-cli
# SHIN_STDIN differs between sourcing setup and reading interactive input.
_state() { typeset -p state tokens IFS PATH MATCH match MBEGIN MEND mbegin mend; local _opt; for _opt in "\${(@f)$(setopt)}"; do [[ $_opt == shinstdin ]] || print -r -- "$_opt"; done; print -r -- "\${_comps[unrelated-cli]}"; pwd; }`
}
_state > state-before
`;

for (const [name, input] of [
  ["reload", "alpha-cli --value alpha<TAB>"],
  ["coexist", "beta-cli --value beta<TAB>"],
  ["file", "alpha-cli --file two<TAB>"],
  ["negative", "alpha-cli --optional -1<TAB>"],
  ["case-sensitive", "alpha-cli --VALUE alpha<TAB>"],
  ["no-match", "alpha-cli --value missing<TAB>"],
]) {
  test(`loading snapshot: ${name} with caller shell settings`, async () => {
    const sections = [];
    for (const shell of shells) {
      const current = program("alpha-cli", "alpha-new")
        .addOption(completionHint(new Option("--file <file>"), { kind: "file" }))
        .addOption(new Option("--optional [value]").choices(["-123"]));
      const output = await capture(shell, current, input, {
        preload: [
          program("alpha-cli", "alpha-old"),
          program("beta-cli", "beta-only"),
          program("alpha-cli", "alpha-old"),
        ],
        shellSetup: stateSetup(shell),
        shellCheck: "_state > state-after;",
      });
      if (name === "reload") assert.match(output, /alpha-new/);
      if (name === "coexist") assert.match(output, /beta-only/);
      sections.push(`Shell: ${shell}\n\n${output}`);
    }
    assertSnapshot(
      new URL(`./snapshots/loading-${name}.snap`, import.meta.url),
      `Input: ${input}\n\n${sections.join("\n---\n\n")}`,
    );
  });
}

test("bash: an early scanner return restores nounset and nocasematch", () => {
  assert.deepEqual(
    session("bash", (scripts) => {
      const fn = scripts.old.match(/complete .*?-F (\w+)/)[1];
      return `source ./old
set -u
shopt -s nocasematch
COMP_WORDS=(alpha-cli --value alpha-); COMP_CWORD=2
COMP_LINE='unrelated input'; COMP_POINT=15
${fn}
[[ $- == *u* ]] || exit 10
shopt -q nocasematch || exit 11
printf 'restored\\n'
`;
    }),
    ["restored"],
  );
});

test("zsh: sourcing an update supersedes an already loaded autoload function", () => {
  assert.deepEqual(
    session("zsh", (scripts, cwd) => {
      writeFileSync(join(cwd, "_alpha-cli"), scripts.old);
      writeFileSync(join(cwd, "_beta-cli"), scripts.beta);
      return `fpath=("$PWD" "\${fpath[@]}")
autoload -Uz compinit; compinit -D -u
alpha-cli() { echo invoked > invoked; }
beta-cli() { echo invoked > invoked; }
node() { echo invoked > invoked; }
PATH=/nonexistent
compadd() { while [[ $1 != -- ]]; do shift; done; shift; printf '%s\\n' "$@"; }
_complete() { words=("$1" --value "$2"); CURRENT=3 PREFIX=$2; "$_comps[$1]"; }
_complete alpha-cli alpha-
_complete beta-cli beta-
source ./new
_complete alpha-cli alpha-
_complete beta-cli beta-
`;
    }),
    ["alpha-old", "beta-only", "alpha-new", "beta-only"],
  );
});

test("fish: replacement preserves unrelated wrapper targets and pattern rules", () => {
  assert.deepEqual(
    session(
      "fish",
      () => `
set -g fish_complete_path
function alpha-cli; echo invoked > invoked; end
function node; echo invoked > invoked; end
set -gx PATH /nonexistent
complete -f -a wrapper-kept -- wrapped-cli
complete -c alpha-cli -w wrapped-cli
complete -f -a pattern-kept -c 'alpha*'
set before_target (complete wrapped-cli)
set before_pattern (complete | string match '*pattern-kept*')
source old
source old
source new
complete -C 'alpha-cli --value alpha-'
test "$before_target" = "$(complete wrapped-cli)"; or exit 11
test "$before_pattern" = "$(complete | string match '*pattern-kept*')"; or exit 12
`,
    ),
    ["alpha-new"],
  );
});

test("bash: never resolves compopt to an external executable", () => {
  assert.deepEqual(
    session("bash", (scripts, cwd) => {
      writeFileSync(join(cwd, "compopt"), "#!/bin/sh\nprintf invoked > invoked\n", { mode: 0o755 });
      const fn = scripts.old.match(/complete .*?-F (\w+)/)[1];
      return `source ./old
PATH=$PWD
COMP_WORDS=(alpha-cli --value alpha-); COMP_CWORD=2
COMP_LINE='alpha-cli --value alpha-'; COMP_POINT=24
${fn}
printf '%s\\n' "\${COMPREPLY[@]}"
`;
    }),
    ["alpha-old"],
  );
});
