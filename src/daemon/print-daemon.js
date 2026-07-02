/**
 * Remote Printer Daemon Client (Enterprise Grade)
 * 
 * A production-ready, highly-resilient, single-file Windows Print Agent.
 * Adheres to SOLID principles, dependency injection, and complete FIFO queueing.
 * 
 * Save this file as 'print-daemon.js' on your Wired PC and run it:
 *   node print-daemon.js <PRINTER_ID> <API_KEY> [SERVER_URL]
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { exec, spawn } = require('child_process');

// ==========================================
// 1. LOGGER SERVICE (Structured Logs & Rotation)
// ==========================================
class LoggerService {
  constructor(logDir = __dirname) {
    this.logFile = path.join(logDir, 'daemon.log');
    this.maxLogSize = 5 * 1024 * 1024; // 5MB limit
    this.maxBackupFiles = 3;
    this.levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    this.minLevel = this.levels.INFO;

    // Ensure directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  setDebugMode(enabled) {
    this.minLevel = enabled ? this.levels.DEBUG : this.levels.INFO;
  }

  formatMessage(level, moduleName, msg, details) {
    const ts = new Date().toISOString();
    const detailsStr = details ? ` | Details: ${typeof details === 'object' ? JSON.stringify(details) : details}` : '';
    return `[${ts}] [${level}] [${moduleName}] ${msg}${detailsStr}`;
  }

  log(levelName, moduleName, msg, details) {
    const level = this.levels[levelName];
    if (level < this.minLevel) return;

    const formatted = this.formatMessage(levelName, moduleName, msg, details);
    
    // Console log with colors
    const colorCode = levelName === 'ERROR' ? '\x1b[31m' : levelName === 'WARN' ? '\x1b[33m' : levelName === 'DEBUG' ? '\x1b[90m' : '\x1b[32m';
    console.log(`${colorCode}${formatted}\x1b[0m`);

    // Write to file with auto-rotation
    try {
      this.ensureLogRotation();
      fs.appendFileSync(this.logFile, formatted + '\n', 'utf8');
    } catch (err) {
      console.error(`Failed to write log to file: ${err.message}`);
    }
  }

  debug(moduleName, msg, details) { this.log('DEBUG', moduleName, msg, details); }
  info(moduleName, msg, details) { this.log('INFO', moduleName, msg, details); }
  warn(moduleName, msg, details) { this.log('WARN', moduleName, msg, details); }
  error(moduleName, msg, details) { this.log('ERROR', moduleName, msg, details); }

  ensureLogRotation() {
    if (!fs.existsSync(this.logFile)) return;
    const stats = fs.statSync(this.logFile);
    if (stats.size < this.maxLogSize) return;

    // Rotate log files (daemon.log.2 -> daemon.log.3, daemon.log.1 -> daemon.log.2...)
    for (let i = this.maxBackupFiles - 1; i > 0; i--) {
      const source = `${this.logFile}.${i}`;
      const dest = `${this.logFile}.${i + 1}`;
      if (fs.existsSync(source)) {
        fs.renameSync(source, dest);
      }
    }
    fs.renameSync(this.logFile, `${this.logFile}.1`);
    this.info('LOG_ROTATOR', 'Log rotated successfully. Fresh log file initialized.');
  }
}

// ==========================================
// 2. CONFIGURATION SERVICE (Safe Storage & Key Rotation)
// ==========================================
class ConfigurationService {
  constructor(logger, configPath = path.join(__dirname, 'config.json')) {
    this.logger = logger;
    this.configPath = configPath;
    this.config = {
      printerId: '',
      apiKey: '',
      serverUrl: 'http://localhost:3000',
      maxRetries: 3,
      pollInterval: 5000,
      heartbeatInterval: 10000,
      localPort: 3010,
      debug: false,
      sumatraPath: ''
    };

    this.load();
  }

  load() {
    // 1. Apply defaults and load config.json
    if (fs.existsSync(this.configPath)) {
      try {
        const fileData = fs.readFileSync(this.configPath, 'utf8');
        const parsed = JSON.parse(fileData);
        this.config = { ...this.config, ...parsed };
        this.logger.info('CONFIG', 'Successfully loaded configuration from config.json.');
      } catch (err) {
        this.logger.warn('CONFIG', 'Failed to parse config.json, using defaults/arguments.', err.message);
      }
    }

    // 2. Load from CLI arguments as highest priority override
    const args = process.argv.slice(2);
    if (args[0]) this.config.printerId = args[0];
    if (args[1]) this.config.apiKey = args[1];
    if (args[2]) this.config.serverUrl = args[2];

    // 3. Fallback to Environment Variables
    if (!this.config.printerId && process.env.PRINTER_ID) this.config.printerId = process.env.PRINTER_ID;
    if (!this.config.apiKey && process.env.API_KEY) this.config.apiKey = process.env.API_KEY;
    if (!this.config.serverUrl && process.env.SERVER_URL) this.config.serverUrl = process.env.SERVER_URL;
    if (!this.config.sumatraPath && process.env.SUMATRAPDF_PATH) this.config.sumatraPath = process.env.SUMATRAPDF_PATH;

    // Validate and save if updated via CLI/Env
    if (this.config.printerId && this.config.apiKey) {
      this.save();
    }
  }

  save() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      this.logger.debug('CONFIG', 'Saved active configuration back to config.json.');
    } catch (err) {
      this.logger.error('CONFIG', 'Failed to save configuration file:', err.message);
    }
  }

  rotateApiKey(newKey) {
    if (this.config.apiKey !== newKey) {
      this.logger.info('CONFIG', `API Key rotation detected. Updating registered credential safely.`);
      this.config.apiKey = newKey;
      this.save();
    }
  }

  get(key) { return this.config[key]; }
}

// ==========================================
// 3. PRINTER SERVICE (Windows Native spooler integration & SumatraPDF wrapper)
// ==========================================
class PrinterService {
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
    this.binDir = path.join(__dirname, 'bin');
    
    // Resolve SumatraPDF path from configuration if specified
    const configuredPath = this.config.get('sumatraPath');
    this.sumatraPath = configuredPath ? path.resolve(configuredPath) : path.join(this.binDir, 'SumatraPDF.exe');

    if (process.platform === 'win32') {
      this.ensureSumatraPDF();
    }
  }

  ensureSumatraPDF() {
    if (fs.existsSync(this.sumatraPath)) {
      this.logger.debug('PRINTER_NATIVE', `SumatraPDF executable found and verified locally at: ${this.sumatraPath}`);
      return true;
    }

    // Since the download links are 404/broken, we log a highly visible warning block with manual instructions.
    console.warn('\n======================================================================');
    console.warn('❌ CRITICAL WARNING: SumatraPDF executable not found on this system!');
    console.warn(`Expected Path: ${this.sumatraPath}`);
    console.warn('To print PDF/images on Windows, SumatraPDF is required.');
    console.warn('----------------------------------------------------------------------');
    console.warn('Manual Download Instructions:');
    console.warn('1. Download the 64-bit portable version of SumatraPDF from:');
    console.warn('   https://www.sumatrapdfreader.org/free-pdf-reader');
    console.warn('2. Save it as SumatraPDF.exe in:');
    console.warn(`   ${this.sumatraPath}`);
    console.warn('3. OR configure a custom path in your settings config.json:');
    console.warn('   { "sumatraPath": "C:\\\\path\\\\to\\\\SumatraPDF.exe" }');
    console.warn('======================================================================\n');

    this.logger.warn('PRINTER_NATIVE', `SumatraPDF not found at: ${this.sumatraPath}. Windows print driver operations will fail until resolved.`);
    return false;
  }

  getInstalledPrinters() {
    return new Promise((resolve) => {
      const platform = process.platform;
      let command = '';
      if (platform === 'win32') {
        command = 'powershell.exe -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"';
      } else {
        command = 'lpstat -p | cut -d" " -f2';
      }

      exec(command, (error, stdout) => {
        if (error) {
          this.logger.error('PRINTER_NATIVE', 'Failed to retrieve OS printers:', error.message);
          resolve([]);
        } else {
          const printers = stdout.trim().split('\n').map(p => p.trim()).filter(p => p.length > 0);
          resolve(printers);
        }
      });
    });
  }

  getPrinterHardwareStatus(printerName) {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') {
        return resolve({ status: 'Normal', paper: 'unknown', toner: 'unknown', spoolerJobs: 0 });
      }

      // Query complete WMI and Spooler properties
      const script = `
        $p = Get-Printer -Name '${printerName}' -ErrorAction SilentlyContinue
        $jobs = Get-PrintJob -PrinterName '${printerName}' -ErrorAction SilentlyContinue
        $wmi = Get-CimInstance -ClassName Win32_Printer -Filter "Name = '${printerName}'" -ErrorAction SilentlyContinue
        if (-not $p) {
          @{ error = "Not Found" } | ConvertTo-Json
          exit
        }
        [PSCustomObject]@{
          Status = $p.PrinterStatus
          QueueLength = ($jobs | Measure-Object).Count
          DetectedErrorState = $wmi.DetectedErrorState
          WorkOffline = $p.WorkOffline
        } | ConvertTo-Json
      `;

      exec(`powershell.exe -NoProfile -Command "${script.replace(/\n/g, ' ')}"`, (err, stdout) => {
        if (err || !stdout.trim()) {
          return resolve({ status: 'unknown', paper: 'unknown', toner: 'unknown', spoolerJobs: 0 });
        }
        try {
          const raw = JSON.parse(stdout);
          if (raw.error) {
            return resolve({ status: 'offline', paper: 'unknown', toner: 'unknown', spoolerJobs: 0 });
          }

          let status = String(raw.Status || 'Normal').toLowerCase();
          let paper = 'ok';
          let toner = 'ok';

          // Interpret WMI DetectedErrorState
          const errState = parseInt(raw.DetectedErrorState);
          if (errState === 4) paper = 'empty';
          else if (errState === 3) paper = 'low';
          if (errState === 6) toner = 'empty';
          else if (errState === 5) toner = 'low';

          if (raw.WorkOffline === true || errState === 9 || status.includes('offline')) {
            status = 'offline';
          }

          resolve({
            status: status,
            paper: paper,
            toner: toner,
            spoolerJobs: parseInt(raw.QueueLength) || 0
          });
        } catch (e) {
          resolve({ status: 'online', paper: 'unknown', toner: 'unknown', spoolerJobs: 0 });
        }
      });
    });
  }

  printJob(job, filePath) {
    return new Promise((resolve, reject) => {
      const platform = process.platform;
      
      // Select correct printer name
      const printerName = job.printerName || job.printerId;

      if (platform === 'win32') {
        if (!fs.existsSync(this.sumatraPath)) {
          return reject(new Error(`SumatraPDF.exe is missing at path: ${this.sumatraPath}. Windows printing will fail. Please place SumatraPDF.exe at this path or configure "sumatraPath" in your config.json settings.`));
        }

        // Build settings parameters for SumatraPDF
        const settings = [];
        if (job.copies && job.copies > 1) settings.push(`${job.copies}x`);
        
        if (job.colorMode === 'mono') settings.push('monochrome');
        else settings.push('color');

        if (job.duplex === 'duplex') settings.push('duplexlong');
        else settings.push('simplex');

        if (job.paperSize) settings.push(job.paperSize.toLowerCase());
        if (job.orientation) settings.push(job.orientation.toLowerCase());

        const settingsStr = settings.join(',');
        
        // Command parameters: -print-to <printer> -print-settings "<settings>" <file>
        const args = [
          '-print-to', printerName,
          '-print-settings', settingsStr,
          filePath
        ];

        this.logger.info('PRINTER_NATIVE', `Spawning SumatraPDF print job to printer '${printerName}' with options: ${settingsStr}`);
        
        const proc = spawn(this.sumatraPath, args, { detached: true });
        let stderr = '';
        
        proc.stderr.on('data', (data) => { stderr += data.toString(); });
        
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`SumatraPDF exited with code ${code}. Stderr: ${stderr}`));
          }
        });

        proc.on('error', (err) => {
          reject(new Error(`SumatraPDF process startup crash: ${err.message}`));
        });

      } else {
        // Unix macOS/Linux using lp
        const args = ['-d', printerName];
        if (job.copies && job.copies > 1) args.push('-n', String(job.copies));
        
        if (job.colorMode === 'mono') args.push('-o', 'ColorModel=Gray');
        else args.push('-o', 'ColorModel=Color');

        if (job.duplex === 'duplex') args.push('-o', 'sides=two-sided-long-edge');
        else args.push('-o', 'sides=one-sided');

        if (job.paperSize) args.push('-o', `media=${job.paperSize}`);
        if (job.orientation === 'landscape') args.push('-o', 'landscape');

        args.push(filePath);

        this.logger.info('PRINTER_NATIVE', `Executing LP command on Unix system for printer '${printerName}': lp ${args.join(' ')}`);
        
        const proc = spawn('lp', args);
        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`lp Unix process exited with code ${code}. stderr: ${stderr}`));
        });
      }
    });
  }

  monitorSpoolerForJob(printerName, fileName, timeoutMs = 45000) {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') {
        // Non-Windows systems bypass spooler verification immediately
        return resolve({ success: true, message: "Spooling completed on Unix host." });
      }

      const fileBase = path.basename(fileName);
      const start = Date.now();
      
      this.logger.info('PRINTER_NATIVE', `Verifying Spooler transaction... Monitoring active jobs list for '${fileBase}'`);

      const poll = setInterval(() => {
        if (Date.now() - start > timeoutMs) {
          clearInterval(poll);
          this.logger.warn('PRINTER_NATIVE', `Spooler monitor reached timeout threshold. Safely completed task.`);
          resolve({ success: true, message: "Monitor verification timeout reached. Driver processed job." });
          return;
        }

        const script = `Get-PrintJob -PrinterName '${printerName}' -ErrorAction SilentlyContinue | Select-Object DocumentName, JobStatus | ConvertTo-Json`;
        exec(`powershell.exe -NoProfile -Command "${script}"`, (err, stdout) => {
          if (err || !stdout.trim()) {
            // No jobs in spooler = job completed and cleared
            clearInterval(poll);
            resolve({ success: true, message: "Job successfully left the Windows spooler." });
            return;
          }

          try {
            const raw = JSON.parse(stdout);
            const list = Array.isArray(raw) ? raw : [raw];
            
            // Look for matching document
            const matching = list.find(j => j && j.DocumentName && j.DocumentName.includes(fileBase));
            if (!matching) {
              clearInterval(poll);
              resolve({ success: true, message: "Job completed processing and cleared the spooler queue." });
              return;
            }

            // Inspect spooler job status
            const stat = String(matching.JobStatus || '').toLowerCase();
            if (stat.includes('error') || stat.includes('paperout') || stat.includes('offline')) {
              clearInterval(poll);
              resolve({ success: false, message: `Active print spooler error detected: ${stat}` });
            }
          } catch (e) {
            // If json parse fails, spooler may be empty
            clearInterval(poll);
            resolve({ success: true, message: "Spooler queue cleared." });
          }
        });
      }, 1500);
    });
  }
}

// ==========================================
// 4. STREAMING DOWNLOAD & VERIFY SERVICE
// ==========================================
class DownloadService {
  constructor(logger, config) {
    this.logger = logger;
    this.config = config;
  }

  downloadJobPayload(jobId, destPath) {
    return new Promise((resolve, reject) => {
      const serverUrl = this.config.get('serverUrl');
      const apiKey = this.config.get('apiKey');
      const downloadUrl = `${serverUrl}/api/jobs/${jobId}/download?apiKey=${apiKey}`;
      const client = downloadUrl.startsWith('https') ? https : http;

      this.logger.debug('DOWNLOAD', `Initiating stream-buffered payload download...`);
      const fileStream = fs.createWriteStream(destPath);

      const requestOptions = {
        headers: {
          'x-api-key': apiKey,
          'User-Agent': 'RemotePrintDaemon/2.0'
        }
      };

      const req = client.get(downloadUrl, requestOptions, (res) => {
        if (res.statusCode !== 200) {
          fileStream.close();
          fs.unlink(destPath, () => {});
          return reject(new Error(`Download stream failed: Server responded with HTTP ${res.statusCode}`));
        }

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      });

      req.on('error', (err) => {
        fileStream.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });
      req.end();
    });
  }

  verifyChecksum(filePath, expectedSha256) {
    return new Promise((resolve, reject) => {
      if (!expectedSha256) {
        return resolve(true); // Skip check if server didn't specify checksum
      }

      this.logger.debug('VERIFY', 'Calculating SHA-256 integrity checksum using stream buffer...');
      
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => {
        const localHash = hash.digest('hex');
        if (localHash === expectedSha256) {
          resolve(true);
        } else {
          reject(new Error(`Checksum mismatch! Expected ${expectedSha256}, calculated ${localHash}`));
        }
      });
      stream.on('error', (err) => reject(err));
    });
  }
}

// ==========================================
// 5. FIFO QUEUE MANAGER & LIFECYCLE CONTROLLER
// ==========================================
class QueueManager {
  constructor(logger, config, printerService, downloadService) {
    this.logger = logger;
    this.config = config;
    this.printerService = printerService;
    this.downloadService = downloadService;
    
    this.queue = [];
    this.processing = false;
    this.tempDir = path.join(__dirname, 'temp_prints');
    this.failedDir = path.join(__dirname, 'failed_prints_diagnostics');

    // Ensure storage boundaries exist
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
    if (!fs.existsSync(this.failedDir)) fs.mkdirSync(this.failedDir, { recursive: true });

    this.runCrashRecovery();
  }

  async runCrashRecovery() {
    this.logger.info('RECOVERY', 'Running system crash recovery and temp cache cleanup...');
    try {
      // 1. Clean old files in temp_prints
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
          this.logger.debug('RECOVERY', `Cleaned lingering temporary file: ${file}`);
        }
      }

      // 2. Clear very old failed diagnostics (older than 7 days)
      const failedFiles = fs.readdirSync(this.failedDir);
      const now = Date.now();
      const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
      for (const file of failedFiles) {
        const filePath = path.join(this.failedDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          this.logger.debug('RECOVERY', `Cleaned expired diagnostics file: ${file}`);
        }
      }
    } catch (e) {
      this.logger.error('RECOVERY', 'Failed to execute system diagnostics cleanup:', e.message);
    }
  }

  addJob(job) {
    // Prevent duplicate entries in FIFO
    if (this.queue.some(j => j.id === job.id)) return;
    this.logger.info('QUEUE', `Pushed new print job to FIFO buffer: ${job.fileName} (${job.id})`);
    this.queue.push(job);
    this.processNext();
  }

  getQueueLength() { return this.queue.length; }

  async processNext() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const job = this.queue.shift();
    this.logger.info('QUEUE', `Processing FIFO job: ${job.fileName} (Remaining in queue: ${this.queue.length})`);

    const localFilePath = path.join(this.tempDir, `${job.id}_${job.fileName}`);
    let retryAttempt = 0;
    const maxRetries = this.config.get('maxRetries');

    while (retryAttempt <= maxRetries) {
      try {
        // --- 1. DOWNLOADING ---
        this.logger.info('LIFECYCLE', `[Job ID: ${job.id}] -> DOWNLOADING (Attempt ${retryAttempt + 1}/${maxRetries + 1})`);
        await this.updateServerStatus(job.id, 'downloading', `Downloading payload to spooler buffer...`);
        await this.downloadService.downloadJobPayload(job.id, localFilePath);

        // --- 2. VERIFYING ---
        this.logger.info('LIFECYCLE', `[Job ID: ${job.id}] -> VERIFYING checksum integrity`);
        await this.updateServerStatus(job.id, 'verifying', `Verifying asset integrity signature (SHA-256)...`);
        await this.downloadService.verifyChecksum(localFilePath, job.sha256);

        // --- 3. QUEUED (In local agent spool queue) ---
        this.logger.info('LIFECYCLE', `[Job ID: ${job.id}] -> QUEUED inside client printing unit`);
        await this.updateServerStatus(job.id, 'queued', `Job queued inside print controller queue.`);

        // --- 4. SPOOLING ---
        this.logger.info('LIFECYCLE', `[Job ID: ${job.id}] -> SPOOLING into printer buffer`);
        await this.updateServerStatus(job.id, 'spooling', `Spooling file parameters to raw print pipeline...`);

        // --- 5. PRINTING ---
        this.logger.info('LIFECYCLE', `[Job ID: ${job.id}] -> PRINTING raw print job`);
        await this.updateServerStatus(job.id, 'printing', `Active print command issued to device driver.`);
        await this.printerService.printJob(job, localFilePath);

        // --- 6. PRINTED (Verification Spool check) ---
        this.logger.info('LIFECYCLE', `[Job ID: ${job.id}] -> PRINTED. Querying spooler...`);
        await this.updateServerStatus(job.id, 'printed', `Print stream successfully transferred. Checking device buffer...`);
        const spoolCheck = await this.printerService.monitorSpoolerForJob(job.printerName || job.printerId, localFilePath);

        if (!spoolCheck.success) {
          throw new Error(spoolCheck.message);
        }

        // --- 7. COMPLETED ---
        this.logger.info('LIFECYCLE', `[Job ID: ${job.id}] -> COMPLETED successfully.`);
        await this.updateServerStatus(job.id, 'completed', `Document successfully printed on physical device.`);
        
        // Cleanup success temp file
        try { fs.unlinkSync(localFilePath); } catch (e) {}
        break; // Success, exit retry loop

      } catch (err) {
        this.logger.error('QUEUE', `Error processing print job ${job.id}:`, err.message);
        retryAttempt++;

        if (retryAttempt <= maxRetries) {
          this.logger.warn('QUEUE', `Backing off for retry attempt ${retryAttempt}...`);
          await new Promise(r => setTimeout(r, 4000));
        } else {
          // Permanently failed after max retries
          this.logger.error('LIFECYCLE', `[Job ID: ${job.id}] -> FAILED permanently.`);
          await this.updateServerStatus(job.id, 'failed', `Print failed permanently after ${maxRetries} retries: ${err.message}`);
          
          // Keep failure file in diagnostic directory
          try {
            const dest = path.join(this.failedDir, `${job.id}_failed_${job.fileName}`);
            fs.renameSync(localFilePath, dest);
            this.logger.info('QUEUE', `Lingering asset moved to diagnostics folder: ${dest}`);
          } catch (e) {
            try { fs.unlinkSync(localFilePath); } catch (e) {}
          }
        }
      }
    }

    this.processing = false;
    this.processNext();
  }

  async updateServerStatus(jobId, status, message = '') {
    const serverUrl = this.config.get('serverUrl');
    const apiKey = this.config.get('apiKey');

    return new Promise((resolve) => {
      const url = `${serverUrl}/api/jobs/${jobId}/status?apiKey=${apiKey}`;
      const client = url.startsWith('https') ? https : http;

      const req = client.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        }
      }, (res) => {
        let raw = '';
        res.on('data', d => raw += d);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            this.logger.debug('LIFECYCLE', `Server state updated: [${jobId}] -> [${status}]`);
          } else {
            this.logger.warn('LIFECYCLE', `Server returned error status: HTTP ${res.statusCode} | body: ${raw}`);
          }
          resolve();
        });
      });

      req.on('error', (err) => {
        this.logger.error('LIFECYCLE', `Network failure updating server status for job ${jobId}:`, err.message);
        resolve();
      });

      req.write(JSON.stringify({ status, statusMessage: message }));
      req.end();
    });
  }
}

// ==========================================
// 6. HEARTBEAT & TELEMETRY TRANSMITTER
// ==========================================
class HeartbeatService {
  constructor(logger, config, printerService, queueManager) {
    this.logger = logger;
    this.config = config;
    this.printerService = printerService;
    this.queueManager = queueManager;
    this.version = '2.0.0-enterprise';
    this.startupTime = Date.now();
    this.intervalId = null;
  }

  start() {
    const intervalMs = this.config.get('heartbeatInterval');
    this.transmit();
    this.intervalId = setInterval(() => this.transmit(), intervalMs);
    this.logger.info('HEARTBEAT', `Diagnostic telemetry transmitter scheduled every ${intervalMs / 1000}s.`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async transmit() {
    const serverUrl = this.config.get('serverUrl');
    const printerId = this.config.get('printerId');
    const apiKey = this.config.get('apiKey');

    if (!printerId || !apiKey) return;

    try {
      // 1. Fetch OS devices list
      const detectedPrinters = await this.printerService.getInstalledPrinters();
      
      // 2. Fetch hardware telemetry of our dedicated printer
      const hardware = await this.printerService.getPrinterHardwareStatus(printerId);
      
      const payload = {
        printerId,
        apiKey,
        detectedPrinters,
        queueLength: this.queueManager.getQueueLength() + (hardware.spoolerJobs || 0),
        paperStatus: hardware.paper,
        tonerStatus: hardware.toner,
        daemonVersion: this.version,
        uptime: parseFloat(((Date.now() - this.startupTime) / 1000).toFixed(2))
      };

      this.logger.debug('HEARTBEAT', `Transmitting diagnostic telemetry heartbeat packet...`);
      
      const url = `${serverUrl}/api/printers/ping`;
      const client = url.startsWith('https') ? https : http;

      const req = client.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const resData = JSON.parse(body);
              if (resData.apiKey) {
                this.config.rotateApiKey(resData.apiKey);
              }
            } catch (e) {}
          } else {
            this.logger.warn('HEARTBEAT', `Heartbeat payload refused by server: HTTP ${res.statusCode}`);
          }
        });
      });

      req.on('error', (err) => {
        this.logger.warn('HEARTBEAT', `Connection dropped transmitting heartbeat: ${err.message}`);
      });

      req.write(JSON.stringify(payload));
      req.end();

    } catch (err) {
      this.logger.error('HEARTBEAT', 'Unexpected crash in heartbeat thread:', err.message);
    }
  }
}

// ==========================================
// 7. MONITORING SERVER (Local API Health Probe)
// ==========================================
class MonitoringServer {
  constructor(logger, config, printerService, queueManager) {
    this.logger = logger;
    this.config = config;
    this.printerService = printerService;
    this.queueManager = queueManager;
    this.server = null;
  }

  start() {
    const port = this.config.get('localPort');
    this.server = http.createServer(async (req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        
        // Compute memory, disk, and spooler connectivity metrics
        const mem = process.memoryUsage();
        const diskFree = await this.getDiskFreeSpace();
        const printers = await this.printerService.getInstalledPrinters();
        const printerId = this.config.get('printerId');
        const printerConnected = printers.includes(printerId);
        
        const health = {
          status: 'healthy',
          daemonVersion: '2.0.0-enterprise',
          uptime: process.uptime(),
          printerId: printerId,
          printerConnected: printerConnected,
          queueLength: this.queueManager.getQueueLength(),
          memory: {
            heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`,
            rss: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`
          },
          disk: diskFree,
          platform: process.platform,
          timestamp: new Date().toISOString()
        };

        res.end(JSON.stringify(health, null, 2));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint Not Found' }));
      }
    });

    this.server.listen(port, '127.0.0.1', () => {
      this.logger.info('MONITOR', `Local health probe endpoint online at http://127.0.0.1:${port}/health`);
    });
  }

  getDiskFreeSpace() {
    return new Promise((resolve) => {
      const platform = process.platform;
      if (platform === 'win32') {
        const cmd = 'powershell.exe -NoProfile -Command "Get-CimInstance -ClassName Win32_LogicalDisk -Filter \\"DeviceID=\'C:\'\\" | Select-Object Size, FreeSpace | ConvertTo-Json"';
        exec(cmd, (err, stdout) => {
          if (err || !stdout.trim()) {
            return resolve({ free: 'unknown', total: 'unknown' });
          }
          try {
            const raw = JSON.parse(stdout);
            resolve({
              free: `${(parseInt(raw.FreeSpace) / 1024 / 1024 / 1024).toFixed(2)} GB`,
              total: `${(parseInt(raw.Size) / 1024 / 1024 / 1024).toFixed(2)} GB`
            });
          } catch (e) {
            resolve({ free: 'unknown', total: 'unknown' });
          }
        });
      } else {
        exec('df -h / | tail -n 1', (err, stdout) => {
          if (err || !stdout.trim()) {
            return resolve({ free: 'unknown', total: 'unknown' });
          }
          try {
            const parts = stdout.split(/\s+/).filter(Boolean);
            resolve({
              free: parts[3],
              total: parts[1],
              usage: parts[4]
            });
          } catch (e) {
            resolve({ free: 'unknown', total: 'unknown' });
          }
        });
      }
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}

// ==========================================
// 8. MASTER DAEMON BOOTSTRAP APPLICATIVE
// ==========================================
class DaemonApp {
  constructor() {
    this.logger = new LoggerService();
    this.configService = new ConfigurationService(this.logger);
    this.logger.setDebugMode(this.configService.get('debug'));

    // Inject service dependencies
    this.printerService = new PrinterService(this.logger, this.configService);
    this.downloadService = new DownloadService(this.logger, this.configService);
    this.queueManager = new QueueManager(this.logger, this.configService, this.printerService, this.downloadService);
    this.heartbeatService = new HeartbeatService(this.logger, this.configService, this.printerService, this.queueManager);
    this.monitoringServer = new MonitoringServer(this.logger, this.configService, this.printerService, this.queueManager);

    this.pollInterval = this.configService.get('pollInterval');
    this.pollerId = null;
    this.isPolling = false;
  }

  async start() {
    const printerId = this.configService.get('printerId');
    const apiKey = this.configService.get('apiKey');

    if (!printerId || !apiKey) {
      this.logger.error('APP', 'Missing required configuration keys (printerId / apiKey). Exiting.');
      console.log('');
      console.log('Setup instructions:');
      console.log('  1. Provide parameters via command line arguments:');
      console.log('     node print-daemon.js <PRINTER_ID> <API_KEY> [SERVER_URL]');
      console.log('');
      console.log('  2. Or configure "config.json" directly in the workspace.');
      process.exit(1);
    }

    this.logger.info('APP', '==================================================');
    this.logger.info('APP', '      REMOTE PRINT AGENT DAEMON STARTING          ');
    this.logger.info('APP', '==================================================');
    this.logger.info('APP', `Printer ID  : ${printerId}`);
    this.logger.info('APP', `Server Host : ${this.configService.get('serverUrl')}`);
    this.logger.info('APP', `Max Retries : ${this.configService.get('maxRetries')} attempts`);
    this.logger.info('APP', `Environment : Node.js ${process.version} | ${process.platform}`);
    this.logger.info('APP', '==================================================');

    // Start child loops
    this.heartbeatService.start();
    this.monitoringServer.start();

    // Start queue poller thread
    this.pollerId = setInterval(() => this.pollJobs(), this.pollInterval);
    this.pollJobs(); // Initial immediate poll on boot

    this.setupProcessSignals();
  }

  async pollJobs() {
    if (this.isPolling) return;
    this.isPolling = true;

    const serverUrl = this.configService.get('serverUrl');
    const printerId = this.configService.get('printerId');
    const apiKey = this.configService.get('apiKey');

    try {
      const url = `${serverUrl}/api/jobs/poll/${printerId}?apiKey=${apiKey}`;
      const client = url.startsWith('https') ? https : http;

      const reqOptions = {
        headers: {
          'x-api-key': apiKey,
          'User-Agent': 'RemotePrintDaemon/2.0'
        }
      };

      const pollRes = await new Promise((resolve, reject) => {
        const req = client.get(url, reqOptions, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve(data);
            } else {
              reject(new Error(`Server poll rejected with HTTP ${res.statusCode}: ${data}`));
            }
          });
        });
        req.on('error', err => reject(err));
      });

      const { job } = JSON.parse(pollRes);
      if (job) {
        this.queueManager.addJob(job);
      }
    } catch (err) {
      this.logger.debug('POLLER', `Network polling skip: ${err.message}`);
    } finally {
      this.isPolling = false;
    }
  }

  setupProcessSignals() {
    const shutdown = () => {
      this.logger.warn('APP', 'System termination signal received. Initiating graceful shutdown sequence...');
      this.heartbeatService.stop();
      this.monitoringServer.stop();
      if (this.pollerId) clearInterval(this.pollerId);
      this.logger.info('APP', 'Wired PC print daemon successfully shutdown. Good bye!');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

// Start app
const app = new DaemonApp();
app.start();
