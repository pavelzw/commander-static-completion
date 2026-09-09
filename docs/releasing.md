# Releasing

The release workflow follows [Diffle's publish workflow](https://github.com/moritzwilksch/diffle/blob/main/.github/workflows/publish.yml): pushing a `v*` tag publishes through GitHub Actions, using Node 24 and an environment named `npmjs`.

For this library, `.github/workflows/publish.yml` first calls the full CI matrix
on the tagged commit. Publishing also requires the tag, package version, lockfile
metadata, and dated changelog entry to agree. `prepack` builds a clean `dist/`
when `npm publish` prepares the package.

## One-time setup

The npm package is named `commander-static-completion`; the GitHub repository is
`pavelzw/commander-static-completion`. Confirm that the publishing account owns
this npm package before releasing.

The public registry returned 404 during setup. An npm owner must handle the
initial publication before configuring the package's trusted publisher in its
settings. That initial publication is a separate, deliberate release using an
authenticated maintainer account. Do not push that already-published version's
tag through this workflow: npm versions are immutable. Start the automated tag
workflow with the next unpublished version.

Create the GitHub environment `npmjs`. In the npm package's **Settings → Trusted
publishing**, add GitHub Actions with these exact values:

| Field                | Value                                |
| -------------------- | ------------------------------------ |
| Organization or user | `pavelzw`                            |
| Repository           | `commander-static-completion`        |
| Workflow filename    | `publish.yml`                        |
| Environment          | `npmjs`                              |
| Allowed action       | Direct publishing with `npm publish` |

The workflow grants `id-token: write` to the publishing job. It uses npm OIDC
trusted publishing; no `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is needed. npm
requires Node 22.14+ and npm 11.5.1+ for this authentication; the workflow uses
current Node 24. Public trusted-publisher releases receive provenance
automatically. See [npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

Creating these workflow files does not configure npm's account settings or
publish a package. A dry run checks packaging but cannot verify OIDC access.

## Versioning

Use Semantic Versioning, with these pre-1.0 conventions:

- `0.x` patch releases fix bugs and make compatible improvements.
- `0.x` minor releases may change the API, supported runtimes, or documented
  completion behavior incompatibly. Describe such changes in the changelog.
- From `1.0.0`, incompatible changes require a major version bump.
- Prereleases such as `0.2.0-rc.1` publish under npm's `next` dist-tag. Stable
  releases publish under `latest`.
- Tags use `v<version>`, with no SemVer build metadata. Never move a published
  release tag or reuse an npm version.

## Release checklist

1. Start from an up-to-date, clean `main`. Review the compatibility audit,
   generated-script diffs, and interactive snapshots for the changes being shipped.
2. Choose an unpublished version and update both manifests without making a tag:

   ```sh
   npm version 0.2.0 --no-git-tag-version
   ```

   For the first publication, the current version is already `0.1.0`; retain it
   if that is the intended initial version. Keep the initial-release bootstrap
   separate from the automated tag workflow described above.

3. Move the relevant `CHANGELOG.md` entries from `[Unreleased]` into a dated
   section, for example `## [0.2.0] - 2026-09-10`. Keep an `[Unreleased]` section
   for subsequent work. Include migration notes when needed.
4. Run the release checks with the intended tag:

   ```sh
   npm ci
   npm run validate
   npm run check:release -- v0.2.0
   npm publish --dry-run
   ```

   Review the file list and confirm the package name, version, public access,
   README, changelog, compiled files, declarations, and source maps. These
   commands do not publish or create tags. The shell tests require Bash, Fish,
   and Zsh as described in the README.

5. Commit the version, changelog, and any installation-documentation changes.
   Push `main` and wait for CI to pass on that commit.
6. Create and push the release tag on that same commit:

   ```sh
   git tag -a v0.2.0 -m "Release v0.2.0"
   git push origin v0.2.0
   ```

   **Pushing this tag starts publication.** The workflow revalidates the tagged
   commit, checks the release metadata, and publishes after validation succeeds.

7. Check the Publish workflow and verify the published version and channel:

   ```sh
   npm view commander-static-completion@0.2.0 version dist.integrity
   npm view commander-static-completion dist-tags
   ```

   For prereleases, verify `next` rather than `latest`. Optionally create a GitHub
   Release for the existing tag with the corresponding changelog notes after
   publication succeeds.

## Failed releases

- If validation fails, fix the issue on `main`. Use a new release version/tag
  when the release contents change.
- If npm rejects OIDC authentication, compare the trusted-publisher fields with
  the table above. Once corrected, rerun the failed publish job for the same tag.
- Before retrying an interrupted publish, check whether npm already has that
  version. If it does, confirm publication succeeded; do not attempt to overwrite
  it. This workflow deliberately does not silently skip existing versions.
- If the package was published with a defect, release a new version with the fix.
