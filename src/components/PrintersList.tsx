import React, { useState } from "react";
import { Printer as PrinterIcon, Plus, Trash2, Key, Check, Copy, Wifi, WifiOff, Loader2, Monitor } from "lucide-react";
import { Printer } from "../types";

interface PrintersListProps {
  printers: Printer[];
  onPrinterAdded: () => void;
  onPrinterDeleted: () => void;
}

export default function PrintersList({ printers, onPrinterAdded, onPrinterDeleted }: PrintersListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredPrinters = printers.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/printers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, location: location || "Wired PC" }),
      });

      if (res.ok) {
        setName("");
        setLocation("");
        setShowAddForm(false);
        onPrinterAdded();
      }
    } catch (err) {
      console.error("Failed to add printer", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this printer? All associated jobs will be cleared.")) return;

    try {
      const res = await fetch(`/api/printers/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onPrinterDeleted();
      }
    } catch (err) {
      console.error("Failed to delete printer", err);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatLastSeen = (isoString: string) => {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);

    if (diffSecs < 10) return "Just now";
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm" id="printers-panel">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Your Printers</h2>
          <p className="text-xs text-slate-500 font-medium">Register the physical printers hooked to your wired PCs worldwide.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center space-x-1 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold text-xs rounded-lg transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{showAddForm ? "Cancel" : "Add Printer"}</span>
        </button>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search printers by name or status..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2.5 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
        />
      </div>

      {/* Add Printer Form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="mb-6 bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Register Remote Printer</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5" htmlFor="p-name">Printer Name</label>
              <input
                id="p-name"
                type="text"
                placeholder="e.g. HP LaserJet 1020"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2.5 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5" htmlFor="p-loc">Location / Computer Name</label>
              <input
                id="p-loc"
                type="text"
                placeholder="e.g. Wired PC in Study Room"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2.5 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !name}
            className="inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
          >
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span>Register & Generate Key</span>
          </button>
        </form>
      )}

      {/* Printers Listing */}
      <div className="space-y-4">
        {filteredPrinters.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/20">
            <PrinterIcon className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-xs font-bold text-slate-500">{printers.length > 0 ? "No printers match your search" : "No printers registered yet"}</p>
            <p className="text-[10px] text-slate-400 mt-1">{printers.length > 0 ? "Try adjusting your search query." : "Add your first printer to start remote queueing."}</p>
          </div>
        ) : (
          filteredPrinters.map((p) => {
            const isOnline = p.status === "online" || p.status === "printing";
            const isPrinting = p.status === "printing";
            return (
              <div
                key={p.id}
                className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-white hover:bg-slate-50/50 rounded-xl border border-slate-200 transition-all relative group"
              >
                {/* Info block */}
                <div className="flex items-start space-x-4">
                  <div className={`p-3 rounded-lg border ${
                    isPrinting ? "bg-indigo-50 border-indigo-100 text-indigo-600" :
                    isOnline ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-slate-50 border-slate-100 text-slate-400"
                  }`}>
                    <PrinterIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-3">
                      <h4 className="text-sm font-bold text-slate-800">{p.name}</h4>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isPrinting ? "bg-indigo-100 text-indigo-700 animate-pulse" :
                        isOnline ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {isPrinting ? (
                          <>
                            <Loader2 className="h-2.5 w-2.5 animate-spin mr-1.5" />
                            Printing
                          </>
                        ) : isOnline ? (
                          <>
                            <Wifi className="h-2.5 w-2.5 mr-1.5" />
                            Online
                          </>
                        ) : (
                          <>
                            <WifiOff className="h-2.5 w-2.5 mr-1.5" />
                            Offline
                          </>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 flex items-center mt-1 font-medium">
                      <Monitor className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                      {p.location}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                      Last active: {formatLastSeen(p.lastSeen)} • Spooled: {p.jobCount} jobs
                    </p>
                  </div>
                </div>

                {/* API Key / Copy / Delete block */}
                <div className="mt-4 md:mt-0 flex flex-wrap items-center gap-3 border-t md:border-t-0 border-slate-100 pt-4 md:pt-0">
                  <div className="flex items-center space-x-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-mono text-slate-600">
                    <Key className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-bold text-slate-500">ID:</span>
                    <span className="text-slate-700 font-bold select-all">{p.id}</span>
                    <button
                      onClick={() => copyToClipboard(p.id, p.id + "-id")}
                      className="p-1 hover:bg-slate-200/50 rounded-sm text-slate-400 hover:text-slate-700 transition-all"
                      title="Copy Printer ID"
                    >
                      {copiedId === p.id + "-id" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>

                  <div className="flex items-center space-x-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-mono text-slate-600">
                    <Key className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-bold text-slate-500">KEY:</span>
                    <span className="text-slate-700 font-bold select-all">{p.apiKey}</span>
                    <button
                      onClick={() => copyToClipboard(p.apiKey, p.id + "-key")}
                      className="p-1 hover:bg-slate-200/50 rounded-sm text-slate-400 hover:text-slate-700 transition-all"
                      title="Copy Printer API Key"
                    >
                      {copiedId === p.id + "-key" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>

                  <button
                    onClick={() => handleDelete(p.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Remove Printer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
