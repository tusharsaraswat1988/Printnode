import fs from 'fs';
import path from 'path';
import { FileStorage } from './storage';
import { Readable } from 'stream';

export class LocalFileStorage implements FileStorage {
  private baseDir: string;

  constructor(baseDir: string = path.join(process.cwd(), 'uploads')) {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async save(id: string, data: Buffer): Promise<void> {
    const filePath = path.join(this.baseDir, id);
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getStream(id: string): Readable {
    const filePath = path.join(this.baseDir, id);
    return fs.createReadStream(filePath);
  }

  async delete(id: string): Promise<void> {
    const filePath = path.join(this.baseDir, id);
    if (fs.existsSync(filePath)) {
      return new Promise((resolve, reject) => {
        fs.unlink(filePath, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  async exists(id: string): Promise<boolean> {
    return fs.existsSync(path.join(this.baseDir, id));
  }
}
