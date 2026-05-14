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

const THEMES = {
  default: {
    label: "Default",
    icon: "Aa",
    backgroundColor: "#ffffff",
    fontColor: "#111111",
    firstLetterColor: "#ef4444",
    fontFamily: "Arial, sans-serif",
    fontStyle: "normal",
  },
  sepia: {
    label: "Sepia",
    icon: "Aa",
    backgroundColor: "#f4ecd8",
    fontColor: "#5b4636",
    firstLetterColor: "#a0522d",
    fontFamily: "Georgia, serif",
    fontStyle: "normal",
  },
  journal: {
    label: "Journal",
    icon: "Aa",
    backgroundColor: "#e5e7eb",
    fontColor: "#1f2937",
    firstLetterColor: "#7c3aed",
    fontFamily: "Georgia, serif",
    fontStyle: "italic",
  },
  "gradient-dusk": {
    label: "Gradient Dusk",
    icon: "Aa",
    backgroundColor: "linear-gradient(135deg, #1e3a8a, #7c3aed)",
    fontColor: "#f8fafc",
    firstLetterColor: "#22d3ee",
    fontFamily: "system-ui, sans-serif",
    fontStyle: "normal",
  },
  "gradient-sunrise": {
    label: "Gradient Sunrise",
    icon: "Aa",
    backgroundColor: "linear-gradient(135deg, #fde68a, #fb7185)",
    fontColor: "#3f1d38",
    firstLetterColor: "#7c2d12",
    fontFamily: "Georgia, serif",
    fontStyle: "normal",
  },
};

const APPEARANCE_FIELDS = ["fontColor", "backgroundColor", "firstLetterColor", "fontFamily", "fontStyle"];
const ALL_FIELDS = ["wpm", ...APPEARANCE_FIELDS, "dyslexicHelper", "linearMode", "backdropDim"];

const saved = document.getElementById("saved");
const preview = document.getElementById("preview");
const themesEl = document.getElementById("themes");
let savedTimer;
let suppressCustomDetect = false;

renderThemeCards();

chrome.storage.local.get(DEFAULTS, (s) => {
  loadIntoForm(s);
  updateThemeSelection(s.theme);
  applyPreview(s);
});

for (const f of ALL_FIELDS) {
  const el = document.getElementById(f);
  el.addEventListener("input", onFieldChange);
  el.addEventListener("change", onFieldChange);
}

function renderThemeCards() {
  themesEl.innerHTML = "";
  for (const [id, t] of Object.entries(THEMES)) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "theme-card";
    card.dataset.theme = id;
    card.style.background = t.backgroundColor;
    card.style.color = t.fontColor;
    card.style.fontFamily = t.fontFamily;
    card.style.fontStyle = t.fontStyle;
    card.innerHTML = `<span><b style="color:${t.firstLetterColor}">A</b>a</span><span class="name">${t.label}</span>`;
    card.addEventListener("click", () => applyTheme(id));
    themesEl.appendChild(card);
  }
  // Custom card
  const custom = document.createElement("button");
  custom.type = "button";
  custom.className = "theme-card";
  custom.dataset.theme = "custom";
  custom.style.background = "#f1f5f9";
  custom.style.color = "#475569";
  custom.innerHTML = `<span>✎</span><span class="name">Custom</span>`;
  themesEl.appendChild(custom);
}

function applyTheme(id) {
  const t = THEMES[id];
  if (!t) return;
  suppressCustomDetect = true;
  for (const f of APPEARANCE_FIELDS) {
    setFieldValue(f, t[f]);
  }
  suppressCustomDetect = false;
  saveAll(id);
  updateThemeSelection(id);
  applyPreview(collectForm());
}

function onFieldChange() {
  const next = collectForm();
  const themeId = suppressCustomDetect ? next.theme : detectTheme(next);
  saveAll(themeId);
  updateThemeSelection(themeId);
  applyPreview(next);
}

function detectTheme(form) {
  for (const [id, t] of Object.entries(THEMES)) {
    if (APPEARANCE_FIELDS.every((f) => normalize(form[f]) === normalize(t[f]))) return id;
  }
  return "custom";
}

function normalize(v) {
  return typeof v === "string" ? v.trim().toLowerCase() : v;
}

function loadIntoForm(s) {
  for (const f of ALL_FIELDS) setFieldValue(f, s[f]);
}

function setFieldValue(f, v) {
  const el = document.getElementById(f);
  if (!el) return;
  if (el.type === "checkbox") el.checked = !!v;
  else if (el.type === "color") el.value = isHex(v) ? v : "#ffffff";
  else el.value = v;
}

function isHex(v) {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
}

function collectForm() {
  const out = { theme: getSelectedTheme() };
  for (const f of ALL_FIELDS) {
    const el = document.getElementById(f);
    out[f] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
  }
  // The color picker can't represent gradients — preserve the stored gradient if user didn't touch the bg picker.
  return out;
}

function getSelectedTheme() {
  const active = themesEl.querySelector('[aria-pressed="true"]');
  return active ? active.dataset.theme : "custom";
}

function saveAll(themeId) {
  const next = collectForm();
  // If a preset theme is active, store the preset values (including gradients), not the picker values.
  if (THEMES[themeId]) {
    Object.assign(next, THEMES[themeId]);
  }
  next.theme = themeId;
  chrome.storage.local.set(next, () => {
    saved.classList.add("show");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => saved.classList.remove("show"), 800);
  });
}

function updateThemeSelection(id) {
  for (const card of themesEl.querySelectorAll(".theme-card")) {
    card.setAttribute("aria-pressed", String(card.dataset.theme === id));
  }
}

function applyPreview(s) {
  const theme = THEMES[s.theme];
  const bg = theme ? theme.backgroundColor : s.backgroundColor;
  const color = theme ? theme.fontColor : s.fontColor;
  const fl = theme ? theme.firstLetterColor : s.firstLetterColor;
  const ff = theme ? theme.fontFamily : s.fontFamily;
  const fs = theme ? theme.fontStyle : s.fontStyle;
  preview.style.background = bg;
  preview.style.color = color;
  preview.style.fontFamily = ff;
  preview.style.fontStyle = fs;
  preview.innerHTML = s.dyslexicHelper
    ? `<b style="color:${fl}">S</b>peed`
    : "Speed";
}
