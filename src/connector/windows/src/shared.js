const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const { execFile } = require("child_process");

const CONNECTOR_VERSION = "2.1.0";
const SERVICE_NAME = "BidWarPrinterConnector";
const SERVICE_DISPLAY_NAME = "BidWar Printer Connector";
const APP_DIR = path.join(process.env.ProgramData || "C:\\ProgramData", "BidWar", "PrinterConnector");
const CONFIG_PATH = path.join(APP_DIR, "config.json");
const LOG_DIR = path.join(APP_DIR, "logs");

function ensureAppDirs() {
  fs.mkdirSync(APP_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    return fallback;
  }
}

function loadConfig() {
  return readJson(CONFIG_PATH, {});
}

function saveConfig(config) {
  ensureAppDirs();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  if (process.platform === "win32") {
    execFile("icacls.exe", [CONFIG_PATH, "/inheritance:r", "/grant:r", "SYSTEM:F", "Administrators:F"], () => {});
  } else {
    fs.chmodSync(CONFIG_PATH, 0o600);
  }
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : null;
    const client = url.startsWith("https") ? https : http;
    const req = client.request(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `BidWarPrinterConnector/${CONNECTOR_VERSION}`,
        ...(options.headers || {}),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => raw += chunk);
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch (err) {
          return reject(new Error(`Invalid JSON from ${url}: ${raw.slice(0, 120)}`));
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
        }
        resolve(parsed);
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function findBundledToken() {
  const candidates = [
    path.join(process.resourcesPath || "", "install-token.json"),
    path.join(path.dirname(process.execPath || ""), "install-token.json"),
    path.join(process.cwd(), "install-token.json"),
  ];
  for (const candidate of candidates) {
    const data = readJson(candidate);
    if (data && data.token && data.claimUrl) return data;
  }
  return null;
}

function parseTokenFromExecutableName() {
  const exeName = path.basename(process.execPath || "");
  const match = exeName.match(/^BidWar Printer Connector--([A-Za-z0-9_-]+)\.exe$/i);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64url").toString("utf8");
    const payload = JSON.parse(decoded);
    if (payload.token && payload.claimUrl) return payload;
  } catch (err) {}
  return null;
}

function parseTokenFromArgs(argv = process.argv) {
  const tokenArg = argv.find((arg) => arg.startsWith("--token="));
  const claimArg = argv.find((arg) => arg.startsWith("--claim-url="));
  if (tokenArg) {
    return {
      token: tokenArg.substring("--token=".length),
      claimUrl: claimArg ? claimArg.substring("--claim-url=".length) : "",
    };
  }

  const deepLink = argv.find((arg) => arg.startsWith("bidwar-printer://"));
  if (deepLink) {
    const parsed = new URL(deepLink);
    return {
      token: parsed.searchParams.get("token") || "",
      claimUrl: parsed.searchParams.get("claimUrl") || "",
    };
  }

  if (process.env.BIDWAR_INSTALL_TOKEN) {
    return {
      token: process.env.BIDWAR_INSTALL_TOKEN,
      claimUrl: process.env.BIDWAR_CLAIM_URL || "",
    };
  }

  return parseTokenFromExecutableName() || findBundledToken();
}

function listWindowsPrinters() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve([]);
    const args = [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-Command",
      "Get-Printer | Sort-Object Name | Select-Object -ExpandProperty Name",
    ];
    execFile("powershell.exe", args, { windowsHide: true }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    });
  });
}

function runSc(args) {
  return new Promise((resolve, reject) => {
    execFile("sc.exe", args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || stdout || err.message));
      resolve(stdout);
    });
  });
}

async function installService(executablePath) {
  const binPath = `"${executablePath}" --service`;
  try {
    await runSc(["stop", SERVICE_NAME]);
  } catch (err) {}
  try {
    await runSc(["delete", SERVICE_NAME]);
  } catch (err) {}
  await runSc(["create", SERVICE_NAME, `binPath=`, binPath, `start=`, "auto", `DisplayName=`, SERVICE_DISPLAY_NAME]);
  await runSc(["failure", SERVICE_NAME, "reset=", "60", "actions=", "restart/5000/restart/5000/restart/5000"]);
  await runSc(["start", SERVICE_NAME]);
}

async function restartService() {
  try {
    await runSc(["stop", SERVICE_NAME]);
  } catch (err) {}
  await runSc(["start", SERVICE_NAME]);
}

async function claimToken({ token, claimUrl, physicalPrinterName }) {
  if (!token) throw new Error("Missing installation token");
  if (!claimUrl) throw new Error("Missing connector claim URL");
  return requestJson(claimUrl, {
    method: "POST",
    body: {
      token,
      physicalPrinterName,
      hostname: os.hostname(),
      connectorVersion: CONNECTOR_VERSION,
    },
  });
}

module.exports = {
  APP_DIR,
  CONFIG_PATH,
  CONNECTOR_VERSION,
  LOG_DIR,
  SERVICE_DISPLAY_NAME,
  SERVICE_NAME,
  claimToken,
  ensureAppDirs,
  installService,
  listWindowsPrinters,
  loadConfig,
  parseTokenFromArgs,
  restartService,
  saveConfig,
};
