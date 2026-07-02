const state = {
  tokenContext: null,
  printers: [],
  config: null,
};

const $ = (id) => document.getElementById(id);

function setMessage(kind, text) {
  $("message").innerHTML = text ? `<p class="${kind}">${text}</p>` : "";
}

function setConnected(config) {
  $("setup-panel").classList.add("hidden");
  $("manual-token-panel").classList.add("hidden");
  $("connected-panel").classList.remove("hidden");
  $("connected-message").textContent = `${config.cloudPrinterName || "Printer"} is connected through ${config.printerName || "this PC"}.`;
}

async function loadPrinters() {
  $("printer-select").innerHTML = `<option>Detecting printers...</option>`;
  state.printers = await window.bidwarConnector.listPrinters();
  if (state.printers.length === 0) {
    $("printer-select").innerHTML = `<option value="">No Windows printers found</option>`;
    $("connect").disabled = true;
    return;
  }
  $("printer-select").innerHTML = state.printers.map((printer) => (
    `<option value="${printer.replace(/"/g, "&quot;")}">${printer}</option>`
  )).join("");
  $("connect").disabled = false;
}

async function init() {
  try {
    const initData = await window.bidwarConnector.init();
    state.tokenContext = initData.tokenContext;
    state.config = initData.config;
    $("version").textContent = `v${initData.version}`;

    if (state.config && state.config.printerId) {
      setConnected(state.config);
    } else if (!state.tokenContext || !state.tokenContext.token) {
      $("manual-token-panel").classList.remove("hidden");
      setMessage("error", "This installer does not include a pairing token. Please download a fresh connector from the BidWar dashboard.");
    }

    await loadPrinters();
  } catch (err) {
    setMessage("error", err.message || "Connector failed to start.");
  }
}

$("refresh-printers").addEventListener("click", async () => {
  setMessage("", "");
  await loadPrinters();
});

$("connect").addEventListener("click", async () => {
  const selectedPrinter = $("printer-select").value;
  if (!selectedPrinter) return;

  const tokenContext = state.tokenContext;
  if (!tokenContext || !tokenContext.token) {
    setMessage("error", "This installer is missing its pairing token. Please download a fresh connector from the BidWar dashboard.");
    return;
  }

  $("connect").disabled = true;
  setMessage("", "");
  try {
    const result = await window.bidwarConnector.pair({
      tokenContext,
      physicalPrinterName: selectedPrinter,
    });
    setConnected(result.config);
  } catch (err) {
    $("connect").disabled = false;
    setMessage("error", err.message || "Unable to pair this connector.");
  }
});

$("restart").addEventListener("click", async () => {
  try {
    await window.bidwarConnector.restartService();
    setMessage("success", "Connector service restarted.");
  } catch (err) {
    setMessage("error", err.message || "Unable to restart connector.");
  }
});

$("dashboard").addEventListener("click", () => {
  window.bidwarConnector.openDashboard();
});

$("logs").addEventListener("click", async () => {
  try {
    const logs = await window.bidwarConnector.readLogs();
    $("log-output").classList.remove("hidden");
    $("log-output").textContent = logs.map((entry) => `== ${entry.file} ==\n${entry.content}`).join("\n\n");
  } catch (err) {
    setMessage("error", err.message || "Unable to read logs.");
  }
});

init();
