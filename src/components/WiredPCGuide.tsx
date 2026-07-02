import React, { useState, useEffect } from "react";
import { Terminal, Copy, Check, Download, AlertCircle, Cpu, Wifi, HelpCircle, HardDrive, RefreshCw } from "lucide-react";
import { Printer } from "../types";

interface WiredPCGuideProps {
  printers: Printer[];
}

export default function WiredPCGuide({ printers }: WiredPCGuideProps) {
  const [selectedPrinterId, setSelectedPrinterId] = useState("");
  const [selectedPrinterKey, setSelectedPrinterKey] = useState("");
  
  const [copied, setCopied] = useState(false);
  const [clientCode, setClientCode] = useState("");
  const [loading, setLoading] = useState(true);

  // Initialize selected printer if list is not empty
  useEffect(() => {
    if (printers.length > 0 && !selectedPrinterId) {
      const active = printers[0];
      setSelectedPrinterId(active.id);
      setSelectedPrinterKey(active.apiKey);
    }
  }, [printers]);

  // Handle printer selection change
  const handlePrinterChange = (printerId: string) => {
    setSelectedPrinterId(printerId);
    const p = printers.find(x => x.id === printerId);
    if (p) {
      setSelectedPrinterKey(p.apiKey);
    }
  };

  const serverUrl = typeof window !== "undefined" ? window.location.origin : "https://your-app.run.app";

  useEffect(() => {
    const fetchScript = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/client-script");
        if (res.ok) {
          const text = await res.text();
          let customScript = text;
          if (selectedPrinterId) {
            customScript = customScript
              .replace("node print-daemon.js <PRINTER_ID> <API_KEY>", `node print-daemon.js ${selectedPrinterId} ${selectedPrinterKey}`)
              .replace('const PRINTER_ID = args[0];', `const PRINTER_ID = args[0] || "${selectedPrinterId}";`)
              .replace('const API_KEY = args[1];', `const API_KEY = args[1] || "${selectedPrinterKey}";`);
          }
          setClientCode(customScript);
        }
      } catch (err) {
        console.error("Failed to load client script", err);
      } finally {
        setLoading(false);
      }
    };
    fetchScript();
  }, [selectedPrinterId, selectedPrinterKey]);

  const copyCode = () => {
    navigator.clipboard.writeText(clientCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6" id="wired-pc-guide-page">
      {/* Title block */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight font-sans">Wired Printer PC Agent Setup</h1>
          <p className="text-xs text-slate-500 font-medium font-sans">Connect a physical USB or Network printer to the cloud by running this daemon script on its host PC.</p>
        </div>

        {/* Printer selector */}
        {printers.length > 0 && (
          <div className="flex items-center space-x-2 shrink-0">
            <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="guide-printer-select">Configure For:</label>
            <select
              id="guide-printer-select"
              value={selectedPrinterId}
              onChange={(e) => handlePrinterChange(e.target.value)}
              className="text-xs font-bold rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 text-slate-700 focus:outline-hidden"
            >
              {printers.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.location})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Guide Content */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 p-6 shadow-md">
        <div className="flex items-center space-x-2.5 mb-6">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <Terminal className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Background Print Client</h2>
            <p className="text-xs text-slate-400">Lightweight background worker daemon, built on raw, zero-dependency Node.js.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-xs text-slate-300">
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-800/60">
            <span className="font-mono text-indigo-400 font-bold block mb-1">01. Setup Node.js Environment</span>
            Make sure Node.js is installed on your physical printer host PC (Windows, macOS, or Linux).
          </div>
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-800/60">
            <span className="font-mono text-indigo-400 font-bold block mb-1">02. Save print-daemon.js</span>
            Click "Download" or copy the generated script code and save it as <code className="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300">print-daemon.js</code>.
          </div>
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-800/60">
            <span className="font-mono text-indigo-400 font-bold block mb-1">03. Exec Run Command</span>
            Launch your command prompt or terminal in the same folder and copy the Command below to run!
          </div>
        </div>

        {/* Action Header */}
        <div className="flex items-center justify-between bg-slate-800 px-4 py-2.5 rounded-t-xl border border-b-0 border-slate-700">
          <span className="text-[10px] font-mono text-slate-400 font-semibold uppercase flex items-center">
            <Cpu className="h-3.5 w-3.5 mr-1.5 text-indigo-400" />
            print-daemon.js (Configured)
          </span>
          <div className="flex items-center space-x-2">
            <a
              href="/api/download-daemon"
              download="print-daemon.js"
              className="inline-flex items-center space-x-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-[10px] font-bold rounded transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download JS</span>
            </a>
            <button
              onClick={copyCode}
              className="inline-flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded transition-all"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "Copied" : "Copy Code"}</span>
            </button>
          </div>
        </div>

        {/* Script code pre */}
        <div className="relative">
          <pre className="text-[10px] font-mono text-slate-300 bg-slate-950 p-4 rounded-b-xl border border-slate-700 overflow-x-auto max-h-64">
            {loading ? "Generating agent script..." : clientCode}
          </pre>
        </div>

        {/* Command Box */}
        {selectedPrinterId && (
          <div className="mt-5 bg-indigo-950/40 border border-indigo-900/40 p-4 rounded-xl text-xs space-y-2">
            <div className="flex items-center space-x-2 text-indigo-200">
              <AlertCircle className="h-4 w-4 text-indigo-400 shrink-0" />
              <span className="font-bold text-white">Execution Command for {printers.find(p=>p.id===selectedPrinterId)?.name}:</span>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-950 p-3 rounded-lg border border-slate-800 gap-3">
              <code className="text-yellow-400 font-mono text-[11px] select-all break-all">
                node print-daemon.js {selectedPrinterId} {selectedPrinterKey}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`node print-daemon.js ${selectedPrinterId} ${selectedPrinterKey}`);
                  alert("Command copied to clipboard!");
                }}
                className="inline-flex items-center justify-center space-x-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded font-bold text-[10px]"
              >
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </button>
            </div>

            <p className="text-[10px] text-indigo-300/80 leading-relaxed font-sans">
              The daemon polls the cloud server every 4 seconds. When a document is uploaded, it streams the payload directly and triggers your host PC's native print driver (<code className="bg-slate-900 px-1 text-slate-200">lp</code> on Mac/Linux or PowerShell's <code className="bg-slate-900 px-1 text-slate-200">Start-Process</code> on Windows).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
