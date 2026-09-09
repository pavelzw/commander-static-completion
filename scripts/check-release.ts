import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

interface Manifest {
  name: string;
  version: string;
  license?: string;
  engines?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  repository?: { type: string; url: string };
  publishConfig?: { access: string; registry: string };
}
interface Lockfile {
  name: string;
  version: string;
  packages: Record<string, Partial<Manifest>>;
}

export function checkMetadata(manifest: Manifest, lock: Lockfile): void {
  assert.equal(manifest.name, "commander-static-completion", "Unexpected npm package name");
  assert.deepEqual(
    manifest.repository,
    {
      type: "git",
      url: "git+https://github.com/pavelzw/commander-static-completion.git",
    },
    "Repository metadata must match the trusted publisher",
  );
  assert.deepEqual(
    manifest.publishConfig,
    {
      access: "public",
      registry: "https://registry.npmjs.org/",
    },
    "Publish to the public npm registry",
  );
  assert.equal(lock.name, manifest.name, "Lockfile package name is stale");
  assert.equal(lock.version, manifest.version, "Lockfile version is stale");
  assert.ok(lock.packages[""], "Lockfile root package is missing");
  for (const field of ["name", "version", "license", "engines", "peerDependencies"] as const) {
    assert.deepEqual(lock.packages[""][field], manifest[field], `Lockfile ${field} is stale`);
  }
}

export function checkRelease(
  tag: string,
  manifest: Manifest,
  lock: Lockfile,
  changelog: string,
): "latest" | "next" {
  checkMetadata(manifest, lock);
  // Release tags use canonical SemVer, without build metadata.
  const match =
    /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u.exec(
      tag,
    );
  assert.ok(match, "Use a release tag such as v0.1.0 or v0.2.0-rc.1");
  const prerelease = match[4];
  if (prerelease) {
    assert.ok(
      prerelease
        .split(".")
        .every((part) => !/^\d+$/u.test(part) || part === "0" || !part.startsWith("0")),
      "Numeric prerelease identifiers must not have leading zeros",
    );
  }
  assert.equal(tag, `v${manifest.version}`, "Release tag must match package.json version");
  assert.ok(
    changelog
      .split("\n")
      .some(
        (line) =>
          line.startsWith(`## [${manifest.version}] - `) && / - \d{4}-\d{2}-\d{2}$/u.test(line),
      ),
    "Add a dated changelog entry for this version before tagging",
  );
  return prerelease ? "next" : "latest";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as Manifest;
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as Lockfile;
  const tag = process.argv[2];
  if (tag) {
    const distTag = checkRelease(tag, manifest, lock, readFileSync("CHANGELOG.md", "utf8"));
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `dist-tag=${distTag}\n`);
    console.log(`Release ${tag} validated; npm dist-tag: ${distTag}`);
  } else {
    checkMetadata(manifest, lock);
    console.log("Package and lockfile release metadata agree.");
  }
}
