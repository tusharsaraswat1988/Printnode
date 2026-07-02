import * as admin from "firebase-admin";
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
    if (this.users.length === 0) {
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

export class FirestoreRepository implements DataRepository {
  private db: any;

  constructor(databaseId: string) {
    const firebaseAdmin = admin as any;
    this.db = firebaseAdmin.firestore(databaseId);
  }

  async getPrinters(): Promise<Printer[]> {
    try {
      const snap = await this.db.collection("printers").get();
      const printers: Printer[] = [];
      snap.forEach((doc: any) => {
        printers.push(doc.data() as Printer);
      });
      return printers;
    } catch (err) {
      console.error("FirestoreRepository: getPrinters failed", err);
      return [];
    }
  }

  async getPrinter(id: string): Promise<Printer | null> {
    try {
      const doc = await this.db.collection("printers").doc(id).get();
      return doc.exists ? (doc.data() as Printer) : null;
    } catch (err) {
      console.error(`FirestoreRepository: getPrinter ${id} failed`, err);
      return null;
    }
  }

  async savePrinter(printer: Printer): Promise<void> {
    try {
      await this.db.collection("printers").doc(printer.id).set(printer);
    } catch (err) {
      console.error(`FirestoreRepository: savePrinter ${printer.id} failed`, err);
    }
  }

  async deletePrinter(id: string): Promise<void> {
    try {
      await this.db.collection("printers").doc(id).delete();
    } catch (err) {
      console.error(`FirestoreRepository: deletePrinter ${id} failed`, err);
    }
  }

  async getJobs(): Promise<PrintJob[]> {
    try {
      const snap = await this.db.collection("jobs").orderBy("createdAt", "desc").get();
      const jobs: PrintJob[] = [];
      snap.forEach((doc: any) => {
        jobs.push(doc.data() as PrintJob);
      });
      return jobs;
    } catch (err) {
      console.error("FirestoreRepository: getJobs failed", err);
      return [];
    }
  }

  async getJob(id: string): Promise<PrintJob | null> {
    try {
      const doc = await this.db.collection("jobs").doc(id).get();
      return doc.exists ? (doc.data() as PrintJob) : null;
    } catch (err) {
      console.error(`FirestoreRepository: getJob ${id} failed`, err);
      return null;
    }
  }

  async saveJob(job: PrintJob): Promise<void> {
    try {
      await this.db.collection("jobs").doc(job.id).set(job);
    } catch (err) {
      console.error(`FirestoreRepository: saveJob ${job.id} failed`, err);
    }
  }

  async deleteJob(id: string): Promise<void> {
    try {
      await this.db.collection("jobs").doc(id).delete();
    } catch (err) {
      console.error(`FirestoreRepository: deleteJob ${id} failed`, err);
    }
  }

  async getUsers(): Promise<User[]> {
    try {
      const snap = await this.db.collection("users").get();
      const users: User[] = [];
      snap.forEach((doc: any) => {
        users.push(doc.data() as User);
      });
      if (users.length === 0) {
        const defaultUser: User = { mobile: "1234567890", password: "123456", role: "admin" };
        await this.saveUser(defaultUser);
        users.push(defaultUser);
      }
      return users;
    } catch (err) {
      console.error("FirestoreRepository: getUsers failed", err);
      return [{ mobile: "1234567890", password: "123456", role: "admin" }];
    }
  }

  async saveUser(user: User): Promise<void> {
    try {
      await this.db.collection("users").doc(user.mobile).set(user);
    } catch (err) {
      console.error(`FirestoreRepository: saveUser ${user.mobile} failed`, err);
    }
  }
}
