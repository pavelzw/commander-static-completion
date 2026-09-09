import { complete as completeShell } from "./helpers.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture } from "./fixture.js";
import { generateCompletion } from "../dist/index.js";

const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
const executables = { zsh: process.env.TEST_ZSH ?? "zsh", fish: process.env.TEST_FISH ?? "fish" };

const complete = (shell, words, cwd) => completeShell(shell, fixture(), words, { cwd });

for (const shell of ["zsh", "fish"]) {
  test(`${shell}: syntax and completion context`, () => {
    const script = generateCompletion(fixture(), { shell });
    const result = spawnSync(executables[shell], ["-n"], { input: script, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  });
}

test("fish: native filesystem completions, including assignments", () => {
  const cwd = mkdtempSync(join(tmpdir(), "csc-fish-"));
  try {
    writeFileSync(join(cwd, "two words.json"), "");
    mkdirSync(join(cwd, "two directories"));
    assert.deepEqual(complete("fish", ["csc-test-cli", "deploy", "--config", "two"], cwd).sort(), [
      "two directories/",
      "two words.json",
    ]);
    assert.deepEqual(complete("fish", ["csc-test-cli", "deploy", "--config=two"], cwd).sort(), [
      "--config=two directories/",
      "--config=two words.json",
    ]);
  } finally {
    rmSync(cwd, { recursive: true });
  }
});

for (const loading of ["source", "autoload"]) {
  test(`zsh: ${loading} native Tab insertion through ZLE, including file quoting`, () => {
    const cwd = mkdtempSync(join(tmpdir(), "csc-zle-"));
    try {
      writeFileSync(join(cwd, "two words.json"), "");
      const cases = [
        ["csc-test-cli deploy --target pr", "csc-test-cli deploy --target production "],
        ["csc-test-cli deploy --target=pr", "csc-test-cli deploy --target=production "],
        ["csc-test-cli deploy -vtpr", "csc-test-cli deploy -vtproduction "],
        ["csc-test-cli deploy --config two", "csc-test-cli deploy --config two\\ words.json "],
        ["csc-test-cli deploy --config=two", "csc-test-cli deploy --config=two\\ words.json "],
      ];
      for (const [line, expected] of cases) {
        rmSync(join(cwd, "result"), { force: true });
        const directory = join(cwd, "completion files");
        mkdirSync(directory, { recursive: true });
        const path = join(directory, "_csc-test-cli");
        writeFileSync(path, generateCompletion(fixture(), { shell: "zsh" }));
        const setup = `fpath=(${quote(directory)} "\${fpath[@]}")\nautoload -Uz compinit\ncompinit -D -u\n${loading === "source" ? `source ${quote(path)}` : ""}\ncsc-test-cli() { print -r -- 'CLI WAS INVOKED' > invoked; }\nPATH=/nonexistent\n_capture() { zle expand-or-complete; print -rn -- "$BUFFER" > result; print -r -- CSC_DONE; }\nzle -N _capture\nbindkey '^I' _capture\nprint -r -- CSC_READY\n`;
        writeFileSync(join(cwd, "setup.zsh"), setup);
        const driver = `zmodload zsh/zpty\nzpty worker ${quote(executables.zsh)} -f -i\nzpty -r worker output '*CSC_PROMPT*'\nzpty -w -n worker ${quote("source ./setup.zsh\r")}\nzpty -r worker output '*CSC_READY*'\nzpty -w -n worker ${quote(line + "\t")}\nzpty -r worker output '*CSC_DONE*'\nprint -r -- "$output"\nzpty -d worker\n[[ -f result && ! -f invoked ]]\n`;
        const result = spawnSync(executables.zsh, ["-f"], {
          input: driver,
          encoding: "utf8",
          cwd,
          timeout: 15000,
          env: { ...process.env, TERM: "xterm", PS1: "CSC_PROMPT> " },
        });
        assert.equal(result.status, 0, `${line}: ${result.stderr} ${result.stdout}`);
        assert.equal(readFileSync(join(cwd, "result"), "utf8"), expected);
      }
    } finally {
      rmSync(cwd, { recursive: true });
    }
  });
}

test("zsh: compinit discovers overrides and autoload works on first and repeated calls", () => {
  const cwd = mkdtempSync(join(tmpdir(), "csc-autoload-"));
  try {
    const names = ["mycli-preview", "mycli'quoted", "mycli$(literal)*"];
    for (const executable of names) {
      const script = generateCompletion(fixture(), { shell: "zsh", executable });
      assert.equal(script.split("\n")[0], `#compdef ${executable}`);
      writeFileSync(join(cwd, `_${executable}`), script);
    }
    const input = `fpath=(${quote(cwd)} "\${fpath[@]}")
autoload -Uz compinit
compinit -D -u
PATH=/nonexistent
compadd() { while [[ $1 != -- ]]; do shift; done; shift; print -rl -- "$@"; }
for executable in ${names.map(quote).join(" ")}; do
  [[ "\${_comps[$executable]}" == "_$executable" ]] || exit 1
  words=("$executable" deploy --target pr)
  CURRENT=4 PREFIX=pr
  "\${_comps[$executable]}"
  "\${_comps[$executable]}"
done
`;
    const result = spawnSync(executables.zsh, ["-f"], {
      cwd,
      input,
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.deepEqual(result.stdout.trim().split("\n"), Array(names.length * 2).fill("production"));
  } finally {
    rmSync(cwd, { recursive: true });
  }
});
