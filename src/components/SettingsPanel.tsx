import React, { useState, useEffect } from "react";
import { 
  Settings, 
  Check, 
  HelpCircle, 
  Printer, 
  Sliders, 
  RefreshCw, 
  FolderPlus, 
  Trash2 
} from "lucide-react";

export default function SettingsPanel() {
  const [defaultCopies, setDefaultCopies] = useState<number>(1);
  const [defaultPaperSize, setDefaultPaperSize] = useState<string>("Letter");
  const [defaultColorMode, setDefaultColorMode] = useState<string>("color");
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(10);
  
  // Custom printer groups feature
  const [printerGroups, setPrinterGroups] = useState<string[]>(["Office", "Home", "Warehouse"]);
  const [newGroupName, setNewGroupName] = useState("");
  
  const [successMessage, setSuccessMessage] = useState("");

  // Load from local storage on mount
  useEffect(() => {
    const savedCopies = localStorage.getItem("print_default_copies");
    if (savedCopies) setDefaultCopies(parseInt(savedCopies));

    const savedPaper = localStorage.getItem("print_default_paper");
    if (savedPaper) setDefaultPaperSize(savedPaper);

    const savedColor = localStorage.getItem("print_default_color");
    if (savedColor) setDefaultColorMode(savedColor);

    const savedRefresh = localStorage.getItem("print_refresh_interval");
    if (savedRefresh) setAutoRefreshInterval(parseInt(savedRefresh));

    const savedGroups = localStorage.getItem("print_printer_groups");
    if (savedGroups) setPrinterGroups(JSON.parse(savedGroups));
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("print_default_copies", defaultCopies.toString());
    localStorage.setItem("print_default_paper", defaultPaperSize);
    localStorage.setItem("print_default_color", defaultColorMode);
    localStorage.setItem("print_refresh_interval", autoRefreshInterval.toString());
    
    setSuccessMessage("Global print defaults and system settings saved successfully!");
    setTimeout(() => setSuccessMessage(""), 4000);
  };

  const handleAddGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName) return;
    if (printerGroups.includes(newGroupName)) {
      alert("Group already exists.");
      return;
    }
    const updated = [...printerGroups, newGroupName];
    setPrinterGroups(updated);
    localStorage.setItem("print_printer_groups", JSON.stringify(updated));
    setNewGroupName("");
  };

  const handleDeleteGroup = (group: string) => {
    const updated = printerGroups.filter(g => g !== group);
    setPrinterGroups(updated);
    localStorage.setItem("print_printer_groups", JSON.stringify(updated));
  };

  return (
    <div className="space-y-6" id="settings-page">
      {/* Title */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">System Configuration Settings</h1>
        <p className="text-xs text-slate-500 font-medium">Manage default values, auto-polling refresh intervals, and custom printer categorization filters.</p>
      </div>

      {successMessage && (
        <div className="p-3.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-100 flex items-center space-x-2 animate-fade-in">
          <Check className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Print Presets settings */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center mb-2">
            <Sliders className="h-5 w-5 mr-1.5 text-indigo-500" />
            Global Printing Defaults
          </h3>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="set-copies">Default Copies count</label>
                <input
                  id="set-copies"
                  type="number"
                  min="1"
                  max="99"
                  value={defaultCopies}
                  onChange={(e) => setDefaultCopies(parseInt(e.target.value))}
                  className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2.5 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="set-paper">Default Paper size</label>
                <select
                  id="set-paper"
                  value={defaultPaperSize}
                  onChange={(e) => setDefaultPaperSize(e.target.value)}
                  className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2.5 bg-slate-50 text-slate-800 focus:outline-hidden cursor-pointer focus:bg-white"
                >
                  <option value="Letter">Letter</option>
                  <option value="A4">A4</option>
                  <option value="Legal">Legal</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="set-color">Default Color Mode</label>
                <select
                  id="set-color"
                  value={defaultColorMode}
                  onChange={(e) => setDefaultColorMode(e.target.value)}
                  className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2.5 bg-slate-50 text-slate-800 focus:outline-hidden cursor-pointer focus:bg-white"
                >
                  <option value="color">Full Color</option>
                  <option value="mono">Grayscale (Mono)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="set-refresh">Auto-Refresh Interval</label>
                <select
                  id="set-refresh"
                  value={autoRefreshInterval}
                  onChange={(e) => setAutoRefreshInterval(parseInt(e.target.value))}
                  className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2.5 bg-slate-50 text-slate-800 focus:outline-hidden cursor-pointer focus:bg-white"
                >
                  <option value="4">High Frequency (4 seconds)</option>
                  <option value="10">Standard Balance (10 seconds)</option>
                  <option value="30">Slower Saving (30 seconds)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-100"
            >
              <Check className="h-4 w-4" />
              <span>Save System Defaults</span>
            </button>
          </form>
        </div>

        {/* Printer Groups list */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center">
            <Printer className="h-5 w-5 mr-1.5 text-slate-400" />
            Printer Groups / Categories
          </h3>

          <form onSubmit={handleAddGroup} className="flex gap-2">
            <input
              type="text"
              placeholder="Add Group (e.g. Sales, Desk)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="flex-1 text-xs rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs shrink-0"
            >
              <FolderPlus className="h-4 w-4 mr-1" />
              <span>Add</span>
            </button>
          </form>

          <div className="divide-y divide-slate-100">
            {printerGroups.map((group) => (
              <div key={group} className="py-2.5 flex items-center justify-between text-xs font-sans font-bold text-slate-700">
                <span>{group} Category</span>
                <button
                  onClick={() => handleDeleteGroup(group)}
                  className="p-1 text-slate-400 hover:text-red-500 rounded transition-all"
                  title="Remove Category"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
