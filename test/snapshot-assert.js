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

// Keep version-specific terminal output in the same case file. Updating one
// installed shell preserves the other version's reviewed output; CI checks both.
export function assertShellSnapshot(path, input, sections) {
  let saved = "";
  try {
    saved = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const header = `Input: ${input}\n\n`;
  const blocks = saved.startsWith(header) ? saved.slice(header.length).split("\n---\n\n") : [];
  const byShell = new Map(blocks.filter(Boolean).map((block) => [block.split("\n")[0], block]));
  if (process.env.UPDATE_SNAPSHOTS === "1") {
    assert.ok(!process.env.CI, "Snapshot updates are disabled in CI");
    assert.ok(!saved || saved.startsWith(header), "Update all shell variants when changing input");
    for (const section of sections) byShell.set(section.split("\n")[0], section);
    const ordered = [...byShell].sort(([a], [b]) => a.localeCompare(b)).map(([, block]) => block);
    writeFileSync(path, header + ordered.join("\n---\n\n"));
    return;
  }
  assert.ok(saved.startsWith(header), `Missing snapshot or changed input: ${path.pathname}`);
  for (const section of sections) {
    const label = section.split("\n")[0];
    assert.equal(section, byShell.get(label), `Snapshot changed: ${path.pathname}: ${label}`);
  }
}
