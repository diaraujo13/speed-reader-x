// SpeedRead X — leitor de página inteira.
//
// Roda numa aba da própria extensão (reader.html), aberta quando o usuário clica
// no ícone estando numa página interna do navegador (chrome://, about:, etc.),
// onde não há content script para receber o texto. É a interface do popup,
// porém estendida: textarea gigante + o leitor RSVP rodando aqui mesmo.
//
// O motor de leitura espelha o do content.js (mesma fórmula de timing, modo
// linear, modo disléxico, atalhos). Como aqui é página nossa, não há host
// hostil → sem Shadow DOM e sem orphan handling (chrome.* está sempre vivo).
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
  const DRAFT_KEY = "popup_draft";
  const SESSION_KEY = "reader_session";

  let settings = { ...DEFAULTS };
  let player = null;

  // ---- DOM ----
  const inputView = document.getElementById("input-view");
  const readerView = document.getElementById("reader-view");
  const textEl = document.getElementById("text");
  const readBtn = document.getElementById("read");
  const pasteBtn = document.getElementById("paste");
  const counterEl = document.getElementById("counter");
  const errEl = document.getElementById("err");
  const optionsLink = document.getElementById("open-options");

  const cardEl = document.querySelector(".sr-card");
  const stageEl = document.querySelector(".sr-stage");
  const wordEl = document.querySelector(".sr-word");
  const progressBar = document.querySelector(".sr-progress-bar");
  const wpmLabel = document.querySelector(".sr-wpm");
  const speedRange = document.querySelector(".sr-speed input");
  const toggleBtn = document.querySelector('[data-action="toggle"]');

  // ---- helpers de texto (espelham content.js) ----
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
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

  function tokenize(text) {
    return stripMarkdown(text)
      .split(/\s+/)
      .flatMap((tok) => tok.split(/[/\\|]/))
      .filter(Boolean);
  }

  function wordDelay(word, baseMs) {
    const len = word.length;
    if (len <= 3) return Math.round(baseMs * 0.75);
    if (len <= 6) return Math.round(baseMs * 1.0);
    if (len <= 9) return Math.round(baseMs * 1.3);
    return Math.round(baseMs * 1.6);
  }

  function formatWord(w) {
    return settings.dyslexicHelper
      ? `<b>${escapeHtml(w[0])}</b>${escapeHtml(w.slice(1))}`
      : escapeHtml(w);
  }

  // ---- settings ----
  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(DEFAULTS, (s) => resolve(s || {}));
    });
  }

  function applyTheme() {
    stageEl.style.background = settings.backgroundColor;
    wordEl.style.color = settings.fontColor;
    wordEl.style.fontFamily = settings.fontFamily;
    wordEl.style.fontStyle = settings.fontStyle || "normal";
    cardEl.style.setProperty("--sr-bold", settings.firstLetterColor || "#ef4444");
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    // Rascunho compartilhado com o popup: se outra aba/popup alterar o texto enquanto
    // estamos na tela de entrada (sem leitura ativa e sem foco no textarea), reflete aqui.
    if (changes[DRAFT_KEY] && !player && document.activeElement !== textEl) {
      textEl.value = changes[DRAFT_KEY].newValue || "";
      updateCounter();
    }
    let touched = false;
    for (const key of Object.keys(changes)) {
      if (key in DEFAULTS) { settings[key] = changes[key].newValue; touched = true; }
    }
    if (!touched) return;
    applyTheme();
    if (player) {
      speedRange.value = settings.wpm;
      wpmLabel.textContent = `${settings.wpm} wpm`;
      player.render();
    }
  });

  // ---- sessão ----
  function getSession() {
    return new Promise((resolve) => {
      chrome.storage.local.get(SESSION_KEY, (r) => resolve(r?.[SESSION_KEY]));
    });
  }
  function persistSession() {
    if (!player) return;
    chrome.storage.local.set({
      [SESSION_KEY]: { text: player.originalText, index: player.index, ts: Date.now() },
    });
  }
  function clearSession() {
    chrome.storage.local.remove(SESSION_KEY);
  }

  // --- Estatísticas (schema/merge em stats-core.js → globalThis.SRStats) ---
  const STATS_KEY = "stats";
  // Fila serial: o get→merge→set é assíncrono; sem serializar, dois flushes próximos
  // (throttle + pause) intercalam e a 2ª escrita sobrescreve a 1ª. A captura+zeragem
  // do delta é SÍNCRONA, então cada flush carrega exatamente o que acumulou.
  let statsQueue = Promise.resolve();
  function flushStats(delta) {
    if (!globalThis.SRStats) return;
    if (!delta || (!delta.readings && !delta.words && !delta.ms)) return;
    const d = { source: "reader", readings: delta.readings, words: delta.words, ms: delta.ms };
    delta.readings = 0; delta.words = 0; delta.ms = 0; // captura síncrona p/ não re-somar
    statsQueue = statsQueue.then(() => new Promise((resolve) => {
      chrome.storage.local.get(STATS_KEY, (r) => {
        if (chrome.runtime?.lastError) return resolve();
        const merged = globalThis.SRStats.mergeStats(r[STATS_KEY], d, globalThis.SRStats.dayKey());
        chrome.storage.local.set({ [STATS_KEY]: merged }, () => resolve());
      });
    }));
  }

  // ---- contador / rascunho ----
  function updateCounter() {
    const n = textEl.value.trim().split(/\s+/).filter(Boolean).length;
    counterEl.textContent = `${n} palavra${n === 1 ? "" : "s"}`;
    readBtn.disabled = n === 0;
  }

  function showError(msg) {
    errEl.textContent = msg;
    errEl.classList.add("show");
    setTimeout(() => errEl.classList.remove("show"), 250);
  }

  // ---- views ----
  function showInputView() {
    readerView.hidden = true;
    inputView.hidden = false;
    textEl.focus();
  }
  function showReaderView() {
    inputView.hidden = true;
    readerView.hidden = false;
    toggleBtn.focus(); // tira o foco do botão "Ler" (que ficou em display:none) e leva ao controle principal
  }

  // ---- player ----
  function buildPlayer(text, words, startIndex) {
    if (player?.timer) clearTimeout(player.timer);
    applyTheme();
    speedRange.value = settings.wpm;
    wpmLabel.textContent = `${settings.wpm} wpm`;
    let lastPersistAt = 0;
    const statsRec = { readings: 0, words: 0, ms: 0 };
    let playStartedAt = 0;
    let lastStatsFlush = 0;
    let readingCredited = false;
    // Credita a leitura só com engajamento real (≥2 palavras OU ≥1s ativo).
    const creditReading = () => {
      if (!readingCredited && (statsRec.words >= 2 || statsRec.ms >= 1000)) {
        statsRec.readings = 1;
        readingCredited = true;
      }
    };

    player = {
      originalText: text,
      words,
      index: startIndex,
      // -1 = nada contado; em resume parte do startIndex (já contado na sessão anterior).
      _lastCountedIndex: startIndex > 0 ? startIndex : -1,
      timer: null,
      playing: false,
      _trackBuilt: false,
      _lastModeLinear: null,
      buildTrack() {
        wordEl.classList.add("sr-linear");
        wordEl.innerHTML =
          '<div class="sr-track">' +
          this.words
            .map((w, i) => `<span class="sr-w" data-idx="${i}">${formatWord(w)}</span>`)
            .join("") +
          "</div>";
        this._trackBuilt = true;
      },
      render() {
        const w = this.words[this.index];
        if (!w) return;
        const wantLinear = settings.linearMode;
        if (this._lastModeLinear !== wantLinear) {
          this._trackBuilt = false;
          wordEl.classList.toggle("sr-linear", wantLinear);
          this._lastModeLinear = wantLinear;
        }
        if (wantLinear) {
          if (!this._trackBuilt) this.buildTrack();
          const all = wordEl.querySelectorAll(".sr-w");
          all.forEach((el) => el.classList.remove("sr-current"));
          const cur = all[this.index];
          if (cur) {
            cur.classList.add("sr-current");
            const track = wordEl.querySelector(".sr-track");
            const center = wordEl.clientWidth / 2;
            // Sem layout ainda (clientWidth 0) → não posiciona; próximo tick/resize recentraliza.
            if (center > 0) {
              const curCenterInTrack = cur.offsetLeft + cur.offsetWidth / 2;
              track.style.transform = `translateX(${center - curCenterInTrack}px)`;
            }
          }
        } else {
          wordEl.innerHTML = formatWord(w);
        }
        const tickMs = 60000 / settings.wpm;
        cardEl.style.setProperty("--sr-tick", `${Math.round(tickMs * 0.85)}ms`);
        const pct = ((this.index + 1) / this.words.length) * 100;
        progressBar.style.width = `${pct}%`;
      },
      tick() {
        if (this.index !== this._lastCountedIndex) {
          statsRec.words += 1;
          this._lastCountedIndex = this.index;
          creditReading();
        }
        this.render();
        const baseMs = 60000 / settings.wpm;
        const delay = wordDelay(this.words[this.index], baseMs);
        cardEl.style.setProperty("--sr-tick", `${Math.round(delay * 0.85)}ms`);
        const now = Date.now();
        if (now - lastPersistAt > 1500) {
          lastPersistAt = now;
          persistSession();
        }
        if (playStartedAt && now - lastStatsFlush > 5000) {
          lastStatsFlush = now;
          statsRec.ms += now - playStartedAt;
          playStartedAt = now;
          creditReading();
          flushStats(statsRec);
        }
        if (this.index >= this.words.length - 1) {
          this.pause();
          toggleBtn.textContent = "↺";
          return;
        }
        this.timer = setTimeout(() => {
          if (!player) return;
          this.index++;
          this.tick();
        }, delay);
      },
      play() {
        if (this.playing) return;
        if (this.index >= this.words.length - 1) this.index = 0;
        this.playing = true;
        playStartedAt = Date.now();
        toggleBtn.textContent = "⏸";
        this.tick();
      },
      pause() {
        this.playing = false;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        toggleBtn.textContent = "⏵";
        if (playStartedAt) { statsRec.ms += Date.now() - playStartedAt; playStartedAt = 0; }
        creditReading();
        flushStats(statsRec);
        persistSession();
      },
      restart() {
        this.pause();
        this.index = 0;
        this.render();
        persistSession();
      },
      step(delta) {
        if (this.playing) this.pause();
        this.index = Math.max(0, Math.min(this.words.length - 1, this.index + delta));
        this.render();
        persistSession();
      },
    };

    player.render();
    player.play();
  }

  function startReading() {
    const text = textEl.value.trim();
    if (!text) return;
    const words = tokenize(text);
    if (!words.length) {
      showError("Nada para ler — o texto não contém palavras.");
      return;
    }
    getSession().then((session) => {
      const startIndex =
        session && session.text === text && session.index < words.length - 1
          ? session.index
          : 0;
      // Mostra a view ANTES de montar o player: render() do modo linear mede
      // wordEl.clientWidth, que é 0 enquanto a seção está com [hidden]/display:none
      // (desalinha a 1ª palavra; com texto de 1 palavra o tick final nunca recorrige).
      showReaderView();
      buildPlayer(text, words, startIndex);
    });
  }

  function leaveReader({ keepSession }) {
    if (player) {
      player.pause();
      if (keepSession) persistSession();
      else clearSession();
      if (player.timer) clearTimeout(player.timer);
    }
    player = null;
    showInputView();
  }

  function adjustWpm(delta) {
    const next = Math.max(100, Math.min(1000, settings.wpm + delta));
    if (next === settings.wpm) return;
    settings.wpm = next;
    speedRange.value = next;
    wpmLabel.textContent = `${next} wpm`;
    chrome.storage.local.set({ wpm: next });
    if (player) cardEl.style.setProperty("--sr-tick", `${Math.round((60000 / next) * 0.85)}ms`);
  }

  // ---- eventos ----
  readBtn.addEventListener("click", startReading);

  textEl.addEventListener("input", () => {
    updateCounter();
    chrome.storage.local.set({ [DRAFT_KEY]: textEl.value });
  });
  textEl.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      startReading();
    }
  });

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

  document.getElementById("open-stats").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("stats.html") });
  });

  readerView.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "new") return leaveReader({ keepSession: true });
    if (action === "stop") return leaveReader({ keepSession: false });
    if (action === "settings") return chrome.runtime.openOptionsPage();
    if (action === "toggle") return player?.playing ? player.pause() : player?.play();
    if (action === "restart") { player?.restart(); player?.play(); }
  });

  speedRange.addEventListener("input", (e) => {
    settings.wpm = Number(e.target.value);
    wpmLabel.textContent = `${settings.wpm} wpm`;
    chrome.storage.local.set({ wpm: settings.wpm });
    if (player) cardEl.style.setProperty("--sr-tick", `${Math.round((60000 / settings.wpm) * 0.85)}ms`);
  });

  document.addEventListener("keydown", (e) => {
    if (readerView.hidden || !player) return;
    if (e.target?.matches?.("input, textarea, select, [contenteditable], [contenteditable=true]")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      return leaveReader({ keepSession: true });
    }
    if (e.key === "p" || e.key === "P" || e.key === " ") {
      e.preventDefault();
      player.playing ? player.pause() : player.play();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      player.step(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      player.step(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      adjustWpm(25);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      adjustWpm(-25);
    }
  });

  // Stage do reader é fluida (clamp/vw); o modo linear mede clientWidth em render().
  // Re-centraliza ao redimensionar (content.js não precisa: modal tem largura fixa de 520px).
  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    if (!player || !settings.linearMode || readerView.hidden) return;
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => player.render());
  });

  // Flush das estatísticas pendentes ao fechar/ocultar a aba (best-effort;
  // o flush throttled de 5s já limita a perda durante leituras longas).
  window.addEventListener("pagehide", () => {
    if (player && player.playing) player.pause();
  });

  // ---- init ----
  loadSettings().then((s) => {
    settings = { ...DEFAULTS, ...s };
    applyTheme();
    speedRange.value = settings.wpm;
    wpmLabel.textContent = `${settings.wpm} wpm`;
  });

  chrome.storage.local.get(DRAFT_KEY, async (r) => {
    if (r[DRAFT_KEY]) {
      textEl.value = r[DRAFT_KEY];
      updateCounter();
    } else {
      try {
        const clip = await navigator.clipboard.readText();
        if (clip && clip.trim() && clip.length < 200000) {
          textEl.value = clip;
          updateCounter();
        }
      } catch {}
    }
    textEl.focus();
  });
})();
