// SpeedRead X — background mínimo (service worker no Chrome, event page no Firefox).
//
// Único motivo de existir: em páginas internas do navegador (chrome://, about:,
// Web Store, etc.) o content script não roda, então o popup não teria onde
// injetar o texto. Nesses casos limpamos o popup do ícone *por aba* para que o
// clique dispare `action.onClicked`, que abre `reader.html` (leitor de página
// inteira) numa aba dedicada. Em páginas normais o `popup.html` continua sendo
// usado normalmente.
//
// O código só registra listeners no topo, então funciona tanto como service
// worker (Chrome) quanto como event page não-persistente (Firefox).

const RESTRICTED_SCHEME =
  /^(chrome|edge|brave|opera|vivaldi|about|chrome-extension|moz-extension|view-source|devtools|chrome-untrusted):/i;
const STORE_HOST =
  /^https?:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|addons\.mozilla\.org|microsoftedge\.microsoft\.com\/addons)/i;

function isRestricted(url) {
  if (!url) return false;
  return RESTRICTED_SCHEME.test(url) || STORE_HOST.test(url);
}

// Em páginas internas → popup vazio (clique cai no onClicked). Caso contrário → popup.html.
function syncTab(tabId, url) {
  const popup = isRestricted(url) ? "" : "popup.html";
  try {
    const p = chrome.action.setPopup({ tabId, popup });
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (_) {}
}

function syncAllTabs() {
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError) return;
    for (const t of tabs) if (t.id != null) syncTab(t.id, t.url);
  });
}

chrome.runtime.onInstalled.addListener(syncAllTabs);
chrome.runtime.onStartup.addListener(syncAllTabs);

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    syncTab(tabId, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // URL muda ao navegar; 'loading' cobre o início da navegação antes do url chegar.
  if (changeInfo.url || changeInfo.status === "loading") {
    syncTab(tabId, changeInfo.url || tab.url);
  }
});

// Só dispara em páginas internas (onde o popup foi limpo). Reaproveita uma aba
// do leitor já aberta em vez de abrir várias.
chrome.action.onClicked.addListener(() => {
  const readerUrl = chrome.runtime.getURL("reader.html");
  chrome.tabs.query({}, (tabs) => {
    const existing =
      !chrome.runtime.lastError &&
      tabs.find((t) => t.url && t.url.split("#")[0].split("?")[0] === readerUrl);
    if (existing && existing.id != null) {
      chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) {
        chrome.windows.update(existing.windowId, { focused: true });
      }
    } else {
      chrome.tabs.create({ url: readerUrl });
    }
  });
});
