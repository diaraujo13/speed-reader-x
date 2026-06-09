// stats.js — dashboard de estatísticas (stats.html). Lê chrome.storage.local.stats,
// renderiza cards + gráfico SVG (sem libs) e atualiza ao vivo via storage.onChanged.
// A lógica pura (schema/merge/agregação) vem de stats-core.js → globalThis.SRStats.
(() => {
  const S = globalThis.SRStats;
  const COLORS = { modal: "#6366f1", reader: "#8b5cf6", chatgpt: "#22d3ee" };
  const SRC_LABEL = { modal: "Modal", reader: "Aba", chatgpt: "ChatGPT" };

  const emptyEl = document.getElementById("empty");
  const contentEl = document.getElementById("content");
  const cReadings = document.getElementById("c-readings");
  const cWords = document.getElementById("c-words");
  const cWpm = document.getElementById("c-wpm");
  const cTime = document.getElementById("c-time");
  const chartEl = document.getElementById("chart");
  const breakdownEl = document.getElementById("breakdown");
  const clearSlot = document.getElementById("clear-slot");

  // ---- formatadores ----
  const fmtNum = (n) => (n || 0).toLocaleString("pt-BR");
  function fmtDuration(ms) {
    const s = Math.round((ms || 0) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return rs ? `${m}min ${rs}s` : `${m}min`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h}h ${rm}min` : `${h}h`;
  }

  // ---- gráfico de barras empilhadas (SVG) ----
  function buildChart(days) {
    const W = 720, H = 240, padL = 12, padR = 12, padT = 18, padB = 28;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const n = days.length;
    const slot = chartW / n;
    const barW = Math.min(34, slot * 0.62);
    const baseY = padT + chartH;
    const order = ["modal", "reader", "chatgpt"];
    const maxWords = Math.max(1, ...days.map((d) => d.words));

    let bars = "";
    let labels = "";
    days.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2;
      const x = cx - barW / 2;
      let yTop = baseY;
      for (const src of order) {
        const w = (d.bySource[src] && d.bySource[src].words) || 0;
        if (w <= 0) continue;
        const h = (w / maxWords) * chartH;
        yTop -= h;
        bars +=
          `<rect class="bar" x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${COLORS[src]}">` +
          `<title>${d.key} · ${SRC_LABEL[src]}: ${fmtNum(w)} palavras</title></rect>`;
      }
      labels += `<text class="axis" x="${cx.toFixed(1)}" y="${(baseY + 16).toFixed(1)}" text-anchor="middle">${d.date.getDate()}</text>`;
    });

    const grid = `<line class="gridline" x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" />`;
    const maxLabel = `<text class="axis" x="${padL}" y="${padT - 4}">${fmtNum(maxWords)}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Palavras lidas por dia nos últimos 14 dias">${grid}${maxLabel}${bars}${labels}</svg>`;
  }

  // ---- breakdown horizontal por origem ----
  function buildBreakdown(bySource) {
    const order = ["modal", "reader", "chatgpt"];
    const max = Math.max(1, ...order.map((s) => (bySource[s] && bySource[s].words) || 0));
    return order
      .map((s) => {
        const w = (bySource[s] && bySource[s].words) || 0;
        const pct = (w / max) * 100;
        return (
          `<div class="brow">` +
          `<div class="name"><i style="background:${COLORS[s]}"></i>${SRC_LABEL[s]}</div>` +
          `<div class="track"><div class="fill" style="width:${pct.toFixed(1)}%;background:${COLORS[s]}"></div></div>` +
          `<div class="num">${fmtNum(w)}</div>` +
          `</div>`
        );
      })
      .join("");
  }

  // ---- render ----
  function render(stats) {
    const sum = S.summarize(stats);
    const hasData = sum.readings > 0 || sum.words > 0 || sum.ms > 0;
    emptyEl.hidden = hasData;
    contentEl.hidden = !hasData;
    if (!hasData) return;
    cReadings.textContent = fmtNum(sum.readings);
    cWords.textContent = fmtNum(sum.words);
    cWpm.innerHTML = sum.effectiveWpm == null
      ? `— <small>wpm</small>`
      : `${fmtNum(sum.effectiveWpm)} <small>wpm</small>`;
    cTime.textContent = fmtDuration(sum.ms);
    chartEl.innerHTML = buildChart(S.lastNDays(stats, 14));
    breakdownEl.innerHTML = buildBreakdown(sum.bySource);
  }

  // ---- limpar (confirmação inline, sem dialog nativo) ----
  function bindClear() {
    clearSlot.querySelector("#clear").addEventListener("click", () => {
      clearSlot.innerHTML =
        `<span class="confirm">Tem certeza? ` +
        `<button class="yes">Sim, limpar</button><button class="no">Cancelar</button></span>`;
      clearSlot.querySelector(".yes").addEventListener("click", () => {
        chrome.storage.local.remove("stats", () => {
          restoreClearBtn();
          render(null);
        });
      });
      clearSlot.querySelector(".no").addEventListener("click", restoreClearBtn);
    });
  }
  function restoreClearBtn() {
    clearSlot.innerHTML = `<button class="danger" id="clear">🗑 Limpar estatísticas</button>`;
    bindClear();
  }

  // ---- init ----
  bindClear();
  chrome.storage.local.get("stats", (r) => render(r.stats));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.stats) render(changes.stats.newValue);
  });
})();
