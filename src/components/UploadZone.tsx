import React, { useMemo, useRef, useState } from "react";
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
  const onlinePrinters = useMemo(
    () => printers.filter((printer) => printer.status === "online" || printer.status === "printing"),
    [printers]
  );
  const hasOnlinePrinters = onlinePrinters.length > 0;

  React.useEffect(() => {
    const savedCopies = localStorage.getItem("print_default_copies");
    if (savedCopies) setCopies(parseInt(savedCopies));

    const savedPaper = localStorage.getItem("print_default_paper");
    if (savedPaper) setPaperSize(savedPaper as "A4" | "Letter" | "Legal");

    const savedColor = localStorage.getItem("print_default_color");
    if (savedColor) setColorMode(savedColor as "color" | "mono");
  }, []);

  React.useEffect(() => {
    if (onlinePrinters.length > 0) {
      const hasCurrentSelection = onlinePrinters.some((printer) => printer.id === selectedPrinterId);
      if (!hasCurrentSelection) {
        setSelectedPrinterId(onlinePrinters[0].id);
      }
      return;
    }

    if (selectedPrinterId) {
      setSelectedPrinterId("");
    }
  }, [onlinePrinters, selectedPrinterId]);

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

  const selectedPrinter = onlinePrinters.find((printer) => printer.id === selectedPrinterId);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm" id="upload-panel">
      <h2 className="text-lg font-bold text-slate-800 mb-1">New Print Request</h2>
      <p className="text-xs text-slate-500 mb-5">Upload any document or photo and send it instantly to your remote printer.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="printer-select">
            Select Destination Printer
          </label>
          <select
            id="printer-select"
            value={selectedPrinterId}
            onChange={(e) => setSelectedPrinterId(e.target.value)}
            disabled={printers.length === 0 || !hasOnlinePrinters}
            className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 transition-all focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {printers.length === 0 && <option value="">No printers configured</option>}
            {printers.length > 0 && !hasOnlinePrinters && <option value="">No online printers available.</option>}
            {onlinePrinters.map((printer) => (
              <option key={printer.id} value={printer.id}>
                {printer.name} ({printer.location}) - {printer.status.toUpperCase()}
              </option>
            ))}
          </select>

          {printers.length === 0 && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-700">No printers configured</p>
              <p className="mt-1 text-xs text-slate-500">Add a registered printer before sending a print job.</p>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("navigate-to-printers"))}
                className="mt-3 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition-all hover:bg-indigo-700"
              >
                Add Printer
              </button>
            </div>
          )}

          {printers.length > 0 && !hasOnlinePrinters && (
            <p className="mt-1.5 text-xs font-medium text-amber-700">No online printers available.</p>
          )}

          {selectedPrinter && (
            <div className="mt-1.5 flex items-center space-x-1.5 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  selectedPrinter.status === "online"
                    ? "bg-emerald-500 animate-pulse"
                    : selectedPrinter.status === "printing"
                      ? "bg-indigo-500 animate-pulse"
                      : "bg-slate-400"
                }`}
              />
              <span className="font-medium text-slate-500">
                Printer is {selectedPrinter.status}.
              </span>
            </div>
          )}
        </div>

        <div
          className={`relative rounded-xl border-2 border-dashed p-6 text-center transition-all ${
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
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <Upload className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-slate-700">Drag and drop file here</p>
              <p className="mt-1 mb-3 text-xs text-slate-400">Supports JPG, PNG, PDF, DOCX, TXT</p>
              <button
                type="button"
                onClick={onButtonClick}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-600 transition-all duration-200 hover:bg-indigo-100"
              >
                Browse Files
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-3 text-left">
              <div className="flex items-center space-x-3 overflow-hidden">
                {filePreview ? (
                  <img
                    src={filePreview}
                    alt="Preview"
                    className="h-12 w-12 shrink-0 rounded-md border border-slate-100 object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-400">
                    {file.type.startsWith("image/") ? <ImageIcon className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
                  </div>
                )}
                <div className="overflow-hidden">
                  <p className="truncate text-sm font-bold text-slate-800" title={file.name}>{file.name}</p>
                  <p className="text-xs text-slate-400">
                    {formatSize(file.size)} - {file.type.split("/")[1]?.toUpperCase() || "FILE"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setFilePreview(null);
                }}
                className="rounded-lg p-1.5 text-xs font-bold text-red-500 transition-all hover:bg-red-50 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700" htmlFor="copies-input">
              Copies
            </label>
            <input
              type="number"
              id="copies-input"
              min="1"
              max="10"
              value={copies}
              onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-center text-sm font-bold text-slate-800 transition-all focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700" htmlFor="color-select">
              Color
            </label>
            <select
              id="color-select"
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as "color" | "mono")}
              className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 transition-all focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="color">Full Color</option>
              <option value="mono">Grayscale</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700" htmlFor="size-select">
              Paper Size
            </label>
            <select
              id="size-select"
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as "A4" | "Letter" | "Legal")}
              className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 transition-all focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Letter">Letter</option>
              <option value="A4">A4</option>
              <option value="Legal">Legal</option>
            </select>
          </div>
        </div>

        {uploadError && (
          <div className="flex items-start space-x-2 rounded-lg border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <span>{uploadError}</span>
          </div>
        )}

        {uploadSuccess && (
          <div className="animate-fade-in flex items-start space-x-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="font-bold">Sent to Queue!</p>
              <p className="mt-0.5 font-medium text-emerald-700/95">
                Your file has been added to the cloud print queue. The wired daemon will fetch and print it.
              </p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isUploading || !file || !selectedPrinterId || !hasOnlinePrinters}
          className="flex w-full items-center justify-center space-x-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
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
