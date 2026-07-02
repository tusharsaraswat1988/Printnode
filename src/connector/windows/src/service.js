const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {
  APP_DIR,
  CONFIG_PATH,
  LOG_DIR,
  ensureAppDirs,
  loadConfig,
} = require("./shared");

ensureAppDirs();

const serviceLogPath = path.join(LOG_DIR, "service.log");
let daemonProcess = null;
let stopping = false;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(serviceLogPath, line, "utf8");
}

function resolveDaemonPath() {
  const candidates = [
    path.join(process.resourcesPath || "", "daemon", "print-daemon.js"),
    path.join(__dirname, "..", "..", "..", "daemon", "print-daemon.js"),
    path.join(process.cwd(), "src", "daemon", "print-daemon.js"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("Bundled print-daemon.js was not found");
  }
  return found;
}

function spawnDaemon() {
  const config = loadConfig();
  if (!config.printerId || !config.apiKey || !config.serverUrl) {
    log("Connector is not paired yet. Service will retry in 10 seconds.");
    setTimeout(spawnDaemon, 10000);
    return;
  }

  const daemonPath = resolveDaemonPath();
  const daemonLog = fs.openSync(path.join(LOG_DIR, "daemon.log"), "a");
  const daemonErr = fs.openSync(path.join(LOG_DIR, "daemon-error.log"), "a");
  const isElectronRuntime = Boolean(process.versions.electron);
  const command = process.execPath;
  const args = isElectronRuntime ? ["--daemon-child"] : [daemonPath];

  log(`Starting daemon for cloud printer ${config.printerId} and local printer ${config.printerName || "(default)"}`);
  daemonProcess = spawn(command, args, {
    cwd: APP_DIR,
    windowsHide: true,
    detached: false,
    env: {
      ...process.env,
      PRINTER_ID: config.printerId,
      API_KEY: config.apiKey,
      SERVER_URL: config.serverUrl,
      PRINTER_NAME: config.printerName || "",
      SUMATRAPDF_PATH: config.sumatraPath || "",
    },
    stdio: ["ignore", daemonLog, daemonErr],
  });

  daemonProcess.on("exit", (code, signal) => {
    log(`Daemon exited with code=${code} signal=${signal}`);
    daemonProcess = null;
    if (!stopping) {
      setTimeout(spawnDaemon, 5000);
    }
  });

  daemonProcess.on("error", (err) => {
    log(`Daemon failed to start: ${err.message}`);
    daemonProcess = null;
    if (!stopping) {
      setTimeout(spawnDaemon, 5000);
    }
  });
}

function shutdown() {
  stopping = true;
  log("Service shutdown requested.");
  if (daemonProcess) {
    daemonProcess.kill("SIGTERM");
  }
  setTimeout(() => process.exit(0), 1500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (err) => {
  log(`Uncaught exception: ${err.stack || err.message}`);
  process.exit(1);
});

spawnDaemon();
