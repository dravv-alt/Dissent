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
  opinion: "#FFE600",
  mistake_admission: "#FFE600",
  mimicry: "#FFE600",
  feedback: "#FFE600",
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
const optAuditPersistence = document.getElementById("opt-audit-persistence");
const trackerTurns   = document.getElementById("tracker-turns");
const trackerChall   = document.getElementById("tracker-challenges");
const healthStatusEl = document.getElementById("health-status");
const degradedBanner = document.getElementById("degraded-banner");

// Audit / Phase 2 DOM refs
const auditClaims      = document.getElementById("audit-claims");
const auditFlagged     = document.getElementById("audit-flagged");
const auditBaseStatus  = document.getElementById("audit-baseline-status");
const btnViewTrail     = document.getElementById("btn-view-trail");
const retroSection     = document.getElementById("retroactive-section");
const retroGrid        = document.getElementById("retroactive-grid");

// Settings-tab mirrors (keep in sync with audit tab)
const settingsAuditClaims     = document.getElementById("settings-audit-claims");
const settingsAuditFlagged    = document.getElementById("settings-audit-flagged");
const settingsAuditBaseStatus = document.getElementById("settings-audit-baseline-status");
const settingsBtnViewTrail    = document.getElementById("settings-btn-view-trail");

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
  chrome.storage.sync.get(["enabled", "threshold", "injectedCount", "epistemicLevel", "epistemicEnabled", "contractEnabled", "socialScorerEnabled", "auditPersistence"], (data) => {
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
    if (data.auditPersistence !== undefined) {
      optAuditPersistence.checked = data.auditPersistence;
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

    const typeColor = TYPE_COLORS[p.type] || "#FFE600";
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

    const typeColor = TYPE_COLORS[p.type] || "#FFE600";
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

  if (optAuditPersistence) {
    optAuditPersistence.addEventListener("change", () => {
      chrome.storage.sync.set({ auditPersistence: optAuditPersistence.checked });
    });
  }

  updateSliderGradient(thresholdSlider);
  updateSliderGradient(epistemicSlider);

  // Poll tracker stats from content script
  pollTrackerStats();

  // Poll audit stats from content script (Phase 2)
  pollAuditStats();

  // Poll platform health from content script
  pollPlatformHealth();

  // View Trail buttons (both audit tab and settings tab)
  if (btnViewTrail) {
    btnViewTrail.addEventListener("click", () => {
      sendToActiveTab({ type: "SHOW_AUDIT_GRAPH" });
      window.close(); // Close popup after action
    });
  }
  if (settingsBtnViewTrail) {
    settingsBtnViewTrail.addEventListener("click", () => {
      sendToActiveTab({ type: "SHOW_AUDIT_GRAPH" });
      window.close();
    });
  }
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
  const colors = { 1: "#FFE600", 2: "#FFE600", 3: "#FFE600" };
  epistemicVal.textContent = val;
  epistemicVal.style.color = colors[val] || "#FFE600";
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
    if (chrome.runtime.lastError) {
      flashBtn("✕ Failed", "#FFE600");
      return;
    }
    injectedCount++;
    statInjected.textContent = injectedCount;
    chrome.storage.sync.set({ injectedCount });
    flashBtn("✓ Injected!", "#FFE600");
  });
}

