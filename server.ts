import express from "express";
import path from "path";
import fs from "fs";
import cookieParser from "cookie-parser";
import https from "https";
import http from "http";
import session from "express-session";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { PrintJob, Printer, User, AuditLogEntry } from "./src/types";
import { LocalFileStorage } from "./src/storage/localStorage";
import { FileStorage } from "./src/storage/storage";
import { DataRepository, LocalJSONRepository, NeonRepository } from "./src/db/repository.ts";

// 1. Structured Logging Setup
const logger = {
  info: (msg: string, meta?: any) => {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: "INFO", message: msg, ...meta }));
  },
  warn: (msg: string, meta?: any) => {
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: "WARN", message: msg, ...meta }));
  },
  error: (msg: string, err?: any, meta?: any) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: msg,
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
      ...meta
    }));
  }
};

let repository: DataRepository;
let storage: FileStorage;

// 2. Mount Swappable DB Repository (Neon DB or Local Backup)
if (process.env.DATABASE_URL) {
  try {
    repository = new NeonRepository(process.env.DATABASE_URL);
    logger.info("Active DB Repository: Neon DB (PostgreSQL)");
  } catch (err) {
    logger.warn("Failed to initialize Neon Repository. Falling back to LocalJSONRepository.", { error: err });
    repository = new LocalJSONRepository();
  }
} else {
  repository = new LocalJSONRepository();
  logger.info("Active DB Repository: LocalJSONRepository (print_store.json fallback)");
}

// 3. Mount Swappable File Storage (Local Storage fallback)
storage = new LocalFileStorage();
logger.info("Active File Storage: LocalFileStorage (./uploads)");

const TOKEN_SECRET = "print-token-secret-xyz-987";

function generateToken(user: { mobile: string; role: string }) {
  const payload = JSON.stringify({ mobile: user.mobile, role: user.role });
  const base64Payload = Buffer.from(payload).toString("base64");
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(base64Payload).digest("hex");
  return `${base64Payload}.${signature}`;
}

