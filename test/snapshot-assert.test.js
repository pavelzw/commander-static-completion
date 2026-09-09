import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertShellSnapshot } from "./snapshot-assert.js";

test("shell snapshot variants preserve untested versions and reject missing or changed output", () => {
  const directory = mkdtempSync(join(tmpdir(), "csc-variants-"));
  const path = pathToFileURL(join(directory, "case.snap"));
  const previous = { CI: process.env.CI, UPDATE_SNAPSHOTS: process.env.UPDATE_SNAPSHOTS };
  const oldBash = "Shell: bash (3.2)\n\n> old▏\n";
  const newBash = "Shell: bash (4+)\n\n> new▏\n";
  try {
    delete process.env.CI;
    process.env.UPDATE_SNAPSHOTS = "1";
    assertShellSnapshot(path, "cli<TAB>", [oldBash]);
    assertShellSnapshot(path, "cli<TAB>", [newBash]);
    const saved = readFileSync(path, "utf8");
    assert.ok(saved.includes(oldBash));
    assert.ok(saved.includes(newBash));
    assert.throws(() => assertShellSnapshot(path, "changed<TAB>", [newBash]), /changing input/);
    process.env.CI = "true";
    assert.throws(() => assertShellSnapshot(path, "cli<TAB>", [newBash]), /disabled in CI/);
    delete process.env.UPDATE_SNAPSHOTS;
    assertShellSnapshot(path, "cli<TAB>", [oldBash]);
    assertShellSnapshot(path, "cli<TAB>", [newBash]);
    assert.throws(() => assertShellSnapshot(path, "cli<TAB>", ["Shell: fish\n\nmissing\n"]));
    assert.throws(() => assertShellSnapshot(path, "cli<TAB>", [newBash.replace("new", "changed")]));
    assert.equal(readFileSync(path, "utf8"), saved);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
