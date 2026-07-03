# SumatraPDF Bundling Report

## Chosen approach

The connector now uses a pinned, vendored SumatraPDF runtime instead of downloading "latest" binaries during `npm run build`.

- The exact upstream artifact is recorded in `resources/vendor/sumatra-manifest.json`.
- Production packaging runs `npm run verify:sumatra` and fails before `electron-builder` if the vendored binary is missing, corrupted, or signed by an unexpected publisher.
- Runtime refresh is a separate maintainer step: `npm run prepare:sumatra`.

## Why this is reliable for production

- Builds are deterministic because the packaged executable is pinned to one release, one archive hash, one executable hash, and one signing certificate.
- Offline builds are safe because packaging no longer depends on external downloads. If the vendored runtime is absent, the build fails with a clear remediation message instead of silently fetching a moving target.
- Corrupted or partial downloads are blocked because the refresh flow validates the archive checksum, confirms the extracted executable checksum, verifies the Authenticode signature, and only then atomically replaces the vendored file.
- Packaged artifacts are tested because `npm run test:packaged-sumatra` verifies the bundled executable exists inside `dist/win-unpacked/resources/daemon/bin`, re-checks its checksum/signature, and confirms it can be launched.

## CI/CD guidance

- Prefer committing `resources/vendor/SumatraPDF.exe` and `resources/vendor/sumatra-manifest.json` so CI consumes the same pinned runtime as local release builds.
- If your CI system uses a clean workspace cache, cache `src/connector/windows/resources/vendor/` between jobs and run `npm run verify:sumatra` before packaging.
- Only run `npm run prepare:sumatra` in a connected maintenance job when intentionally updating the pinned SumatraPDF version.

## Licensing compliance

- The installer now carries SumatraPDF notice and license files under `resources/legal/SumatraPDF/`.
- `resources/legal/SumatraPDF/NOTICE.txt` documents the exact corresponding-source URL for the redistributed version and the redistribution obligations that go with GPL-licensed software.
