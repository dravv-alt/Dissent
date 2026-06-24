// ============================================================
// Dissent — UI Components (Shadow DOM Isolated)
// Alert banners and toast notifications live inside a closed
// Shadow DOM so they can never conflict with the host page.
// ============================================================

let _sbShadowHost = null;
let _sbShadowRoot = null;
let _sbActiveBanner = null;

// ── Initialise the Shadow DOM host (called once) ─────────────
function sbInitUI() {
  if (_sbShadowHost) return;

  _sbShadowHost = document.createElement("div");
  _sbShadowHost.id = "sycophancy-breaker-root";
  _sbShadowHost.style.cssText =
    "all:initial; position:fixed; top:0; left:0; width:0; height:0; z-index:2147483647; pointer-events:none;";

  _sbShadowRoot = _sbShadowHost.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = _sbStyles();
  _sbShadowRoot.appendChild(style);

  const container = document.createElement("div");
  container.id = "sb-root";
  _sbShadowRoot.appendChild(container);

  document.body.appendChild(_sbShadowHost);
}

// ── Create alert banner ──────────────────────────────────────
function sbShowBanner(score, matches, severity, dominantType, counterPrompt, detectionNum) {
  sbInitUI();

  // Remove any existing banner
  if (_sbActiveBanner) {
    _sbActiveBanner.remove();
    _sbActiveBanner = null;
  }

  const cfg = {
    nuclear:  { color: "#FFE600", label: "HIGH SYCOPHANCY",     icon: "⚠️" },
    moderate: { color: "#FFE600", label: "MODERATE SYCOPHANCY", icon: "🔶" },
    mild:     { color: "#FFE600", label: "MILD SYCOPHANCY",     icon: "⚡" },
  };

  const typeLabels = {
    opinion: "Opinion Syco",
    mistake_admission: "Cave-in Syco",
    mimicry: "Mimicry Syco",
    feedback: "Feedback Syco",
    position_change: "Position-Change (SYA)",
    social_validation: "Social Validation Risk",
  };

  const { color, label, icon } = cfg[severity];
  const typeLabel = typeLabels[dominantType] || "Opinion Syco";

  const banner = document.createElement("div");
  banner.className = "sb-banner";
  banner.style.setProperty("--sb-color", color);
  banner.setAttribute("data-severity", severity);

  banner.innerHTML = `
    <div class="sb-header">
      <span class="sb-title">${icon} ${label}</span>
      <button class="sb-close" aria-label="Close">✕</button>
    </div>
    <div class="sb-meta">
      <span class="sb-score">Score ${score} · ${matches.length} pattern(s)</span>
      <span class="sb-type-badge" style="border-color:${color};color:${color}">${typeLabel}</span>
    </div>
    <div class="sb-patterns">
      ${matches.map(m => `
        <div class="sb-match-item">
          <span class="sb-tag" style="background:${color}18;border-color:${color}44;color:${color}">${m.label}</span>
          ${m.snippet ? `<div class="sb-match-snippet"><b>Sentence:</b> "${_escHtml(m.snippet)}"</div>` : ''}
          ${m.type === 'position_change' ? `<div class="sb-match-snippet"><b>Context:</b> AI flipped position after your challenge.</div>` : ''}
        </div>
      `).join("")}
    </div>
    <div class="sb-prompt-box" id="sb-prompt-text">${_escHtml(counterPrompt)}</div>
    <div class="sb-actions">
      <button class="sb-btn sb-btn-inject" style="background:${color};color:#000;font-weight:700;">⚡ Inject Prompt</button>
      <button class="sb-btn sb-btn-cycle">↻ New Prompt</button>
    </div>
    <div class="sb-footer">Dissent · Detection #${detectionNum}</div>
  `;

  const container = _sbShadowRoot.getElementById("sb-root");
  container.appendChild(banner);
  _sbActiveBanner = banner;

  // ── Wire buttons ──
  let currentPrompt = counterPrompt;

  banner.querySelector(".sb-close").addEventListener("click", () => {
    banner.remove();
    _sbActiveBanner = null;
  });

  banner.querySelector(".sb-btn-inject").addEventListener("click", () => {
    const ok = sbInjectPrompt(currentPrompt);
    banner.remove();
    _sbActiveBanner = null;
    sbShowToast(
      ok ? "Prompt injected — break the loop!" : "Could not find chat input. Click the input field first.",
      ok ? "#00ff88" : "#ff4444"
    );
  });

  banner.querySelector(".sb-btn-cycle").addEventListener("click", () => {
    currentPrompt = sbGetCounterPrompt(severity, dominantType);
    banner.querySelector("#sb-prompt-text").textContent = currentPrompt;
  });

  // Auto-dismiss
  setTimeout(() => {
    if (_sbActiveBanner !== banner) return;
    banner.style.opacity = "0";
    banner.style.transition = "opacity 0.5s ease";
    setTimeout(() => {
      if (banner.parentNode) banner.remove();
      if (_sbActiveBanner === banner) _sbActiveBanner = null;
    }, 500);
  }, SB_CONFIG.BANNER_DISMISS_MS);
}

// ── Toast notification ───────────────────────────────────────
function sbShowToast(message, color = "#FFE600") {
  sbInitUI();

  const toast = document.createElement("div");
  toast.className = "sb-toast";
  toast.style.setProperty("--sb-toast-color", color);
  toast.textContent = message;

  const container = _sbShadowRoot.getElementById("sb-root");
  container.appendChild(toast);

  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3200);
}

// ──────────────────────────────────────────────────────────────
// EPISTEMIC SUGGESTION PANEL
// Shows a side-by-side original vs rewritten prompt when
// the interceptor detects epistemic certainty in user input.
// ──────────────────────────────────────────────────────────────

let _sbActiveEpistemicPanel = null;

function sbShowEpistemicPanel(transform, inputEl, platformKey) {
  sbInitUI();

  // Remove existing panel
  if (_sbActiveEpistemicPanel) {
    _sbActiveEpistemicPanel.remove();
    _sbActiveEpistemicPanel = null;
  }

  const { certainty, label, original, rewritten } = transform;

  const panel = document.createElement("div");
  panel.className = "sb-epistemic-panel";
  panel.style.setProperty("--sb-ep-color", certainty.color);

  panel.innerHTML = `
    <div class="sb-ep-header">
      <div class="sb-ep-title-row">
        <span class="sb-ep-icon">🔬</span>
        <span class="sb-ep-title">EPISTEMIC CERTAINTY DETECTED</span>
        <button class="sb-ep-close" aria-label="Dismiss">✕</button>
      </div>
      <div class="sb-ep-meta">
        <span class="sb-ep-level" style="border-color:${certainty.color};color:${certainty.color}">${certainty.label}</span>
        <span class="sb-ep-label">${_escHtml(label)}</span>
        <span class="sb-ep-desc">${certainty.desc}</span>
      </div>
    </div>

    <div class="sb-ep-compare">
      <div class="sb-ep-col">
        <div class="sb-ep-col-header sb-ep-col-original">YOUR MESSAGE</div>
        <div class="sb-ep-text">${_escHtml(original)}</div>
      </div>
      <div class="sb-ep-arrow">→</div>
      <div class="sb-ep-col">
        <div class="sb-ep-col-header sb-ep-col-rewrite">SUGGESTED REWRITE</div>
        <div class="sb-ep-text sb-ep-rewrite-text">${_escHtml(rewritten)}</div>
      </div>
    </div>

    <div class="sb-ep-hint">
      Rephrasing beliefs as questions reduces sycophancy by ~24pp (AISI 2026)
    </div>

    <div class="sb-ep-actions">
      <button class="sb-ep-btn sb-ep-btn-accept">✓ Use Rewrite</button>
      <button class="sb-ep-btn sb-ep-btn-original">Send Original</button>
      <button class="sb-ep-btn sb-ep-btn-dismiss">Dismiss</button>
    </div>
  `;

  const container = _sbShadowRoot.getElementById("sb-root");
  container.appendChild(panel);
  _sbActiveEpistemicPanel = panel;

  // ── Wire buttons ──

  panel.querySelector(".sb-ep-close").addEventListener("click", () => {
    _sbDismissEpistemicPanel();
  });

  panel.querySelector(".sb-ep-btn-dismiss").addEventListener("click", () => {
    _sbDismissEpistemicPanel();
  });

  panel.querySelector(".sb-ep-btn-accept").addEventListener("click", () => {
    _sbDismissEpistemicPanel();
    _sbReplaceAndSend(rewritten, inputEl, platformKey);
    sbShowToast("Rewritten as question — sycophancy trigger removed!", "#00e676");
  });

  panel.querySelector(".sb-ep-btn-original").addEventListener("click", () => {
    _sbDismissEpistemicPanel();
    _sbSendOriginal(inputEl, platformKey);
    sbShowToast("Sent original — watch for sycophancy in the response", "#FFE600");
  });
}

