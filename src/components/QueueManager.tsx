import React, { useState } from "react";
import { 
  FileText, 
  Trash2, 
  Clock, 
  Loader2, 
  AlertCircle, 
  RefreshCw, 
  Printer as PrinterIcon, 
  User as UserIcon,
  ChevronRight,
  HelpCircle,
  XCircle,
  CheckCircle2,
  Download
} from "lucide-react";
import { PrintJob, Printer } from "../types";

interface QueueManagerProps {
  jobs: PrintJob[];
  printers: Printer[];
  onJobDeleted: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export default function QueueManager({ 
  jobs, 
  printers, 
  onJobDeleted, 
  onRefresh, 
  isRefreshing 
}: QueueManagerProps) {
  const [filterPrinterId, setFilterPrinterId] = useState<string>("all");

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to cancel and delete this print job?")) return;
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onJobDeleted();
      }
    } catch (err) {
      console.error("Failed to delete job", err);
    }
  };

  const getPrinterName = (printerId: string) => {
    const printer = printers.find(p => p.id === printerId);
    return printer ? printer.name : "Unknown Printer";
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const getStatusBadge = (status: PrintJob["status"], message?: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100 animate-pulse">
            <Clock className="h-3.5 w-3.5 mr-1" />
            Queueing
          </span>
        );
      case "downloading":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-100">
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            Downloading
          </span>
        );
      case "printing":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            Printing
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />
            Printed
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-100" title={message}>
            <XCircle className="h-3.5 w-3.5 mr-1 text-red-500" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-50 text-slate-700 border border-slate-100">
            {status}
          </span>
        );
    }
  };

  // Only show live/active/pending jobs in QueueManager
  const liveJobs = jobs.filter(j => j.status !== "completed" && j.status !== "failed");

  const filteredJobs = filterPrinterId === "all" 
    ? liveJobs 
    : liveJobs.filter(j => j.printerId === filterPrinterId);

  return (
    <div className="space-y-6" id="queue-manager-page">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Active Print Queue</h1>
            <button
              onClick={onRefresh}
              className={`p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all ${isRefreshing ? "animate-spin" : ""}`}
              title="Sync Queue"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500 font-medium">Monitor active payloads fetching or spooling in real-time on physical printers.</p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider" htmlFor="queue-filter">
            Filter:
          </label>
          <select
            id="queue-filter"
            value={filterPrinterId}
            onChange={(e) => setFilterPrinterId(e.target.value)}
            className="text-xs font-bold rounded-xl border border-slate-200 px-3 py-2 bg-white text-slate-700 focus:outline-hidden cursor-pointer"
          >
            <option value="all">All Printers ({liveJobs.length})</option>
            {printers.map((p) => {
              const count = liveJobs.filter(j => j.printerId === p.id).length;
              return (
                <option key={p.id} value={p.id}>
                  {p.name} ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Content list */}
      {filteredJobs.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-500">The print queue is clean</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">No documents or photos are queueing. Send a test file from the Print dashboard.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold text-xs uppercase tracking-wider">
                  <th className="py-4 px-6">File Details</th>
                  <th className="py-4 px-6">Target Printer</th>
                  <th className="py-4 px-6">Submitted By</th>
                  <th className="py-4 px-6">Time</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/50 transition-all">
                    <td className="py-4 px-6 font-medium text-slate-800">
                      <div className="flex items-center space-x-3 max-w-xs">
                        <div className="p-2 bg-slate-50 rounded-lg text-slate-500">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate" title={job.fileName}>{job.fileName}</p>
                          <p className="text-[10px] text-slate-400 font-semibold">{formatSize(job.fileSize)} • {job.copies} {job.copies === 1 ? "copy" : "copies"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-slate-600 font-medium">
                      <div className="flex items-center space-x-2">
                        <PrinterIcon className="h-4 w-4 text-slate-400" />
                        <span>{getPrinterName(job.printerId)}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-slate-500 font-medium">
                      <div className="flex items-center space-x-2">
                        <UserIcon className="h-4 w-4 text-slate-400" />
                        <span>{job.userId || "guest"}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-slate-500 font-medium">{formatTime(job.createdAt)}</td>
                    <td className="py-4 px-6">{getStatusBadge(job.status, job.statusMessage)}</td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <a
                          href={`/api/jobs/${job.id}/download`}
                          download={job.fileName}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all"
                          title="Download document payload"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <button
                          onClick={() => handleDelete(job.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          title="Cancel Print Job"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile responsive Cards Grid fallback */}
          <div className="block md:hidden space-y-4">
            {filteredJobs.map((job) => (
              <div 
                key={job.id} 
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="p-2 bg-slate-50 rounded-lg text-slate-500">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate" title={job.fileName}>{job.fileName}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{formatSize(job.fileSize)} • {job.copies} {job.copies === 1 ? "copy" : "copies"}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(job.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Cancel Job"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 font-bold border-t border-slate-100 pt-3">
                  <div className="flex items-center space-x-1.5">
                    <PrinterIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{getPrinterName(job.printerId)}</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <UserIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{job.userId || "guest"}</span>
                  </div>
                  <div className="mt-1 font-mono text-slate-400">{formatTime(job.createdAt)}</div>
                  <div className="mt-1 text-right">{getStatusBadge(job.status)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
