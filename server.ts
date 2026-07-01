import express from "express";
import path from "path";
import fs from "fs";
import cookieParser from "cookie-parser";
import session from "express-session";
import { createServer as createViteServer } from "vite";
import { PrintJob, Printer } from "./src/types";
import { FirebaseFileStorage } from "./src/storage/firebaseStorage";
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}
const db = admin.firestore();
const storage = new FirebaseFileStorage();

// In-memory / File persistent data store
const STORE_PATH = path.join(process.cwd(), "print_store.json");

let printers: Printer[] = [
  {
    id: "printer-hp-tank-1",
    name: "Hp laserjet tank mfp 1005",
    location: "Home Office",
    status: "online",
    apiKey: "print_k_" + Math.random().toString(36).substr(2, 6),
    jobCount: 0,
    lastSeen: new Date().toISOString(),
  },
  {
    id: "printer-hp-mgp-1",
    name: "Hp laserjet mgp 1005",
    location: "Living Room",
    status: "offline",
    apiKey: "print_k_" + Math.random().toString(36).substr(2, 6),
    jobCount: 0,
    lastSeen: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  }
];

let jobs: PrintJob[] = [];
let users: { mobile: string; password: string }[] = [
  { mobile: "1234567890", password: "123456" } // Default admin/user
];

// Load from disk if exists
function loadStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const data = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
      if (data.printers) printers = data.printers;
      if (data.jobs) jobs = data.jobs;
      if (data.users) users = data.users;
      console.log("Successfully loaded print store from disk");
    }
  } catch (err) {
    console.error("Error loading print store, using default memory state", err);
  }
}

// Save to disk
function saveStore() {
  try {
    const data = { printers, jobs, users };
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving print store to disk", err);
  }
}