function _sbDismissEpistemicPanel() {
  if (_sbActiveEpistemicPanel) {
    _sbActiveEpistemicPanel.remove();
    _sbActiveEpistemicPanel = null;
  }
  _sbInterceptor.sendBlocked = false;
  _sbInterceptor.pendingResult = null;
}

// ── Escape HTML ──────────────────────────────────────────────
function _escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ── Stylesheet ───────────────────────────────────────────────
function _sbStyles() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700&family=Syne:wght@700;800&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    #sb-root {
      position: fixed; inset: 0;
      pointer-events: none;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px; line-height: 1.5; color: #e0e0e0;
    }

    /* ── BANNER ── */
    .sb-banner {
      position: fixed; bottom: 28px; right: 28px; width: 420px;
      background: #000000; border: 3px solid var(--sb-color);
      border-radius: 0;
      padding: 20px; pointer-events: auto;
      box-shadow: 6px 6px 0 var(--sb-color);
      animation: sb-slide 0.35s cubic-bezier(.16,1,.3,1);
    }
    @keyframes sb-slide {
      from { transform: translateX(120%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    .sb-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
    .sb-title  { font-family: 'Syne', sans-serif; color:var(--sb-color); font-weight:800; font-size:15px; letter-spacing:.12em; text-transform:uppercase; line-height:1; }
    .sb-close  { background:none; border:none; color:#888; cursor:pointer; font-size:18px; padding:2px; line-height:1; font-weight:700; }
    .sb-close:hover { color:#fff; }

    .sb-meta   { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
    .sb-score  { font-size:11px; color:#aaa; font-weight:700; }
    .sb-type-badge {
      font-size:9px; padding:3px 8px; border-radius:0;
      border:2px solid var(--sb-color); background:var(--sb-color); color:#000;
      letter-spacing:.1em; text-transform:uppercase; font-weight:700;
      box-shadow: 2px 2px 0 #fff;
    }

    .sb-patterns { display:flex; flex-direction:column; gap:10px; margin-bottom:16px; max-height:140px; overflow-y:auto; }
    .sb-match-item { display:flex; flex-direction:column; gap:6px; background:#0a0a0a; padding:10px; border:1px solid #222; }
    .sb-tag {
      align-self: flex-start;
      border:1px solid var(--sb-color); background:#111; color:var(--sb-color); border-radius:0; padding:2px 8px;
      font-size:9px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
    }
    .sb-match-snippet {
      font-family: 'Playfair Display', serif; font-size: 13px; color: #fff; font-style: italic;
      background: #000; padding: 8px 10px; 
      border-radius: 0; border-left: 3px solid var(--sb-color);
      white-space: normal; word-break: break-word; line-height: 1.5;
    }
    .sb-match-snippet b { color: #000; background: var(--sb-color); padding: 0 3px; font-style: normal; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; }

    .sb-prompt-box {
      background:#000; border:2px solid #333; box-shadow: 4px 4px 0 #333; border-radius:0;
      padding:14px; color:#fff; font-family: 'Playfair Display', serif; font-size:14px; font-style:italic; line-height:1.6;
      margin-bottom:16px; max-height:100px; overflow:hidden;
      display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical;
    }

    .sb-actions { display:flex; gap:12px; }
    .sb-btn {
      flex:1; padding:12px 14px; border-radius:0;
      font-family: 'Syne', sans-serif; font-size:12px; font-weight:800; cursor:pointer;
      letter-spacing:.15em; text-transform:uppercase; border:3px solid #000;
      transition: all .15s; box-shadow: 4px 4px 0 #fff;
    }
    .sb-btn:active { transform:translate(2px,2px); box-shadow: 1px 1px 0 #fff; }
    .sb-btn-inject { background:var(--sb-color); color:#000; }
    .sb-btn-inject:hover { background:#fff; box-shadow: 4px 4px 0 var(--sb-color); transform:translate(-2px,-2px); }
    .sb-btn-cycle  { background:#000; color:#fff; border-color:#fff; box-shadow: 4px 4px 0 #fff; }
    .sb-btn-cycle:hover { background:#222; box-shadow: 4px 4px 0 var(--sb-color); transform:translate(-2px,-2px); }

    .sb-footer { margin-top:14px; font-size:10px; font-weight:700; color:#666; text-align:right; letter-spacing:.1em; text-transform:uppercase; }

    /* ── TOAST ── */
    .sb-toast {
      position:fixed; bottom:32px; left:50%; transform:translateX(-50%);
      background:#000; border:3px solid var(--sb-toast-color); color:var(--sb-toast-color);
      padding:14px 28px; border-radius:0; font-family:'Syne', sans-serif; font-size:14px; font-weight:800; letter-spacing:.15em; text-transform:uppercase;
      pointer-events:auto;
      box-shadow: 6px 6px 0 var(--sb-toast-color);
      animation: sb-toast-life 3.5s ease forwards;
    }
    @keyframes sb-toast-life { 0%,80%{opacity:1} 100%{opacity:0} }

    /* ── EPISTEMIC SUGGESTION PANEL ── */
    .sb-epistemic-panel {
      position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
      width: min(580px, calc(100vw - 56px));
      background: #000; border: 4px solid var(--sb-ep-color);
      border-radius: 0;
      padding: 26px 30px; pointer-events: auto;
      box-shadow: 8px 8px 0 var(--sb-ep-color);
      animation: sb-ep-appear 0.3s cubic-bezier(.16,1,.3,1);
    }
    @keyframes sb-ep-appear {
      from { transform: translateX(-50%) translateY(20px); opacity: 0; }
      to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
    }

    .sb-ep-header { margin-bottom: 18px; }
    .sb-ep-title-row {
      display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
    }
    .sb-ep-icon { font-size: 18px; }
    .sb-ep-title {
      flex: 1; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 18px;
      letter-spacing: .15em; text-transform: uppercase;
      color: var(--sb-ep-color); line-height: 1;
    }
    .sb-ep-close {
      background: none; border: none; color: #888;
      cursor: pointer; font-size: 20px; padding: 2px; line-height: 1; font-weight: 700;
    }
    .sb-ep-close:hover { color: #fff; }

    .sb-ep-meta {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    }
    .sb-ep-level {
      font-size: 9px; padding: 4px 8px; border-radius: 0;
      border: 2px solid var(--sb-ep-color); background: var(--sb-ep-color); color: #000;
      letter-spacing: .12em; text-transform: uppercase; font-weight: 700;
      box-shadow: 2px 2px 0 #fff;
    }
    .sb-ep-label { font-size: 12px; color: #fff; font-weight: 700; letter-spacing: .05em; }
    .sb-ep-desc { font-size: 11px; color: #aaa; }

    /* Side-by-side comparison */
    .sb-ep-compare {
      display: grid; grid-template-columns: 1fr auto 1fr;
      gap: 14px; align-items: stretch; margin-bottom: 20px;
    }
    .sb-ep-col {
      background: #000; border: 2px solid #333; box-shadow: 4px 4px 0 #333; border-radius: 0;
      overflow: hidden; display: flex; flex-direction: column;
    }
    .sb-ep-col-header {
      font-size: 10px; font-weight: 700; letter-spacing: .15em;
      text-transform: uppercase; padding: 10px 14px;
      border-bottom: 2px solid #333; background: #0a0a0a;
    }
    .sb-ep-col-original { color: #888; background: #000; }
    .sb-ep-col-rewrite  { border-color: #00e676; box-shadow: 4px 4px 0 #00e676; color: #00e676; background: #000; }
    .sb-ep-col-rewrite .sb-ep-col-header { border-bottom: 2px solid #00e676; background: #002613; color: #00e676; }
    
    .sb-ep-text {
      padding: 14px; font-family: 'Playfair Display', serif; font-size: 14px; line-height: 1.6;
      color: #888; max-height: 120px; overflow-y: auto; flex: 1;
      white-space: pre-wrap; word-break: break-word;
    }
    .sb-ep-rewrite-text { color: #fff; font-style: italic; }
    .sb-ep-arrow {
      display: flex; align-items: center; justify-content: center;
      color: var(--sb-ep-color); font-size: 22px; font-weight: 700;
    }

    .sb-ep-hint {
      font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #888; text-align: center;
      margin-bottom: 18px; font-weight: 600; text-transform: uppercase; letter-spacing: .1em;
    }

    .sb-ep-actions { display: flex; gap: 14px; }
    .sb-ep-btn {
      flex: 1; padding: 14px 16px; border-radius: 0;
      font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 800;
      cursor: pointer; letter-spacing: .15em; text-transform: uppercase; border: 3px solid #000;
      transition: all .15s; box-shadow: 4px 4px 0 #fff;
    }
    .sb-ep-btn:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 #fff; }
    .sb-ep-btn-accept  { background: #00e676; color: #000; }
    .sb-ep-btn-accept:hover { background: #fff; box-shadow: 4px 4px 0 #00e676; transform: translate(-2px,-2px); }
    .sb-ep-btn-original { background: #000; color: #aaa; border: 3px solid #aaa; box-shadow: 4px 4px 0 #aaa; }
    .sb-ep-btn-original:hover { background: #aaa; color: #000; box-shadow: 4px 4px 0 #fff; transform: translate(-2px,-2px); }
    .sb-ep-btn-dismiss  { background: #000; color: #666; border: 3px solid #666; box-shadow: 4px 4px 0 #666; }
    .sb-ep-btn-dismiss:hover { background: #666; color: #000; box-shadow: 4px 4px 0 #fff; transform: translate(-2px,-2px); }

    /* ── EXPLAINABILITY CARD (Component 9) ── */
    .sb-card {
      position: fixed; bottom: 28px; right: 28px; width: 440px;
      background: #000; border: 4px solid var(--sb-color);
      border-radius: 0;
      padding: 0; pointer-events: auto; overflow: hidden;
      box-shadow: 8px 8px 0 var(--sb-color);
      animation: sb-card-in 0.38s cubic-bezier(.16,1,.3,1);
      max-height: 88vh; display: flex; flex-direction: column;
    }
    @keyframes sb-card-in {
      from { transform: translateX(130%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }

    /* Card header stripe */
    .sb-card-header {
      display: flex; align-items: center; gap: 12px;
      padding: 18px 20px 16px; border-bottom: 3px solid var(--sb-color);
      background: #000; flex-shrink: 0;
    }
    .sb-card-icon { font-size: 18px; line-height: 1; }
    .sb-card-title {
      flex: 1; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 15px;
      letter-spacing: .12em; text-transform: uppercase;
      color: var(--sb-color); line-height: 1;
    }
    .sb-card-badges { display: flex; gap: 8px; align-items: center; }
    .sb-card-sev-badge {
      font-size: 9px; padding: 3px 8px; border-radius: 0;
      border: 2px solid var(--sb-color); background: var(--sb-color); color: #000;
      letter-spacing: .1em; text-transform: uppercase; font-weight: 700;
      box-shadow: 2px 2px 0 #fff;
    }
    .sb-card-cat-badge {
      font-size: 9px; padding: 3px 8px; border-radius: 0;
      background: #111; color: var(--sb-color); border: 1px solid var(--sb-color);
      letter-spacing: .1em; text-transform: uppercase; font-weight: 700;
    }
    .sb-card-close {
      background: none; border: none; color: #888;
      cursor: pointer; font-size: 20px; padding: 2px; line-height: 1; font-weight: 700;
      margin-left: 6px; flex-shrink: 0;
    }
    .sb-card-close:hover { color: #fff; }

    /* Scrollable body */
    .sb-card-body {
      padding: 20px; overflow-y: auto; flex: 1;
      display: flex; flex-direction: column; gap: 16px;
      background: #000;
    }

    /* Summary sentence */
    .sb-card-summary {
      font-family: 'Playfair Display', serif; font-size: 18px; color: var(--sb-color); font-weight: 900; line-height: 1.4;
      padding-bottom: 16px; border-bottom: 2px dashed #333;
      position: relative; display: inline-block; z-index: 1;
    }
    .sb-card-summary::before {
      content: ''; position: absolute; left: 0; right: 0; bottom: 18px;
      height: 35%; background: var(--sb-color); z-index: -1; opacity: 0.35;
    }

    /* Why list */
    .sb-card-section-label {
      font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .15em; text-transform: uppercase;
      color: var(--sb-color); font-weight: 700; margin-bottom: 8px; margin-top: 4px;
    }
    .sb-card-reasons { display: flex; flex-direction: column; gap: 8px; }
    .sb-card-reason-item {
      display: flex; gap: 10px; align-items: flex-start;
    }
    .sb-card-reason-dot {
      width: 7px; height: 7px; border-radius: 0;
      background: var(--sb-color); margin-top: 5px; flex-shrink: 0;
      box-shadow: 2px 2px 0 #fff;
    }
    .sb-card-reason-text {
      font-size: 12px; color: #e0e0e0; line-height: 1.5; font-weight: 500;
    }

    /* Lead evidence chip */
    .sb-card-lead-evidence {
      background: #000; border: 2px solid var(--sb-color); box-shadow: 4px 4px 0 var(--sb-color); border-radius: 0;
      padding: 14px 16px; margin-bottom: 4px;
    }
    .sb-card-lead-label {
      font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--sb-color); letter-spacing: .15em;
      text-transform: uppercase; margin-bottom: 8px; font-weight: 700;
    }
    .sb-card-lead-text {
      font-family: 'Playfair Display', serif; font-size: 14px; color: #fff; font-style: italic;
      word-break: break-word; line-height: 1.5;
      cursor: pointer;
    }
    .sb-card-lead-text:hover { color: var(--sb-color); text-decoration: underline; }

    /* Confidence meter */
    .sb-card-confidence {
      background: #000; border: 2px solid #333; box-shadow: 4px 4px 0 #333; border-radius: 0;
      padding: 16px; margin-bottom: 4px;
    }
    .sb-card-conf-row {
      display: flex; align-items: center; gap: 12px; margin-bottom: 10px;
    }
    .sb-card-conf-label {
      font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #fff; text-transform: uppercase;
      letter-spacing: .15em; flex: 1; font-weight: 700;
    }
    .sb-card-conf-pct {
      font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 900; color: var(--sb-color); line-height: 1;
    }
    .sb-card-conf-bar-track {
      height: 8px; background: #222; border: 2px solid #000; box-shadow: 2px 2px 0 var(--sb-color); border-radius: 0; overflow: hidden;
    }
    .sb-card-conf-bar-fill {
      height: 100%; border-radius: 0;
      background: var(--sb-color);
      transition: width 0.6s cubic-bezier(.4,0,.2,1);
    }
    .sb-card-factors {
      display: flex; flex-direction: column; gap: 8px; margin-top: 14px;
    }
    .sb-card-factor-row {
      display: flex; align-items: center; gap: 10px;
    }
    .sb-card-factor-name {
      font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #aaa; flex: 1; font-weight: 600; text-transform: uppercase; letter-spacing: .05em;
    }
    .sb-card-factor-bar-track {
      width: 80px; height: 6px; background: #222; border: 1px solid #000; box-shadow: 1px 1px 0 #fff; border-radius: 0; overflow: hidden;
    }
    .sb-card-factor-bar-fill {
      height: 100%; border-radius: 0; background: var(--sb-color);
      transition: width 0.5s ease;
    }
    .sb-card-factor-pct {
      font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; color: var(--sb-color); width: 28px; text-align: right;
    }

    /* Counter-prompt box */
    .sb-card-prompt-section { display: flex; flex-direction: column; gap: 8px; }
    .sb-card-prompt-box {
      background: #000; border: 2px solid #333; box-shadow: 4px 4px 0 #333; border-radius: 0;
      padding: 14px; font-family: 'Playfair Display', serif; font-size: 13px; font-style: italic; color: #ccc; line-height: 1.6;
      max-height: 90px; overflow: hidden;
      display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;
    }

    /* Action buttons */
    .sb-card-actions { display: flex; gap: 12px; flex-shrink: 0; padding: 0 20px 20px; background: #000; }
    .sb-card-btn {
      flex: 1; padding: 12px 14px; border-radius: 0;
      font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 800;
      cursor: pointer; letter-spacing: .15em; text-transform: uppercase; border: 3px solid #000;
      transition: all .15s; box-shadow: 4px 4px 0 #fff;
    }
    .sb-card-btn:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 #fff; }
    .sb-card-btn-inject { background: var(--sb-color); color: #000; }
    .sb-card-btn-inject:hover { background: #fff; box-shadow: 4px 4px 0 var(--sb-color); transform: translate(-2px,-2px); }
    .sb-card-btn-cycle  { background: #000; color: #fff; border-color: #fff; box-shadow: 4px 4px 0 #fff; }
    .sb-card-btn-cycle:hover { background: #222; box-shadow: 4px 4px 0 var(--sb-color); transform: translate(-2px,-2px); }
    .sb-card-btn-dismiss { background: #000; color: #666; border: 3px solid #666; box-shadow: 4px 4px 0 #666; flex: 0 0 auto; padding: 12px 16px; }
    .sb-card-btn-dismiss:hover { background: #666; color: #000; box-shadow: 4px 4px 0 #fff; transform: translate(-2px,-2px); }

    /* Card footer */
    .sb-card-footer {
      padding: 12px 20px; font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; color: #666;
      text-align: right; letter-spacing: .1em; text-transform: uppercase; flex-shrink: 0;
      border-top: 2px solid #222; background: #0a0a0a;
    }

    /* ── AUDIT TIMELINE (Phase 2) ── */
    .sb-timeline-container {
      margin-top: 16px;
      border-top: 2px dashed #333;
      padding-top: 16px;
    }
    .sb-timeline-toggle {
      background: none; border: none; color: var(--sb-color);
      font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 800; letter-spacing: .15em;
      text-transform: uppercase; cursor: pointer;
      display: flex; align-items: center; gap: 8px;
      width: 100%; text-align: left;
    }
    .sb-timeline-toggle:hover { filter: brightness(1.2); }
    .sb-timeline-content {
      display: none;
      margin-top: 16px;
    }
    .sb-timeline-content.is-open { display: block; }
    
    .sb-timeline-banner {
      background: #000; border: 2px solid #FFE600; box-shadow: 4px 4px 0 #FFE600; border-radius: 0; padding: 14px;
      margin-bottom: 16px; cursor: pointer; transition: all 0.15s;
    }
    .sb-timeline-banner:hover { transform: translate(-2px,-2px); box-shadow: 6px 6px 0 #fff; }
    .sb-timeline-banner-title {
      font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #FFE600;
      letter-spacing: .1em; text-transform: uppercase; margin-bottom: 6px;
    }
    .sb-timeline-banner-text {
      font-family: 'Playfair Display', serif; font-size: 13px; color: #fff; line-height: 1.5; font-style: italic;
    }

    .sb-timeline-list {
      display: flex; flex-direction: column; gap: 12px;
    }
    .sb-timeline-entry {
      display: flex; gap: 12px; align-items: flex-start;
      background: #000; border: 2px solid #333; box-shadow: 3px 3px 0 #333; border-radius: 0;
      padding: 12px 14px; transition: all 0.15s;
    }
    .sb-timeline-entry:hover { border-color: var(--sb-color); box-shadow: 3px 3px 0 var(--sb-color); }
    .sb-timeline-entry.historical { opacity: 0.8; border-style: dashed; }
    
    .sb-timeline-turn {
      background: #111; color: var(--sb-color); border: 1px solid var(--sb-color); font-family: 'JetBrains Mono', monospace; font-size: 10px;
      font-weight: 700; padding: 4px 8px; border-radius: 0;
      flex-shrink: 0; min-width: 36px; text-align: center; box-shadow: 2px 2px 0 #fff;
    }
    .sb-timeline-text {
      flex: 1; font-family: 'Playfair Display', serif; font-size: 13px; color: #fff; line-height: 1.5;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 240px;
    }
    .sb-timeline-actions {
      display: flex; gap: 8px; align-items: center; flex-shrink: 0;
    }
    .sb-timeline-jump {
      background: #000; border: 2px solid #555; box-shadow: 2px 2px 0 #555; border-radius: 0;
      color: #aaa; cursor: pointer; padding: 4px 8px; font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .1em; transition: all 0.15s;
    }
    .sb-timeline-jump:hover { background: var(--sb-color); color: #000; border-color: #000; box-shadow: 2px 2px 0 #fff; }
    .sb-timeline-flags { font-size: 12px; }

    /* ── NARRATIVE GRAPH (Phase 5) ── */
    .sb-graph-modal {
      position: fixed; inset: 0; background: rgba(0,0,0,0.9);
      z-index: 2147483647; display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(6px); animation: sb-fade-in 0.2s ease;
    }
    @keyframes sb-fade-in { from { opacity: 0; } to { opacity: 1; } }
    
    .sb-graph-container {
      background: #000; border: 4px solid var(--sb-color); border-radius: 0; box-shadow: 12px 12px 0 var(--sb-color);
      width: 90vw; height: 90vh; display: flex; flex-direction: column;
      overflow: hidden;
    }
    
    .sb-graph-header {
      padding: 22px 26px; border-bottom: 4px solid var(--sb-color);
      display: flex; justify-content: space-between; align-items: center;
      background: #000; box-shadow: 0 4px 0 #222; position: relative; z-index: 10;
    }
    .sb-graph-title { font-family: 'Syne', sans-serif; font-weight: 800; color: var(--sb-color); font-size: 20px; letter-spacing: 0.15em; text-transform: uppercase; line-height: 1; }
    .sb-graph-close { background: none; border: none; color: #888; font-size: 24px; font-weight: 700; cursor: pointer; line-height: 1; }
    .sb-graph-close:hover { color: #fff; }
    
    .sb-graph-body {
      flex: 1; overflow: auto; position: relative; background: #050505;
    }
    
    .sb-graph-svg {
      display: block; min-width: 100%; min-height: 100%;
    }
    
    /* SVG Node Styles */
    .sb-node-rect { fill: #000; stroke: #333; stroke-width: 3px; rx: 0; transition: all 0.2s; cursor: pointer; }
    .sb-node-rect:hover { stroke: #FFE600; filter: drop-shadow(4px 4px 0 #FFE600); }
    .sb-node-text { fill: #fff; font-family: 'Playfair Display', serif; font-size: 13px; font-style: italic; pointer-events: none; }
    .sb-node-speaker { fill: #FFE600; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; pointer-events: none; }
    
    /* Sycophancy Borders */
    .sb-node-opinion { stroke: #FFE600; }
    .sb-node-position { stroke: #FFE600; }
    .sb-node-mimicry { stroke: #FFE600; }
    .sb-node-social { stroke: #FFE600; }
    
    /* Historical / Baseline */
    .sb-node-historical { stroke-dasharray: 6 6; fill: #0a0a0a; }
    .sb-node-compromised { animation: sb-pulse-yellow 2s infinite; stroke: #FFE600; stroke-width: 4px; }
    
    @keyframes sb-pulse-yellow {
      0% { filter: drop-shadow(0 0 2px #FFE600); }
      50% { filter: drop-shadow(0 0 12px #FFE600); }
      100% { filter: drop-shadow(0 0 2px #FFE600); }
    }
    
    /* Edges */
    .sb-edge { fill: none; stroke-width: 2px; }
    .sb-edge-extends { stroke: #555; }
    .sb-edge-contradicts { stroke: #FFE600; stroke-dasharray: 6 6; }
    .sb-edge-adopts { stroke: #FFE600; stroke-dasharray: 3 3; }
    .sb-edge-amplifies { stroke: #FFE600; stroke-width: 3.5px; }
  `;
}

// ──────────────────────────────────────────────────────────────
// sbHighlightEvidence(evidenceArray, responseEl, durationMs?)
//
// Component 8: Evidence Highlighting
// Walks the DOM text nodes inside `responseEl` (the AI response
// element on the page) and wraps each matched text span in a
// <mark> element styled by severity.
//
// Arguments:
//   evidenceArray — flat evidence array from sbCollectEvidence/sbMergeTrackerEvidence
//   responseEl    — the DOM element containing the AI response text
//   durationMs    — how long highlights stay visible (default: 8000)
//
// Returns:
//   { highlighted: number, skipped: number, marks: Element[] }
//   highlighted — number of text spans successfully marked
//   skipped     — number of evidence items skipped (behavioral or out-of-range)
//   marks       — array of <mark> elements inserted (for cleanup/testing)
//
// Design decisions:
//   1. OVERLAPPING SPANS: Merged before insertion. If evidence A covers
//      chars 5-20 and evidence B covers 12-30, they merge to 5-30 with
//      the higher severity colour. No nested <mark> elements.
//   2. BEHAVIORAL EVIDENCE: Skipped (no startIndex/endIndex).
//   3. DOM TEXT WALKING: Uses a TreeWalker to find text nodes.
//      The full concatenated text of all text nodes is built first
//      (matching how detector.js sees the response), then positions
//      are mapped back to individual nodes.
//   4. PLATFORM RENDERING: Some platforms insert HTML into responses
//      (bold, code blocks, etc.). We only target text nodes, so
//      structural HTML is never touched.
//   5. AUTO-CLEANUP: All <mark> elements are removed after durationMs.
// ──────────────────────────────────────────────────────────────

// Severity colour palette (applied inline so they work outside Shadow DOM)
const _SB_HIGHLIGHT_COLORS = {
  nuclear: { background: "rgba(255, 230, 0, 0.28)", outline: "#FFE600" },
  high:    { background: "rgba(255, 230, 0, 0.22)", outline: "#FFE600" },
  medium:  { background: "rgba(255, 230, 0, 0.18)", outline: "#FFE600" },
  low:     { background: "rgba(255, 230, 0, 0.12)", outline: "#FFE600" },
};

function sbHighlightEvidence(evidenceArray, responseEl, durationMs = 8000) {
  // ── Guards ──────────────────────────────────────────────────
  if (!responseEl || !(responseEl instanceof Element)) {
    return { highlighted: 0, skipped: 0, marks: [] };
  }
  if (!Array.isArray(evidenceArray) || evidenceArray.length === 0) {
    return { highlighted: 0, skipped: 0, marks: [] };
  }

  const SEVERITY_RANK = { low: 1, medium: 2, high: 3, nuclear: 4 };
  let highlighted = 0;
  let skipped = 0;
  const marks = [];

  // ── Step 1: Filter to textual evidence only ─────────────────
  // Behavioral evidence has no character positions — skip it.
  const textualEvidence = evidenceArray.filter(ev => {
    if (!ev || ev.evidenceType !== "textual") { skipped++; return false; }
    if (typeof ev.startIndex !== "number" || typeof ev.endIndex !== "number") { skipped++; return false; }
    if (ev.startIndex < 0 || ev.endIndex <= ev.startIndex) { skipped++; return false; }
    return true;
  });

  if (textualEvidence.length === 0) {
    return { highlighted, skipped, marks };
  }

  // ── Step 2: Collect all text nodes + build full text string ─
  // The detector runs on a flat string. We need to reproduce that
  // same flat string from the DOM to ensure index positions match.
  const textNodes = [];
  const walker = document.createTreeWalker(responseEl, NodeFilter.SHOW_TEXT, null);
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  if (textNodes.length === 0) {
    return { highlighted, skipped, marks };
  }

  // Build the full text with node boundaries tracked
  // nodeRanges[i] = { node, start, end } — char offsets in fullText
  const nodeRanges = [];
  let fullText = "";
  for (const tn of textNodes) {
    const start = fullText.length;
    fullText += tn.nodeValue;
    nodeRanges.push({ node: tn, start, end: fullText.length });
  }

  // ── Step 3: Merge overlapping/adjacent evidence spans ───────
  // Sort by startIndex, then merge overlapping ranges.
  // When merging, keep the highest severity.
  const sorted = [...textualEvidence].sort((a, b) => a.startIndex - b.startIndex);

  const merged = [];
  for (const ev of sorted) {
    // Clamp to actual text length
    const start = Math.min(ev.startIndex, fullText.length);
    const end   = Math.min(ev.endIndex,   fullText.length);
    if (start >= end) { skipped++; continue; }

    const sev = ev.severity || "low";

    if (merged.length === 0 || start > merged[merged.length - 1].end) {
      // No overlap — new span
      merged.push({ start, end, severity: sev });
    } else {
      // Overlapping — extend and take the higher severity
      const prev = merged[merged.length - 1];
      prev.end = Math.max(prev.end, end);
      if ((SEVERITY_RANK[sev] || 0) > (SEVERITY_RANK[prev.severity] || 0)) {
        prev.severity = sev;
      }
    }
  }

  // ── Step 4: Insert <mark> elements for each merged span ─────
  // We process spans in REVERSE order so that earlier insertions
  // don't shift the character offsets for later insertions.
  for (let i = merged.length - 1; i >= 0; i--) {
    const span = merged[i];
    const colors = _SB_HIGHLIGHT_COLORS[span.severity] || _SB_HIGHLIGHT_COLORS.low;

    // Find which text nodes this span crosses
    const involved = nodeRanges.filter(nr =>
      nr.start < span.end && nr.end > span.start
    );

    if (involved.length === 0) { skipped++; continue; }

    // For each involved text node, wrap the relevant portion in a <mark>
    // We iterate in reverse to avoid offset drift within the same parent
    for (let j = involved.length - 1; j >= 0; j--) {
      const nr = involved[j];

      // Portion of this span that falls within this text node
      const localStart = Math.max(0, span.start - nr.start);
      const localEnd   = Math.min(nr.node.nodeValue.length, span.end - nr.start);

      if (localStart >= localEnd) continue;

      try {
        const range = document.createRange();
        range.setStart(nr.node, localStart);
        range.setEnd(nr.node, localEnd);

        const mark = document.createElement("mark");
        mark.dataset.sbEvidence = "true";
        mark.style.cssText = [
          `background: ${colors.background}`,
          `outline: 1px solid ${colors.outline}`,
          "border-radius: 2px",
          "padding: 0 1px",
          "margin: 0",
          "display: inline",
          "transition: opacity 0.4s ease",
        ].join("; ");

        range.surroundContents(mark);
        marks.push(mark);
        highlighted++;
      } catch (err) {
        // surroundContents throws if the range splits an element boundary
        // (e.g. inside a <code> or strong block). Skip gracefully.
        skipped++;
      }
    }
  }

  // ── Step 5: Auto-cleanup after durationMs ──────────────────
  if (marks.length > 0 && durationMs > 0) {
    setTimeout(() => {
      for (const m of marks) {
        if (!m.parentNode) continue;
        // Fade out
        m.style.opacity = "0";
        setTimeout(() => {
          if (m.parentNode) {
            // Replace <mark> with its text content to restore DOM structure
            const parent = m.parentNode;
            while (m.firstChild) parent.insertBefore(m.firstChild, m);
            parent.removeChild(m);
          }
        }, 400); // match transition duration
      }
    }, durationMs);
  }

  return { highlighted, skipped, marks };
}

// ──────────────────────────────────────────────────────────────
// sbShowExplainabilityCard(explanation, confidence, detection, detectionNum)
//
// Component 9: Explainability Card
// Replaces sbShowBanner() in the final pipeline (C10). Same Shadow
// DOM isolation, same animation, dramatically richer content.
//
// Arguments:
//   explanation   — output of sbGenerateExplanation() [C6]
//   confidence    — output of sbCalculateConfidence() [C7]
//   detection     — output of sbBuildDetection()      [C5]
//   detectionNum  — integer detection counter for footer
//
// Returns: the card DOM element (for testing / cleanup)
// ──────────────────────────────────────────────────────────────

function sbShowExplainabilityCard(explanation, confidence, detection, detectionNum) {
  sbInitUI();

  // Remove any existing card or legacy banner
  if (_sbActiveBanner) {
    _sbActiveBanner.remove();
    _sbActiveBanner = null;
  }

  const SEV_CFG = {
    nuclear:  { color: "#FFE600", label: "HIGH SYCOPHANCY",     icon: "⚠️" },
    high:     { color: "#FFE600", label: "HIGH SYCOPHANCY",     icon: "⚠️" },
    moderate: { color: "#FFE600", label: "MODERATE SYCOPHANCY", icon: "🔶" },
    medium:   { color: "#FFE600", label: "MODERATE SYCOPHANCY", icon: "🔶" },
    mild:     { color: "#FFE600", label: "MILD SYCOPHANCY",     icon: "⚡" },
    low:      { color: "#FFE600", label: "MILD SYCOPHANCY",     icon: "⚡" },
  };

  const CAT_LABELS = {
    opinion:           "Opinion",
    mistake_admission: "Cave-in",
    mimicry:           "Mimicry",
    feedback:          "Feedback",
    position_change:   "Position-Change",
    social_validation: "Social Validation",
  };

  const severity   = detection?.severity || "low";
  const category   = detection?.category || "opinion";
  const sevCfg     = SEV_CFG[severity] || SEV_CFG.low;
  const catLabel   = CAT_LABELS[category] || category;
  const confPct    = confidence ? Math.round(confidence.confidence * 100) : null;
  const factors    = confidence?.factors || [];
  const summary    = explanation?.summary    || "Potential sycophantic response detected.";
  const reasons    = explanation?.reasons    || [];
  const counterCtx = explanation?.counterPromptContext || category;
  const leadEv     = explanation?.leadEvidence || null;

  // sbGetCounterPrompt uses 'nuclear'/'moderate'/'mild' as severity keys
  const PROMPT_SEV_MAP = {
    nuclear: "nuclear", high: "nuclear",
    moderate: "moderate", medium: "moderate",
    mild: "mild", low: "mild",
  };
  const promptSeverity = PROMPT_SEV_MAP[severity] || "mild";
  let currentPrompt = sbGetCounterPrompt(promptSeverity, counterCtx);

  const reasonsHTML = reasons.length
    ? reasons.map(r =>
        `<div class="sb-card-reason-item">
           <div class="sb-card-reason-dot"></div>
           <div class="sb-card-reason-text">${_escHtml(r)}</div>
         </div>`).join("")
    : `<div class="sb-card-reason-text" style="color:#555">No specific patterns identified.</div>`;

  const leadEvidenceHTML = leadEv?.matchedText
    ? `<div class="sb-card-lead-evidence">
         <div class="sb-card-lead-label">Flagged text</div>
         <div class="sb-card-lead-text" id="sb-lead-text">"${_escHtml(leadEv.matchedText)}"</div>
       </div>`
    : "";

  const confBarWidth = confPct !== null ? `${confPct}%` : "0%";
  const confidenceHTML = confPct !== null
    ? `<div class="sb-card-confidence">
         <div class="sb-card-conf-row">
           <span class="sb-card-conf-label">Confidence</span>
           <span class="sb-card-conf-pct">${confPct}%</span>
         </div>
         <div class="sb-card-conf-bar-track">
           <div class="sb-card-conf-bar-fill" style="width:0%" id="sb-conf-bar"></div>
         </div>
         ${factors.length
           ? `<div class="sb-card-factors">
               ${factors.map(f => {
                 const fp = Math.round(f.contribution * 100);
                 const bp = Math.min(100, Math.round((f.contribution / 0.98) * 100));
                 return `<div class="sb-card-factor-row">
                   <span class="sb-card-factor-name">${_escHtml(f.name)}</span>
                   <div class="sb-card-factor-bar-track">
                     <div class="sb-card-factor-bar-fill" style="width:${bp}%"></div>
                   </div>
                   <span class="sb-card-factor-pct">${fp}%</span>
                 </div>`;
               }).join("")}
             </div>`
           : ""}
       </div>`
    : "";

  const card = document.createElement("div");
  card.className = "sb-card";
  card.style.setProperty("--sb-color", sevCfg.color);
  card.setAttribute("data-severity", severity);
  card.setAttribute("data-category", category);

  card.innerHTML = `
    <div class="sb-card-header">
      <span class="sb-card-icon">${sevCfg.icon}</span>
      <span class="sb-card-title">${sevCfg.label}</span>
      <div class="sb-card-badges">
        <span class="sb-card-sev-badge">${_escHtml(severity)}</span>
        <span class="sb-card-cat-badge">${_escHtml(catLabel)}</span>
      </div>
      <button class="sb-card-close" aria-label="Close">✕</button>
    </div>
    <div class="sb-card-body">
      <div class="sb-card-summary">${_escHtml(summary)}</div>
      ${reasons.length
        ? `<div>
             <div class="sb-card-section-label">Why this was flagged</div>
             <div class="sb-card-reasons">${reasonsHTML}</div>
           </div>`
        : ""}
      ${leadEvidenceHTML}
      ${confidenceHTML}
      <div class="sb-card-prompt-section">
        <div class="sb-card-section-label">Counter-prompt</div>
        <div class="sb-card-prompt-box" id="sb-card-prompt-text">${_escHtml(currentPrompt)}</div>
      </div>
      <div id="sb-audit-timeline-mount"></div>
    </div>
    <div class="sb-card-actions">
      <button class="sb-card-btn sb-card-btn-inject" style="background:${sevCfg.color};color:#000;font-weight:700;">⚡ Inject Prompt</button>
      <button class="sb-card-btn sb-card-btn-cycle">↻ New Prompt</button>
      <button class="sb-card-btn sb-card-btn-dismiss">✕</button>
    </div>
    <div class="sb-card-footer">Dissent · Detection #${detectionNum || "—"}</div>
  `;

  const container = _sbShadowRoot.getElementById("sb-root");
  container.appendChild(card);
  _sbActiveBanner = card;

  // Animate confidence bar on next frame
  if (confPct !== null) {
    requestAnimationFrame(() => {
      const bar = card.querySelector("#sb-conf-bar");
      if (bar) bar.style.width = confBarWidth;
    });
  }

  // Lead evidence click → scroll to highlighted mark in page
  const leadTextEl = card.querySelector("#sb-lead-text");
  if (leadTextEl) {
    leadTextEl.addEventListener("click", () => {
      try {
        const mark = document.querySelector("mark[data-sb-evidence='true']");
        if (mark) mark.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (_) { /* scroll is optional */ }
    });
  }

  const dismissCard = () => {
    card.style.opacity = "0";
    card.style.transition = "opacity 0.3s ease";
    setTimeout(() => {
      if (card.parentNode) card.remove();
      if (_sbActiveBanner === card) _sbActiveBanner = null;
    }, 300);
  };

  card.querySelector(".sb-card-close").addEventListener("click", dismissCard);
  card.querySelector(".sb-card-btn-dismiss").addEventListener("click", dismissCard);

  card.querySelector(".sb-card-btn-inject").addEventListener("click", () => {
    const ok = sbInjectPrompt(currentPrompt);
    dismissCard();
    sbShowToast(
      ok ? "Prompt injected — break the loop!" : "Could not find chat input. Click the input field first.",
      ok ? "#00ff88" : "#ff4444"
    );
  });

  card.querySelector(".sb-card-btn-cycle").addEventListener("click", () => {
    currentPrompt = sbGetCounterPrompt(promptSeverity, counterCtx);
    const promptBox = card.querySelector("#sb-card-prompt-text");
    if (promptBox) promptBox.textContent = currentPrompt;
  });

  // Mount Audit Timeline
  _sbMountAuditTimeline(card);

  // Increase the banner dismiss timeout if timeline is opened
  let dismissTimer = setTimeout(() => {
    if (_sbActiveBanner !== card) return;
    dismissCard();
  }, SB_CONFIG.BANNER_DISMISS_MS);

  const timelineToggle = card.querySelector('.sb-timeline-toggle');
  if (timelineToggle) {
    timelineToggle.addEventListener('click', () => {
      clearTimeout(dismissTimer); // Don't auto-dismiss while user is looking at timeline
    });
  }

  return card;
}

// ──────────────────────────────────────────────────────────────
// _sbMountAuditTimeline(card)
// Component 10: Turn Audit Timeline (Phase 2 MVP)
// Renders the timeline UI inside the explainability card.
// ──────────────────────────────────────────────────────────────

function _sbMountAuditTimeline(card) {
  const mountPoint = card.querySelector("#sb-audit-timeline-mount");
  if (!mountPoint) return;

  const baseline = typeof sbGetBaseline === "function" ? sbGetBaseline() : null;
  const timeline = typeof sbGetTimeline === "function" ? sbGetTimeline(20) : [];

  if (timeline.length === 0) return;

  // Render Baseline Banner
  let bannerHTML = "";
  if (baseline && baseline.compromised) {
    const turnLabel = baseline.compromisedTurnIndex !== null ? `Turn ${baseline.compromisedTurnIndex + 1}` : "Early on";
    const flagNames = (baseline.compromisedTypes || []).map(t => t.replace(/_/g, ' ')).join(', ');
    
    bannerHTML = `
      <div class="sb-timeline-banner" id="sb-baseline-banner">
        <div class="sb-timeline-banner-title">⚠️ Compromised Baseline Detected</div>
        <div class="sb-timeline-banner-text">
          In <b>${turnLabel}</b>, the AI accepted your unverified premise without challenge (${_escHtml(flagNames)}). 
          ${timeline.length} subsequent claims have built on this foundation.
        </div>
      </div>
    `;
  }

  // Render Timeline Entries
  const entriesHTML = timeline.map(entry => {
    const isHist = entry.node.isHistorical;
    const isFlagged = Object.keys(entry.annotations).length > 0;
    const flags = isFlagged ? "🚩" : (isHist ? "📜" : "");
    const histClass = isHist ? "historical" : "live";
    const truncatedClaim = entry.node.claimText.length > 80 
      ? entry.node.claimText.substring(0, 77) + "..." 
      : entry.node.claimText;

    return `
      <div class="sb-timeline-entry ${histClass}">
        <div class="sb-timeline-turn">T${entry.node.turnIndex + 1}</div>
        <div class="sb-timeline-text" title="${_escHtml(entry.node.fullSentence)}">
          ${_escHtml(truncatedClaim)}
        </div>
        <div class="sb-timeline-actions">
          <div class="sb-timeline-flags" title="${Object.keys(entry.annotations).join(', ')}">${flags}</div>
          <button class="sb-timeline-jump" data-turn="${entry.node.turnIndex}">Jump</button>
        </div>
      </div>
    `;
  }).join("");

  mountPoint.innerHTML = `
    <div class="sb-timeline-container">
      <button class="sb-timeline-toggle">
        <span class="sb-timeline-chevron">▶</span> View Reasoning Trail
      </button>
      <div class="sb-timeline-content">
        ${bannerHTML}
        <div class="sb-timeline-list">
          ${entriesHTML}
        </div>
      </div>
    </div>
  `;

  // Wire Interactions
  const toggle = mountPoint.querySelector('.sb-timeline-toggle');
  const content = mountPoint.querySelector('.sb-timeline-content');
  const chevron = mountPoint.querySelector('.sb-timeline-chevron');

  toggle.addEventListener('click', () => {
    const isOpen = content.classList.toggle('is-open');
    chevron.textContent = isOpen ? '▼' : '▶';
    // Let the card flex height up to max-height
  });

  // Jump to Turn logic
  const jumpButtons = mountPoint.querySelectorAll('.sb-timeline-jump');
  jumpButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const turnIdx = parseInt(btn.getAttribute('data-turn'), 10);
      const platformKey = typeof sbGetPlatformKey === "function" ? sbGetPlatformKey() : null;
      if (platformKey && typeof sbQueryResponses === "function") {
        const responses = sbQueryResponses(platformKey);
        if (responses[turnIdx]) {
          responses[turnIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  });

  // Baseline Banner click logic
  const banner = mountPoint.querySelector('#sb-baseline-banner');
  if (banner && baseline.compromisedTurnIndex !== null) {
    banner.addEventListener('click', () => {
      const platformKey = typeof sbGetPlatformKey === "function" ? sbGetPlatformKey() : null;
      if (platformKey && typeof sbQueryResponses === "function") {
        const responses = sbQueryResponses(platformKey);
        if (responses[baseline.compromisedTurnIndex]) {
          responses[baseline.compromisedTurnIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  }
}

// ──────────────────────────────────────────────────────────────
// sbRenderNarrativeGraph(graphData)
// Component 10: Narrative State Graph Visualization (Phase 5)
// ──────────────────────────────────────────────────────────────

function sbRenderNarrativeGraph(graphData) {
  sbInitUI();

  const containerId = "sb-graph-modal";
  let modal = _sbShadowRoot.getElementById(containerId);
  if (modal) modal.remove();

  modal = document.createElement("div");
  modal.id = containerId;
  modal.className = "sb-graph-modal";

  // Configuration for layout
  const NODE_WIDTH = 240;
  const NODE_HEIGHT = 50;
  const X_SPACING = 280;
  const Y_SPACING = 90;
  const MARGIN_X = 50;
  const MARGIN_Y = 50;

  // Process nodes
  const nodesArr = Object.values(graphData.nodes);
  if (nodesArr.length === 0) return;

  // Map nodes to layers by turnIndex
  const layers = {};
  let maxTurn = 0;
  
  nodesArr.forEach(entry => {
    const t = entry.node.turnIndex;
    if (!layers[t]) layers[t] = [];
    layers[t].push(entry);
    if (t > maxTurn) maxTurn = t;
  });

  // Calculate coordinates
  const nodeCoords = {};
  let maxWidth = 0;
  
  for (let t = 0; t <= maxTurn; t++) {
    if (!layers[t]) continue;
    // Sort nodes within turn by claimIndex
    layers[t].sort((a, b) => a.node.claimIndex - b.node.claimIndex);
    
    layers[t].forEach((entry, idx) => {
      const x = MARGIN_X + (idx * X_SPACING);
      const y = MARGIN_Y + (t * Y_SPACING);
      
      nodeCoords[entry.node.id] = { x, y, entry };
      if (x + NODE_WIDTH > maxWidth) maxWidth = x + NODE_WIDTH;
    });
  }

  const svgWidth = Math.max(800, maxWidth + MARGIN_X);
  const svgHeight = Math.max(600, MARGIN_Y + (maxTurn * Y_SPACING) + NODE_HEIGHT + MARGIN_Y);

  // Generate Edges HTML
  let edgesHTML = "";
  nodesArr.forEach(entry => {
    const fromId = entry.node.id;
    const fromCoord = nodeCoords[fromId];
    if (!fromCoord) return;

    entry.edges.forEach(edge => {
      const toId = edge.toId;
      const toCoord = nodeCoords[toId];
      if (!toCoord) return;

      // Start at bottom center of 'from' node
      const x1 = fromCoord.x + (NODE_WIDTH / 2);
      const y1 = fromCoord.y + NODE_HEIGHT;
      // End at top center of 'to' node
      const x2 = toCoord.x + (NODE_WIDTH / 2);
      const y2 = toCoord.y;

      // Bezier curve
      const path = `M ${x1} ${y1} C ${x1} ${y1 + 40}, ${x2} ${y2 - 40}, ${x2} ${y2}`;
      
      let edgeClass = "sb-edge sb-edge-extends";
      if (edge.type === "contradicts") edgeClass = "sb-edge sb-edge-contradicts";
      else if (edge.type === "adopts_premise") edgeClass = "sb-edge sb-edge-adopts";
      else if (edge.type === "amplifies") edgeClass = "sb-edge sb-edge-amplifies";

      edgesHTML += `<path class="${edgeClass}" d="${path}" marker-end="url(#arrowhead)"></path>`;
    });
  });

  // Generate Nodes HTML
  let nodesHTML = "";
  for (const id in nodeCoords) {
    const { x, y, entry } = nodeCoords[id];
    
    let rectClass = "sb-node-rect";
    if (entry.node.isHistorical) rectClass += " sb-node-historical";
    
    const anns = Object.keys(entry.annotations);
    if (anns.length > 0) {
      if (anns.some(a => a.includes("opinion"))) rectClass += " sb-node-opinion";
      else if (anns.some(a => a.includes("position"))) rectClass += " sb-node-position";
      else if (anns.some(a => a.includes("mimicry"))) rectClass += " sb-node-mimicry";
      else if (anns.some(a => a.includes("social"))) rectClass += " sb-node-social";
      else rectClass += " sb-node-opinion"; // default highlighted
    }

    // Check if this is the compromised root
    const isCompromisedRoot = anns.includes("baseline_compromised_root");
    if (isCompromisedRoot) rectClass += " sb-node-compromised";

    const text = entry.node.claimText.length > 32 
      ? entry.node.claimText.substring(0, 32) + "..." 
      : entry.node.claimText;

    nodesHTML += `
      <g transform="translate(${x}, ${y})" class="sb-node-group" data-id="${id}" data-turn="${entry.node.turnIndex}">
        <rect width="${NODE_WIDTH}" height="${NODE_HEIGHT}" class="${rectClass}"></rect>
        <text x="10" y="20" class="sb-node-speaker">${entry.node.speaker} (T${entry.node.turnIndex + 1})</text>
        <text x="10" y="38" class="sb-node-text">${_escHtml(text)}</text>
      </g>
    `;
  }

  modal.innerHTML = `
    <div class="sb-graph-container">
      <div class="sb-graph-header">
        <div class="sb-graph-title">Narrative State Graph</div>
        <button class="sb-graph-close">✕</button>
      </div>
      <div class="sb-graph-body">
        <svg class="sb-graph-svg" width="${svgWidth}" height="${svgHeight}">
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <polygon points="0 0, 6 3, 0 6" fill="#666" />
            </marker>
          </defs>
          ${edgesHTML}
          ${nodesHTML}
        </svg>
      </div>
    </div>
  `;

  _sbShadowRoot.getElementById("sb-root").appendChild(modal);

  modal.querySelector(".sb-graph-close").addEventListener("click", () => {
    modal.remove();
  });

  // Jump on node click
  const nodeGroups = modal.querySelectorAll(".sb-node-group");
  nodeGroups.forEach(g => {
    g.addEventListener("click", () => {
      const turnIdx = parseInt(g.getAttribute("data-turn"), 10);
      const platformKey = typeof sbGetPlatformKey === "function" ? sbGetPlatformKey() : null;
      if (platformKey && typeof sbQueryResponses === "function") {
        const responses = sbQueryResponses(platformKey);
        if (responses[turnIdx]) {
          responses[turnIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
          modal.remove();
        }
      }
    });
  });
}
