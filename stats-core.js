// stats-core.js — lógica PURA de estatísticas de leitura (sem chrome.*, sem DOM).
//
// Compartilhada entre content.js (content script), reader.js e stats.js (dashboard).
// Exposta em globalThis.SRStats. Regra: NÃO chamar chrome.* aqui — quem persiste
// (content.js/reader.js) faz o get→merge→set envolto em safeChrome. Assim este
// arquivo é seguro de carregar tanto no mundo isolado do content script quanto em
// páginas da extensão, e não dispara "Extension context invalidated".
//
// Schema em chrome.storage.local.stats:
//   { v:1, totals:{readings,words,ms}, bySource:{modal,reader,chatgpt:{...}},
//     byDay: { "YYYY-MM-DD": { readings, words, ms, bySource:{...} } } }
//   - readings: nº de leituras iniciadas
//   - words:    palavras (tokens) exibidas no RSVP durante a reprodução
//   - ms:       tempo ATIVO de leitura (somente enquanto tocando)
(function () {
  const SOURCES = ["modal", "reader", "chatgpt"];
  const SCHEMA_VERSION = 1;

  function zeroBucket() {
    return { readings: 0, words: 0, ms: 0 };
  }

  function emptyStats() {
    const bySource = {};
    for (const s of SOURCES) bySource[s] = zeroBucket();
    return { v: SCHEMA_VERSION, totals: zeroBucket(), bySource, byDay: {} };
  }

  function isValid(stats) {
    return !!stats && stats.v === SCHEMA_VERSION && !!stats.totals && !!stats.bySource && !!stats.byDay;
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  // "YYYY-MM-DD" no fuso LOCAL (não UTC) — os buckets diários são do dia do usuário.
  function dayKey(date) {
    const d = date || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function normalizeSource(src) {
    return SOURCES.indexOf(src) >= 0 ? src : "modal";
  }

  function addInto(bucket, d) {
    bucket.readings += d.readings || 0;
    bucket.words += d.words || 0;
    bucket.ms += d.ms || 0;
  }

  // Aplica um delta { source, readings, words, ms } sobre `prev` no dia `day`.
  // Retorna um NOVO objeto (não muta `prev`). Se `prev` for inválido, parte do vazio.
  function mergeStats(prev, delta, day) {
    const s = isValid(prev) ? clone(prev) : emptyStats();
    const src = normalizeSource(delta && delta.source);
    const d = {
      readings: (delta && delta.readings) || 0,
      words: (delta && delta.words) || 0,
      ms: (delta && delta.ms) || 0,
    };
    const dk = day || dayKey();

    addInto(s.totals, d);

    if (!s.bySource[src]) s.bySource[src] = zeroBucket();
    addInto(s.bySource[src], d);

    if (!s.byDay[dk]) s.byDay[dk] = { readings: 0, words: 0, ms: 0, bySource: {} };
    addInto(s.byDay[dk], d);
    if (!s.byDay[dk].bySource) s.byDay[dk].bySource = {};
    if (!s.byDay[dk].bySource[src]) s.byDay[dk].bySource[src] = zeroBucket();
    addInto(s.byDay[dk].bySource[src], d);

    return s;
  }

  // Resumo derivado para a UI. effectiveWpm = palavras / minutos ativos.
  // Exige um mínimo de tempo ativo (MIN_EFFECTIVE_MS) para não cuspir números
  // absurdos de sessões muito curtas; abaixo disso retorna null (UI mostra "—").
  const MIN_EFFECTIVE_MS = 3000;
  function summarize(stats) {
    const s = isValid(stats) ? stats : emptyStats();
    const t = s.totals;
    const minutes = t.ms / 60000;
    const effectiveWpm = t.ms >= MIN_EFFECTIVE_MS && minutes > 0 ? Math.round(t.words / minutes) : null;
    return {
      readings: t.readings,
      words: t.words,
      ms: t.ms,
      effectiveWpm,
      bySource: s.bySource,
    };
  }

  // Últimos `n` dias (inclusive hoje), em ordem cronológica, preenchendo dias vazios.
  function lastNDays(stats, n, today) {
    const s = isValid(stats) ? stats : emptyStats();
    const base = today || new Date();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      const key = dayKey(d);
      const rec = s.byDay[key] || { readings: 0, words: 0, ms: 0, bySource: {} };
      out.push({
        key,
        date: d,
        readings: rec.readings || 0,
        words: rec.words || 0,
        ms: rec.ms || 0,
        bySource: rec.bySource || {},
      });
    }
    return out;
  }

  globalThis.SRStats = {
    SOURCES,
    SCHEMA_VERSION,
    emptyStats,
    zeroBucket,
    isValid,
    dayKey,
    mergeStats,
    summarize,
    lastNDays,
  };
})();
