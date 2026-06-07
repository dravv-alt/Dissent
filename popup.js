// ============================================================
// Dissent — Popup Script (v2)
// Proper bidirectional messaging with sendResponse handling
// ============================================================

const QUICK_PROMPTS = [
  { severity: "nuclear", type: "opinion", text: "Stop. You've been sycophantic. Reset completely — what are the actual flaws, risks, and weaknesses in what I said? No softening. No flattery." },
  { severity: "nuclear", type: "mistake_admission", text: "I challenged you and you caved. Were you actually wrong, or did you fold under pressure? Defend your original answer if it was correct." },
  { severity: "moderate", type: "opinion", text: "What parts of my reasoning are weak or incorrect? Don't soften it. I want critical evaluation, not agreement." },
  { severity: "moderate", type: "feedback", text: "Your feedback was too positive. Give me a brutal, honest critique. What are the real weaknesses?" },
  { severity: "mild", type: "opinion", text: "Give me one concrete flaw or limitation in the idea we just discussed. Be specific." },
];

const PATTERN_META = [
  { label: "Flattery opener", desc: "Great question!, Excellent point!", weight: 3, type: "opinion" },
  { label: "Sycophantic agreement", desc: "Absolutely, you're right!", weight: 3, type: "opinion" },
  { label: "Cave-in admission", desc: "You're right, I was wrong", weight: 3, type: "mistake_admission" },
  { label: "Absolute validation", desc: "You're 100% correct", weight: 2, type: "opinion" },
  { label: "Echo deference", desc: "As you correctly said...", weight: 2, type: "mimicry" },
  { label: "Work praise", desc: "Your code is exceptional", weight: 2, type: "feedback" },
  { label: "Intelligence flattery", desc: "You've clearly thought this through", weight: 2, type: "opinion" },
  { label: "Unconditional agreement", desc: "I completely agree with you", weight: 2, type: "opinion" },
  { label: "Great question opener", desc: "Great question!", weight: 1, type: "opinion" },
  { label: "Maximum agreement", desc: "I couldn't agree more", weight: 1, type: "opinion" },
  { label: "Sense validation", desc: "That makes perfect sense", weight: 1, type: "opinion" },
];

const THRESHOLD_DESCS = {
  1: "Hair-trigger — flags almost everything",
  2: "Balanced — triggers on clear sycophancy",
  3: "Conservative — only obvious cases",
  4: "Strict — needs multiple patterns",
  5: "Maximum — only extreme sycophancy",
};

const TYPE_COLORS = {
  opinion: "#ff3333",
  mistake_admission: "#ff8800",
  mimicry: "#aa66ff",
  feedback: "#ffcc00",
};

let selectedPromptIndex = 0;
let injectedCount = 0;

// ── DOM refs ──
const mainToggle      = document.getElementById("main-toggle");
const statusDot       = document.getElementById("status-dot");
const platformName    = document.getElementById("platform-name");
const statTotal       = document.getElementById("stat-total");
const statSession     = document.getElementById("stat-session");
const statInjected    = document.getElementById("stat-injected");
const promptGrid      = document.getElementById("prompt-grid");
const customPromptEl  = document.getElementById("custom-prompt");
const charCount       = document.getElementById("char-count");
const injectBtn       = document.getElementById("inject-btn");
const clearBtn        = document.getElementById("clear-btn");
const thresholdSlider = document.getElementById("threshold-slider");
const thresholdVal    = document.getElementById("threshold-val");
const thresholdDesc   = document.getElementById("threshold-desc");
const patternListEl   = document.getElementById("pattern-list");
const resetStatsBtn   = document.getElementById("reset-stats-btn");
const epistemicSlider = document.getElementById("epistemic-slider");
const epistemicVal    = document.getElementById("epistemic-val");
const epistemicDesc   = document.getElementById("epistemic-desc");
const optEpistemic   = document.getElementById("opt-epistemic");
const optContract    = document.getElementById("opt-contract");
const optSocial      = document.getElementById("opt-social");
const trackerTurns   = document.getElementById("tracker-turns");
const trackerChall   = document.getElementById("tracker-challenges");

// ── INIT ──
function init() {
  loadState();
  renderPromptGrid();
  renderPatternList();
  setupTabs();
  setupListeners();
  detectPlatform();
}

