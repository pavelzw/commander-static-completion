import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fixture } from "./fixture.js";
import { capture } from "./snapshot-harness.js";

const cases = [
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
  ["directory", "csc-test-cli deploy --config nest<TAB>"],
  ["ambiguous", "csc-test-cli deploy --color <TAB><TAB>"],
];
for (const [name, input] of cases) {
  test(`interactive snapshot: ${name}`, async () => {
    const sections = [];
    for (const shell of ["bash", "fish", "zsh"]) {
      const program = fixture();
      program.command("tasks");
      program.command("tags");
      sections.push(`Shell: ${shell}\n\n${await capture(shell, program, input)}`);
    }
    const actual = `Input: ${input}\n\n${sections.join("\n---\n\n")}`;
    const path = new URL(`./snapshots/${name}.snap`, import.meta.url);
    if (process.env.UPDATE_SNAPSHOTS === "1") {
      assert.ok(!process.env.CI, "Snapshot updates are disabled in CI");
      writeFileSync(path, actual);
    } else {
      let expected;
      try {
        expected = readFileSync(path, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        assert.fail(
          `Missing snapshot: ${path.pathname}. Run npm run test:snapshots:update and review the diff.`,
        );
      }
      assert.equal(
        actual,
        expected,
        `Snapshot changed: ${path.pathname}. Review before running npm run test:snapshots:update.`,
      );
    }
  });
}
