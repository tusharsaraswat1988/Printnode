import React, { useState, useEffect } from "react";
import { Terminal, Copy, Check, Download, AlertCircle, Cpu, Wifi, HelpCircle } from "lucide-react";

interface ClientGuideProps {
  selectedPrinterId?: string;
  selectedPrinterKey?: string;
}

export default function ClientGuide({ selectedPrinterId = "YOUR_PRINTER_ID", selectedPrinterKey = "YOUR_PRINTER_KEY" }: ClientGuideProps) {
  const [copied, setCopied] = useState(false);
  const [clientCode, setClientCode] = useState("");
  const [loading, setLoading] = useState(true);

  const serverUrl = typeof window !== "undefined" ? window.location.origin : "https://your-app.run.app";

  useEffect(() => {
    // Fetch the client script directly from the backend to get the exact formatted version
    const fetchScript = async () => {
      try {
        const res = await fetch("/api/client-script");
        if (res.ok) {
          const text = await res.text();
          // Replace placeholders with selected printer details for convenience if they exist
          let customScript = text;
          if (selectedPrinterId && selectedPrinterId !== "YOUR_PRINTER_ID") {
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
    <div className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 p-6 shadow-md" id="guide-panel">
      <div className="flex items-center space-x-2.5 mb-4">
        <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
          <Terminal className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Wired PC Daemon Instructions</h2>
          <p className="text-xs text-slate-400">Run this zero-dependency background client on your wired printing PC.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5 text-xs text-slate-300">
        <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-800">
          <span className="font-mono text-indigo-400 font-bold block mb-1">01. Setup Node.js</span>
          Make sure Node.js is installed on your wired printer PC (Windows, macOS, or Linux).
        </div>
        <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-800">
          <span className="font-mono text-indigo-400 font-bold block mb-1">02. Save the Daemon</span>
          Click download or copy the code below and save it as <code className="bg-slate-800 px-1 py-0.5 rounded text-indigo-300">print-daemon.js</code>.
        </div>
        <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-800">
          <span className="font-mono text-indigo-400 font-bold block mb-1">03. Run Terminal</span>
          Execute: <code className="bg-slate-800 px-1 py-0.5 rounded text-yellow-300 font-mono">node print-daemon.js</code> to start listening for jobs!
        </div>
      </div>

      {/* Copy & Download Header */}
      <div className="flex items-center justify-between bg-slate-800 px-4 py-2 rounded-t-xl border border-b-0 border-slate-700">
        <span className="text-[10px] font-mono text-slate-400 font-semibold tracking-wider uppercase flex items-center">
          <Cpu className="h-3.5 w-3.5 mr-1.5 text-indigo-400" />
          print-daemon.js (Auto-configured)
        </span>
        <div className="flex items-center space-x-2">
          {/* Direct download endpoint */}
          <a
            href="/api/download-daemon"
            download="print-daemon.js"
            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-100 text-[10px] font-semibold rounded transition-all"
            title="Download JS script"
          >
            <Download className="h-3 w-3" />
            <span>Download</span>
          </a>
          <button
            onClick={copyCode}
            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold rounded transition-all"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? "Copied" : "Copy Code"}</span>
          </button>
        </div>
      </div>

      {/* Code Area */}
      <div className="relative">
        <pre className="text-[10px] font-mono text-slate-300 bg-slate-950 p-4 rounded-b-xl border border-slate-700 overflow-x-auto max-h-64 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {loading ? "Generating script content..." : clientCode}
        </pre>
      </div>

      {/* Quick Launch Assist box */}
      <div className="mt-4 bg-indigo-950/40 border border-indigo-900/40 p-3.5 rounded-xl text-xs flex items-start space-x-3 text-indigo-200">
        <AlertCircle className="h-4.5 w-4.5 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white block mb-0.5">Quick Copy Command</span>
          {selectedPrinterId && selectedPrinterId !== "YOUR_PRINTER_ID" ? (
            <div className="flex items-center space-x-2 mt-1 bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 font-mono text-slate-300 w-fit">
              <span className="text-yellow-400">node print-daemon.js {selectedPrinterId} {selectedPrinterKey}</span>
            </div>
          ) : (
            <p className="text-[11px] text-indigo-300/90">
              Select or register a printer to generate a pre-configured quick-start run command here!
            </p>
          )}
          <p className="text-[10px] text-indigo-300/70 mt-1">
            Note: The script prints natively via macOS/Linux <code className="bg-slate-900 text-slate-300 px-1 py-0.5 rounded font-mono">lp</code> or Windows PowerShell <code className="bg-slate-900 text-slate-300 px-1 py-0.5 rounded font-mono">Start-Process -Verb Print</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
