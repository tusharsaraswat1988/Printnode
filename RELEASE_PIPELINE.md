# Automated Windows Connector Release Pipeline

This document explains the automated CI/CD and deployment architecture for building, releasing, and serving the Windows Print Connector executable (`BidWar-Printer-Connector.exe`).

---

## 1. Pipeline Overview

The pipeline removes all dependencies on manual local builds and direct repository storage of binary files by using **GitHub Actions** for automated packaging and a **self-healing fallback cache mechanism** inside the production Express server on Render.

```
[ Push to main ] 
       │
       ▼
 ┌───────────┐
 │  GitHub   │ ──────► Compiles & Packages print-daemon.js into Windows Executable (.exe)
 │  Actions  │
 └───────────┘
       │
       ▼
 ┌───────────┐
 │  GitHub   │ ──────► Automatically updates the "latest" release with the new executable
 │  Releases │
 └───────────┘
       ▲
       │ (1-Hour Cache Polling & On-Demand Fallback Download)
       │
 ┌───────────┐
 │  Express  │ ──────► Serves cache instantly or redirects users directly to GitHub
 │ (Render)  │         if any disk, permissions, or system issues occur.
 └───────────┘
```

---

## 2. GitHub Actions CI/CD Workflow (`.github/workflows/release.yml`)

The workflow is configured to trigger on any `push` to the `main` branch, tag creation (e.g., `v*`), or manual trigger (`workflow_dispatch`).

### Workflow Steps:
1. **Checkout Code**: Checks out the latest source files.
2. **Setup Node.js**: Installs Node 18 environments.
3. **Packaging with `pkg`**: Calls the Vercel `pkg` compiler to build a standalone, single-file Windows x64 binary containing the print daemon and Node runtime:
   ```bash
   npx pkg src/daemon/print-daemon.js --targets node18-win-x64 --output dist/BidWar-Printer-Connector.exe
   ```
4. **Publish Action Artifact**: Uploads the compiled binary to the GitHub Action workflow artifacts pool.
5. **Auto-Update GitHub Release**: Re-creates/updates a perpetual GitHub release tagged as `latest` and uploads `BidWar-Printer-Connector.exe` as its asset.

---

## 3. Server-Side Cache, Build-Time Compilation, & Fallback Architecture (`server.ts`)

To ensure absolute resilience and eliminate any potential "404 Not Found" or download delays, the application uses a **hybrid delivery model**:

1. **Build-Time Compilation (Primary & Fail-safe)**:
   During the Render deployment's build phase (`npm run build`), the build system automatically packages `src/daemon/print-daemon.js` using `pkg` directly inside the container:
   ```bash
   pkg src/daemon/print-daemon.js --targets node18-win-x64 --output uploads/BidWar-Printer-Connector.exe
   ```
   This guarantees that a fully up-to-date compiled Windows Connector executable is **always present locally** inside the container as soon as the deployment goes live.

2. **Custom GitHub Releases (Optional & Dynamic)**:
   If you have configured a custom GitHub repository to deliver central releases, you can set the `GITHUB_REPO` environment variable (e.g. `GITHUB_REPO="your-username/your-repo"`).
   - If `GITHUB_REPO` is set, the server checks if the local cached version is older than **1 hour**.
   - If stale, it attempts to dynamically pull the newest release binary from GitHub to keep the cache updated.

3. **Graceful Fallback & Zero-Failure Guarantee**:
   If the GitHub repository URL is not yet created, returns a 404 error, or encounters rate limits, the server **gracefully catches the error** and serves the locally compiled `uploads/BidWar-Printer-Connector.exe` built during the deployment. The user receives a perfectly functional binary with zero interruption, avoiding broken redirects or broken links.

---

## 4. How to Use & Update

- **To Release a New Version**: Simply push your changes to the `main` branch. The GitHub Action will compile and publish the executable immediately.
- **Client Access**: Users on the dashboard will click the "Download Connector" button which points to `/api/connectors/windows/download`, and they will automatically receive the newest version.
