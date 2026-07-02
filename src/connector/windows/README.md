# BidWar Printer Connector for Windows

This package is the production Windows connector for BidWar Remote Print. It keeps the existing daemon as the print engine and wraps it with:

- one-time token pairing
- Windows printer discovery
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
npm run build
```

The production artifact is:

```text
src/connector/windows/dist/BidWar Printer Connector.exe
```

Copy that file to:

```text
dist/connectors/BidWar Printer Connector.exe
```

so the existing server endpoint can serve it from `/api/connectors/windows/download`.
