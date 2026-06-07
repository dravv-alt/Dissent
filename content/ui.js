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
    nuclear:  { color: "#ff3333", label: "HIGH SYCOPHANCY",     icon: "⚠️" },
    moderate: { color: "#ff8800", label: "MODERATE SYCOPHANCY", icon: "🔶" },
    mild:     { color: "#ffcc00", label: "MILD SYCOPHANCY",     icon: "⚡" },
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
      <button class="sb-btn sb-btn-inject" style="background:${color}">⚡ Inject Prompt</button>
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
function sbShowToast(message, color = "#00ff88") {
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
    sbShowToast("Sent original — watch for sycophancy in the response", "#ff8800");
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
    * { box-sizing: border-box; margin: 0; padding: 0; }

    #sb-root {
      position: fixed; inset: 0;
      pointer-events: none;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      font-size: 12px; line-height: 1.5; color: #e0e0e0;
    }

    /* ── BANNER ── */
    .sb-banner {
      position: fixed; bottom: 24px; right: 24px; width: 400px;
      background: #0c0c0c; border: 1px solid var(--sb-color);
      border-left: 4px solid var(--sb-color); border-radius: 10px;
      padding: 16px; pointer-events: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,.6), 0 0 24px color-mix(in srgb, var(--sb-color) 12%, transparent);
      animation: sb-slide 0.35s cubic-bezier(.16,1,.3,1);
    }
    @keyframes sb-slide {
      from { transform: translateX(120%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    .sb-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    .sb-title  { color:var(--sb-color); font-weight:700; font-size:11px; letter-spacing:.08em; text-transform:uppercase; }
    .sb-close  { background:none; border:none; color:#555; cursor:pointer; font-size:16px; padding:2px; line-height:1; }
    .sb-close:hover { color:#fff; }

    .sb-meta   { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
    .sb-score  { font-size:11px; color:#888; }
    .sb-type-badge {
      font-size:9px; padding:2px 7px; border-radius:4px;
      border:1px solid; letter-spacing:.06em; text-transform:uppercase; font-weight:600;
    }

    .sb-patterns { display:flex; flex-direction:column; gap:8px; margin-bottom:12px; max-height:120px; overflow-y:auto; }
    .sb-match-item { display:flex; flex-direction:column; gap:4px; }
    .sb-tag {
      align-self: flex-start;
      border:1px solid; border-radius:4px; padding:2px 6px;
      font-size:10px; letter-spacing:.03em;
    }
    .sb-match-snippet {
      font-family: inherit; font-size: 10.5px; color: #e0e0e0;
      background: rgba(0,0,0,0.3); padding: 6px 8px; 
      border-radius: 4px; border-left: 3px solid var(--sb-color);
      white-space: normal; word-break: break-word; line-height: 1.4;
    }
    .sb-match-snippet b { color: var(--sb-color); opacity: 0.8; }

    .sb-prompt-box {
      background:#111; border:1px solid #2a2a2a; border-radius:6px;
      padding:10px; color:#aaa; font-size:11px; line-height:1.6;
      margin-bottom:12px; max-height:80px; overflow:hidden;
      display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical;
    }

    .sb-actions { display:flex; gap:8px; }
    .sb-btn {
      flex:1; padding:8px 12px; border-radius:6px;
      font-family:inherit; font-size:11px; font-weight:600; cursor:pointer;
      letter-spacing:.05em; text-transform:uppercase; border:none;
      transition: opacity .15s, transform .1s;
    }
    .sb-btn:hover  { opacity:.88; }
    .sb-btn:active { transform:scale(.97); }
    .sb-btn-inject { color:#000; }
    .sb-btn-cycle  { background:#1a1a1a; color:#aaa; border:1px solid #333; }

    .sb-footer { margin-top:10px; font-size:10px; color:#333; text-align:right; letter-spacing:.03em; }

    /* ── TOAST ── */
    .sb-toast {
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      background:#0c0c0c; border:1px solid var(--sb-toast-color); color:var(--sb-toast-color);
      padding:10px 20px; border-radius:6px; font-size:12px; letter-spacing:.04em;
      pointer-events:auto;
      box-shadow: 0 4px 20px rgba(0,0,0,.5);
      animation: sb-toast-life 3.2s ease forwards;
    }
    @keyframes sb-toast-life { 0%,70%{opacity:1} 100%{opacity:0} }

    /* ── EPISTEMIC SUGGESTION PANEL ── */
    .sb-epistemic-panel {
      position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
      width: min(520px, calc(100vw - 48px));
      background: #0c0c0c; border: 1px solid var(--sb-ep-color);
      border-top: 3px solid var(--sb-ep-color); border-radius: 12px;
      padding: 18px 20px; pointer-events: auto;
      box-shadow: 0 12px 48px rgba(0,0,0,.7), 0 0 32px color-mix(in srgb, var(--sb-ep-color) 10%, transparent);
      animation: sb-ep-appear 0.3s cubic-bezier(.16,1,.3,1);
    }
    @keyframes sb-ep-appear {
      from { transform: translateX(-50%) translateY(20px); opacity: 0; }
      to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
    }

    .sb-ep-header { margin-bottom: 14px; }
    .sb-ep-title-row {
      display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
    }
    .sb-ep-icon { font-size: 16px; }
    .sb-ep-title {
      flex: 1; font-weight: 700; font-size: 11px;
      letter-spacing: .1em; text-transform: uppercase;
      color: var(--sb-ep-color);
    }
    .sb-ep-close {
      background: none; border: none; color: #555;
      cursor: pointer; font-size: 16px; padding: 2px; line-height: 1;
    }
    .sb-ep-close:hover { color: #fff; }

    .sb-ep-meta {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    .sb-ep-level {
      font-size: 9px; padding: 2px 8px; border-radius: 4px;
      border: 1px solid; letter-spacing: .06em;
      text-transform: uppercase; font-weight: 700;
    }
    .sb-ep-label { font-size: 11px; color: #aaa; font-weight: 500; }
    .sb-ep-desc { font-size: 10px; color: #666; }

    /* Side-by-side comparison */
    .sb-ep-compare {
      display: grid; grid-template-columns: 1fr auto 1fr;
      gap: 10px; align-items: stretch; margin-bottom: 12px;
    }
    .sb-ep-col {
      background: #111; border: 1px solid #222; border-radius: 8px;
      overflow: hidden;
    }
    .sb-ep-col-header {
      font-size: 9px; font-weight: 700; letter-spacing: .1em;
      text-transform: uppercase; padding: 6px 10px;
      border-bottom: 1px solid #222;
    }
    .sb-ep-col-original { color: #888; background: #0e0e0e; }
    .sb-ep-col-rewrite  { color: #00e676; background: rgba(0,230,118,.04); }
    .sb-ep-text {
      padding: 10px; font-size: 12px; line-height: 1.6;
      color: #ccc; max-height: 100px; overflow-y: auto;
      white-space: pre-wrap; word-break: break-word;
    }
    .sb-ep-rewrite-text { color: #e8e8e8; }
    .sb-ep-arrow {
      display: flex; align-items: center; justify-content: center;
      color: #444; font-size: 18px; font-weight: 300;
    }

    .sb-ep-hint {
      font-size: 10px; color: #555; text-align: center;
      margin-bottom: 14px; font-style: italic;
    }

    .sb-ep-actions { display: flex; gap: 8px; }
    .sb-ep-btn {
      flex: 1; padding: 9px 12px; border-radius: 7px;
      font-family: inherit; font-size: 11px; font-weight: 600;
      cursor: pointer; letter-spacing: .04em; border: none;
      transition: opacity .15s, transform .1s;
    }
    .sb-ep-btn:hover  { opacity: .88; }
    .sb-ep-btn:active { transform: scale(.97); }
    .sb-ep-btn-accept  { background: #00e676; color: #000; }
    .sb-ep-btn-original { background: #1a1a1a; color: #aaa; border: 1px solid #333; }
    .sb-ep-btn-dismiss  { background: #1a1a1a; color: #666; border: 1px solid #222; }

    /* ── EXPLAINABILITY CARD (Component 9) ── */
    .sb-card {
      position: fixed; bottom: 24px; right: 24px; width: 420px;
      background: #0c0c0c; border: 1px solid var(--sb-color);
      border-left: 4px solid var(--sb-color); border-radius: 12px;
      padding: 0; pointer-events: auto; overflow: hidden;
      box-shadow: 0 8px 40px rgba(0,0,0,.7), 0 0 32px color-mix(in srgb, var(--sb-color) 10%, transparent);
      animation: sb-card-in 0.38s cubic-bezier(.16,1,.3,1);
      max-height: 88vh; display: flex; flex-direction: column;
    }
    @keyframes sb-card-in {
      from { transform: translateX(130%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }

    /* Card header stripe */
    .sb-card-header {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 14px 10px; border-bottom: 1px solid #1a1a1a;
      flex-shrink: 0;
    }
    .sb-card-icon { font-size: 15px; line-height: 1; }
    .sb-card-title {
      flex: 1; font-weight: 700; font-size: 10px;
      letter-spacing: .1em; text-transform: uppercase;
      color: var(--sb-color);
    }
    .sb-card-badges { display: flex; gap: 5px; align-items: center; }
    .sb-card-sev-badge {
      font-size: 9px; padding: 2px 6px; border-radius: 3px;
      border: 1px solid var(--sb-color); color: var(--sb-color);
      letter-spacing: .06em; text-transform: uppercase; font-weight: 700;
    }
    .sb-card-cat-badge {
      font-size: 9px; padding: 2px 6px; border-radius: 3px;
      background: #1a1a1a; color: #666;
      letter-spacing: .04em; text-transform: uppercase;
    }
    .sb-card-close {
      background: none; border: none; color: #444;
      cursor: pointer; font-size: 15px; padding: 2px; line-height: 1;
      margin-left: 4px; flex-shrink: 0;
    }
    .sb-card-close:hover { color: #fff; }

    /* Scrollable body */
    .sb-card-body {
      padding: 14px; overflow-y: auto; flex: 1;
      display: flex; flex-direction: column; gap: 12px;
    }

    /* Summary sentence */
    .sb-card-summary {
      font-size: 12.5px; color: #ddd; line-height: 1.55;
      padding-bottom: 10px; border-bottom: 1px solid #1c1c1c;
    }

    /* Why list */
    .sb-card-section-label {
      font-size: 9px; letter-spacing: .1em; text-transform: uppercase;
      color: #555; font-weight: 700; margin-bottom: 6px;
    }
    .sb-card-reasons { display: flex; flex-direction: column; gap: 5px; }
    .sb-card-reason-item {
      display: flex; gap: 8px; align-items: flex-start;
    }
    .sb-card-reason-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: var(--sb-color); margin-top: 5px; flex-shrink: 0;
    }
    .sb-card-reason-text {
      font-size: 11px; color: #c0c0c0; line-height: 1.5;
    }

    /* Lead evidence chip */
    .sb-card-lead-evidence {
      background: #111; border: 1px solid #222; border-radius: 6px;
      padding: 8px 10px; border-left: 3px solid var(--sb-color);
    }
    .sb-card-lead-label {
      font-size: 9px; color: #555; letter-spacing: .08em;
      text-transform: uppercase; margin-bottom: 4px;
    }
    .sb-card-lead-text {
      font-size: 11px; color: #e0e0e0; font-style: italic;
      word-break: break-word; line-height: 1.5;
      cursor: pointer;
    }
    .sb-card-lead-text:hover { color: var(--sb-color); text-decoration: underline; }

    /* Confidence meter */
    .sb-card-confidence {
      background: #0e0e0e; border: 1px solid #1c1c1c; border-radius: 6px;
      padding: 10px;
    }
    .sb-card-conf-row {
      display: flex; align-items: center; gap: 8px; margin-bottom: 7px;
    }
    .sb-card-conf-label {
      font-size: 9px; color: #555; text-transform: uppercase;
      letter-spacing: .08em; flex: 1;
    }
    .sb-card-conf-pct {
      font-size: 13px; font-weight: 700; color: var(--sb-color);
    }
    .sb-card-conf-bar-track {
      height: 4px; background: #1c1c1c; border-radius: 2px; overflow: hidden;
    }
    .sb-card-conf-bar-fill {
      height: 100%; border-radius: 2px;
      background: linear-gradient(90deg, var(--sb-color) 0%, color-mix(in srgb, var(--sb-color) 60%, #fff) 100%);
      transition: width 0.6s cubic-bezier(.4,0,.2,1);
    }
    .sb-card-factors {
      display: flex; flex-direction: column; gap: 4px; margin-top: 8px;
    }
    .sb-card-factor-row {
      display: flex; align-items: center; gap: 6px;
    }
    .sb-card-factor-name {
      font-size: 10px; color: #666; flex: 1;
    }
    .sb-card-factor-bar-track {
      width: 60px; height: 3px; background: #1c1c1c; border-radius: 2px; overflow: hidden;
    }
    .sb-card-factor-bar-fill {
      height: 100%; border-radius: 2px; background: #333;
      transition: width 0.5s ease;
    }
    .sb-card-factor-pct {
      font-size: 9px; color: #555; width: 24px; text-align: right;
    }

    /* Counter-prompt box */
    .sb-card-prompt-section { display: flex; flex-direction: column; gap: 6px; }
    .sb-card-prompt-box {
      background: #111; border: 1px solid #1e1e1e; border-radius: 6px;
      padding: 10px; font-size: 11px; color: #999; line-height: 1.6;
      max-height: 75px; overflow: hidden;
      display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;
    }

    /* Action buttons */
    .sb-card-actions { display: flex; gap: 7px; flex-shrink: 0; }
    .sb-card-btn {
      flex: 1; padding: 9px 10px; border-radius: 7px;
      font-family: inherit; font-size: 10.5px; font-weight: 600;
      cursor: pointer; letter-spacing: .04em; border: none;
      transition: opacity .15s, transform .1s;
    }
    .sb-card-btn:hover  { opacity: .88; }
    .sb-card-btn:active { transform: scale(.97); }
    .sb-card-btn-inject { color: #000; }
    .sb-card-btn-cycle  { background: #1a1a1a; color: #888; border: 1px solid #2a2a2a; }
    .sb-card-btn-dismiss { background: transparent; color: #444;
      border: 1px solid #1c1c1c; flex: 0 0 auto; padding: 9px 12px; }

    /* Card footer */
    .sb-card-footer {
      padding: 7px 14px; font-size: 9px; color: #2a2a2a;
      text-align: right; letter-spacing: .03em; flex-shrink: 0;
      border-top: 1px solid #111;
    }
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
  nuclear: { background: "rgba(255, 51,  51,  0.28)", outline: "#ff3333" },
  high:    { background: "rgba(255, 136, 0,   0.22)", outline: "#ff8800" },
  medium:  { background: "rgba(255, 204, 0,   0.22)", outline: "#ffcc00" },
  low:     { background: "rgba(100, 200, 255, 0.18)", outline: "#64c8ff" },
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
        // (e.g. inside a <code> or <strong> block). Skip gracefully.
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
    nuclear:  { color: "#ff3333", label: "HIGH SYCOPHANCY",     icon: "⚠️" },
    high:     { color: "#ff3333", label: "HIGH SYCOPHANCY",     icon: "⚠️" },
    moderate: { color: "#ff8800", label: "MODERATE SYCOPHANCY", icon: "🔶" },
    medium:   { color: "#ff8800", label: "MODERATE SYCOPHANCY", icon: "🔶" },
    mild:     { color: "#ffcc00", label: "MILD SYCOPHANCY",     icon: "⚡" },
    low:      { color: "#ffcc00", label: "MILD SYCOPHANCY",     icon: "⚡" },
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
    </div>
    <div class="sb-card-actions" style="padding:10px 14px;border-top:1px solid #111">
      <button class="sb-card-btn sb-card-btn-inject" style="background:${sevCfg.color}">⚡ Inject</button>
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

  setTimeout(() => {
    if (_sbActiveBanner !== card) return;
    dismissCard();
  }, SB_CONFIG.BANNER_DISMISS_MS);

  return card;
}
