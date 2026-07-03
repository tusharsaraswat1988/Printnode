# BidWar Printer Connector for Windows

This package is the production Windows connector for BidWar Remote Print. It keeps the existing daemon as the print engine and wraps it with:

- one-time token pairing
- Windows printer discovery
- bundled PDF printing support via SumatraPDF, installed automatically with the connector
- secure local credential storage under `ProgramData\BidWar\PrinterConnector`
- Windows Service installation with automatic startup and restart-on-failure
- system tray controls for status, restart, dashboard, updates, and exit

The connector does not introduce a new queue or backend protocol. It still uses:

- `/api/printers/ping`
- `/api/jobs/poll/:printerId`
- `/api/jobs/:id/download`
- `/api/jobs/:id/status`

## Token Flow

The BidWar web dashboard creates a short-lived connector token for an existing registered printer. The installer consumes that token, lets the user select a Windows printer, claims the token, stores the returned `printerId` and `apiKey`, and starts the Windows Service.

Supported token sources:

- bundled `install-token.json` inside the installer resources
- `--token=<token> --claim-url=<url>` for managed deployment
- `bidwar-printer://connect?token=<token>&claimUrl=<url>` after protocol registration
- `BIDWAR_INSTALL_TOKEN` and `BIDWAR_CLAIM_URL` environment variables

## Build

Install dependencies in this folder and build the installer:

```powershell
npm install
npm run build:release
```

Production packaging is deterministic and offline-safe:

- `npm run build` verifies the pinned vendored SumatraPDF runtime and then packages the installer.
- `npm run build:release` also runs a packaged-runtime smoke test to confirm `SumatraPDF.exe` exists and is launchable from the unpacked app.
- `npm run prepare:sumatra` is the maintainer-only refresh step for intentionally updating the pinned SumatraPDF runtime in a connected environment.

If the vendored runtime is missing, corrupted, or signed by an unexpected publisher, the build fails with a clear error instead of downloading a replacement during packaging.

The pinned runtime metadata lives in `resources/vendor/sumatra-manifest.json`.

The production artifact is:

```text
src/connector/windows/dist/BidWar Printer Connector.exe
```

Copy that file to:

```text
dist/connectors/BidWar Printer Connector.exe
```

so the existing server endpoint can serve it from `/api/connectors/windows/download`.

## SumatraPDF Runtime Policy

The connector vendors `resources/vendor/SumatraPDF.exe` and validates it before packaging:

- portable archive SHA-256
- extracted executable SHA-256
- Authenticode signer subject and thumbprint

The refresh flow downloads into a temporary directory, validates the archive and extracted executable, and only then atomically replaces the vendored copy. Partial or corrupted downloads are never packaged.

## Licensing

SumatraPDF is redistributed as an unmodified third-party executable. The installer includes license and notice files from `resources/legal/SumatraPDF/`, including the GPL text and a corresponding-source URL for the exact upstream tag shipped with the connector.

See `SUMATRAPDF_BUNDLING_REPORT.md` for a short production-reliability summary.
