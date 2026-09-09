import { test } from "node:test";
import { assertSnapshot } from "./snapshot-assert.js";
import {
  fixture,
  defaultSnapshotFixture,
  optionalClusterSnapshotFixture,
  descriptionFixture,
} from "./fixture.js";
import { capture } from "./snapshot-harness.js";

const cases = [
  ["descriptions-commands", "csc-test-cli s<TAB><TAB>", descriptionFixture],
  ["descriptions-options", "csc-test-cli --<TAB><TAB>", descriptionFixture],
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
  ["directory", "csc-test-cli deploy --config nest<TAB>"],
  ["ambiguous", "csc-test-cli deploy --color <TAB><TAB>"],
];
for (const [name, input, makeProgram] of cases) {
  test(`interactive snapshot: ${name}`, async () => {
    const sections = [];
    for (const shell of ["bash", "fish", "zsh"]) {
      const program = makeProgram ? makeProgram() : fixture();
      if (!makeProgram) {
        program.command("tasks");
        program.command("tags");
      }
      sections.push(`Shell: ${shell}\n\n${await capture(shell, program, input)}`);
    }
    const actual = `Input: ${input}\n\n${sections.join("\n---\n\n")}`;
    const path = new URL(`./snapshots/${name}.snap`, import.meta.url);
    assertSnapshot(path, actual);
  });
}
