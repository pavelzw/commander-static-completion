import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCompletion } from "../dist/index.js";
import { generatedSnapshotFixture } from "./fixture.js";
import { assertSnapshot } from "./snapshot-assert.js";

for (const shell of ["bash", "fish", "zsh"]) {
  test(`generated script snapshot: ${shell}`, () => {
    const generate = () => generateCompletion(generatedSnapshotFixture(), { shell });
    const actual = generate();
    assert.equal(generate(), actual, "Fresh equivalent definitions must generate identical output");
    assertSnapshot(new URL(`./snapshots/generated/${shell}.snap`, import.meta.url), actual);
  });
}
