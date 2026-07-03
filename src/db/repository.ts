import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { Printer, PrintJob, User } from "../types";

export interface DataRepository {
  getPrinters(): Promise<Printer[]>;
  getPrinter(id: string): Promise<Printer | null>;
  savePrinter(printer: Printer): Promise<void>;
  deletePrinter(id: string): Promise<void>;

  getJobs(): Promise<PrintJob[]>;
  getJob(id: string): Promise<PrintJob | null>;
  saveJob(job: PrintJob): Promise<void>;
  deleteJob(id: string): Promise<void>;

  getUsers(): Promise<User[]>;
  saveUser(user: User): Promise<void>;
}

export class LocalJSONRepository implements DataRepository {
  private storePath: string;
  private printers: Printer[] = [];
  private jobs: PrintJob[] = [];
  private users: User[] = [];

  constructor(storePath: string = path.join(process.cwd(), "print_store.json")) {
    this.storePath = storePath;
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = JSON.parse(fs.readFileSync(this.storePath, "utf-8"));
        if (data.printers) this.printers = data.printers;
        if (data.jobs) this.jobs = data.jobs;
        if (data.users) this.users = data.users;
      }
    } catch (err) {
      console.error("LocalJSONRepository: load failed", err);
    }
  }

  private save() {
    try {
      const data = { printers: this.printers, jobs: this.jobs, users: this.users };
      fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("LocalJSONRepository: save failed", err);
    }
  }

  async getPrinters(): Promise<Printer[]> {
    this.load();
    return this.printers;
  }

  async getPrinter(id: string): Promise<Printer | null> {
    this.load();
    return this.printers.find(p => p.id === id) || null;
  }

  async savePrinter(printer: Printer): Promise<void> {
    this.load();
    const idx = this.printers.findIndex(p => p.id === printer.id);
    if (idx !== -1) this.printers[idx] = printer;
    else this.printers.push(printer);
    this.save();
  }

  async deletePrinter(id: string): Promise<void> {
    this.load();
    this.printers = this.printers.filter(p => p.id !== id);
    this.save();
  }

  async getJobs(): Promise<PrintJob[]> {
    this.load();
    return this.jobs;
  }

  async getJob(id: string): Promise<PrintJob | null> {
    this.load();
    return this.jobs.find(j => j.id === id) || null;
  }

  async saveJob(job: PrintJob): Promise<void> {
    this.load();
    const idx = this.jobs.findIndex(j => j.id === job.id);
    if (idx !== -1) this.jobs[idx] = job;
    else this.jobs.unshift(job);
    this.save();
  }

  async deleteJob(id: string): Promise<void> {
    this.load();
    this.jobs = this.jobs.filter(j => j.id !== id);
    this.save();
  }

  async getUsers(): Promise<User[]> {
    this.load();
    const envMobile = process.env.ADMIN_MOBILE || process.env.MOBILE || process.env.ADMIN_ID || process.env.ID || process.env.ADMIN_USER || process.env.USER;
    const envPassword = process.env.ADMIN_PASSWORD || process.env.PASSWORD || process.env.ADMIN_PASS || process.env.PASS;

    if (envMobile && envPassword) {
      const idx = this.users.findIndex(u => u.mobile === envMobile);
      if (idx !== -1) {
        this.users[idx].password = envPassword;
        this.users[idx].role = "admin";
      } else {
        this.users.push({ mobile: envMobile, password: envPassword, role: "admin" });
      }
      this.save();
    } else if (this.users.length === 0) {
      this.users = [{ mobile: "1234567890", password: "123456", role: "admin" }];
      this.save();
    }
    return this.users;
  }

  async saveUser(user: User): Promise<void> {
    this.load();
    const idx = this.users.findIndex(u => u.mobile === user.mobile);
    if (idx !== -1) this.users[idx] = user;
    else this.users.push(user);
    this.save();
  }
}

