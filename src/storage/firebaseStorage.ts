import * as admin from 'firebase-admin';
import { FileStorage } from './storage';
import { Readable } from 'stream';

export class FirebaseFileStorage implements FileStorage {
  private bucket: admin.storage.Bucket;

  constructor() {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET // You need to ensure this is set
      });
    }
    this.bucket = admin.storage().bucket();
  }

  async save(id: string, data: Buffer): Promise<void> {
    const file = this.bucket.file(`jobs/${id}`);
    await file.save(data);
  }

  getStream(id: string): Readable {
    return this.bucket.file(`jobs/${id}`).createReadStream();
  }

  async delete(id: string): Promise<void> {
    await this.bucket.file(`jobs/${id}`).delete();
  }

  async exists(id: string): Promise<boolean> {
    const [exists] = await this.bucket.file(`jobs/${id}`).exists();
    return exists;
  }
}
