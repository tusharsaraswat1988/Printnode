import React, { useState, useEffect, useRef } from "react";
import { Play, Square, Printer as PrinterIcon, Terminal, Check, AlertTriangle, HelpCircle, Sparkles } from "lucide-react";
import { Printer } from "../types";

interface VirtualPrinterProps {
  printers: Printer[];
  onStateChange: () => void;
}

export default function VirtualPrinter({ printers, onStateChange }: VirtualPrinterProps) {
  const [isActive, setIsActive] = useState(false);
  const [selectedPrinterId, setSelectedPrinterId] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [activeJobName, setActiveJobName] = useState<string | null>(null);
  const [activeJobProgress, setActiveJobProgress] = useState<number>(0);
  const [activeJobState, setActiveJobState] = useState<string>("");

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Initialize selected printer
  useEffect(() => {
    if (printers.length > 0 && !selectedPrinterId) {
      setSelectedPrinterId(printers[0].id);
    }
  }, [printers, selectedPrinterId]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((prev) => [...prev.slice(-30), `[${timestamp}] ${message}`]); // Keep last 30 logs
  };

  // Auto scroll logs
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const startDaemon = () => {
    if (!selectedPrinterId) {
      alert("Please select a printer to emulate.");
      return;
    }

    const printer = printers.find(p => p.id === selectedPrinterId);
    if (!printer) return;

    setIsActive(true);
    setLogs([]);
    addLog(`INIT: Starting Virtual Printer Daemon for [${printer.name}]`);
    addLog(`CONFIG: Remote Connection established to ${window.location.origin}`);
    addLog(`AUTH: Printer Key accepted. Status: Listening...`);

    // Run the polling cycle
    runPollCycle();
    intervalRef.current = setInterval(runPollCycle, 5000);
  };

  const stopDaemon = () => {
    setIsActive(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    addLog(`STOP: Virtual Daemon stopped safely.`);
    setActiveJobName(null);
    setActiveJobProgress(0);
    setActiveJobState("");
  };

  const runPollCycle = async () => {
    if (!selectedPrinterId) return;
    const printer = printers.find(p => p.id === selectedPrinterId);
    if (!printer) return;

    try {
      // 1. Ping the server to show online
      const pingRes = await fetch("/api/printers/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerId: selectedPrinterId, apiKey: printer.apiKey }),
      });
      onStateChange(); // refresh dashboard metrics

      // 2. Poll for pending jobs
      const pollRes = await fetch(`/api/jobs/poll/${selectedPrinterId}?apiKey=${printer.apiKey}`);
      const { job } = await pollRes.json();

      if (job) {
        // Found a job! Stop polling temporarily during execution
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }

        addLog(`POLL: Found job [${job.fileName}] (${job.id}) in queue`);
        setActiveJobName(job.fileName);
        setActiveJobProgress(5);
        setActiveJobState("Starting download");

        // Step A: Downloading (takes 1.5 seconds)
        addLog(`DOWNLOAD: Retrieving from server /api/jobs/${job.id}/download...`);
        await fetch(`/api/jobs/${job.id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "downloading" }),
        });
        onStateChange();

        await sleep(1500);
        setActiveJobProgress(35);
        setActiveJobState("File downloaded. Spooling...");
        addLog(`DOWNLOAD: Saved locally to virtual buffer (${formatSize(job.fileSize)})`);

        // Step B: Printing (takes 3 seconds)
        addLog(`SPOOL: Sending to physical spooler [${printer.name}]...`);
        await fetch(`/api/jobs/${job.id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "printing" }),
        });
        onStateChange();

        await sleep(1000);
        setActiveJobProgress(60);
        setActiveJobState("Printing page 1 of " + job.copies);
        addLog(`PRINT: Whirrr... Feeding paper (${job.paperSize})`);

        await sleep(1000);
        setActiveJobProgress(85);
        setActiveJobState("Applying ink (" + job.colorMode + ")");
        addLog(`PRINT: Applying thermal ink... Clack, clack, whirrrr...`);

        // Step C: Complete
        await sleep(1000);
        setActiveJobProgress(100);
        setActiveJobState("Completed successfully");
        addLog(`PRINT: Output tray loaded. Job [${job.fileName}] successfully printed!`);

        await fetch(`/api/jobs/${job.id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        });

        await sleep(800);
        setActiveJobName(null);
        setActiveJobProgress(0);
        setActiveJobState("");
        onStateChange();

        // Restart polling if we are still active
        addLog("STATUS: Listening for print jobs...");
        if (isActive) {
          intervalRef.current = setInterval(runPollCycle, 5000);
        }
      } else {
        addLog("POLL: Queue checked, 0 pending jobs. Sleeping 5s...");
      }
    } catch (err: any) {
      addLog(`ERROR: Loop crash: ${err.message}`);
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <div className="bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 p-6 shadow-sm" id="emulator-panel">
      {/* Title */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <PrinterIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center">
              On-Screen Printer Emulator
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-900/40 text-indigo-300 border border-indigo-500/30">
                <Sparkles className="h-2.5 w-2.5 mr-0.5 text-indigo-400" />
                Preview Mode
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 font-medium">Emulate a physical printer directly in your browser tab to test the full cloud loop instantly.</p>
          </div>
        </div>

        {/* Toggle Controls */}
        <div className="flex items-center space-x-2">
          {!isActive ? (
            <button
              onClick={startDaemon}
              disabled={printers.length === 0}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-all shadow-sm"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Start Emulator</span>
            </button>
          ) : (
            <button
              onClick={stopDaemon}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Stop Emulator</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left Side: Connection & Live Feedback */}
        <div className="space-y-3 md:col-span-1">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5" htmlFor="emulator-printer">
              Emulate Printer
            </label>
            <select
              id="emulator-printer"
              value={selectedPrinterId}
              onChange={(e) => setSelectedPrinterId(e.target.value)}
              disabled={isActive}
              className="w-full text-xs font-bold rounded-lg border border-slate-800 px-2.5 py-2.5 bg-slate-900 text-slate-200 focus:outline-hidden disabled:opacity-50 cursor-pointer"
            >
              {printers.length === 0 && <option value="">Register a printer first</option>}
              {printers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.location})
                </option>
              ))}
            </select>
          </div>

          {/* Active Job Visual */}
          {activeJobName ? (
            <div className="bg-slate-900 border border-indigo-500/30 rounded-xl p-4 text-center animate-pulse">
              <PrinterIcon className="h-8 w-8 text-indigo-400 mx-auto mb-2 animate-bounce" />
              <p className="text-xs font-bold text-white truncate" title={activeJobName}>{activeJobName}</p>
              <p className="text-[10px] text-indigo-300 font-bold mt-1">{activeJobState}</p>
              
              {/* Progress Bar */}
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${activeJobProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 text-center h-32 flex flex-col items-center justify-center text-slate-500">
              <PrinterIcon className="h-7 w-7 text-slate-700 mb-2" />
              <p className="text-[11px] font-bold">Printer is {isActive ? "Idle" : "Inactive"}</p>
              <p className="text-[10px] text-slate-600 font-medium mt-0.5">
                {isActive ? "Listening for pending files..." : "Start the emulator to poll the queue."}
              </p>
            </div>
          )}
        </div>

        {/* Right Side: Virtual Client Terminal Logs */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider flex items-center">
              <Terminal className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
              Local Terminal Logs (Wired PC Simulator)
            </span>
            <span className={`h-2 w-2 rounded-full ${isActive ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
          </div>
          <div 
            ref={logsContainerRef}
            className="font-mono text-[10px] bg-slate-900 border border-slate-800 rounded-xl p-4 h-36 overflow-y-auto text-slate-300 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
          >
            {logs.length === 0 ? (
              <p className="text-slate-600 italic font-medium">Terminal closed. Start printer emulator to boot daemon logs.</p>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="leading-5">
                  <span className="text-indigo-400">$</span> {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
