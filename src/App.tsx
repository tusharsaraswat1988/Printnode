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
  Clock,
  Menu,
  X,
  History,
  User as UserIcon,
  ShieldAlert,
  HardDrive,
  LogOut,
  Sliders,
  Terminal,
  ChevronRight
} from "lucide-react";
import { Printer, PrintJob } from "./types";
import UploadZone from "./components/UploadZone";
import PrintersManagement from "./components/PrintersManagement";
import QueueManager from "./components/QueueManager";
import HistoryManager from "./components/HistoryManager";
import UsersManagement from "./components/UsersManagement";
import WiredPCGuide from "./components/WiredPCGuide";
import SystemStatusPanel from "./components/SystemStatusPanel";
import SettingsPanel from "./components/SettingsPanel";
import LoginPage from "./components/LoginPage";

export default function App() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Set default home page to "print"
  const [activeTab, setActiveTab] = useState<
    "print" | "printers" | "queue" | "history" | "users" | "wired" | "status" | "settings"
  >("print");
  
  const [user, setUser] = useState<{ mobile: string; role: "admin" | "employee" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Set up auto polling to sync state in real-time, respecting setting preferences
  useEffect(() => {
    if (!user) return;
    refreshData();

    const intervalSec = parseInt(localStorage.getItem("print_refresh_interval") || "4");
    const interval = setInterval(() => {
      fetchPrinters();
      fetchJobs();
    }, intervalSec * 1000);

    return () => clearInterval(interval);
  }, [user, refreshData, fetchPrinters, fetchJobs]);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST", credentials: 'include' }); 
    try {
      localStorage.removeItem("print_auth_token");
    } catch (e) {
      console.warn("localStorage removeItem failed:", e);
    }
    window.location.reload(); 
  };

  // Safe navigation fallback for role checks
  const isAdmin = user?.role === "admin";
  const currentTab = (!isAdmin && ["printers", "users", "wired", "status", "settings"].includes(activeTab)) 
    ? "print" 
    : activeTab;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 font-sans">
        <LoaderSpinner />
        <p className="text-xs font-bold text-slate-500 mt-3 tracking-wide">Connecting to Remote Print Network...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={() => window.location.reload()} />;
  }

  // Navigation Items
  const menuItems = [
    { id: "print", label: "Print", icon: PrinterIcon, adminOnly: false },
    { id: "queue", label: "Queue", icon: Clock, adminOnly: false, badge: jobs.filter(j => j.status !== "completed" && j.status !== "failed").length },
    { id: "history", label: "History", icon: History, adminOnly: false },
    { id: "printers", label: "Printers", icon: PrinterIcon, adminOnly: true },
    { id: "users", label: "Users", icon: UserIcon, adminOnly: true },
    { id: "settings", label: "Settings", icon: Settings2, adminOnly: true },
    { id: "wired", label: "Wired PC", icon: Cpu, adminOnly: true },
    { id: "status", label: "System Status", icon: Activity, adminOnly: true },
  ];

  const visibleMenuItems = menuItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800" id="main-app">
      {/* Top Mobile/Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 md:px-8 py-3.5 shadow-xs flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Hamburger trigger for mobile */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 block lg:hidden transition-all"
            title="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="h-5.5 w-5.5" /> : <Menu className="h-5.5 w-5.5" />}
          </button>

          <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100 shrink-0">
            <PrinterIcon className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <h1 className="text-sm font-bold text-slate-800 tracking-tight leading-none sm:text-base">Remote Print</h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100/60 uppercase">
                Enterprise
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-bold tracking-tight hidden xs:block mt-0.5">Secure TLS Cloud Print Sync Engine</p>
          </div>
        </div>

        {/* Header Right */}
        <div className="flex items-center space-x-3 text-xs text-slate-500 font-medium">
          <div className="hidden md:flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-500">
            <Globe className="h-3.5 w-3.5 text-indigo-500 animate-pulse" />
            <span>Node Cluster Online</span>
          </div>

          <button
            onClick={refreshData}
            disabled={isRefreshing}
            className="inline-flex items-center space-x-1 px-3.5 py-1.5 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 rounded-lg transition-all text-[11px] font-bold text-slate-700 shadow-2xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Quick profile info */}
          <div className="hidden xs:flex flex-col text-right">
            <span className="text-slate-800 font-bold text-[11px] font-mono leading-tight">{user.mobile}</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{user.role} console</span>
          </div>
        </div>
      </header>

      {/* Main Page Layout Wrapper */}
      <div className="flex-1 flex relative">
        {/* Left Sidebar (Permanent on Desktop, hidden on mobile) */}
        <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 p-4 shrink-0 justify-between">
          <div className="space-y-6">
            <div className="px-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Main Console Navigation</p>
            </div>
            
            <nav className="space-y-1.5">
              {visibleMenuItems.map((item) => {
                const IconComp = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id as any);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      isActive 
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" 
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <IconComp className="h-4.5 w-4.5" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className={`px-2 py-0.5 text-[9px] rounded-full font-bold ${
                        isActive ? "bg-white/20 text-white" : "bg-indigo-50 text-indigo-600"
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Logout & profile foot */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="flex items-center space-x-3 px-2">
              <div className="p-2 bg-slate-50 rounded-lg text-slate-500 border border-slate-100">
                <UserIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate font-mono">{user.mobile}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{user.role}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center space-x-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 text-xs font-bold rounded-xl transition-all border border-rose-100/30"
            >
              <LogOut className="h-4 w-4" />
              <span>Log out session</span>
            </button>
          </div>
        </aside>

        {/* Mobile slide-out drawer or overlay */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Drawer */}
            <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white z-50 lg:hidden p-5 flex flex-col justify-between shadow-xl animate-slide-in">
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <PrinterIcon className="h-5 w-5 text-indigo-600" />
                    <span className="font-bold text-slate-800 text-sm">Console Portal</span>
                  </div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <nav className="space-y-1.5">
                  {visibleMenuItems.map((item) => {
                    const IconComp = item.icon;
                    const isActive = currentTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id as any);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                          isActive 
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" 
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <IconComp className="h-4.5 w-4.5" />
                          <span>{item.label}</span>
                        </div>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className={`px-2 py-0.5 text-[9px] rounded-full font-bold ${
                            isActive ? "bg-white/20 text-white" : "bg-indigo-50 text-indigo-600"
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Logout bottom */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <button
                  onClick={handleLogout}
                  className="w-full inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-all border border-rose-100/30"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log out session</span>
                </button>
              </div>
            </aside>
          </>
        )}

        {/* Primary Page Canvas Area */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 overflow-y-auto max-w-7xl mx-auto space-y-6">
          
          {/* Active Tab Screen Switches */}
          {currentTab === "print" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Home is a pure elegant print view */}
              <div className="lg:col-span-8">
                <UploadZone 
                  printers={printers} 
                  onJobCreated={refreshData} 
                />
              </div>

              {/* Quick info status block on Home for family members */}
              <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 font-sans">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cloud Printers Connection</h3>
                
                <div className="space-y-3">
                  {printers.length === 0 ? (
                    <p className="text-xs text-slate-500 font-bold">No active printers connected yet.</p>
                  ) : (
                    printers.map(p => {
                      const isOnline = p.status === "online" || p.status === "printing";
                      return (
                        <div key={p.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{p.name}</p>
                            <p className="text-[10px] text-slate-400 font-semibold">{p.location}</p>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            isOnline ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                          }`}>
                            {p.status.toUpperCase()}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 text-indigo-800 text-xs rounded-xl font-bold flex items-start space-x-2 leading-relaxed">
                  <FileCheck className="h-4.5 w-4.5 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-indigo-950 block">Simple cloud printing</span>
                    Select your destination printer, upload your file (PDF/Image/Text), and press print. The connected PC will fetch the file automatically.
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentTab === "printers" && (
            <PrintersManagement 
              printers={printers} 
              onPrinterAdded={refreshData}
              onPrinterDeleted={refreshData}
              onPrinterRenamed={refreshData}
            />
          )}

          {currentTab === "queue" && (
            <QueueManager 
              jobs={jobs} 
              printers={printers} 
              onJobDeleted={refreshData}
              onRefresh={refreshData}
              isRefreshing={isRefreshing}
            />
          )}

          {currentTab === "history" && (
            <HistoryManager 
              jobs={jobs} 
              printers={printers} 
              onJobDeleted={refreshData}
              onRefresh={refreshData}
              isRefreshing={isRefreshing}
            />
          )}

          {currentTab === "users" && (
            <UsersManagement 
              currentUserMobile={user.mobile}
              currentUserRole={user.role}
            />
          )}

          {currentTab === "settings" && (
            <SettingsPanel />
          )}

          {currentTab === "wired" && (
            <WiredPCGuide 
              printers={printers} 
            />
          )}

          {currentTab === "status" && (
            <SystemStatusPanel 
              printers={printers} 
              jobs={jobs} 
              onRefresh={refreshData}
              isRefreshing={isRefreshing}
            />
          )}

        </main>
      </div>

      {/* Footer Branding block */}
      <footer className="border-t border-slate-100 bg-white py-5 text-center text-[11px] text-slate-400 font-sans mt-auto">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="font-bold text-slate-500 flex items-center justify-center">
            <PrinterIcon className="h-3.5 w-3.5 mr-1 text-indigo-500 shrink-0" />
            Enterprise Remote Cloud Print console v2.0
          </p>
          <p className="text-[10px] text-slate-400">Secure TLS transport • Encrypted persistent databases • Real-time synchronization</p>
        </div>
      </footer>
    </div>
  );
}

function LoaderSpinner() {
  return (
    <div className="relative flex items-center justify-center h-10 w-10">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-8 w-8 bg-indigo-600 items-center justify-center text-white">
        <PrinterIcon className="h-4.5 w-4.5 animate-pulse" />
      </span>
    </div>
    // push update
  );
}
