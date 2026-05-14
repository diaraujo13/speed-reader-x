(() => {
  const DEFAULTS = {
    wpm: 300,
    theme: "default",
    fontColor: "#111111",
    backgroundColor: "#ffffff",
    firstLetterColor: "#ef4444",
    fontFamily: "Arial, sans-serif",
    fontStyle: "normal",
    dyslexicHelper: true,
    linearMode: false,
    backdropDim: false,
  };

  const HOST_ID = "speedread-x-host";
  const STYLES = `
    :host, * { box-sizing: border-box; }
    .sr-trigger {
      position: absolute;
      z-index: 2147483647;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      font: 600 13px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: #fff;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: 0;
      border-radius: 999px;
      box-shadow: 0 6px 18px rgba(99, 102, 241, 0.45);
      cursor: pointer;
      user-select: none;
    }
    .sr-trigger:hover { transform: translateY(-1px); }
    .sr-bolt { font-size: 14px; }

    .sr-modal {
      position: absolute;
      z-index: 2147483646;
      width: 520px;
      background: #0f172a;
      color: #e2e8f0;
      border-radius: 14px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.45);
      font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .sr-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 14px;
      background: rgba(255,255,255,0.04);
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .sr-title { font-weight: 700; letter-spacing: 0.3px; }
    .sr-header-actions { display: flex; gap: 4px; }
    .sr-icon {
      background: transparent; color: inherit; border: 0; cursor: pointer;
      width: 28px; height: 28px; border-radius: 6px; font-size: 14px;
    }
    .sr-icon:hover { background: rgba(255,255,255,0.08); }

    .sr-stage {
      min-height: 160px;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      background: #ffffff;
    }
    .sr-word {
      font-size: 44px;
      font-weight: 600;
      color: #111;
      letter-spacing: 0.5px;
      text-align: center;
      max-width: 100%;
      word-break: break-word;
    }
    .sr-word b { color: var(--sr-bold, #ef4444); font-weight: 800; }

    .sr-controls {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px;
    }
    .sr-btn {
      background: rgba(255,255,255,0.06); color: inherit;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px; padding: 6px 10px; cursor: pointer;
      font-size: 14px;
    }
    .sr-btn:hover { background: rgba(255,255,255,0.12); }
    .sr-primary { background: #6366f1; border-color: transparent; }
    .sr-primary:hover { background: #818cf8; }

    .sr-speed { margin-left: auto; display: flex; align-items: center; gap: 8px; }
    .sr-speed input { width: 160px; accent-color: #8b5cf6; }
    .sr-wpm { min-width: 64px; text-align: right; opacity: 0.85; font-variant-numeric: tabular-nums; }

    .sr-progress { height: 3px; background: rgba(255,255,255,0.06); }
    .sr-progress-bar { height: 100%; width: 0; background: linear-gradient(90deg, #6366f1, #8b5cf6); transition: width 80ms linear; }

    .sr-modal.sr-minimized {
      position: fixed !important;
      bottom: 16px;
      right: 16px;
      top: auto !important;
      left: auto !important;
      width: 260px;
    }
    .sr-modal.sr-minimized .sr-stage { min-height: 48px; padding: 10px 14px; }
    .sr-modal.sr-minimized .sr-word { font-size: 20px; }
    .sr-modal.sr-minimized .sr-controls { display: none; }
    .sr-modal.sr-minimized .sr-header [data-action="settings"] { display: none; }
    .sr-modal.sr-minimized .sr-title::after { content: " (mini)"; opacity: 0.6; font-weight: 400; font-size: 11px; }

    .sr-backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483645;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      animation: sr-fade-in 160ms ease-out;
      cursor: pointer;
    }
    @keyframes sr-fade-in { from { opacity: 0; } to { opacity: 1; } }

    .sr-word.sr-linear {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 32px;
      align-items: baseline;
      width: 100%;
    }
    .sr-word.sr-linear .sr-prev,
    .sr-word.sr-linear .sr-next {
      font-size: 0.55em;
      opacity: 0.32;
      font-weight: 400;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sr-word.sr-linear .sr-prev { text-align: right; }
    .sr-word.sr-linear .sr-next { text-align: left; }
    .sr-word.sr-linear .sr-current { text-align: center; white-space: nowrap; }
    .sr-modal.sr-minimized .sr-word.sr-linear .sr-prev,
    .sr-modal.sr-minimized .sr-word.sr-linear .sr-next { display: none; }
    .sr-modal.sr-minimized .sr-word.sr-linear { display: block; }
  `;
  let settings = { ...DEFAULTS };
  let host, shadow, triggerEl, modalEl, backdropEl;
  let playerState = null;

  loadSettings().then((s) => {
    settings = { ...DEFAULTS, ...s };
  });

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of Object.keys(changes)) {
      if (key in DEFAULTS) settings[key] = changes[key].newValue;
    }
    if (modalEl) {
      applyModalTheme();
      if (playerState && !playerState.minimized) ensureBackdrop();
      playerState?.render();
    }
  });

  ensureHost();
  initChatGPTInjector();
  initMessageBridge();

  let selectionDebounce = null;
  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionDebounce);
    selectionDebounce = setTimeout(updateTrigger, 120);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalEl) closeModal();
  });

  function initMessageBridge() {
    chrome.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === "sr-open" && typeof msg.text === "string") {
        openModal(msg.text);
        sendResponse({ ok: true });
      }
      return true;
    });
  }

  function getSelectedText() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return "";
    return sel.toString().trim();
  }

  function getSelectionRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const rects = range.getClientRects();
    if (!rects.length) return null;
    return rects[rects.length - 1];
  }

  function updateTrigger() {
    if (modalEl && !playerState?.minimized) return hideTrigger();
    const text = getSelectedText();
    if (!text) return hideTrigger();
    const rect = getSelectionRect();
    if (!rect) return hideTrigger();
    showTrigger(rect, text);
  }

  function ensureHost() {
    if (host) return;
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.all = "initial";
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    shadow.appendChild(style);
    (document.body || document.documentElement).appendChild(host);
  }

  function showTrigger(rect, text) {
    ensureHost();
    if (!triggerEl) {
      triggerEl = document.createElement("button");
      triggerEl.className = "sr-trigger";
      triggerEl.type = "button";
      triggerEl.innerHTML = `<span class="sr-bolt">⚡</span><span>SpeedRead</span>`;
      triggerEl.addEventListener("mousedown", (e) => e.preventDefault());
      shadow.appendChild(triggerEl);
    }
    triggerEl.onclick = () => openModal(text);
    const top = window.scrollY + rect.bottom + 8;
    const left = window.scrollX + rect.left;
    triggerEl.style.top = `${top}px`;
    triggerEl.style.left = `${left}px`;
    triggerEl.style.display = "inline-flex";
  }

  function hideTrigger() {
    if (triggerEl) triggerEl.style.display = "none";
  }

  async function openModal(text) {
    closeModal({ keepSession: true });
    hideTrigger();
    const words = tokenize(text);
    if (!words.length) return;
    const session = await getSession();
    const startIndex =
      session && session.text === text && session.index < words.length - 1
        ? session.index
        : 0;
    buildModal(text, words, startIndex);
  }

  function buildModal(text, words, startIndex) {
    ensureBackdrop();
    modalEl = document.createElement("div");
    modalEl.className = "sr-modal";
    modalEl.innerHTML = `
      <div class="sr-header" data-drag-handle>
        <span class="sr-title">SpeedRead</span>
        <div class="sr-header-actions">
          <button class="sr-icon" data-action="settings" title="Configurações">⚙</button>
          <button class="sr-icon" data-action="minimize" title="Minimizar">_</button>
          <button class="sr-icon" data-action="close" title="Fechar e salvar posição (Esc)">✕</button>
        </div>
      </div>
      <div class="sr-stage">
        <div class="sr-word"></div>
      </div>
      <div class="sr-controls">
        <button class="sr-btn" data-action="restart" title="Reiniciar do começo">⏮</button>
        <button class="sr-btn sr-primary" data-action="toggle" title="Pausar/Retomar">⏸</button>
        <button class="sr-btn" data-action="stop" title="Parar e descartar progresso">⏹</button>
        <div class="sr-speed">
          <input type="range" min="100" max="1000" step="10" />
          <span class="sr-wpm">${settings.wpm} wpm</span>
        </div>
      </div>
      <div class="sr-progress"><div class="sr-progress-bar"></div></div>
    `;
    shadow.appendChild(modalEl);
    applyModalTheme();
    centerModal();
    makeDraggable(modalEl, modalEl.querySelector("[data-drag-handle]"));

    const wordEl = modalEl.querySelector(".sr-word");
    const progressBar = modalEl.querySelector(".sr-progress-bar");
    const wpmLabel = modalEl.querySelector(".sr-wpm");
    const speedRange = modalEl.querySelector(".sr-speed input");
    const toggleBtn = modalEl.querySelector('[data-action="toggle"]');

    speedRange.value = settings.wpm;
    let lastPersistAt = 0;

    playerState = {
      originalText: text,
      words,
      index: startIndex,
      timer: null,
      playing: false,
      minimized: false,
      render() {
        const w = this.words[this.index];
        if (!w) return;
        const cur = formatWord(w);
        if (settings.linearMode) {
          const prev = this.index > 0 ? escapeHtml(this.words[this.index - 1]) : "";
          const next = this.index < this.words.length - 1 ? escapeHtml(this.words[this.index + 1]) : "";
          wordEl.classList.add("sr-linear");
          wordEl.innerHTML = `<span class="sr-prev">${prev}</span><span class="sr-current">${cur}</span><span class="sr-next">${next}</span>`;
        } else {
          wordEl.classList.remove("sr-linear");
          wordEl.innerHTML = cur;
        }
        const pct = ((this.index + 1) / this.words.length) * 100;
        progressBar.style.width = `${pct}%`;
      },
      tick() {
        this.render();
        const now = Date.now();
        if (now - lastPersistAt > 1500) {
          lastPersistAt = now;
          persistSession();
        }
        if (this.index >= this.words.length - 1) {
          this.pause();
          return;
        }
        this.timer = setTimeout(() => {
          this.index++;
          this.tick();
        }, 60000 / settings.wpm);
      },
      play() {
        if (this.playing) return;
        this.playing = true;
        toggleBtn.textContent = "⏸";
        this.tick();
      },
      pause() {
        this.playing = false;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        toggleBtn.textContent = "⏵";
        persistSession();
      },
      restart() {
        this.pause();
        this.index = 0;
        this.render();
        persistSession();
      },
      toggleMinimize() {
        this.minimized = !this.minimized;
        modalEl.classList.toggle("sr-minimized", this.minimized);
        const btn = modalEl.querySelector('[data-action="minimize"]');
        btn.textContent = this.minimized ? "▢" : "_";
        btn.title = this.minimized ? "Restaurar" : "Minimizar";
        if (this.minimized) {
          modalEl.style.left = "";
          modalEl.style.top = "";
          removeBackdrop();
        } else {
          centerModal();
          ensureBackdrop();
        }
        persistSession();
      },
    };

    modalEl.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      if (action === "close") closeModal({ keepSession: true });
      if (action === "stop") closeModal({ keepSession: false });
      if (action === "minimize") playerState.toggleMinimize();
      if (action === "toggle") playerState.playing ? playerState.pause() : playerState.play();
      if (action === "restart") {
        playerState.restart();
        playerState.play();
      }
      if (action === "settings") chrome.runtime.sendMessage?.({ type: "open-options" });
    });

    speedRange.addEventListener("input", (e) => {
      settings.wpm = Number(e.target.value);
      wpmLabel.textContent = `${settings.wpm} wpm`;
      chrome.storage?.local?.set({ wpm: settings.wpm });
    });

    playerState.render();
    playerState.play();
  }

  function closeModal({ keepSession = true } = {}) {
    if (playerState) {
      playerState.pause();
      if (keepSession) persistSession();
      else clearSession();
    }
    playerState = null;
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
    removeBackdrop();
  }

  function ensureBackdrop() {
    if (!settings.backdropDim) return removeBackdrop();
    if (backdropEl) return;
    backdropEl = document.createElement("div");
    backdropEl.className = "sr-backdrop";
    backdropEl.addEventListener("click", () => closeModal({ keepSession: true }));
    shadow.appendChild(backdropEl);
  }

  function removeBackdrop() {
    if (backdropEl && backdropEl.parentNode) backdropEl.parentNode.removeChild(backdropEl);
    backdropEl = null;
  }

  function formatWord(w) {
    return settings.dyslexicHelper
      ? `<b>${escapeHtml(w[0])}</b>${escapeHtml(w.slice(1))}`
      : escapeHtml(w);
  }

  function persistSession() {
    if (!playerState) return;
    chrome.storage?.local?.set({
      session: {
        text: playerState.originalText,
        index: playerState.index,
        ts: Date.now(),
      },
    });
  }

  function clearSession() {
    chrome.storage?.local?.remove?.("session");
  }

  function getSession() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get("session", (r) => resolve(r?.session));
      } catch {
        resolve(null);
      }
    });
  }

  function applyModalTheme() {
    if (!modalEl) return;
    const stage = modalEl.querySelector(".sr-stage");
    const word = modalEl.querySelector(".sr-word");
    stage.style.background = settings.backgroundColor;
    word.style.color = settings.fontColor;
    word.style.fontFamily = settings.fontFamily;
    word.style.fontStyle = settings.fontStyle || "normal";
    modalEl.style.setProperty("--sr-bold", settings.firstLetterColor || "#ef4444");
  }

  function centerModal() {
    const w = 520, h = 280;
    modalEl.style.width = `${w}px`;
    modalEl.style.left = `${Math.max(8, (window.innerWidth - w) / 2)}px`;
    modalEl.style.top = `${Math.max(8, (window.innerHeight - h) / 3) + window.scrollY}px`;
  }

  function makeDraggable(el, handle) {
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    handle.style.cursor = "move";
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect();
      ox = r.left + window.scrollX;
      oy = r.top + window.scrollY;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      el.style.left = `${ox + (e.clientX - sx)}px`;
      el.style.top = `${oy + (e.clientY - sy)}px`;
    });
    window.addEventListener("mouseup", () => (dragging = false));
  }

  function tokenize(text) {
    return stripMarkdown(text).split(" ").filter(Boolean);
  }

  function stripMarkdown(text) {
    return text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
      .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      .replace(/^\s*\|.*\|\s*$/gm, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function initChatGPTInjector() {
    if (!/^(chatgpt\.com|chat\.openai\.com)$/i.test(location.hostname)) return;
    const decorate = () => {
      const msgs = document.querySelectorAll(
        '[data-message-author-role="assistant"]:not([data-sr-decorated])'
      );
      for (const msg of msgs) {
        msg.dataset.srDecorated = "1";
        if (getComputedStyle(msg).position === "static") msg.style.position = "relative";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sr-chatgpt-btn";
        btn.title = "Abrir no SpeedRead";
        btn.setAttribute("aria-label", "Abrir resposta no SpeedRead");
        btn.textContent = "⚡ SpeedRead";
        Object.assign(btn.style, {
          position: "absolute",
          bottom: "8px",
          right: "8px",
          zIndex: "10",
          padding: "4px 10px",
          fontSize: "12px",
          fontWeight: "600",
          color: "#fff",
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          border: "0",
          borderRadius: "999px",
          cursor: "pointer",
          opacity: "0",
          transition: "opacity 120ms",
          boxShadow: "0 4px 12px rgba(99,102,241,0.35)",
        });
        msg.addEventListener("mouseenter", () => (btn.style.opacity = "1"));
        msg.addEventListener("mouseleave", () => (btn.style.opacity = "0"));
        btn.addEventListener("focus", () => (btn.style.opacity = "1"));
        btn.addEventListener("blur", () => (btn.style.opacity = "0"));
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const text = (msg.innerText || msg.textContent || "").trim();
          if (text) openModal(text);
        });
        msg.appendChild(btn);
      }
    };
    decorate();
    new MutationObserver(decorate).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(DEFAULTS, (s) => resolve(s || {}));
      } catch {
        resolve({});
      }
    });
  }

})();
