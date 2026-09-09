import assert from "node:assert/strict";
import { runShell } from "./shell-process.js";
import { generateCompletion } from "../dist/index.js";

export const shells = ["bash", "zsh", "fish"];
export const executables = {
  bash: process.env.TEST_BASH ?? "/bin/bash",
  zsh: process.env.TEST_ZSH ?? "zsh",
  fish: process.env.TEST_FISH ?? "fish",
};
const bash = executables.bash;
export const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
const fishQuote = (s) => "'" + s.replaceAll("\\", "\\\\").replaceAll("'", "\\'") + "'";

function bashComplete(program, words, { cwd, breaks = " \t\n\"'@><=;|&(:" } = {}) {
  const script = generateCompletion(program, { shell: "bash" });
  const fn = script.match(/complete .*?-F (\w+)/)[1];
  const result = runShell(bash, ["--noprofile", "--norc"], {
    cwd,
    context: words,
    input: `${script}\nnode() { echo 'NODE WAS INVOKED' >&2; return 99; }\ncsc-test-cli() { echo 'CLI WAS INVOKED' >&2; return 99; }\nPATH=/nonexistent\nCOMP_WORDS=(${words.map(quote).join(" ")})\nCOMP_CWORD=${words.length - 1}\nCOMP_WORDBREAKS=${quote(breaks)}\n${fn}\nif ((${"${#COMPREPLY[@]}"})); then printf '%s\\0' "${"${COMPREPLY[@]}"}"; fi\n`,
    encoding: "utf8",
    timeout: 15000,
    killSignal: "SIGKILL",
  });
  assert.equal(
    result.status,
    0,
    `${result.error?.message ?? ""} ${result.stderr}; words=${JSON.stringify(words)}`,
  );
  assert.equal(result.stderr, "");
  return result.stdout.split("\0").filter(Boolean);
}

function otherComplete(shell, program, words, cwd) {
  const script = generateCompletion(program, { shell });
  let input;
  if (shell === "fish") {
    // Use a fixture name that cannot collide with bundled CLI completions.
    // Isolate our fixture from bundled/user completions, but retain native helpers.
    const line = words
      .map((word, index) => (index === words.length - 1 && word === "" ? "" : fishQuote(word)))
      .join(" ");
    input = `set -g fish_complete_path\n${script}\nfunction node; echo 'NODE WAS INVOKED' >&2; end\nfunction csc-test-cli; echo 'CLI WAS INVOKED' >&2; end\nset -gx PATH /nonexistent\ncomplete -C ${fishQuote(line)}\n`;
  } else {
    // Test scanner output directly; the separate ZLE test covers native registration.
    const fn = script.match(/^\s*compdef (\w+)/m)[1];
    input = `compdef() { :; }\n${script}\ncompadd() { while [[ $1 != -- ]]; do shift; done; shift; printf '%s\\n' "$@"; }\nnode() { echo 'NODE WAS INVOKED' >&2; return 99; }\ncsc-test-cli() { echo 'CLI WAS INVOKED' >&2; }\nPATH=/nonexistent\nwords=(${words.map(quote).join(" ")})\nCURRENT=${words.length}\nPREFIX=${quote(words.at(-1))}\n${fn}\n`;
  }
  const result = runShell(executables[shell], shell === "fish" ? ["--no-config"] : ["-f"], {
    input,
    context: words,
    encoding: "utf8",
    timeout: 15000,
    killSignal: "SIGKILL",
    cwd,
  });
  assert.equal(
    result.status,
    0,
    `${result.error?.message ?? ""} ${result.stderr}; words=${JSON.stringify(words)}`,
  );
  assert.equal(result.stderr, "");
  return result.stdout
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t")[0]);
}

export function complete(shell, program, words, options = {}) {
  return shell === "bash"
    ? bashComplete(program, words, options)
    : otherComplete(shell, program, words, options.cwd);
}
