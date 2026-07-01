import React, { useState } from "react";
import { FileText, Download, Trash2, CheckCircle2, XCircle, Clock, Loader2, AlertCircle, RefreshCw, Printer as PrinterIcon } from "lucide-react";
import { PrintJob, Printer } from "../types";

interface JobsListProps {
  jobs: PrintJob[];
  printers: Printer[];
  onJobDeleted: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export default function JobsList({ jobs, printers, onJobDeleted, onRefresh, isRefreshing }: JobsListProps) {
  const [filterPrinterId, setFilterPrinterId] = useState<string>("all");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);

  const handleSelectAll = () => {
    if (selectedJobIds.length === filteredJobs.length) {
      setSelectedJobIds([]);
    } else {
      setSelectedJobIds(filteredJobs.map(j => j.id));
    }
  };

  const handleSelectJob = (id: string) => {
    if (selectedJobIds.includes(id)) {
      setSelectedJobIds(selectedJobIds.filter(selectedId => selectedId !== id));
    } else {
      setSelectedJobIds([...selectedJobIds, id]);
    }
  };

  const handleBulkDelete = async () => {
    await Promise.all(selectedJobIds.map(id => 
      fetch(`/api/jobs/${id}`, { method: "DELETE" })
    ));
    setSelectedJobIds([]);
    onJobDeleted();
  };

  const handleBulkRetry = async () => {
    await Promise.all(selectedJobIds.map(id =>
      fetch(`/api/jobs/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pending" })
      })
    ));
    setSelectedJobIds([]);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
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
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const getStatusBadge = (status: PrintJob["status"], message?: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100 animate-pulse">
            <Clock className="h-3.5 w-3.5 mr-1" />
            Queueing
          </span>
        );
      case "downloading":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-100">
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            Downloading
          </span>
        );
      case "printing":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            Printing
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />
            Printed
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-100" title={message}>
            <XCircle className="h-3.5 w-3.5 mr-1 text-red-500" />
            Failed
          </span>
        );
    }
  };

  const filteredJobs = filterPrinterId === "all" 
    ? jobs 
    : jobs.filter(j => j.printerId === filterPrinterId);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm" id="queue-panel">
      {/* Header and Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-slate-800">Live Queue Manager</h2>
            <button
              onClick={onRefresh}
              className={`p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all ${isRefreshing ? "animate-spin" : ""}`}
              title="Refresh Queue"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500 font-medium">Track files uploading from phones/PCs and printing on your remote systems.</p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {selectedJobIds.length > 0 && (
            <div className="flex items-center space-x-2 mr-4 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="text-xs font-bold text-slate-700">{selectedJobIds.length} Selected</span>
              <button onClick={handleBulkRetry} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">Retry</button>
              <button onClick={handleBulkDelete} className="text-xs font-bold text-red-600 hover:text-red-800">Delete</button>
            </div>
          )}
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider" htmlFor="filter-select">
            Filter by:
          </label>
          <select
            id="filter-select"
            value={filterPrinterId}
            onChange={(e) => setFilterPrinterId(e.target.value)}
            className="text-xs font-bold rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 text-slate-700 focus:outline-hidden cursor-pointer"
          >
            <option value="all">All Printers</option>
            {printers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Queue Listing */}
      <div className="space-y-4">
        {filteredJobs.length > 0 && (
          <div className="flex items-center space-x-3 px-5 py-3 bg-slate-50 rounded-xl border border-slate-200">
            <input 
              type="checkbox" 
              checked={selectedJobIds.length === filteredJobs.length && filteredJobs.length > 0}
              onChange={handleSelectAll}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-bold text-slate-500">Select All</span>
          </div>
        )}
        {filteredJobs.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/20">
            <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-xs font-bold text-slate-500">Print queue is empty</p>
            <p className="text-[10px] text-slate-400 mt-1">Submit documents or photos from mobile or PC above.</p>
          </div>
        ) : (
          filteredJobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-white hover:bg-slate-50/50 rounded-xl border border-slate-200 transition-all gap-4"
            >
              <div className="flex items-center space-x-3">
                <input 
                  type="checkbox" 
                  checked={selectedJobIds.includes(job.id)}
                  onChange={() => handleSelectJob(job.id)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                {/* Left Side: Job Info */}
                <div className="flex items-start space-x-4 overflow-hidden">
                <div className={`p-3 rounded-lg border ${
                  job.status === "completed" ? "bg-emerald-50 border-emerald-100 text-emerald-600" :
                  job.status === "failed" ? "bg-red-50 border-red-100 text-red-600" :
                  "bg-amber-50 border-amber-100 text-amber-600 animate-pulse"
                }`}>
                  <FileText className="h-6 w-6" />
                </div>
                <div className="overflow-hidden min-w-0">
                  <h4 className="text-sm font-bold text-slate-800 truncate" title={job.fileName}>
                    {job.fileName}
                  </h4>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1 text-[10px] text-slate-500 font-bold">
                    <span>{formatSize(job.fileSize)}</span>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center">
                      <PrinterIcon className="h-3.5 w-3.5 mr-1 text-slate-400" />
                      {getPrinterName(job.printerId)}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span>{job.copies} {job.copies === 1 ? "copy" : "copies"}</span>
                    <span className="text-slate-300">•</span>
                    <span className="capitalize">{job.colorMode}</span>
                    <span className="text-slate-300">•</span>
                    <span>{job.paperSize}</span>
                  </div>
                  {job.statusMessage && (
                    <div className="mt-2 flex items-start space-x-2 text-[10px] text-red-700 bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-100 max-w-lg font-bold">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{job.statusMessage}</span>
                    </div>
                  )}
                </div>
              </div>
              </div>

              {/* Right Side: Status and Actions */}
              <div className="flex items-center justify-between md:justify-end space-x-4 border-t md:border-t-0 border-slate-100 pt-4 md:pt-0 shrink-0">
                <div className="flex flex-col items-start md:items-end space-y-1">
                  {getStatusBadge(job.status, job.statusMessage)}
                  <span className="text-[10px] text-slate-400 font-bold">
                    At {formatTime(job.createdAt)}
                  </span>
                </div>

                <div className="flex items-center space-x-1.5">
                  {/* Download link - pulls binary from our express endpoint */}
                  <a
                    href={`/api/jobs/${job.id}/download`}
                    download={job.fileName}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="Download original file"
                  >
                    <Download className="h-4 w-4" />
                  </a>

                  {/* Remove Job */}
                  <button
                    onClick={() => handleDelete(job.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Remove from queue"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
