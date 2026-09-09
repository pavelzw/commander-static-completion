import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

export function assertSnapshot(path, actual) {
  if (process.env.UPDATE_SNAPSHOTS === "1") {
    assert.ok(!process.env.CI, "Snapshot updates are disabled in CI");
    writeFileSync(path, actual);
    return;
  }
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
