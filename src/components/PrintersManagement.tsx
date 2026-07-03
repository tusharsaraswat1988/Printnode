import React, { useState } from "react";
import { 
  Printer as PrinterIcon, 
  Plus, 
  Trash2, 
  Key, 
  Check, 
  Copy, 
  Wifi, 
  WifiOff, 
  Loader2, 
  Monitor, 
  Edit2, 
  CheckSquare, 
  XSquare,
  MapPin
} from "lucide-react";
import { Printer } from "../types";

interface PrintersManagementProps {
  printers: Printer[];
  onPrinterAdded: () => void;
  onPrinterDeleted: () => void;
  onPrinterRenamed: () => void;
}

export default function PrintersManagement({ 
  printers, 
  onPrinterAdded, 
  onPrinterDeleted, 
  onPrinterRenamed 
}: PrintersManagementProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Renaming state
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredPrinters = printers.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
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

  const handleStartRename = (printer: Printer) => {
    setEditingPrinterId(printer.id);
    setEditName(printer.name);
    setEditLocation(printer.location);
  };

  const handleSaveRename = async (id: string) => {
    if (!editName) return;
    setIsRenaming(true);
    try {
      const res = await fetch(`/api/printers/${id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, location: editLocation }),
      });
      if (res.ok) {
        setEditingPrinterId(null);
        onPrinterRenamed();
      }
    } catch (err) {
      console.error("Failed to rename printer", err);
    } finally {
      setIsRenaming(false);
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
    <div className="space-y-6" id="printers-management-page">
      {/* Page Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Printer Hardware Management</h1>
          <p className="text-xs text-slate-500 font-medium">Add, configure, and rename physical printers hooked to your client PCs globally.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center justify-center space-x-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>{showAddForm ? "Cancel Add" : "Register New Printer"}</span>
        </button>
      </div>

      {/* Register Printer Form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border-2 border-dashed border-indigo-200 space-y-4 animate-fade-in shadow-xs">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
            <PrinterIcon className="h-4 w-4 mr-1.5 text-indigo-500" />
            Register Remote Hardware Printer
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="new-p-name">Printer Name</label>
              <input
                id="new-p-name"
                type="text"
                placeholder="e.g. HP LaserJet Pro M404"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2.5 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5" htmlFor="new-p-loc">Location / Room</label>
              <input
                id="new-p-loc"
                type="text"
                placeholder="e.g. Living Room, Office 3B"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2.5 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !name}
            className="inline-flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-100"
          >
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span>Generate Pair Key & Register</span>
          </button>
        </form>
      )}

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <input
          type="text"
          placeholder="Search registered printers by name, location, or status..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full text-sm rounded-xl border border-slate-200 px-4 py-2.5 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
        />
      </div>

      {/* Cards List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredPrinters.length === 0 ? (
          <div className="col-span-2 text-center py-16 bg-white border border-slate-200 rounded-2xl">
            <PrinterIcon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-500">No remote printers registered</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Create and link a virtual or hardware printer profile above to enable remote cloud printing.</p>
          </div>
        ) : (
          filteredPrinters.map((p) => {
            const isOnline = p.status === "online" || p.status === "printing";
            const isPrinting = p.status === "printing";
            const isEditing = editingPrinterId === p.id;

            return (
              <div 
                key={p.id}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-all"
              >
                {/* Upper block */}
                <div>
                  <div className="flex items-start justify-between">
                    <div className={`p-3 rounded-xl ${
                      isPrinting ? "bg-indigo-50 text-indigo-600 border border-indigo-100" :
                      isOnline ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : 
                      "bg-slate-50 text-slate-400 border border-slate-100"
                    }`}>
                      <PrinterIcon className="h-6 w-6" />
                    </div>

                    <div className="flex items-center space-x-2">
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

                      {!isEditing && (
                        <button
                          onClick={() => handleStartRename(p)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all"
                          title="Rename/Edit Printer Details"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete Profile"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Name and description section */}
                  <div className="mt-3">
                    {isEditing ? (
                      <div className="space-y-2 mt-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Printer Name"
                          className="w-full text-xs font-bold rounded-lg border border-slate-200 px-2.5 py-1.5 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                        />
                        <input
                          type="text"
                          value={editLocation}
                          onChange={(e) => setEditLocation(e.target.value)}
                          placeholder="Location Name"
                          className="w-full text-xs font-bold rounded-lg border border-slate-200 px-2.5 py-1.5 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                        />
                        <div className="flex items-center space-x-2 mt-1">
                          <button
                            onClick={() => handleSaveRename(p.id)}
                            disabled={isRenaming || !editName}
                            className="inline-flex items-center space-x-1 px-3 py-1 bg-indigo-600 text-white rounded-md text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {isRenaming ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <CheckSquare className="h-3 w-3" />}
                            <span>Save</span>
                          </button>
                          <button
                            onClick={() => setEditingPrinterId(null)}
                            className="inline-flex items-center space-x-1 px-3 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold hover:bg-slate-200"
                          >
                            <XSquare className="h-3 w-3" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h4 className="text-base font-bold text-slate-800 tracking-tight">{p.name}</h4>
                        <p className="text-xs text-slate-500 flex items-center mt-1 font-medium">
                          <MapPin className="h-3.5 w-3.5 mr-1 text-slate-400 shrink-0" />
                          {p.location}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Active heartbeat indicators */}
                  <p className="text-[10px] text-slate-400 mt-2 font-medium">
                    Last sync: {formatLastSeen(p.lastSeen)} • Printed total: <span className="text-slate-700 font-bold">{p.jobCount} files</span>
                  </p>
                </div>

                {/* Lower metadata box */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2 text-[11px] font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Printer ID:</span>
                    <div className="flex items-center space-x-1">
                      <span className="text-slate-800 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200/60 select-all">{p.id}</span>
                      <button
                        onClick={() => copyToClipboard(p.id, p.id + "-id")}
                        className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700"
                        title="Copy Printer ID"
                      >
                        {copiedId === p.id + "-id" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Pairing Key:</span>
                    <div className="flex items-center space-x-1">
                      <span className="text-slate-800 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200/60 select-all">{p.apiKey}</span>
                      <button
                        onClick={() => copyToClipboard(p.apiKey, p.id + "-key")}
                        className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700"
                        title="Copy Pairing Key"
                      >
                        {copiedId === p.id + "-key" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