function flashBtn(label, color) {
  injectBtn.textContent = label;
  injectBtn.style.background = color;
  injectBtn.style.color = "#000";
  setTimeout(() => {
    injectBtn.textContent = "⚡ Inject Selected";
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

// ── AUDIT STATS (Phase 2) ──
function pollAuditStats() {
  // Query Baseline
  sendToActiveTab({ type: "GET_AUDIT_BASELINE" }, (baselineResponse) => {
    if (chrome.runtime.lastError) return;
    const baseline = baselineResponse;

    // Query Graph Stats
    sendToActiveTab({ type: "GET_AUDIT_GRAPH" }, (graphResponse) => {
      if (chrome.runtime.lastError) return;
      const graph = graphResponse;
      
      if (auditClaims) auditClaims.textContent = graph ? graph.nodeCount : 0;
      if (settingsAuditClaims) settingsAuditClaims.textContent = graph ? graph.nodeCount : 0;
      
      // Calculate flagged turns (nodes with annotations)
      let flaggedCount = 0;
      if (graph && graph.nodes) {
        flaggedCount = Object.values(graph.nodes).filter(n => n.annotations && Object.keys(n.annotations).length > 0).length;
      }
      if (auditFlagged) auditFlagged.textContent = flaggedCount;
      if (settingsAuditFlagged) settingsAuditFlagged.textContent = flaggedCount;

      if (baseline) {
        if (baseline.compromised) {
          if (auditBaseStatus) {
            auditBaseStatus.innerHTML = `⚠️ <span style="color:#FFE600">Compromised</span>`;
          }
          if (settingsAuditBaseStatus) {
            settingsAuditBaseStatus.innerHTML = `⚠️ <span style="color:#FFE600">Compromised</span>`;
          }
          if (retroSection) retroSection.style.display = "block";
          renderRetroactivePrompts(baseline);
        } else {
          if (auditBaseStatus) auditBaseStatus.textContent = "✅ Clean";
          if (settingsAuditBaseStatus) settingsAuditBaseStatus.textContent = "✅ Clean";
          if (retroSection) retroSection.style.display = "none";
        }
      }
    });
  });
}

function renderRetroactivePrompts(baseline) {
  if (!retroGrid) return;
  retroGrid.innerHTML = "";
  
  const turnLabel = baseline.compromisedTurnIndex !== null ? `Turn ${baseline.compromisedTurnIndex + 1}` : "Early on";
  const flagNames = (baseline.compromisedTypes || []).map(t => t.replace(/_/g, ' ')).join(', ');
  
  const prompts = [
    `Let's pause and look back at this conversation. You accepted my premise early on (around ${turnLabel}) without questioning it, and we've been building on it since. Can we critically evaluate that original premise now, and tell me what evidence would actually disprove it?`,
    `I want to check our reasoning foundation. In ${turnLabel}, you agreed with my assertion. What are the strongest arguments against that assertion?`
  ];

  prompts.forEach((text, i) => {
    const card = document.createElement("div");
    card.className = "prompt-card";
    card.innerHTML = `
      <span class="prompt-badge badge-nuclear">RESET</span>
      <span class="prompt-preview">${text.slice(0, 80)}…</span>
    `;
    card.addEventListener("click", () => {
      customPromptEl.value = text;
      charCount.textContent = text.length;
      document.querySelectorAll("#retroactive-grid .prompt-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      // Deselect quick prompts
      document.querySelectorAll("#prompt-grid .prompt-card").forEach(c => c.classList.remove("selected"));
    });
    retroGrid.appendChild(card);
  });
}

// ── PLATFORM HEALTH ──
function pollPlatformHealth() {
  sendToActiveTab({ type: "GET_PLATFORM_HEALTH" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (!response) return;

    // Update degraded banner
    if (degradedBanner) {
      degradedBanner.classList.toggle("visible", !!response.isDegraded);
    }

    // Update health status indicator
    if (healthStatusEl && response.strategy) {
      const strategy = response.strategy;
      const stratClass = (strategy === "chain") ? "strategy-chain"
        : (strategy === "heuristic") ? "strategy-heuristic"
        : (strategy === "attribute") ? "strategy-attribute"
        : "strategy-none";

      const confidence = response.confidence != null
        ? Math.round(response.confidence * 100) + "%"
        : "—";

      healthStatusEl.innerHTML =
        `<span class="strategy-tag ${stratClass}">${strategy}</span> ${confidence}`;
    }
  });
}

// ── START ──
document.addEventListener("DOMContentLoaded", init);
