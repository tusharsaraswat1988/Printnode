export type JobStatus = 'pending' | 'downloading' | 'printing' | 'completed' | 'failed';

export interface PrintJob {
  id: string;
  printerId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileData: string; // Base64 encoded file content
  copies: number;
  colorMode: 'color' | 'mono';
  paperSize: 'A4' | 'Letter' | 'Legal';
  status: JobStatus;
  statusMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Printer {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline' | 'printing';
  lastSeen: string;
  apiKey: string;
  jobCount: number;
}