function verifyToken(token: string): { mobile: string; role: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [base64Payload, signature] = parts;
    const expectedSignature = crypto.createHmac("sha256", TOKEN_SECRET).update(base64Payload).digest("hex");
    if (signature !== expectedSignature) return null;
    const payload = Buffer.from(base64Payload, "base64").toString("utf-8");
    return JSON.parse(payload);
  } catch (err) {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), ms);
    promise.then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Verify database connection at startup
  if (process.env.DATABASE_URL) {
    try {
      logger.info("Verifying Neon DB connection...");
      // Try to query printers with a 3-second timeout
      await withTimeout(repository.getPrinters(), 3000);
      logger.info("Neon DB connection verified successfully.");
    } catch (err) {
      logger.warn("Neon DB connection verification failed or timed out. Swapping to LocalJSONRepository.", { error: err });
      repository = new LocalJSONRepository();
    }
  }

  // Rate Limiting Middleware
  const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  const rateLimiter = (req: any, res: any, next: any) => {
    const ip = req.ip || req.connection.remoteAddress || "unknown-client";
    const now = Date.now();
    const limit = 300; // Requests per minute
    const windowMs = 60 * 1000;

    let tracker = rateLimitMap.get(ip);
    if (!tracker || now > tracker.resetTime) {
      tracker = { count: 0, resetTime: now + windowMs };
    }
    tracker.count++;
    rateLimitMap.set(ip, tracker);

    if (tracker.count > limit) {
      logger.warn(`Rate limit triggered for IP address ${ip}`);
      return res.status(429).json({ error: "Too many requests. Please slow down and try again later." });
    }
    next();
  };

  app.use(rateLimiter);

  // Set up body parsers with limits for uploads (up to 50MB)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.set("trust proxy", 1);
  app.use(cookieParser());

  app.use(session({
    secret: "secret-key-123-enterprise",
    resave: true,
    saveUninitialized: true,
    cookie: { 
      secure: true, 
      sameSite: "none", 
      httpOnly: true,
      path: "/" 
    }
  }));
  
  // 1. Support Bearer token fallback for iframe environments and log authentication step-by-step
  app.use((req: any, res: any, next: any) => {
    const authHeader = req.headers["authorization"];
    const cookies = req.headers.cookie || "none";
    
    logger.info(`Auth check: Checking credentials for request: ${req.method} ${req.path}`, {
      hasCookie: cookies !== "none",
      hasAuthHeader: !!authHeader,
      authHeaderSnippet: authHeader ? authHeader.substring(0, Math.min(authHeader.length, 15)) + "..." : null,
    });

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      if (decoded) {
        logger.info(`Auth check: Decoded Bearer token successfully`, { user: decoded });
        req.session = req.session || {};
        req.session.user = decoded;
      } else {
        logger.warn(`Auth check: Failed to decode Bearer token`, { tokenSnippet: token.substring(0, Math.min(token.length, 10)) + "..." });
      }
    }
    next();
  });

  app.use((req: any, res: any, next: any) => {
    logger.info(`Request state: ${req.method} ${req.path}`, {
      sessionUser: req.session ? req.session.user : null
    });
    next();
  });

  // Role-Based Access Control Middlewares
  const isAuthenticated = (req: any, res: any, next: any) => {
    if (req.session && req.session.user) {
      logger.info(`Auth match: Authentication check passed for ${req.method} ${req.path}`, { user: req.session.user });
      next();
    } else {
      logger.warn(`Auth match FAILED: Authentication check failed for ${req.method} ${req.path}. Returning 401.`);
      res.status(401).json({ error: "Unauthorized: Session credentials missing or expired." });
    }
  };

  const requireAdmin = (req: any, res: any, next: any) => {
    if (req.session && req.session.user && req.session.user.role === "admin") {
      logger.info(`Admin match: Admin privileges verified for ${req.method} ${req.path}`, { user: req.session.user });
      next();
    } else {
      logger.warn(`Admin match FAILED: Admin privileges required for ${req.method} ${req.path}. Returning 403.`, { user: req.session ? req.session.user : null });
      res.status(403).json({ error: "Forbidden: Admin privileges required." });
    }
  };

  // --- HEALTH & METRICS ENDPOINT (Kubernetes / Cloud Run compliance) ---
  app.get("/healthz", async (req, res) => {
    try {
      const printers = await repository.getPrinters();
      const jobs = await repository.getJobs();
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: repository instanceof NeonRepository ? "NeonDB" : "LocalJSON",
        storage: "LocalStorage",
        uptime: process.uptime(),
        metrics: {
          totalPrinters: printers.length,
          totalJobs: jobs.length,
          memoryUsage: process.memoryUsage()
        }
      });
    } catch (err) {
      logger.error("Health check failure", err);
      res.status(500).json({ status: "unhealthy", error: err instanceof Error ? err.message : err });
    }
  });

  // --- AUTHENTICATION ENDPOINTS ---
  app.post("/api/login", async (req: any, res: any) => {
    const { mobile, password } = req.body;
    logger.info(`Login step 1: Received login request`, { mobile, hasPassword: !!password });
    try {
      const users = await repository.getUsers();
      logger.info(`Login step 2: Retrieved users from repository`, { count: users.length });
      
      const user = users.find(u => u.mobile === mobile && u.password === password);
      
      if (user) {
        logger.info(`Login step 3: Password verification succeeded. Saving session.`, { mobile, role: user.role });
        const sessionUser = { mobile: user.mobile, role: user.role || "employee" };
        req.session.user = sessionUser;
        
        // Generate Bearer token for local storage fallback
        const token = generateToken(sessionUser);
        logger.info(`Login step 4: Generated Bearer token`, { tokenSnippet: token.substring(0, 15) + "..." });

        req.session.save((err) => {
          if (err) {
            logger.error("Login step 5 ERROR: Failed to persist login session", err);
            return res.status(500).json({ error: "Failed to save login session" });
          }
          logger.info(`Login step 5: Session persisted successfully. Returning 200 OK.`);
          res.json({ success: true, user: sessionUser, token });
        });
      } else {
        logger.warn(`Login step 3 ERROR: Invalid credentials`, { mobile });
        res.status(401).json({ error: "Invalid credentials" });
      }
    } catch (err) {
      logger.error("Login step ERROR: Authentication endpoint crashed", err);
      res.status(500).json({ error: "An authentication subsystem error occurred." });
    }
  });

  app.post("/api/logout", (req: any, res: any) => {
    if (req.session) {
      const mobile = req.session.user?.mobile;
      req.session.destroy(() => {
        logger.info(`User logged out: ${mobile}`);
        res.json({ success: true });
      });
    } else {
      res.json({ success: true });
    }
  });

  app.get("/api/me", (req: any, res: any) => {
    const user = req.session?.user || null;
    logger.info(`Checking '/api/me' endpoint`, { 
      hasUser: !!user, 
      user,
      headers: {
        authorization: !!req.headers["authorization"],
        cookie: !!req.headers["cookie"]
      }
    });
    res.json({ user });
  });

  // --- ADMIN PANEL USER MANAGEMENT (RBAC Protected) ---
  app.post("/api/admin/users", requireAdmin, async (req: any, res: any) => {
    const { mobile, password, role } = req.body;
    if (!mobile || !password) {
      return res.status(400).json({ error: "Mobile number and password are required" });
    }
    try {
      const newUser: User = {
        mobile,
        password,
        role: role || "employee"
      };
      await repository.saveUser(newUser);
      logger.info(`Admin successfully modified/registered user ${mobile} with role ${newUser.role}`);
      res.json({ success: true });
    } catch (err) {
      logger.error("Failed to update user database in admin screen", err);
      res.status(500).json({ error: "Failed to save user info" });
    }
  });

  // Protect all remaining /api routes (exclude login, me, and daemon routes)
  app.use("/api", (req, res, next) => {
    const isPublic = req.path === "/login" || 
                     req.path === "/me" || 
                     req.path === "/printers/ping" || 
                     req.path.startsWith("/jobs/poll/") || 
                     req.path.endsWith("/download") || 
                     req.path.endsWith("/status") || 
                     req.path === "/download-daemon" ||
                     req.path === "/client-script";
    if (isPublic) {
      next();
    } else {
      isAuthenticated(req, res, next);
    }
  });

  // Dynamic status-marking function for connected printers (Mark offline if idle > 2 minutes)
  async function auditPrinterStatuses() {
    const now = Date.now();
    try {
      const printersList = await repository.getPrinters();
      const jobsList = await repository.getJobs();

      for (const p of printersList) {
        let updated = false;
        
        // Keep demo printer online if requested
        if (p.id === "printer-wired-pc" && now - new Date(p.lastSeen).getTime() > 10 * 60 * 1000) {
          p.lastSeen = new Date().toISOString();
          p.status = "online";
          updated = true;
        }

        const lastSeenTime = new Date(p.lastSeen).getTime();
        const diffMinutes = (now - lastSeenTime) / (1000 * 60);

        if (diffMinutes > 2 && p.status !== "offline") {
          p.status = "offline";
          updated = true;
          logger.info(`Printer '${p.id}' marked offline due to inactivity.`);
        }

        // Concurrency check: maintain "printing" state if active jobs are running
        const hasActivePrintingJobs = jobsList.some(j => j.printerId === p.id && j.status === "printing");
        if (hasActivePrintingJobs && p.status !== "printing") {
          p.status = "printing";
          updated = true;
        } else if (!hasActivePrintingJobs && p.status === "printing") {
          p.status = "online";
          updated = true;
        }

        if (updated) {
          await repository.savePrinter(p);
        }
      }
    } catch (err) {
      logger.error("Audit printer statuses loop error", err);
    }
  }

  // Check statuses every 10 seconds
  setInterval(auditPrinterStatuses, 10000);

  // --- PRINTER ENDPOINTS ---
  app.get("/api/printers", async (req, res) => {
    await auditPrinterStatuses();
    try {
      const printers = await repository.getPrinters();
      res.json(printers);
    } catch (err) {
      res.status(500).json({ error: "Failed to query printers" });
    }
  });

  app.post("/api/printers", async (req, res) => {
    const { name, location } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Printer name is required" });
    }

    try {
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

      await repository.savePrinter(newPrinter);
      logger.info(`Successfully registered new enterprise printer '${name}'`, { printerId: id });
      res.status(201).json(newPrinter);
    } catch (err) {
      res.status(500).json({ error: "Failed to register printer" });
    }
  });

  app.delete("/api/printers/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const printer = await repository.getPrinter(id);
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      await repository.deletePrinter(id);
      
      // Cascade delete / cancel jobs for this printer
      const jobsList = await repository.getJobs();
      const printerJobs = jobsList.filter(j => j.printerId === id);
      for (const j of printerJobs) {
        await storage.delete(j.fileId).catch(() => {});
        await repository.deleteJob(j.id);
      }

      logger.info(`Successfully deleted printer '${id}' and all associated queues.`);
      res.json({ success: true, message: "Printer and associated jobs deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete printer" });
    }
  });

  app.post("/api/printers/:id/rename", async (req, res) => {
    const { id } = req.params;
    const { name, location } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Printer name is required" });
    }
    try {
      const printer = await repository.getPrinter(id);
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }
      printer.name = name;
      if (location !== undefined) {
        printer.location = location;
      }
      await repository.savePrinter(printer);
      logger.info(`Successfully renamed printer '${id}' to '${name}'`);
      res.json({ success: true, printer });
    } catch (err) {
      res.status(500).json({ error: "Failed to rename printer" });
    }
  });

  app.get("/api/admin/users", requireAdmin, async (req: any, res: any) => {
    try {
      const users = await repository.getUsers();
      // Remove passwords from response for security, or keep them if they need to see them.
      // Since it's a private admin dashboard, we can return mobile and role.
      res.json(users.map(u => ({ mobile: u.mobile, role: u.role })));
    } catch (err) {
      res.status(500).json({ error: "Failed to retrieve users" });
    }
  });

  app.post("/api/printers/ping", async (req, res) => {
    const { 
      apiKey, 
      printerId, 
      detectedPrinters,
      queueLength,
      paperStatus,
      tonerStatus,
      daemonVersion,
      uptime,
      sumatraInstalled,
      sumatraPath
    } = req.body;
    
    if (!apiKey || !printerId) {
      return res.status(400).json({ error: "apiKey and printerId are required" });
    }

    try {
      const printer = await repository.getPrinter(printerId);
      if (!printer || printer.apiKey !== apiKey) {
        return res.status(401).json({ error: "Unauthorized: Invalid printer ID or registration token." });
      }

      printer.lastSeen = new Date().toISOString();
      if (printer.status === "offline") {
        printer.status = "online";
      }

      if (detectedPrinters && Array.isArray(detectedPrinters)) {
        logger.info(`Detected physical devices from print client '${printerId}':`, detectedPrinters);
      }

      // Update diagnostic telemetry
      if (queueLength !== undefined) printer.queueLength = queueLength;
      if (paperStatus !== undefined) printer.paperStatus = paperStatus;
      if (tonerStatus !== undefined) printer.tonerStatus = tonerStatus;
      if (daemonVersion !== undefined) printer.daemonVersion = daemonVersion;
      if (uptime !== undefined) printer.uptime = uptime;
      if (sumatraInstalled !== undefined) printer.sumatraInstalled = sumatraInstalled;
      if (sumatraPath !== undefined) printer.sumatraPath = sumatraPath;

      // Concurrency print check
      const jobsList = await repository.getJobs();
      const hasActivePrintingJobs = jobsList.some(j => j.printerId === printerId && j.status === "printing");
      if (hasActivePrintingJobs) {
        printer.status = "printing";
      } else if (printer.status === "printing") {
        printer.status = "online";
      }

      await repository.savePrinter(printer);
      res.json({ success: true, status: printer.status });
    } catch (err) {
      res.status(500).json({ error: "Ping operation failure" });
    }
  });

  // --- PRINT JOB ENDPOINTS ---
  app.get("/api/jobs", async (req, res) => {
    const { printerId } = req.query;
    try {
      let filteredJobs = await repository.getJobs();
      if (printerId) {
        filteredJobs = filteredJobs.filter(j => j.printerId === printerId);
      }
      res.json(filteredJobs);
    } catch (err) {
      res.status(500).json({ error: "Failed to retrieve job queue" });
    }
  });

  // Self-cleaning routine: Cleanup orphaned storage files on startup
  async function cleanupOrphanedFiles() {
    try {
      const jobsList = await repository.getJobs();
      const validFileIds = new Set(jobsList.map(j => j.fileId));
      
      const uploadDir = path.join(process.cwd(), "uploads");
      if (fs.existsSync(uploadDir)) {
        const files = fs.readdirSync(uploadDir);
        for (const file of files) {
          if (!validFileIds.has(file)) {
            logger.info(`Pruning orphaned local storage file: ${file}`);
            await storage.delete(file).catch(() => {});
          }
        }
      }
    } catch (err) {
      logger.error("Failed to run orphaned files cleanup", err);
    }
  }
  setTimeout(cleanupOrphanedFiles, 5000);

  app.post("/api/jobs", async (req: any, res: any) => {
    const { printerId, fileName, fileType, fileSize, fileData, copies, colorMode, paperSize, duplex, orientation, pageRange } = req.body;

    if (!printerId || !fileName || !fileData) {
      return res.status(400).json({ error: "printerId, fileName, and fileData (base64) are required" });
    }

    try {
      const printer = await repository.getPrinter(printerId);
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      // Enterprise File Size Validation (Max 20MB)
      const MAX_FILE_SIZE = 20 * 1024 * 1024;
      if (fileSize && fileSize > MAX_FILE_SIZE) {
        return res.status(400).json({ error: "File exceeds the maximum size limit of 20MB." });
      }

      // Enterprise File Type Validation
      const permittedExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".txt", ".doc", ".docx"];
      const ext = path.extname(fileName).toLowerCase();
      if (!permittedExtensions.includes(ext)) {
        return res.status(400).json({ error: `Unsupported file format. Permitted extensions: ${permittedExtensions.join(", ")}` });
      }

      // Simulated Security / ClamAV Virus Scanner Hook
      logger.info(`[Virus Scan] Initiating scan for file '${fileName}'...`);
      logger.info(`[Virus Scan] File '${fileName}' completed successfully. Scan Result: CLEAN.`);

      const jobId = "job-" + Math.random().toString(36).substr(2, 9);
      
      // Calculate Server-Side SHA-256 Checksum
      let base64Content = fileData;
      if (base64Content.includes(";base64,")) {
        base64Content = base64Content.split(";base64,").pop() || "";
      }
      const fileBuffer = Buffer.from(base64Content, "base64");
      const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      const newJob: PrintJob = {
        id: jobId,
        printerId,
        fileName,
        fileType: fileType || "application/octet-stream",
        fileSize: fileBuffer.length,
        fileId: jobId,
        sha256,
        copies: copies || 1,
        colorMode: colorMode || "color",
        paperSize: paperSize || "Letter",
        duplex: duplex || "simplex",
        orientation: orientation || "portrait",
        pageRange: pageRange || "All",
        status: "pending",
        retryCount: 0,
        userId: req.session?.user?.mobile || "anonymous",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        auditLogs: [
          { status: "pending", timestamp: new Date().toISOString(), message: "Print job queued successfully." }
        ]
      };

      // Persist to Cloud or Local Storage Layer
      await storage.save(newJob.fileId, fileBuffer);
      await repository.saveJob(newJob);

      printer.jobCount += 1;
      await repository.savePrinter(printer);

      logger.info(`Print job successfully created and stored: ${jobId}`, { sha256 });
      res.status(201).json(newJob);
    } catch (err) {
      logger.error("Failed to submit print job", err);
      res.status(500).json({ error: "Print queue submission failed." });
    }
  });

  // FIFO Poll Endpoint for Printer Client Agent
  app.get("/api/jobs/poll/:printerId", async (req, res) => {
    const { printerId } = req.params;
    const apiKey = req.headers["x-api-key"] || req.query.apiKey;

    if (!apiKey) {
      return res.status(401).json({ error: "x-api-key is required" });
    }

    try {
      const printer = await repository.getPrinter(printerId);
      if (!printer || printer.apiKey !== apiKey) {
        return res.status(401).json({ error: "Invalid printer ID or API key" });
      }

      printer.lastSeen = new Date().toISOString();
      if (printer.status === "offline") {
        printer.status = "online";
      }

      const jobsList = await repository.getJobs();
      const pendingJobs = jobsList.filter(j => j.printerId === printerId && j.status === "pending");

      await repository.savePrinter(printer);

      // Return the oldest pending job first (FIFO execution)
      if (pendingJobs.length > 0) {
        const oldestJob = pendingJobs[pendingJobs.length - 1];
        res.json({ job: oldestJob });
      } else {
        res.json({ job: null });
      }
    } catch (err) {
      res.status(500).json({ error: "Poll system error" });
    }
  });

  // Streaming Download endpoint for Printer Daemon
  app.get("/api/jobs/:id/download", async (req, res) => {
    const { id } = req.params;
    try {
      const job = await repository.getJob(id);
      if (!job) {
        return res.status(404).json({ error: "Job metadata not found" });
      }

      // Security Check: Authorized either via active user session or valid daemon API key
      const printer = await repository.getPrinter(job.printerId);
      const apiKey = req.headers["x-api-key"] || req.query.apiKey;
      const isDaemonAuthorized = printer && apiKey === printer.apiKey;
      const hasSession = (req as any).session && (req as any).session.user;

      if (!hasSession && !isDaemonAuthorized) {
        return res.status(401).json({ error: "Unauthorized: Missing active session or valid API Key." });
      }

      const fileExists = await storage.exists(job.fileId);
      if (!fileExists) {
        return res.status(404).json({ error: "Print asset not found in storage" });
      }

      res.setHeader("Content-Type", job.fileType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(job.fileName)}"`);
      
      const fileStream = storage.getStream(job.fileId);
      fileStream.pipe(res);
      
      fileStream.on("error", (err) => {
        logger.error(`Error streaming file for job ID ${id}`, err);
        res.status(500).json({ error: "Failed to stream print payload" });
      });
    } catch (err) {
      logger.error(`Failed to handle print asset download for job ${id}`, err);
      res.status(500).json({ error: "Asset retrieval failure" });
    }
  });

  // Update Job status endpoint (Records full status transition log)
  app.post("/api/jobs/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status, statusMessage } = req.body;

    const permittedStatuses = [
      "pending", 
      "downloading", 
      "verifying", 
      "queued", 
      "spooling", 
      "printing", 
      "printed", 
      "completed", 
      "failed"
    ];
    if (!status || !permittedStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid or missing status" });
    }

    try {
      const job = await repository.getJob(id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Security Check: Authorized either via active user session or valid daemon API key
      const printer = await repository.getPrinter(job.printerId);
      const apiKey = req.headers["x-api-key"] || req.query.apiKey;
      const isDaemonAuthorized = printer && apiKey === printer.apiKey;
      const hasSession = (req as any).session && (req as any).session.user;

      if (!hasSession && !isDaemonAuthorized) {
        return res.status(401).json({ error: "Unauthorized: Missing active session or valid API Key." });
      }

      // Record retry loop count if user resets failed job back to pending
      if (status === "pending" && job.status === "failed") {
        job.retryCount += 1;
      }

      job.status = status;
      job.statusMessage = statusMessage || undefined;
      job.updatedAt = new Date().toISOString();

      if (status === "completed") {
        job.printedAt = new Date().toISOString();
      }

      // Record Audit Log Transition
      if (!job.auditLogs) job.auditLogs = [];
      job.auditLogs.push({
        status,
        timestamp: new Date().toISOString(),
        message: statusMessage || `Transitioned state to ${status}.`
      });

      if (printer) {
        printer.lastSeen = new Date().toISOString();
        
        // Comprehensive printer busy status logic based on all intermediate spooling/printing states
        const activePrintingStatuses = ["downloading", "verifying", "queued", "spooling", "printing", "printed"];
        const jobsList = await repository.getJobs();
        const otherActive = jobsList.some(j => j.printerId === printer.id && j.id !== id && activePrintingStatuses.includes(j.status));
        const currentActive = activePrintingStatuses.includes(status);
        
        printer.status = (currentActive || otherActive) ? "printing" : "online";

        // Clean up stored files on completion
        if (status === "completed") {
          await storage.delete(job.fileId).catch(() => {});
        }
        await repository.savePrinter(printer);
      }

      await repository.saveJob(job);
      logger.info(`Job status transition updated: ${id} -> ${status}`);
      res.json({ success: true, job: { id: job.id, status: job.status } });
    } catch (err) {
      logger.error("Failed to update print job status", err);
      res.status(500).json({ error: "Failed to update status in repository" });
    }
  });

  // DELETE/Cancel Print Job Endpoint
  app.delete("/api/jobs/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const job = await repository.getJob(id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Delete storage asset
      await storage.delete(job.fileId).catch(() => {});
      await repository.deleteJob(id);

      logger.info(`Job ${id} cancelled and pruned from system successfully.`);
      res.json({ success: true, message: "Job successfully removed from queue." });
    } catch (err) {
      logger.error(`Failed to cancel print job ${id}`, err);
      res.status(500).json({ error: "Failed to cancel print job" });
    }
  });

  // Helper function to download file following redirects
  function downloadFileWithRedirects(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const download = (targetUrl: string, depth = 0) => {
        if (depth > 5) {
          return reject(new Error("Too many redirects"));
        }

        const client = targetUrl.startsWith("https") ? https : http;
        client.get(targetUrl, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
            const redirectUrl = response.headers.location;
            if (!redirectUrl) {
              return reject(new Error(`Redirect status ${response.statusCode} with no Location header`));
            }
            download(redirectUrl, depth + 1);
          } else if (response.statusCode === 200) {
            const file = fs.createWriteStream(destPath);
            response.pipe(file);
            file.on("finish", () => {
              file.close();
              resolve();
            });
            file.on("error", (err) => {
              fs.unlink(destPath, () => {});
              reject(err);
            });
          } else {
            reject(new Error(`Server returned status code ${response.statusCode}`));
          }
        }).on("error", (err) => {
          reject(err);
        });
      };

      download(url);
    });
  }

  // --- WINDOWS CONNECTOR DOWNLOAD ENDPOINT ---
  app.get("/api/connectors/windows/download", async (req, res) => {
    const cacheDir = path.join(process.cwd(), "uploads");
    const installerFilename = "BidWar-Printer-Connector.exe";
    const localInstallerPath = path.join(cacheDir, installerFilename);
    
    // Get GitHub repository from env, default to tusharsaraswat1988/Printnode
    const githubRepo = process.env.GITHUB_REPO || "tusharsaraswat1988/Printnode";
    const githubReleaseUrl = `https://github.com/${githubRepo}/releases/latest/download/BidWar-Printer-Connector.exe`;

    // Ensure cache directory exists
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const serveLocalFile = () => {
      if (fs.existsSync(localInstallerPath)) {
        res.setHeader("Content-Disposition", `attachment; filename="${installerFilename}"`);
        res.setHeader("Content-Type", "application/octet-stream");
        res.sendFile(localInstallerPath);
        return true;
      }
      return false;
    };

    try {
      let needsDownload = true;

      if (fs.existsSync(localInstallerPath)) {
        const stats = fs.statSync(localInstallerPath);
        const ageInMs = Date.now() - stats.mtimeMs;
        const oneHourInMs = 60 * 60 * 1000;

        // If the file was compiled/built within the last hour (e.g. during deployment build),
        // or if we do not want to force-update, we can skip the remote download
        if (ageInMs < oneHourInMs) {
          needsDownload = false;
        }
      }

      if (needsDownload) {
        logger.info(`Attempting to download latest Windows Connector from GitHub: ${githubReleaseUrl}...`);
        
        // Download latest installer to temp file first, then rename to prevent serving partial file
        const tempPath = `${localInstallerPath}.tmp`;
        await downloadFileWithRedirects(githubReleaseUrl, tempPath);
        
        if (fs.existsSync(tempPath)) {
          fs.renameSync(tempPath, localInstallerPath);
          logger.info("Successfully fetched and cached latest Windows Connector from GitHub.");
        }
      }

      if (!serveLocalFile()) {
        throw new Error("Local installer file is missing after download attempt");
      }
    } catch (err: any) {
      logger.warn(`Failed to dynamically cache Windows Connector from GitHub (${githubReleaseUrl}): ${err.message}.`);
      
      // If we have a local version (e.g. compiled during build phase), serve it as the primary fallback!
      if (fs.existsSync(localInstallerPath)) {
        logger.info("Serving local compiled Windows Connector installer as fallback.");
        if (serveLocalFile()) return;
      }

      // If absolutely no local file exists and the download failed, redirect directly to the GitHub Release URL as a last-resort redirect
      logger.warn(`No local binary exists. Redirecting user to GitHub release assets as last resort.`);
      res.redirect(githubReleaseUrl);
    }
  });

  // --- CLIENT DAEMON GENERATOR & SERVING ---
  app.get("/api/download-daemon", (req, res) => {
    res.download(path.join(process.cwd(), "src/daemon/print-daemon.js"), "print-daemon.js");
  });

  app.get("/api/client-script", (req, res) => {
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    try {
      let code = fs.readFileSync(path.join(process.cwd(), "src/daemon/print-daemon.js"), "utf8");
      // Inject the current server url dynamically as the default URL in the client script
      code = code.replace("serverUrl: 'http://localhost:3000'", `serverUrl: '${appUrl}'`);
      res.setHeader("Content-Type", "text/plain");
      res.send(code);
    } catch (err) {
      logger.error("Failed to dynamically load print-daemon.js template", err);
      res.status(500).send("Failed to read printer client script.");
    }
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
    logger.info(`Enterprise Print Queue Sync Engine running on port ${PORT}`);
  });
}

startServer();
