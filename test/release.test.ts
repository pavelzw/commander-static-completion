import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMetadata, checkRelease } from "../scripts/check-release.js";

function fixture(version = "0.1.0") {
  const manifest = {
    name: "commander-static-completion",
    version,
    license: "MIT",
    engines: { node: ">=22.12.0" },
    peerDependencies: { commander: "^14.0.0 || ^15.0.0" },
    repository: {
      type: "git",
      url: "git+https://github.com/pavelzw/commander-static-completion.git",
    },
    publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
  };
  const lock = { name: manifest.name, version, packages: { "": structuredClone(manifest) } };
  const changelog = `# Changelog\n\n## [Unreleased]\n\n## [${version}] - 2026-09-09\n\n- Release notes.\n`;
  return { manifest, lock, changelog };
}

test("release: stable and prerelease tags select separate npm channels", () => {
  for (const [version, expected] of [
    ["0.1.0", "latest"],
    ["1.2.3", "latest"],
    ["0.2.0-rc.1", "next"],
    ["1.0.0-beta", "next"],
    ["1.0.0-0", "next"],
  ]) {
    const { manifest, lock, changelog } = fixture(version);
    assert.equal(checkRelease(`v${version}`, manifest, lock, changelog), expected);
  }
});

test("release: invalid tags and version mismatches fail", () => {
  const { manifest, lock, changelog } = fixture();
  for (const tag of [
    "0.1.0",
    "v01.1.0",
    "v0.1",
    "v0.1.0+build",
    "v0.1.0-rc.01",
    "v0.1.0-",
    "v0.1.0\n",
    "v0.2.0",
  ]) {
    assert.throws(() => checkRelease(tag, manifest, lock, changelog), tag);
  }
});

test("release: missing or undated release notes fail", () => {
  const { manifest, lock } = fixture();
  for (const changelog of ["## [Unreleased]\n", "## [0.1.0]\n", "## [0.2.0] - 2026-09-09\n"]) {
    assert.throws(() => checkRelease("v0.1.0", manifest, lock, changelog), /dated changelog/);
  }
});

test("release: npm destination and stale lock metadata fail before publishing", () => {
  const { manifest, lock } = fixture();
  checkMetadata(manifest, lock);
  assert.throws(() => checkMetadata({ ...manifest, name: "other" }, lock), /package name/);
  assert.throws(
    () =>
      checkMetadata(
        { ...manifest, repository: { type: "git", url: "https://example.com/other.git" } },
        lock,
      ),
    /trusted publisher/,
  );
  assert.throws(
    () =>
      checkMetadata(
        { ...manifest, publishConfig: { access: "public", registry: "https://example.com" } },
        lock,
      ),
    /public npm/,
  );
  assert.throws(() => checkMetadata(manifest, { ...lock, version: "0.0.1" }), /Lockfile version/);
  for (const field of ["version", "license", "engines", "peerDependencies"] as const) {
    const stale = structuredClone(lock);
    delete (stale.packages[""] as Partial<typeof manifest>)[field];
    assert.throws(() => checkMetadata(manifest, stale), /Lockfile .* stale/);
  }
});
