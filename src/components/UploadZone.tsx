import React, { useState, useRef } from "react";
import { Upload, FileText, Image as ImageIcon, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Printer } from "../types";

interface UploadZoneProps {
  printers: Printer[];
  onJobCreated: () => void;
}

export default function UploadZone({ printers, onJobCreated }: UploadZoneProps) {
  const [selectedPrinterId, setSelectedPrinterId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [copies, setCopies] = useState<number>(1);
  const [colorMode, setColorMode] = useState<"color" | "mono">("color");
  const [paperSize, setPaperSize] = useState<"A4" | "Letter" | "Legal">("Letter");
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load local storage default presets if they exist
  React.useEffect(() => {
    const savedCopies = localStorage.getItem("print_default_copies");
    if (savedCopies) setCopies(parseInt(savedCopies));

    const savedPaper = localStorage.getItem("print_default_paper");
    if (savedPaper) setPaperSize(savedPaper as any);

    const savedColor = localStorage.getItem("print_default_color");
    if (savedColor) setColorMode(savedColor as any);
  }, []);

  // Initialize selected printer if not set
  React.useEffect(() => {
    const onlinePrinters = printers.filter(p => p.status !== "offline");
    if (onlinePrinters.length > 0 && !selectedPrinterId) {
      setSelectedPrinterId(onlinePrinters[0].id);
    } else if (printers.length > 0 && !selectedPrinterId) {
      setSelectedPrinterId(printers[0].id);
    }
  }, [printers, selectedPrinterId]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = (selectedFile: File) => {
    setFile(selectedFile);
    setUploadError(null);
    setUploadSuccess(false);

    // Create preview if image
    if (selectedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setFilePreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setUploadError("Please select a file to print");
      return;
    }
    if (!selectedPrinterId) {
      setUploadError("Please select a target printer");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64Data = reader.result as string;

        const payload = {
          printerId: selectedPrinterId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          fileData: base64Data,
          copies,
          colorMode,
          paperSize,
        };

        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Failed to submit print job");
        }

        setUploadSuccess(true);
        setFile(null);
        setFilePreview(null);
        onJobCreated();
        setIsUploading(false);
      };
    } catch (err: any) {
      console.error("Upload error", err);
      setUploadError(err.message || "An error occurred during upload.");
      setIsUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const selectedPrinter = printers.find(p => p.id === selectedPrinterId);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm" id="upload-panel">
      <h2 className="text-lg font-bold text-slate-800 mb-1">New Print Request</h2>
      <p className="text-xs text-slate-500 mb-5">Upload any document or photo and send it instantly to your remote printer.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Printer Selection */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="printer-select">
            Select Destination Printer
          </label>
          <select
            id="printer-select"
            value={selectedPrinterId}
            onChange={(e) => setSelectedPrinterId(e.target.value)}
            className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2.5 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all cursor-pointer"
          >
            {printers.length === 0 && (
              <option value="">No printers available - Register one first</option>
            )}
            {printers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.location}) — {p.status.toUpperCase()}
              </option>
            ))}
          </select>
          {selectedPrinter && (
            <div className="mt-1.5 flex items-center space-x-1.5 text-xs">
              <span className={`h-2 w-2 rounded-full ${
                selectedPrinter.status === "online" ? "bg-emerald-500 animate-pulse" :
                selectedPrinter.status === "printing" ? "bg-indigo-500 animate-pulse" : "bg-slate-400"
              }`} />
              <span className="text-slate-500 font-medium">
                Printer is {selectedPrinter.status}. 
                {selectedPrinter.status === "offline" && " (Daemon is not running on your PC)"}
              </span>
            </div>
          )}
        </div>

        {/* Drag & Drop File Upload */}
        <div
          className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all ${
            dragActive ? "border-indigo-500 bg-indigo-50/40" : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
          }`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          id="drop-zone"
        >
          <input
            ref={fileInputRef}
            type="file"
            id="file-upload"
            className="hidden"
            accept="image/*,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleChange}
          />

          {!file ? (
            <div className="flex flex-col items-center justify-center">
              <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-3">
                <Upload className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-slate-700">Drag and drop file here</p>
              <p className="text-xs text-slate-400 mt-1 mb-3">Supports JPG, PNG, PDF, DOCX, TXT</p>
              <button
                type="button"
                onClick={onButtonClick}
                className="inline-flex items-center justify-center px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all duration-200"
              >
                Browse Files
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-left bg-white p-3 rounded-lg border border-slate-100">
              <div className="flex items-center space-x-3 overflow-hidden">
                {filePreview ? (
                  <img
                    src={filePreview}
                    alt="Preview"
                    className="h-12 w-12 rounded-md object-cover border border-slate-100 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 shrink-0 border border-slate-100">
                    {file.type.startsWith("image/") ? (
                      <ImageIcon className="h-6 w-6" />
                    ) : (
                      <FileText className="h-6 w-6" />
                    )}
                  </div>
                )}
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-slate-800 truncate" title={file.name}>{file.name}</p>
                  <p className="text-xs text-slate-400">{formatSize(file.size)} • {file.type.split("/")[1]?.toUpperCase() || "FILE"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setFilePreview(null);
                }}
                className="text-xs font-bold text-red-500 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg transition-all"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        {/* Print Settings Grid */}
        <div className="grid grid-cols-3 gap-3">
          {/* Copies Counter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="copies-input">
              Copies
            </label>
            <input
              type="number"
              id="copies-input"
              min="1"
              max="10"
              value={copies}
              onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-center font-bold"
            />
          </div>

          {/* Color Mode */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="color-select">
              Color
            </label>
            <select
              id="color-select"
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as "color" | "mono")}
              className="w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all cursor-pointer font-bold"
            >
              <option value="color">Full Color</option>
              <option value="mono">Grayscale</option>
            </select>
          </div>

          {/* Paper Size */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="size-select">
              Paper Size
            </label>
            <select
              id="size-select"
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as any)}
              className="w-full text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all cursor-pointer font-bold"
            >
              <option value="Letter">Letter</option>
              <option value="A4">A4</option>
              <option value="Legal">Legal</option>
            </select>
          </div>
        </div>

        {/* Feedback Messages */}
        {uploadError && (
          <div className="flex items-start space-x-2 bg-red-50 text-red-700 p-3 rounded-lg border border-red-100 text-xs font-bold">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
            <span>{uploadError}</span>
          </div>
        )}

        {uploadSuccess && (
          <div className="flex items-start space-x-2 bg-emerald-50 text-emerald-800 p-3 rounded-lg border border-emerald-100 text-xs animate-fade-in font-bold">
            <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            <div>
              <p className="font-bold">Sent to Queue!</p>
              <p className="mt-0.5 text-emerald-700/95 font-medium">Your file has been added to the cloud print queue. The wired daemon will fetch and print it.</p>
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          type="submit"
          disabled={isUploading || !file || !selectedPrinterId}
          className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-indigo-600 text-white font-bold text-sm rounded-xl shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          id="btn-submit-print"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Uploading & Queueing...</span>
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              <span>Send to Printer Queue</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
