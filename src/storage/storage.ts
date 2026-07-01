import { Readable } from 'stream';

export interface FileStorage {
  save(id: string, data: Buffer): Promise<void>;
  getStream(id: string): Readable;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}