// ── LOAD STATE ──
function loadState() {
  chrome.storage.sync.get(["enabled", "threshold", "injectedCount", "epistemicLevel", "epistemicEnabled", "contractEnabled", "socialScorerEnabled"], (data) => {
    if (data.enabled !== undefined) {
      mainToggle.checked = data.enabled;
      updateStatusDot(data.enabled);
    }
    if (data.threshold) {
      thresholdSlider.value = data.threshold;
      updateThresholdDisplay(data.threshold);
    }
    if (data.epistemicLevel) {
      epistemicSlider.value = data.epistemicLevel;
      updateEpistemicDisplay(data.epistemicLevel);
    }
    if (data.epistemicEnabled !== undefined) {
      optEpistemic.checked = data.epistemicEnabled;
    }
    if (data.contractEnabled !== undefined) {
      optContract.checked = data.contractEnabled;
    }
    if (data.socialScorerEnabled !== undefined) {
      optSocial.checked = data.socialScorerEnabled;
    }
    if (data.bannerEnabled !== undefined) {
      document.getElementById("opt-banner").checked = data.bannerEnabled;
    }
    injectedCount = data.injectedCount || 0;
    statInjected.textContent = injectedCount;
  });

  // Get stats from background
  chrome.runtime.sendMessage({ type: "GET_STATS" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response) {
      statTotal.textContent = response.totalDetections || 0;
      statSession.textContent = response.sessionDetections || 0;
    }
  });
}

// ── DETECT PLATFORM ──
function detectPlatform() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const url = tabs[0].url || "";
    let platform = "—";
    if (url.includes("claude.ai")) platform = "Claude.ai";
    else if (url.includes("chatgpt.com")) platform = "ChatGPT";
    else if (url.includes("gemini.google.com")) platform = "Gemini";
    else {
      statusDot.classList.add("offline");
    }
    platformName.textContent = platform;
  });
}

// ── STATUS DOT ──
function updateStatusDot(enabled) {
  statusDot.classList.toggle("offline", !enabled);
}

// ── RENDER PROMPT GRID ──
function renderPromptGrid() {
  promptGrid.innerHTML = "";
  QUICK_PROMPTS.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = `prompt-card${i === selectedPromptIndex ? " selected" : ""}`;

    const typeColor = TYPE_COLORS[p.type] || "#ff3333";
    card.innerHTML = `
      <span class="prompt-badge badge-${p.severity}">${p.severity}</span>
      <span class="prompt-preview">${p.text.slice(0, 80)}…</span>
    `;
    card.addEventListener("click", () => {
      selectedPromptIndex = i;
      customPromptEl.value = "";
      charCount.textContent = "0";
      document.querySelectorAll(".prompt-card").forEach((c, j) => {
        c.classList.toggle("selected", j === i);
      });
    });
    promptGrid.appendChild(card);
  });
}

// ── RENDER PATTERN LIST ──
function renderPatternList() {
  patternListEl.innerHTML = "";
  PATTERN_META.forEach((p) => {
    const row = document.createElement("div");
    row.className = "pattern-row";
    row.style.marginBottom = "10px";

    const typeColor = TYPE_COLORS[p.type] || "#ff3333";
    row.innerHTML = `
      <div>
        <div class="pattern-name">${p.label}</div>
        <div class="pattern-weight" style="font-size:9px;color:#555;margin-top:2px">
          ${p.desc} · w:${p.weight}
          <span style="color:${typeColor};margin-left:4px;font-size:8px;text-transform:uppercase">${p.type.replace("_", " ")}</span>
        </div>
      </div>
      <label class="mini-toggle">
        <input type="checkbox" checked />
        <span class="mini-slider"></span>
      </label>
    `;
    patternListEl.appendChild(row);
  });
}

