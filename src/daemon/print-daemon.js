/**
 * Remote Printer Daemon Client (Node.js)
 * Save this file as 'print-daemon.js' on your Wired PC and run it:
 *   node print-daemon.js <PRINTER_ID> <API_KEY>
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

// Parse Arguments
const args = process.argv.slice(2);
const PRINTER_ID = args[0];
const API_KEY = args[1];
const SERVER_URL = args[2] || "http://localhost:3000";

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
console.log(`Printer ID: ${PRINTER_ID}`);
console.log(`Server URL: ${SERVER_URL}`);
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
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
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
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
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
    await requestHelper(`${SERVER_URL}/api/jobs/${jobId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { status, statusMessage }
    });
  } catch (err) {
    console.error(`Failed to update job status to ${status}:`, err.message);
  }
}

// Native print trigger
function printFileNative(filePath) {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let command = '';

    if (platform === 'win32') {
      command = `powershell.exe -Command "Start-Process -FilePath '${filePath}' -Verb Print"`;
    } else if (platform === 'darwin' || platform === 'linux') {
      command = `lp "${filePath}"`;
    } else {
      return reject(new Error(`Unsupported OS platform: ${platform}`));
    }

    console.log(`Executing command: ${command}`);
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`CLI Print error: ${error.message}. stderr: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

// Main polling loop
async function pollQueue() {
  try {
    // 1. Ping server to maintain online status and send detected printers
    try {
      const detectedPrinters = await getPrinters();
      await requestHelper(`${SERVER_URL}/api/printers/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { printerId: PRINTER_ID, apiKey: API_KEY, detectedPrinters }
      });
    } catch (e) {
      console.warn(`[Ping Warning] Unable to ping server: ${e.message}`);
    }

    // 2. Poll for pending jobs
    const pollRes = await requestHelper(`${SERVER_URL}/api/jobs/poll/${PRINTER_ID}?apiKey=${API_KEY}`);
    const { job } = JSON.parse(pollRes.data);

    if (job) {
      console.log(`\n[Job Detected] Found job: ${job.fileName} (${job.id})`);
      console.log(`- Type  : ${job.fileType}`);
      console.log(`- Copies: ${job.copies}`);
      console.log(`- Color : ${job.colorMode}`);
      console.log(`- Paper : ${job.paperSize}`);

      // A. Set status to Downloading
      console.log(`-> Downloading...`);
      await updateJobStatus(job.id, 'downloading');

      // B. Download the file
      const downloadUrl = `${SERVER_URL}/api/jobs/${job.id}/download`;
      const localFilePath = path.join(TEMP_DIR, job.fileName);
      await downloadFile(downloadUrl, localFilePath);
      console.log(`-> Downloaded to: ${localFilePath}`);

      // B2. Verify SHA-256 Checksum Integrity
      if (job.sha256) {
        console.log("-> Verifying file integrity checksum (SHA-256)...");
        const fileBuffer = fs.readFileSync(localFilePath);
        const localHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        if (localHash !== job.sha256) {
          console.error(`-> Checksum mismatch! Expected: ${job.sha256}, Got: ${localHash}`);
          await updateJobStatus(job.id, 'failed', 'Integrity check failed: checksum mismatch (SHA-256).');
          try { fs.unlinkSync(localFilePath); } catch (e) {}
          return;
        }
        console.log("-> Checksum matches perfectly! Payload is clean and verified.");
      }

      // C. Set status to Printing
      console.log(`-> Spooling to printer...`);
      await updateJobStatus(job.id, 'printing');

      // D. Try to Print
      try {
        await printFileNative(localFilePath);
        console.log(`-> PRINT SUCCESSFUL!`);
        await updateJobStatus(job.id, 'completed');
      } catch (printErr) {
        console.error(`-> PRINT FAILED: ${printErr.message}`);
        await updateJobStatus(job.id, 'failed', printErr.message);
      }

      // E. Clean up local file
      try {
        fs.unlinkSync(localFilePath);
        console.log(`-> Cleaned up temp file.`);
      } catch (e) {
        // Ignore file delete error
      }
    }
  } catch (err) {
    console.error(`[Error in Polling Loop]: ${err.message}`);
  }
}

// Start polling every 5 seconds
setInterval(pollQueue, 5000);
pollQueue(); // Run immediately on start
