const path = require("path");
const fs = require("fs");
const {
  APP_DIR,
  CONFIG_PATH,
  CONNECTOR_VERSION,
  LOG_DIR,
  claimToken,
  ensureAppDirs,
  installService,
  listWindowsPrinters,
  loadConfig,
  parseTokenFromArgs,
  restartService,
  saveConfig,
} = require("./shared");

const isDaemonChild = process.argv.includes("--daemon-child");
const isService = process.argv.includes("--service");

if (isDaemonChild) {
  const daemonPath = path.join(process.resourcesPath || path.join(__dirname, "..", "..", ".."), "daemon", "print-daemon.js");
  require(daemonPath);
} else if (isService) {
  require("./service");
} else {
const { app, BrowserWindow, ipcMain, Menu, Tray, shell, nativeImage } = require("electron");

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 620,
    minWidth: 620,
    minHeight: 520,
    title: "BidWar Printer Connector",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer.html"));
  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("BidWar Printer Connector");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Printer Status", click: () => showWindow() },
    { label: "Reconnect", click: () => showWindow() },
    { label: "Restart Connector", click: () => restartService().catch(() => {}) },
    { label: "Open Dashboard", click: () => openDashboard() },
    { label: "Check Updates", click: () => showWindow() },
    { type: "separator" },
    {
      label: "Exit",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]));
  tray.on("double-click", () => showWindow());
}

function showWindow() {
  if (!mainWindow) createWindow();
  mainWindow.show();
  mainWindow.focus();
}

function openDashboard() {
  const config = loadConfig();
  if (config.serverUrl) shell.openExternal(config.serverUrl);
}

app.whenReady().then(() => {
  ensureAppDirs();
  app.setLoginItemSettings({ openAtLogin: true, args: ["--tray"] });
  createWindow();
  createTray();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

ipcMain.handle("connector:init", async () => {
  return {
    version: CONNECTOR_VERSION,
    tokenContext: parseTokenFromArgs(),
    config: loadConfig(),
    configPath: CONFIG_PATH,
    logDir: LOG_DIR,
    appDir: APP_DIR,
  };
});

ipcMain.handle("connector:list-printers", async () => {
  return listWindowsPrinters();
});

ipcMain.handle("connector:pair", async (_event, payload) => {
  const tokenContext = payload.tokenContext || parseTokenFromArgs();
  const physicalPrinterName = payload.physicalPrinterName;
  const claimed = await claimToken({
    token: tokenContext.token,
    claimUrl: tokenContext.claimUrl || payload.claimUrl,
    physicalPrinterName,
  });

  const config = {
    printerId: claimed.printerId,
    apiKey: claimed.apiKey,
    serverUrl: claimed.serverUrl,
    printerName: claimed.printerName || physicalPrinterName,
    cloudPrinterName: claimed.cloudPrinterName,
    connectorVersion: claimed.connectorVersion || CONNECTOR_VERSION,
    pollInterval: claimed.pollInterval || 5000,
    heartbeatInterval: claimed.heartbeatInterval || 10000,
    pairedAt: new Date().toISOString(),
  };
  saveConfig(config);
  await installService(process.execPath);
  return { success: true, config };
});

ipcMain.handle("connector:restart-service", async () => {
  await restartService();
  return { success: true };
});

ipcMain.handle("connector:read-health", async () => {
  const config = loadConfig();
  const healthUrl = "http://127.0.0.1:3010/health";
  const text = await new Promise((resolve, reject) => {
    const client = healthUrl.startsWith("https") ? require("https") : require("http");
    const req = client.get(healthUrl, (res) => {
      let raw = "";
      res.on("data", (chunk) => raw += chunk);
      res.on("end", () => resolve(raw));
    });
    req.on("error", reject);
  });
  return {
    config,
    health: JSON.parse(text),
  };
});

ipcMain.handle("connector:open-dashboard", async () => {
  openDashboard();
  return { success: true };
});

ipcMain.handle("connector:read-logs", async () => {
  const files = ["service.log", "daemon.log", "daemon-error.log"];
  return files.map((file) => {
    const filePath = path.join(LOG_DIR, file);
    if (!fs.existsSync(filePath)) return { file, content: "" };
    const content = fs.readFileSync(filePath, "utf8").split(/\r?\n/).slice(-80).join("\n");
    return { file, content };
  });
});
}