// Initialize
loadStore();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set up body parsers with limits for uploads (up to 50MB)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use((req: any, res: any, next: any) => {
    console.log(`[Request] ${req.method} ${req.path}, Session: ${JSON.stringify(req.session)}`);
    next();
  });
  app.use(session({
    secret: 'secret-key-123',
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false, sameSite: 'lax', path: '/' }
  }));

  // Auth Middleware
  const isAuthenticated = (req: any, res: any, next: any) => {
    if (req.session.user) {
      next();
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  };

  // Auth API
  app.post("/api/login", (req: any, res: any) => {
    const { mobile, password } = req.body;
    const user = users.find(u => u.mobile === mobile && u.password === password);
    if (user) {
      req.session.user = { mobile };
      req.session.save((err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to save session" });
        }
        res.json({ success: true });
      });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  app.post("/api/logout", (req: any, res: any) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/me", (req: any, res: any) => {
    res.json({ user: req.session.user || null });
  });

  // Admin API (simplified)
  app.post("/api/admin/users", (req: any, res: any) => {
    // Basic protection: only allowing if mobile matches default or some check
    if (!req.session.user || req.session.user.mobile !== "1234567890") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { mobile, password } = req.body;
    const existingIndex = users.findIndex(u => u.mobile === mobile);
    if (existingIndex !== -1) {
      users[existingIndex].password = password;
    } else {
      users.push({ mobile, password });
    }
    saveStore();
    res.json({ success: true });
  });

  // Protect all API routes except login
  app.use("/api", (req, res, next) => {
    if (req.path === "/login" || req.path === "/me" || req.path === "/printers/ping" || req.path.startsWith("/jobs/poll/") || req.path === "/download-daemon") {
      next();
    } else {
      isAuthenticated(req, res, next);
    }
  });

  // Helper: auto offline checker middleware or function
  // Mark printers offline if they haven't pinged in 2 minutes
  function checkPrinterStatuses() {
    const now = Date.now();
    let updated = false;
    printers = printers.map(p => {
      // Keep demo printer online if it was set so, but check others
      if (p.id === "printer-wired-pc" && now - new Date(p.lastSeen).getTime() > 10 * 60 * 1000) {
        // Refresh demo printer last seen to keep it available as demo
        p.lastSeen = new Date().toISOString();
        updated = true;
      }
      
      const lastSeenTime = new Date(p.lastSeen).getTime();
      const diffMinutes = (now - lastSeenTime) / (1000 * 60);
      
      if (diffMinutes > 2 && p.status !== "offline") {
        p.status = "offline";
        updated = true;
      }
      return p;
    });
    if (updated) {
      saveStore();
    }
  }

  // Set interval to check printer statuses
  setInterval(checkPrinterStatuses, 10000);

  // --- API ROUTES ---

  // 1. GET /api/printers - List all printers
  app.get("/api/printers", (req, res) => {
    checkPrinterStatuses();
    res.json(printers);
  });

  // 2. POST /api/printers - Register a new printer
  app.post("/api/printers", (req, res) => {
    const { name, location } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Printer name is required" });
    }

    const id = "printer-" + Math.random().toString(36).substr(2, 9);
    const apiKey = "print_k_" + Math.random().toString(36).substr(2, 6);

    const newPrinter: Printer = {
      id,
      name,
      location: location || "Unknown Location",
      status: "online",
      apiKey,
      jobCount: 0,
      lastSeen: new Date().toISOString(),
    };

    printers.push(newPrinter);
    saveStore();

    res.status(201).json(newPrinter);
  });

  // 3. DELETE /api/printers/:id - Delete printer
  app.delete("/api/printers/:id", (req, res) => {
    const { id } = req.params;
    const index = printers.findIndex(p => p.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Printer not found" });
    }

    printers.splice(index, 1);
    // Also clear jobs for this printer? Let's keep jobs but maybe mark or delete
    jobs = jobs.filter(j => j.printerId !== id);
    
    saveStore();
    res.json({ success: true, message: "Printer and associated jobs deleted" });
  });

  // 4. POST /api/printers/ping - Printer client ping
  app.post("/api/printers/ping", (req, res) => {
    const { apiKey, printerId } = req.body;
    if (!apiKey || !printerId) {
      return res.status(400).json({ error: "apiKey and printerId are required" });
    }

    const printer = printers.find(p => p.id === printerId && p.apiKey === apiKey);
    if (!printer) {
      return res.status(401).json({ error: "Unauthorized / Printer not registered" });
    }

    printer.lastSeen = new Date().toISOString();
    
    // If it was offline, mark online
    if (printer.status === "offline") {
      printer.status = "online";
    }

    // Handle detected printers
    if (req.body.detectedPrinters && Array.isArray(req.body.detectedPrinters)) {
      // Logic to auto-register or update if needed
      console.log(`Detected printers from ${printerId}:`, req.body.detectedPrinters);
      // For now, just log them, maybe update the printer name if it's the one?
    }

    // Check if there are any active printing jobs, if so keep status as "printing"
    const hasActivePrintingJobs = jobs.some(j => j.printerId === printerId && j.status === "printing");
    if (hasActivePrintingJobs) {
      printer.status = "printing";
    } else if (printer.status === "printing") {
      printer.status = "online";
    }

    saveStore();
    res.json({ success: true, status: printer.status });
  });

  // 5. GET /api/jobs - List all print jobs (exclude full fileData payload for light network traffic)
  app.get("/api/jobs", (req, res) => {
    const { printerId } = req.query;
    let filteredJobs = jobs;

    if (printerId) {
      filteredJobs = jobs.filter(j => j.printerId === printerId);
    }

    // Map jobs to ensure clean response
    const lightJobs = filteredJobs.map(({ ...rest }) => rest);
    res.json(lightJobs);
  });

  // Cleanup orphaned files on startup
  async function cleanupOrphanedFiles() {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) return;
    
    const files = fs.readdirSync(uploadDir);
    const validFileIds = new Set(jobs.map(j => j.fileId));
    
    for (const file of files) {
      if (!validFileIds.has(file)) {
        console.log(`Cleaning orphaned file: ${file}`);
        await storage.delete(file);
      }
    }
  }
  cleanupOrphanedFiles();

  // 6. POST /api/jobs - Submit a new print job
  app.post("/api/jobs", async (req, res) => {
    const { printerId, fileName, fileType, fileSize, fileData, copies, colorMode, paperSize } = req.body;

    if (!printerId || !fileName || !fileData) {
      return res.status(400).json({ error: "printerId, fileName, and fileData (base64) are required" });
    }

    const printer = printers.find(p => p.id === printerId);
    if (!printer) {
      return res.status(404).json({ error: "Printer not found" });
    }

    const newJob: PrintJob = {
      id: "job-" + Math.random().toString(36).substr(2, 9),
      printerId,
      fileName,
      fileType: fileType || "application/octet-stream",
      fileSize: fileSize || 0,
      fileId: "", // Will be filled below
      copies: copies || 1,
      colorMode: colorMode || "color",
      paperSize: paperSize || "Letter",
      status: "pending",
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save file
    try {
      let base64Data = fileData;
      if (base64Data.includes(";base64,")) {
        base64Data = base64Data.split(";base64,").pop() || "";
      }
      const buffer = Buffer.from(base64Data, "base64");
      newJob.fileId = newJob.id;
      await storage.save(newJob.fileId, buffer);
    } catch (err) {
      return res.status(500).json({ error: "Failed to store file" });
    }

    jobs.unshift(newJob); // Put at start of list
    printer.jobCount += 1;
    saveStore();

    // Respond with light version
    res.status(201).json(newJob);
  });

  // 7. GET /api/jobs/poll/:printerId - Poll for pending jobs for a specific printer (requires apiKey header or query)
  app.get("/api/jobs/poll/:printerId", (req, res) => {
    const { printerId } = req.params;
    const apiKey = req.headers["x-api-key"] || req.query.apiKey;

    if (!apiKey) {
      return res.status(401).json({ error: "API Key is required" });
    }

    const printer = printers.find(p => p.id === printerId && p.apiKey === apiKey);
    if (!printer) {
      return res.status(401).json({ error: "Invalid printer ID or API key" });
    }

    // Update printer lastSeen and online status
    printer.lastSeen = new Date().toISOString();
    if (printer.status === "offline") {
      printer.status = "online";
    }

    // Find any pending jobs for this printer
    const pendingJobs = jobs.filter(j => j.printerId === printerId && j.status === "pending");
    
    saveStore();

    // Return the oldest pending job first (FIFO)
    if (pendingJobs.length > 0) {
      const oldestJob = pendingJobs[pendingJobs.length - 1];
      res.json({ job: oldestJob });
    } else {
      res.json({ job: null });
    }
  });

  // 8. GET /api/jobs/:id/download - Stream binary download of the job's file
  app.get("/api/jobs/:id/download", async (req, res) => {
    const { id } = req.params;
    const job = jobs.find(j => j.id === id);

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    try {
      const exists = await storage.exists(job.fileId);
      if (!exists) {
        return res.status(404).json({ error: "File not found in storage" });
      }

      res.setHeader("Content-Type", job.fileType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(job.fileName)}"`);
      
      const stream = storage.getStream(job.fileId);
      stream.pipe(res);
      stream.on('error', (err) => {
        console.error("Error streaming file", err);
        res.status(500).json({ error: "Failed to stream file" });
      });
    } catch (err) {
      console.error("Error streaming file", err);
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  // 9. POST /api/jobs/:id/status - Update job status
  app.post("/api/jobs/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status, statusMessage } = req.body;

    const allowedStatuses = ["pending", "downloading", "printing", "completed", "failed"];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid or missing status" });
    }

    const job = jobs.find(j => j.id === id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (status === "pending" && job.status === "failed") {
        job.retryCount += 1;
    }
    
    job.status = status;
    job.statusMessage = statusMessage || undefined;
    job.updatedAt = new Date().toISOString();

    // Update printer status if it's currently printing
    const printer = printers.find(p => p.id === job.printerId);
    if (printer) {
      printer.lastSeen = new Date().toISOString();
      if (status === "printing") {
        printer.status = "printing";
      } else if (status === "completed" || status === "failed") {
        // Delete file on completion/failure
        await storage.delete(job.fileId);
        
        // Check if there are other jobs actively printing on this printer
        const otherPrinting = jobs.some(j => j.printerId === printer.id && j.id !== id && j.status === "printing");
        printer.status = otherPrinting ? "printing" : "online";
      }
    }

    saveStore();
    res.json({ success: true, job: { id: job.id, status: job.status } });
  });

  // 10. DELETE /api/jobs/:id - Delete/Cancel a print job
  app.delete("/api/jobs/:id", async (req, res) => {
    const { id } = req.params;
    const index = jobs.findIndex(j => j.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Job not found" });
    }

    const job = jobs[index];
    
    // Delete file
    await storage.delete(job.fileId);

    // Only allow deleting if not actively printing/downloading, or just remove anyway
    jobs.splice(index, 1);
    saveStore();

    res.json({ success: true, message: "Job removed from queue" });
  });

  // 12. GET /api/download-daemon - Serves the updated daemon script file
  app.get("/api/download-daemon", (req, res) => {
    res.download(path.join(process.cwd(), 'src/daemon/print-daemon.js'), 'print-daemon.js');
  });

  // 11. GET /api/client-script - Serves a copyable raw text of the printer client script!
  app.get("/api/client-script", (req, res) => {
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    
    const clientCode = `/**
 * Remote Printer Daemon Client (Node.js)
 * Save this file as 'print-daemon.js' on your Wired PC and run it:
 *   node print-daemon.js <PRINTER_ID> <API_KEY>
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Parse Arguments
const args = process.argv.slice(2);
const PRINTER_ID = args[0];
const API_KEY = args[1];
const SERVER_URL = args[2] || "${appUrl}";

if (!PRINTER_ID || !API_KEY) {
  console.error("Error: Missing parameters.");
  console.log("");
  console.log("Usage: node print-daemon.js <PRINTER_ID> <API_KEY> [SERVER_URL]");
  console.log("Example: node print-daemon.js printer-wired-pc print_k_d3b1f9");
  process.exit(1);
}

console.log("=========================================");
console.log("   REMOTE PRINT DAEMON RUNNING           ");
console.log("=========================================");
console.log(\`Printer ID: \${PRINTER_ID}\`);
console.log(\`Server URL: \${SERVER_URL}\`);
console.log("Status    : Connecting and listening for print jobs...");
console.log("=========================================");

// Ensure temporary prints folder exists
const TEMP_DIR = path.join(__dirname, 'temp_prints');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Fetch printers installed on the PC
function getPrinters() {
  return new Promise((resolve) => {
    const platform = process.platform;
    let command = '';
    if (platform === 'win32') {
      command = 'powershell.exe -Command "Get-Printer | Select-Object -ExpandProperty Name"';
    } else {
      command = 'lpstat -p | cut -d" " -f2';
    }
    exec(command, (error, stdout) => {
      if (error) {
        resolve([]);
      } else {
        const printers = stdout.trim().split('\n').filter(p => p.length > 0);
        resolve(printers);
      }
    });
  });
}

const requestHelper = (url, options = {}) => {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, data, headers: res.headers });
        } else {
          reject(new Error(\`HTTP \${res.statusCode}: \${data}\`));
        }
      });
    });
    req.on('error', (err) => reject(err));
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
};

const downloadFile = (url, destPath) => {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(\`Download failed: HTTP \${res.statusCode}\`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
};

// Update status back to server
async function updateJobStatus(jobId, status, statusMessage = '') {
  try {
    await requestHelper(\`\${SERVER_URL}/api/jobs/\${jobId}/status\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { status, statusMessage }
    });
  } catch (err) {
    console.error(\`Failed to update job status to \${status}:\`, err.message);
  }
}

// Native print trigger
function printFileNative(filePath) {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let command = '';

    if (platform === 'win32') {
      // Windows: use PowerShell to print
      command = \`powershell.exe -Command "Start-Process -FilePath '\${filePath}' -Verb Print"\`;
    } else if (platform === 'darwin' || platform === 'linux') {
      // macOS / Linux: use standard lp command
      command = \`lp "\${filePath}"\`;
    } else {
      return reject(new Error(\`Unsupported OS platform: \${platform}\`));
    }

    console.log(\`Executing command: \${command}\`);
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(\`CLI Print error: \${error.message}. stderr: \${stderr}\`));
      } else {
        resolve(stdout);
      }
    });
  });
}

// Main polling loop
async function pollQueue() {
  try {
    // 1. Ping server to maintain online status
    try {
      await requestHelper(\`\${SERVER_URL}/api/printers/ping\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { printerId: PRINTER_ID, apiKey: API_KEY }
      });
    } catch (e) {
      console.warn(\`[Ping Warning] Unable to ping server: \${e.message}\`);
    }

    // 2. Poll for pending jobs
    const pollRes = await requestHelper(\`\${SERVER_URL}/api/jobs/poll/\${PRINTER_ID}?apiKey=\${API_KEY}\`);
    const { job } = JSON.parse(pollRes.data);

    if (job) {
      console.log(\`\\n[Job Detected] Found job: \${job.fileName} (\${job.id})\`);
      console.log(\`- Type  : \${job.fileType}\`);
      console.log(\`- Copies: \${job.copies}\`);
      console.log(\`- Color : \${job.colorMode}\`);
      console.log(\`- Paper : \${job.paperSize}\`);

      // A. Set status to Downloading
      console.log(\`-> Downloading...\`);
      await updateJobStatus(job.id, 'downloading');

      // B. Download the file
      const downloadUrl = \`\${SERVER_URL}/api/jobs/\${job.id}/download\`;
      const localFilePath = path.join(TEMP_DIR, job.fileName);
      await downloadFile(downloadUrl, localFilePath);
      console.log(\`-> Downloaded to: \${localFilePath}\`);

      // C. Set status to Printing
      console.log(\`-> Spooling to printer...\`);
      await updateJobStatus(job.id, 'printing');

      // D. Try to Print
      try {
        await printFileNative(localFilePath);
        console.log(\`-> PRINT SUCCESSFUL!\`);
        await updateJobStatus(job.id, 'completed');
      } catch (printErr) {
        console.error(\`-> PRINT FAILED: \${printErr.message}\`);
        await updateJobStatus(job.id, 'failed', printErr.message);
      }

      // E. Clean up local file
      try {
        fs.unlinkSync(localFilePath);
        console.log(\`-> Cleaned up temp file.\`);
      } catch (e) {
        // Ignore file delete error
      }
    }
  } catch (err) {
    console.error(\`[Error in Polling Loop]: \${err.message}\`);
  }
}

// Start polling every 5 seconds
setInterval(pollQueue, 5000);
pollQueue(); // Run immediately on start
`;
    res.setHeader("Content-Type", "text/plain");
    res.send(clientCode);
  });


  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
