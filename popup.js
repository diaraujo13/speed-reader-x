const textEl = document.getElementById("text");
const readBtn = document.getElementById("read");
const pasteBtn = document.getElementById("paste");
const errEl = document.getElementById("err");
const counterEl = document.getElementById("counter");
const optionsLink = document.getElementById("open-options");
const openTabLink = document.getElementById("open-tab");

const DRAFT_KEY = "popup_draft";

// Mesma classificação de página interna do background.js — manter os dois em sincronia.
const RESTRICTED_SCHEME =
  /^(chrome|edge|brave|opera|vivaldi|about|chrome-extension|moz-extension|view-source|devtools|chrome-untrusted):/i;
const STORE_HOST =
  /^https?:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|addons\.mozilla\.org|microsoftedge\.microsoft\.com\/addons)/i;
function isRestricted(url) {
  return !!url && (RESTRICTED_SCHEME.test(url) || STORE_HOST.test(url));
}

chrome.storage.local.get(DRAFT_KEY, async (r) => {
  if (r[DRAFT_KEY]) {
    textEl.value = r[DRAFT_KEY];
    updateCounter();
    return;
  }
  try {
    const clip = await navigator.clipboard.readText();
    if (clip && clip.trim() && clip.length < 200000) {
      textEl.value = clip;
      updateCounter();
      textEl.select();
    }
  } catch {}
});

textEl.addEventListener("input", () => {
  updateCounter();
  chrome.storage.local.set({ [DRAFT_KEY]: textEl.value });
});

textEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    triggerRead();
  }
});

readBtn.addEventListener("click", triggerRead);

pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      textEl.value = text;
      updateCounter();
      chrome.storage.local.set({ [DRAFT_KEY]: text });
      textEl.focus();
    } else {
      showError("Clipboard vazio.");
    }
  } catch {
    showError("Permissão de clipboard negada — cole manualmente com Ctrl/Cmd+V.");
  }
});

optionsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

openTabLink.addEventListener("click", (e) => {
  e.preventDefault();
  openReaderTab();
});

// Leitor de página inteira: garante que o texto atual chegue via popup_draft antes de abrir.
// Reaproveita uma aba do leitor já aberta (mesmo critério do background.js) em vez de duplicar.
function openReaderTab() {
  const readerUrl = chrome.runtime.getURL("reader.html");
  chrome.storage.local.set({ [DRAFT_KEY]: textEl.value }, () => {
    chrome.tabs.query({}, (tabs) => {
      const existing =
        !chrome.runtime.lastError &&
        tabs.find((t) => t.url && t.url.split("#")[0].split("?")[0] === readerUrl);
      if (existing && existing.id != null) {
        chrome.tabs.update(existing.id, { active: true });
        if (existing.windowId != null) chrome.windows.update(existing.windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: readerUrl });
      }
      window.close();
    });
  });
}

function updateCounter() {
  const n = textEl.value.trim().split(/\s+/).filter(Boolean).length;
  counterEl.textContent = `${n} palavra${n === 1 ? "" : "s"}`;
  readBtn.disabled = n === 0;
}

async function triggerRead() {
  const text = textEl.value.trim();
  if (!text) return;
  hideError();
  readBtn.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("no-tab");
    if (isRestricted(tab.url)) {
      throw new Error("restricted-page");
    }
    await chrome.tabs.sendMessage(tab.id, { type: "sr-open", text });
    window.close();
  } catch (err) {
    const code = err?.message || "";
    if (code === "restricted-page") {
      // Página interna: o content script não roda aqui. Abre o leitor de página inteira.
      readBtn.disabled = false;
      return openReaderTab();
    } else if (/Receiving end does not exist/i.test(err?.message || "")) {
      showError("Recarregue a aba ativa para que o SpeedRead carregue, ou tente em outra aba.");
    } else {
      showError("Não foi possível abrir o leitor: " + (err?.message || "erro desconhecido"));
    }
    readBtn.disabled = false;
  }
}

function showError(msg) {
  errEl.textContent = msg;
  errEl.classList.add("show");
  setTimeout(() => errEl.classList.remove("show"), 250);
}

function hideError() {
  errEl.textContent = "";
}
