import { useState, useEffect, useCallback } from "react";
import { 
  Printer as PrinterIcon, 
  FileText, 
  Activity, 
  Wifi, 
  Globe, 
  Cpu, 
  Settings2, 
  HelpCircle,
  FileCheck,
  RefreshCw,
  Clock
} from "lucide-react";
import { Printer, PrintJob } from "./types";
import UploadZone from "./components/UploadZone";
import PrintersList from "./components/PrintersList";
import JobsList from "./components/JobsList";
import ClientGuide from "./components/ClientGuide";
import VirtualPrinter from "./components/VirtualPrinter";
import LoginPage from "./components/LoginPage";

export default function App() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"queue" | "printers" | "connect">("queue");
  const [user, setUser] = useState<{ mobile: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Check login status
  useEffect(() => {
    fetch("/api/me", { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Fetch all printers
  const fetchPrinters = useCallback(async () => {
    try {
      const res = await fetch("/api/printers");
      if (res.ok) {
        const data = await res.json();
        setPrinters(data);
      }
    } catch (err) {
      console.error("Error fetching printers", err);
    }
  }, []);

  // Fetch all jobs
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (err) {
      console.error("Error fetching jobs", err);
    }
  }, []);

  // Refresh both printers and jobs
  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([fetchPrinters(), fetchJobs()]);
    setIsRefreshing(false);
  }, [fetchPrinters, fetchJobs]);

  // Set up auto polling every 4 seconds to sync state in real-time
  useEffect(() => {
    if (!user) return;
    refreshData();
    const interval = setInterval(() => {
      fetchPrinters();
      fetchJobs();
    }, 4000);

    return () => clearInterval(interval);
  }, [user, refreshData, fetchPrinters, fetchJobs]);

  // Statistics counters
  const totalPrinters = printers.length;
  const onlinePrinters = printers.filter(p => p.status === "online" || p.status === "printing").length;
  const pendingJobsCount = jobs.filter(j => j.status === "pending" || j.status === "downloading" || j.status === "printing").length;
  const completedJobsCount = jobs.filter(j => j.status === "completed").length;

  // Selected printer key for quick reference in Connection guide
  const firstPrinter = printers[0];

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (!user) return <LoginPage onLogin={() => window.location.reload()} />;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800" id="main-app">
      {/* Top Ambient Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 md:px-8 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <PrinterIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <h1 className="text-lg font-bold text-slate-800 tracking-tight">Remote Print Console</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Cloud Sync Active
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">Cross-platform synchronization and remote print controller</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs text-slate-500 font-medium">
            <button
              onClick={async () => { 
                await fetch("/api/logout", { method: "POST", credentials: 'include' }); 
                localStorage.removeItem("print_auth_token");
                window.location.reload(); 
              }}
              className="px-4 py-2 text-red-600 hover:text-red-800 font-semibold"
            >
              Logout
            </button>
            <div className="hidden sm:flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
              <Globe className="h-3.5 w-3.5 text-indigo-500" />
              <span>Worldwide printing network</span>
            </div>
            <button
              onClick={refreshData}
              disabled={isRefreshing}
              className="inline-flex items-center space-x-1 px-4 py-2 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 rounded-lg transition-all text-slate-700 font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="hidden xs:inline">Sync Data</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6">
        
        {/* Statistics Widgets Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-6" id="stats-dashboard">
          {/* Item 1: Active Printers */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center space-x-4 shadow-sm">
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
              <Wifi className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Printers Online</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-0.5">
                {onlinePrinters} <span className="text-xs font-medium text-slate-400">/ {totalPrinters}</span>
              </h3>
            </div>
          </div>

          {/* Item 2: Jobs in Queue */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center space-x-4 shadow-sm">
            <div className="p-3 bg-amber-50 rounded-xl text-amber-600 animate-pulse">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Queueing Jobs</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-0.5">{pendingJobsCount}</h3>
            </div>
          </div>

          {/* Item 3: Printed Successfully */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center space-x-4 shadow-sm">
            <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Completed Jobs</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-0.5">{completedJobsCount}</h3>
            </div>
          </div>

          {/* Item 4: Platform Engine */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 flex items-center space-x-4 shadow-sm">
            <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Server Environment</p>
              <h3 className="text-sm font-mono font-bold text-slate-700 mt-1">Node/Vite</h3>
            </div>
          </div>
        </section>

        {/* Workspace Layout Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Uploading and Printer Emulator */}
          <div className="lg:col-span-5 space-y-6">
            <UploadZone 
              printers={printers} 
              onJobCreated={refreshData} 
            />

            <VirtualPrinter 
              printers={printers} 
              onStateChange={refreshData} 
            />
          </div>

          {/* Right Column: Dynamic Tabs (Queue, Printers list, Client guide) */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            
            {/* Tabs Selector Bar */}
            <div className="bg-white p-1 rounded-xl border border-slate-200 flex items-center space-x-1 shadow-sm">
              <button
                onClick={() => setActiveTab("queue")}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-3 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "queue"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>Live Print Queue</span>
                {pendingJobsCount > 0 && (
                  <span className={`ml-1.5 px-2 py-0.5 text-[10px] rounded-full font-bold ${
                    activeTab === "queue" ? "bg-white/20 text-white" : "bg-indigo-50 text-indigo-600"
                  }`}>
                    {pendingJobsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("printers")}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-3 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "printers"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <PrinterIcon className="h-4 w-4" />
                <span>My Remote Printers</span>
              </button>

              <button
                onClick={() => setActiveTab("connect")}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-3 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "connect"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <Cpu className="h-4 w-4" />
                <span>Connect Wired PC</span>
              </button>
            </div>

            {/* Tab Body Contents */}
            <div className="flex-1">
              {activeTab === "queue" && (
                <JobsList 
                  jobs={jobs} 
                  printers={printers} 
                  onJobDeleted={refreshData}
                  onRefresh={refreshData}
                  isRefreshing={isRefreshing}
                />
              )}

              {activeTab === "printers" && (
                <PrintersList 
                  printers={printers} 
                  onPrinterAdded={refreshData}
                  onPrinterDeleted={refreshData}
                />
              )}

              {activeTab === "connect" && (
                <ClientGuide 
                  selectedPrinterId={firstPrinter?.id} 
                  selectedPrinterKey={firstPrinter?.apiKey} 
                />
              )}
            </div>

          </div>
        </section>

      </main>

      {/* Footer Branding block */}
      <footer className="border-t border-gray-100 bg-white py-6 mt-12 text-center text-xs text-gray-400">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="font-semibold text-gray-500 flex items-center justify-center">
            <PrinterIcon className="h-4 w-4 mr-1 text-blue-500" />
            Remote Print Queue Sync Engine v1.0
          </p>
          <p>Durable cloud persistence & real-time client agent synchronization.</p>
          <p className="text-[10px] text-gray-300">© 2026 Remote Print. Fully sandboxed & secure TLS file routing.</p>
        </div>
      </footer>
    </div>
  );
}
