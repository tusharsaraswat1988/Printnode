import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Printer } from "../types";

interface ConnectorOnboardingProps {
  printers: Printer[];
}

export default function ConnectorOnboarding({ printers }: ConnectorOnboardingProps) {
  const [selectedPrinterId, setSelectedPrinterId] = useState("");
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [clientCode, setClientCode] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);
  const [creatingToken, setCreatingToken] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (printers.length > 0 && !selectedPrinterId) {
      setSelectedPrinterId(printers[0].id);
    }
  }, [printers, selectedPrinterId]);

  const selectedPrinter = useMemo(
    () => printers.find((printer) => printer.id === selectedPrinterId) || printers[0],
    [printers, selectedPrinterId]
  );

  useEffect(() => {
    if (!developerOpen || !selectedPrinter) return;
    const fetchScript = async () => {
      setLoadingCode(true);
      try {
        const res = await fetch("/api/client-script");
        const text = res.ok ? await res.text() : "";
        setClientCode(text);
      } catch (err) {
        setClientCode("");
      } finally {
        setLoadingCode(false);
      }
    };
    fetchScript();
  }, [developerOpen, selectedPrinter]);

  const formatLastSeen = (isoString?: string) => {
    if (!isoString) return "Never";
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    if (diffSecs < 10) return "Just now";
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    return new Date(isoString).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
  };

  const createConnectorToken = async () => {
    if (!selectedPrinter) return;
    setCreatingToken(true);
    setDownloadError(null);
    try {
      const res = await fetch("/api/connectors/install-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerId: selectedPrinter.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to prepare connector download");

      const link = document.createElement("a");
      link.href = data.downloadUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setDownloadError(err.message || "Unable to prepare connector download");
    } finally {
      setCreatingToken(false);
    }
  };

  const copyValue = (value: string, id: string) => {
    navigator.clipboard.writeText(value);
    setCopied(id);
    setTimeout(() => setCopied(null), 1600);
  };

  const isConnected = selectedPrinter?.status === "online" || selectedPrinter?.status === "printing";

  return (
    <div className="space-y-6" id="connector-onboarding-page">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Windows Printer Connector</h1>
          <p className="text-xs text-slate-500 font-medium">Production setup for Windows PCs that host physical printers.</p>
        </div>
        {printers.length > 0 && (
          <select
            value={selectedPrinterId}
            onChange={(event) => setSelectedPrinterId(event.target.value)}
            className="text-xs font-bold rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 text-slate-700 focus:outline-hidden"
          >
            {printers.map((printer) => (
              <option key={printer.id} value={printer.id}>{printer.name} ({printer.location})</option>
            ))}
          </select>
        )}
      </div>

      {printers.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center shadow-xs">
          <WifiOff className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-600">No printer profile is registered yet</p>
          <p className="text-xs text-slate-400 mt-1">Register a printer first, then download the Windows connector for that printer.</p>
        </div>
      ) : selectedPrinter && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatusTile label="Printer Status" value={isConnected ? "Connected" : "Offline"} tone={isConnected ? "green" : "slate"} />
            <StatusTile label="Last Seen" value={formatLastSeen(selectedPrinter.lastSeen)} />
            <StatusTile label="Connector Version" value={selectedPrinter.daemonVersion || "Not installed"} />
            <StatusTile label="Queued Locally" value={`${selectedPrinter.queueLength || 0}`} />
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
              <div className="flex items-start space-x-4">
                <div className={`p-3 rounded-xl border ${isConnected ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-500 border-slate-100"}`}>
                  {isConnected ? <Wifi className="h-6 w-6" /> : <WifiOff className="h-6 w-6" />}
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">{selectedPrinter.name}</h2>
                  <p className="text-xs text-slate-500 mt-1">{selectedPrinter.location || "Windows host PC"}</p>
                  <p className="text-[11px] text-slate-400 mt-2">The connector installs as a Windows Service, starts with Windows, reconnects automatically, and includes built-in PDF printing support.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={createConnectorToken}
                  disabled={creatingToken}
                  className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                >
                  {creatingToken ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  <span>Download Windows Connector</span>
                </button>
                <button
                  onClick={createConnectorToken}
                  disabled={creatingToken}
                  className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-xl transition-all"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Reconnect</span>
                </button>
              </div>
            </div>

            {downloadError && (
              <div className="mt-4 flex items-start space-x-2 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{downloadError}</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <button
              onClick={() => setDeveloperOpen(!developerOpen)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition-all"
            >
              <span className="inline-flex items-center space-x-2 text-sm font-bold text-slate-700">
                <Terminal className="h-4 w-4 text-slate-400" />
                <span>Developer Options</span>
              </span>
              {developerOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
            </button>

            {developerOpen && (
              <div className="border-t border-slate-100 p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SecretRow label="Printer ID" value={selectedPrinter.id} copied={copied === "printer-id"} onCopy={() => copyValue(selectedPrinter.id, "printer-id")} />
                  <SecretRow label="Pairing Key" value={selectedPrinter.apiKey} copied={copied === "pairing-key"} onCopy={() => copyValue(selectedPrinter.apiKey, "pairing-key")} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <a
                    href="/api/download-daemon"
                    download="print-daemon.js"
                    className="inline-flex items-center space-x-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Daemon source</span>
                  </a>
                  <button
                    onClick={() => copyValue(`node print-daemon.js ${selectedPrinter.id} ${selectedPrinter.apiKey}`, "cli")}
                    className="inline-flex items-center space-x-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all"
                  >
                    {copied === "cli" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>CLI command</span>
                  </button>
                  <a
                    href="http://127.0.0.1:3010/health"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Diagnostics</span>
                  </a>
                </div>

                <pre className="text-[10px] font-mono text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-x-auto max-h-64">
                  {loadingCode ? "Loading daemon source..." : clientCode || "Daemon source unavailable."}
                </pre>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatusTile({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "green" }) {
  const toneClass = tone === "green" ? "text-emerald-700 bg-emerald-50 border-emerald-100" : "text-slate-700 bg-white border-slate-200";
  return (
    <div className={`p-4 rounded-2xl border shadow-xs ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-sm font-bold mt-1 truncate">{value}</p>
    </div>
  );
}

function SecretRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-[11px] font-mono flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-slate-400 font-bold uppercase mb-1">{label}</p>
        <p className="text-slate-700 font-bold truncate select-all">{value}</p>
      </div>
      <button onClick={onCopy} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 shrink-0" title={`Copy ${label}`}>
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