export class NeonRepository implements DataRepository {
  private pool: Pool;
  private isInitialized = false;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes("neon.tech") || connectionString.includes("render.com") || connectionString.includes("supabase.co")
        ? { rejectUnauthorized: false }
        : undefined,
    });

    this.pool.on("error", (err) => {
      console.error("Neon DB Pool Error:", err);
    });
  }

  async initializeSchema() {
    if (this.isInitialized) return;
    try {
      const client = await this.pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS printers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            location TEXT NOT NULL,
            status TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            api_key TEXT NOT NULL,
            job_count INTEGER NOT NULL DEFAULT 0,
            queue_length INTEGER NOT NULL DEFAULT 0,
            paper_status TEXT NOT NULL DEFAULT 'unknown',
            toner_status TEXT NOT NULL DEFAULT 'unknown',
            daemon_version TEXT,
            uptime DOUBLE PRECISION
          );
        `);

        // Migration step: ALTER TABLE for existing databases
        await client.query(`
          ALTER TABLE printers ADD COLUMN IF NOT EXISTS queue_length INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE printers ADD COLUMN IF NOT EXISTS paper_status TEXT NOT NULL DEFAULT 'unknown';
          ALTER TABLE printers ADD COLUMN IF NOT EXISTS toner_status TEXT NOT NULL DEFAULT 'unknown';
          ALTER TABLE printers ADD COLUMN IF NOT EXISTS daemon_version TEXT;
          ALTER TABLE printers ADD COLUMN IF NOT EXISTS uptime DOUBLE PRECISION;
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            printer_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            file_id TEXT NOT NULL,
            sha256 TEXT,
            copies INTEGER NOT NULL,
            color_mode TEXT NOT NULL,
            paper_size TEXT NOT NULL,
            duplex TEXT,
            orientation TEXT,
            page_range TEXT,
            status TEXT NOT NULL,
            status_message TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            user_id TEXT,
            printed_at TEXT,
            audit_logs TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            mobile TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            role TEXT NOT NULL
          );
        `);

        // Insert default admin and employee users if they don't exist
        await client.query(`
          INSERT INTO users (mobile, password, role) 
          VALUES 
            ('1234567890', '123456', 'admin'),
            ('9876543210', 'password123', 'employee')
          ON CONFLICT (mobile) DO NOTHING;
        `);

        // Seed printers if printers table is empty
        const printerCheck = await client.query("SELECT COUNT(*) FROM printers;");
        if (parseInt(printerCheck.rows[0].count) === 0) {
          console.log("Seeding default printers into Neon DB...");
          await client.query(`
            INSERT INTO printers (id, name, location, status, last_seen, api_key, job_count)
            VALUES 
              ('printer-wired-pc', 'Deskjet 2700 Series', 'Living Room Wired PC', 'offline', '2026-07-02T04:38:41.429Z', 'print_k_d3b1f9', 2),
              ('printer-office-laser', 'LaserJet Pro M404', 'Office Room 4B', 'offline', '2026-07-01T14:13:10.691Z', 'print_k_a8c2f1', 5)
            ON CONFLICT (id) DO NOTHING;
          `);
        }

        // Seed some sample jobs if jobs table is empty
        const jobCheck = await client.query("SELECT COUNT(*) FROM jobs;");
        if (parseInt(jobCheck.rows[0].count) === 0) {
          console.log("Seeding sample print jobs into Neon DB...");
          const auditLogs001 = JSON.stringify([
            { timestamp: "2026-07-01T10:00:00.000Z", status: "pending", message: "Job created" },
            { timestamp: "2026-07-01T10:01:00.000Z", status: "printing", message: "Job sent to printer" },
            { timestamp: "2026-07-01T10:02:00.000Z", status: "printed", message: "Successfully printed" }
          ]);
          const auditLogs002 = JSON.stringify([
            { timestamp: "2026-07-01T12:00:00.000Z", status: "pending", message: "Job created and waiting in queue" }
          ]);

          await client.query(`
            INSERT INTO jobs (
              id, printer_id, file_name, file_type, file_size, file_id, sha256, 
              copies, color_mode, paper_size, duplex, orientation, page_range, 
              status, status_message, retry_count, user_id, printed_at, audit_logs, 
              created_at, updated_at
            )
            VALUES 
              (
                'job-001', 'printer-wired-pc', 'monthly_report.pdf', 'application/pdf', 154200, 'mock-file-1', 'sha-256-mock-1', 
                1, 'mono', 'A4', 'duplex', 'portrait', '1-5', 
                'printed', 'Success', 0, '1234567890', '2026-07-01T10:02:00.000Z', $1, 
                '2026-07-01T10:00:00.000Z', '2026-07-01T10:02:00.000Z'
              ),
              (
                'job-002', 'printer-office-laser', 'presentation_slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 4500000, 'mock-file-2', 'sha-256-mock-2', 
                3, 'color', 'Letter', 'simplex', 'landscape', NULL, 
                'pending', 'Waiting in queue', 0, '9876543210', NULL, $2, 
                '2026-07-01T12:00:00.000Z', '2026-07-01T12:00:00.000Z'
              )
            ON CONFLICT (id) DO NOTHING;
          `, [auditLogs001, auditLogs002]);
        }

        this.isInitialized = true;
        console.log("Neon DB schema initialized and verified successfully.");
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("NeonRepository: failed to initialize schema", err);
    }
  }

  async getPrinters(): Promise<Printer[]> {
    await this.initializeSchema();
    try {
      const res = await this.pool.query("SELECT * FROM printers");
      return res.rows.map(row => ({
        id: row.id,
        name: row.name,
        location: row.location,
        status: row.status as 'online' | 'offline' | 'printing',
        lastSeen: row.last_seen,
        apiKey: row.api_key,
        jobCount: row.job_count,
        queueLength: row.queue_length,
        paperStatus: row.paper_status,
        tonerStatus: row.toner_status,
        daemonVersion: row.daemon_version,
        uptime: row.uptime ? parseFloat(row.uptime) : undefined
      }));
    } catch (err) {
      console.error("NeonRepository: getPrinters failed", err);
      return [];
    }
  }

  async getPrinter(id: string): Promise<Printer | null> {
    await this.initializeSchema();
    try {
      const res = await this.pool.query("SELECT * FROM printers WHERE id = $1", [id]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        name: row.name,
        location: row.location,
        status: row.status as 'online' | 'offline' | 'printing',
        lastSeen: row.last_seen,
        apiKey: row.api_key,
        jobCount: row.job_count,
        queueLength: row.queue_length,
        paperStatus: row.paper_status,
        tonerStatus: row.toner_status,
        daemonVersion: row.daemon_version,
        uptime: row.uptime ? parseFloat(row.uptime) : undefined
      };
    } catch (err) {
      console.error(`NeonRepository: getPrinter ${id} failed`, err);
      return null;
    }
  }

  async savePrinter(printer: Printer): Promise<void> {
    await this.initializeSchema();
    try {
      await this.pool.query(
        `INSERT INTO printers (id, name, location, status, last_seen, api_key, job_count, queue_length, paper_status, toner_status, daemon_version, uptime)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE 
         SET name = EXCLUDED.name, 
             location = EXCLUDED.location, 
             status = EXCLUDED.status, 
             last_seen = EXCLUDED.last_seen, 
             api_key = EXCLUDED.api_key, 
             job_count = EXCLUDED.job_count,
             queue_length = EXCLUDED.queue_length,
             paper_status = EXCLUDED.paper_status,
             toner_status = EXCLUDED.toner_status,
             daemon_version = EXCLUDED.daemon_version,
             uptime = EXCLUDED.uptime`,
        [
          printer.id, 
          printer.name, 
          printer.location, 
          printer.status, 
          printer.lastSeen, 
          printer.apiKey, 
          printer.jobCount,
          printer.queueLength || 0,
          printer.paperStatus || 'unknown',
          printer.tonerStatus || 'unknown',
          printer.daemonVersion || null,
          printer.uptime !== undefined ? printer.uptime : null
        ]
      );
    } catch (err) {
      console.error(`NeonRepository: savePrinter ${printer.id} failed`, err);
    }
  }

  async deletePrinter(id: string): Promise<void> {
    await this.initializeSchema();
    try {
      await this.pool.query("DELETE FROM printers WHERE id = $1", [id]);
    } catch (err) {
      console.error(`NeonRepository: deletePrinter ${id} failed`, err);
    }
  }

  async getJobs(): Promise<PrintJob[]> {
    await this.initializeSchema();
    try {
      const res = await this.pool.query("SELECT * FROM jobs ORDER BY created_at DESC");
      return res.rows.map(row => ({
        id: row.id,
        printerId: row.printer_id,
        fileName: row.file_name,
        fileType: row.file_type,
        fileSize: row.file_size,
        fileId: row.file_id,
        sha256: row.sha256 || undefined,
        copies: row.copies,
        colorMode: row.color_mode as 'color' | 'mono',
        paperSize: row.paper_size as 'A4' | 'Letter' | 'Legal',
        duplex: row.duplex as 'simplex' | 'duplex' | undefined,
        orientation: row.orientation as 'portrait' | 'landscape' | undefined,
        pageRange: row.page_range || undefined,
        status: row.status as any,
        statusMessage: row.status_message || undefined,
        retryCount: row.retry_count,
        userId: row.user_id || undefined,
        printedAt: row.printed_at || undefined,
        auditLogs: row.audit_logs ? JSON.parse(row.audit_logs) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (err) {
      console.error("NeonRepository: getJobs failed", err);
      return [];
    }
  }

  async getJob(id: string): Promise<PrintJob | null> {
    await this.initializeSchema();
    try {
      const res = await this.pool.query("SELECT * FROM jobs WHERE id = $1", [id]);
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        printerId: row.printer_id,
        fileName: row.file_name,
        fileType: row.file_type,
        fileSize: row.file_size,
        fileId: row.file_id,
        sha256: row.sha256 || undefined,
        copies: row.copies,
        colorMode: row.color_mode as 'color' | 'mono',
        paperSize: row.paper_size as 'A4' | 'Letter' | 'Legal',
        duplex: row.duplex as 'simplex' | 'duplex' | undefined,
        orientation: row.orientation as 'portrait' | 'landscape' | undefined,
        pageRange: row.page_range || undefined,
        status: row.status as any,
        statusMessage: row.status_message || undefined,
        retryCount: row.retry_count,
        userId: row.user_id || undefined,
        printedAt: row.printed_at || undefined,
        auditLogs: row.audit_logs ? JSON.parse(row.audit_logs) : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (err) {
      console.error(`NeonRepository: getJob ${id} failed`, err);
      return null;
    }
  }

  async saveJob(job: PrintJob): Promise<void> {
    await this.initializeSchema();
    try {
      await this.pool.query(
        `INSERT INTO jobs (
          id, printer_id, file_name, file_type, file_size, file_id, sha256, 
          copies, color_mode, paper_size, duplex, orientation, page_range, 
          status, status_message, retry_count, user_id, printed_at, audit_logs, 
          created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         ON CONFLICT (id) DO UPDATE 
         SET printer_id = EXCLUDED.printer_id,
             file_name = EXCLUDED.file_name,
             file_type = EXCLUDED.file_type,
             file_size = EXCLUDED.file_size,
             file_id = EXCLUDED.file_id,
             sha256 = EXCLUDED.sha256,
             copies = EXCLUDED.copies,
             color_mode = EXCLUDED.color_mode,
             paper_size = EXCLUDED.paper_size,
             duplex = EXCLUDED.duplex,
             orientation = EXCLUDED.orientation,
             page_range = EXCLUDED.page_range,
             status = EXCLUDED.status,
             status_message = EXCLUDED.status_message,
             retry_count = EXCLUDED.retry_count,
             user_id = EXCLUDED.user_id,
             printed_at = EXCLUDED.printed_at,
             audit_logs = EXCLUDED.audit_logs,
             created_at = EXCLUDED.created_at,
             updated_at = EXCLUDED.updated_at`,
        [
          job.id, job.printerId, job.fileName, job.fileType, job.fileSize, job.fileId, job.sha256 || null,
          job.copies, job.colorMode, job.paperSize, job.duplex || null, job.orientation || null, job.pageRange || null,
          job.status, job.statusMessage || null, job.retryCount, job.userId || null, job.printedAt || null,
          job.auditLogs ? JSON.stringify(job.auditLogs) : null, job.createdAt, job.updatedAt
        ]
      );
    } catch (err) {
      console.error(`NeonRepository: saveJob ${job.id} failed`, err);
    }
  }

  async deleteJob(id: string): Promise<void> {
    await this.initializeSchema();
    try {
      await this.pool.query("DELETE FROM jobs WHERE id = $1", [id]);
    } catch (err) {
      console.error(`NeonRepository: deleteJob ${id} failed`, err);
    }
  }

  async getUsers(): Promise<User[]> {
    await this.initializeSchema();
    try {
      const envMobile = process.env.ADMIN_MOBILE || process.env.MOBILE || process.env.ADMIN_ID || process.env.ID || process.env.ADMIN_USER || process.env.USER;
      const envPassword = process.env.ADMIN_PASSWORD || process.env.PASSWORD || process.env.ADMIN_PASS || process.env.PASS;

      if (envMobile && envPassword) {
        const envUser: User = { mobile: envMobile, password: envPassword, role: "admin" };
        await this.saveUser(envUser);
      }

      const res = await this.pool.query("SELECT * FROM users");
      if (res.rows.length === 0) {
        const defaultUser: User = { mobile: "1234567890", password: "123456", role: "admin" };
        await this.saveUser(defaultUser);
        return [defaultUser];
      }
      return res.rows.map(row => ({
        mobile: row.mobile,
        password: row.password,
        role: row.role as 'admin' | 'employee'
      }));
    } catch (err) {
      console.error("NeonRepository: getUsers failed", err);
      const envMobile = process.env.ADMIN_MOBILE || process.env.MOBILE || process.env.ADMIN_ID || process.env.ID || process.env.ADMIN_USER || process.env.USER;
      const envPassword = process.env.ADMIN_PASSWORD || process.env.PASSWORD || process.env.ADMIN_PASS || process.env.PASS;
      if (envMobile && envPassword) {
        return [{ mobile: envMobile, password: envPassword, role: "admin" }];
      }
      return [{ mobile: "1234567890", password: "123456", role: "admin" }];
    }
  }

  async saveUser(user: User): Promise<void> {
    await this.initializeSchema();
    try {
      await this.pool.query(
        `INSERT INTO users (mobile, password, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (mobile) DO UPDATE
         SET password = EXCLUDED.password,
             role = EXCLUDED.role`,
        [user.mobile, user.password, user.role]
      );
    } catch (err) {
      console.error(`NeonRepository: saveUser ${user.mobile} failed`, err);
    }
  }
}
