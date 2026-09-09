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

test("zsh: native Tab insertion through ZLE, including file quoting", () => {
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
      const setup = `autoload -Uz compinit\ncompinit -D -u\n${generateCompletion(fixture(), { shell: "zsh" })}\ncsc-test-cli() { print -r -- 'CLI WAS INVOKED' > invoked; }\n_capture() { zle expand-or-complete; print -rn -- "$BUFFER" > result; print -r -- CSC_DONE; }\nzle -N _capture\nbindkey '^I' _capture\nprint -r -- CSC_READY\n`;
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
