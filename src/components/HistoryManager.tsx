import React, { useState } from "react";
import { 
  FileText, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Printer as PrinterIcon, 
  User as UserIcon, 
  Calendar,
  Download,
  AlertCircle
} from "lucide-react";
import { PrintJob, Printer } from "../types";

interface HistoryManagerProps {
  jobs: PrintJob[];
  printers: Printer[];
  onJobDeleted: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export default function HistoryManager({ 
  jobs, 
  printers, 
  onJobDeleted, 
  onRefresh, 
  isRefreshing 
}: HistoryManagerProps) {
  const [filterPrinterId, setFilterPrinterId] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [filterDate, setFilterDate] = useState("all"); // 'all', 'today', 'yesterday'
  const [isReprintingId, setIsReprintingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this historical job record?")) return;
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      if (res.ok) {
        onJobDeleted();
      }
    } catch (err) {
      console.error("Failed to delete job", err);
    }
  };

  const handleReprint = async (job: PrintJob) => {
    setIsReprintingId(job.id);
    try {
      const res = await fetch(`/api/jobs/${job.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending", statusMessage: "Resubmitted for reprint." }),
      });
      if (res.ok) {
        alert("Print job successfully resubmitted to queue!");
        onRefresh();
      }
    } catch (err) {
      console.error("Failed to reprint job", err);
    } finally {
      setIsReprintingId(null);
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

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString([], { month: "short", day: "numeric" }) + " at " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Completed or Failed jobs are historical records
  const historyJobs = jobs.filter(j => j.status === "completed" || j.status === "failed");

  // Get unique users for filter options
  const uniqueUsers = Array.from(new Set(historyJobs.map(j => j.userId).filter(Boolean))) as string[];

  // Applying Filters
  const filteredJobs = historyJobs.filter((job) => {
    // 1. Printer Filter
    if (filterPrinterId !== "all" && job.printerId !== filterPrinterId) {
      return false;
    }

    // 2. User Filter
    if (filterUser !== "all" && job.userId !== filterUser) {
      return false;
    }

    // 3. Date Filter
    if (filterDate !== "all") {
      const jobDate = new Date(job.createdAt);
      const today = new Date();
      if (filterDate === "today") {
        return jobDate.toDateString() === today.toDateString();
      } else if (filterDate === "yesterday") {
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        return jobDate.toDateString() === yesterday.toDateString();
      }
    }

    return true;
  });

  return (
    <div className="space-y-6" id="history-manager-page">
      {/* Title Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Print History Logs</h1>
            <p className="text-xs text-slate-500 font-medium font-sans">View previous logs, download document files, or resubmit jobs back to the printer queue.</p>
          </div>
          <button
            onClick={onRefresh}
            className={`p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all ${isRefreshing ? "animate-spin" : ""}`}
            title="Sync History"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Filters Panel Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 border-t border-slate-100 pt-4">
          {/* Printer filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5" htmlFor="h-printer-filter">Filter Printer</label>
            <select
              id="h-printer-filter"
              value={filterPrinterId}
              onChange={(e) => setFilterPrinterId(e.target.value)}
              className="w-full text-xs font-bold rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 text-slate-700 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Printers ({historyJobs.length})</option>
              {printers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* User filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5" htmlFor="h-user-filter">Filter User</label>
            <select
              id="h-user-filter"
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="w-full text-xs font-bold rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 text-slate-700 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Users</option>
              {uniqueUsers.map((user) => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
          </div>

          {/* Date filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5" htmlFor="h-date-filter">Filter Date</label>
            <select
              id="h-date-filter"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full text-xs font-bold rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 text-slate-700 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
            </select>
          </div>
        </div>
      </div>

      {/* History Listing */}
      {filteredJobs.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-500">No matching history records</p>
          <p className="text-xs text-slate-400 mt-1">There are no completed or failed print tasks matching your criteria.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredJobs.map((job) => {
            const isSuccess = job.status === "completed";
            return (
              <div 
                key={job.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-300 transition-all"
              >
                {/* File details block */}
                <div className="flex items-start space-x-4 overflow-hidden">
                  <div className={`p-3 rounded-xl border ${
                    isSuccess ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
                  }`}>
                    {isSuccess ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
                  </div>
                  <div className="overflow-hidden min-w-0">
                    <h4 className="text-sm font-bold text-slate-800 truncate" title={job.fileName}>{job.fileName}</h4>
                    
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1.5 text-[10px] text-slate-500 font-bold">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-bold">{job.status.toUpperCase()}</span>
                      <span>{formatSize(job.fileSize)}</span>
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center">
                        <PrinterIcon className="h-3.5 w-3.5 mr-1 text-slate-400" />
                        {getPrinterName(job.printerId)}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center">
                        <UserIcon className="h-3.5 w-3.5 mr-1 text-slate-400" />
                        {job.userId || "guest"}
                      </span>
                    </div>

                    {job.statusMessage && !isSuccess && (
                      <div className="mt-2 text-[10px] text-red-700 bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-100 flex items-start space-x-1.5 max-w-xl font-bold">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{job.statusMessage}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Date and actions block */}
                <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0 shrink-0">
                  <div className="text-left md:text-right">
                    <p className="text-xs font-bold text-slate-700">{formatDateTime(job.printedAt || job.createdAt)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-bold">Original: {formatDateTime(job.createdAt)}</p>
                  </div>

                  <div className="flex items-center space-x-1">
                    {/* Reprint Action */}
                    <button
                      onClick={() => handleReprint(job)}
                      disabled={isReprintingId === job.id}
                      className="p-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-all"
                      title="Reprint Job"
                    >
                      <RefreshCw className={`h-4 w-4 ${isReprintingId === job.id ? "animate-spin" : ""}`} />
                    </button>

                    {/* Download File */}
                    <a
                      href={`/api/jobs/${job.id}/download`}
                      download={job.fileName}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      title="Download payload document"
                    >
                      <Download className="h-4 w-4" />
                    </a>

                    {/* Prune historical log */}
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Delete log record"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
