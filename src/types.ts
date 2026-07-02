export type JobStatus = 'pending' | 'downloading' | 'printing' | 'completed' | 'failed';

export interface AuditLogEntry {
  status: JobStatus;
  timestamp: string;
  message?: string;
}

export interface PrintJob {
  id: string;
  printerId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileId: string; // File reference ID (swappable storage key)
  sha256?: string; // SHA-256 file checksum
  copies: number;
  colorMode: 'color' | 'mono';
  paperSize: 'A4' | 'Letter' | 'Legal';
  duplex?: 'simplex' | 'duplex';
  orientation?: 'portrait' | 'landscape';
  pageRange?: string;
  status: JobStatus;
  statusMessage?: string;
  retryCount: number;
  userId?: string;
  printedAt?: string;
  auditLogs?: AuditLogEntry[];
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

export interface User {
  mobile: string;
  password: string;
  role: 'admin' | 'employee';
}