// ── TABS ──
function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${target}`).classList.add("active");
    });
  });
}

// ── LISTENERS ──
function setupListeners() {
  mainToggle.addEventListener("change", () => {
    const enabled = mainToggle.checked;
    updateStatusDot(enabled);
    chrome.storage.sync.set({ enabled });
    sendToActiveTab({ type: "TOGGLE_ENABLED", enabled });
  });

  customPromptEl.addEventListener("input", () => {
    charCount.textContent = customPromptEl.value.length;
  });

  injectBtn.addEventListener("click", () => {
    const promptText = customPromptEl.value.trim() || QUICK_PROMPTS[selectedPromptIndex].text;
    doInject(promptText);
  });

  clearBtn.addEventListener("click", () => {
    customPromptEl.value = "";
    charCount.textContent = "0";
    selectedPromptIndex = 0;
    renderPromptGrid();
  });

  thresholdSlider.addEventListener("input", () => {
    const val = parseInt(thresholdSlider.value);
    updateThresholdDisplay(val);
    chrome.storage.sync.set({ threshold: val });
    updateSliderGradient(thresholdSlider);
  });

  resetStatsBtn.addEventListener("click", () => {
    injectedCount = 0;
    statTotal.textContent = "0";
    statSession.textContent = "0";
    statInjected.textContent = "0";
    chrome.storage.sync.set({ injectedCount: 0 });
    chrome.runtime.sendMessage({ type: "RESET_STATS" });
  });

  epistemicSlider.addEventListener("input", () => {
    const val = parseInt(epistemicSlider.value);
    updateEpistemicDisplay(val);
    chrome.storage.sync.set({ epistemicLevel: val });
    updateSliderGradient(epistemicSlider);
  });

  optEpistemic.addEventListener("change", () => {
    chrome.storage.sync.set({ epistemicEnabled: optEpistemic.checked });
  });

  optContract.addEventListener("change", () => {
    chrome.storage.sync.set({ contractEnabled: optContract.checked });
  });

  optSocial.addEventListener("change", () => {
    chrome.storage.sync.set({ socialScorerEnabled: optSocial.checked });
  });

  const optBanner = document.getElementById("opt-banner");
  if (optBanner) {
    optBanner.addEventListener("change", () => {
      chrome.storage.sync.set({ bannerEnabled: optBanner.checked });
    });
  }

  const testCardBtn = document.getElementById("test-card-btn");
  if (testCardBtn) {
    testCardBtn.addEventListener("click", () => {
      sendToActiveTab({ type: "TEST_CARD" });
    });
  }

  updateSliderGradient(thresholdSlider);
  updateSliderGradient(epistemicSlider);

  // Poll tracker stats from content script
  pollTrackerStats();
}

// ── THRESHOLD DISPLAY ──
function updateThresholdDisplay(val) {
  thresholdVal.textContent = val;
  thresholdDesc.textContent = THRESHOLD_DESCS[val] || "";
}

const EPISTEMIC_DESCS = {
  1: 'Statement — intercepts "X is definitely..." and tag questions',
  2: 'Belief — intercepts "I think...", "I believe..."',
  3: 'Conviction — only "I\'m certain...", "Obviously..."',
};

function updateEpistemicDisplay(val) {
  const colors = { 1: "#ffcc00", 2: "#ff8800", 3: "#ff3b3b" };
  epistemicVal.textContent = val;
  epistemicVal.style.color = colors[val] || "#ff8800";
  epistemicDesc.textContent = EPISTEMIC_DESCS[val] || "";
}

function updateSliderGradient(slider) {
  const min = slider.min || 0;
  const max = slider.max || 100;
  const pct = ((slider.value - min) / (max - min)) * 100;
  slider.style.setProperty("--val", pct + "%");
}

// ── INJECT PROMPT ──
function doInject(text) {
  sendToActiveTab({ type: "INJECT_CUSTOM_PROMPT", prompt: text }, (response) => {
    if (chrome.runtime.lastError || (response && !response.success)) {
      flashBtn("✕ Failed", "#ff4444");
      return;
    }
    injectedCount++;
    statInjected.textContent = injectedCount;
    chrome.storage.sync.set({ injectedCount });
    flashBtn("✓ Injected!", "#E1FF00");
  });
}

function flashBtn(label, color) {
  injectBtn.textContent = label;
  injectBtn.style.background = color;
  injectBtn.style.color = "#000";
  setTimeout(() => {
    injectBtn.textContent = "⚡ Inject";
    injectBtn.style.background = "";
    injectBtn.style.color = "";
  }, 1500);
}

// ── MESSAGING ──
function sendToActiveTab(msg, callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, msg, callback || (() => {}));
  });
}

// ── TRACKER STATS ──
function pollTrackerStats() {
  sendToActiveTab({ type: "GET_TRACKER_STATS" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response) {
      trackerTurns.textContent = response.totalTurns || 0;
      trackerChall.textContent = response.challenges || 0;
    }
  });
}

// ── START ──
document.addEventListener("DOMContentLoaded", init);
