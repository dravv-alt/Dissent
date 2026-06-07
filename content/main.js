// ============================================================
// Dissent — Main Orchestrator
// Uses MutationObserver (not setInterval) for efficient,
// event-driven response scanning.
// ============================================================

// How long (ms) the response text must be STABLE before we run the pipeline.
// Prevents flagging mid-stream while the AI is still generating.
const SB_STREAM_SETTLE_MS = 1800;

const sbState = {
  enabled: true,
  seenFingerprints: new Set(),
  lastToastTime: 0,
  detectionCount: 0,
  observer: null,
  // Fallback interval handle (used if MutationObserver cannot
  // find a container — e.g. platform loaded late)
  fallbackTimer: null,
  // Map of element → { timer, snapshotText } for streaming guard
  settleTimers: new Map(),
};

// ──────────────────────────────────────────────────────────────
// PROCESS A SINGLE AI RESPONSE ELEMENT
// Component 10: Full Evidence Pipeline
//
// Flow:
//   1. Fingerprint check
//   2. sbCollectEvidence()   — L4 + L6 (sync)
//   3. sbRecordTurn()        — L3 (async, merged via sbMergeTrackerEvidence)
//   4. sbBuildDetection()    — dominant category + severity
//   5. sbGenerateExplanation()
//   6. sbCalculateConfidence()
//   7. sbHighlightEvidence() — word-level text highlighting in DOM
//   8. sbShowExplainabilityCard() — rich Shadow DOM card
//   9. chrome.runtime.sendMessage() — evidence-rich badge payload
// ──────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────
// STREAMING GUARD
// Waits until the AI response text has stopped changing for
// SB_STREAM_SETTLE_MS milliseconds before running the pipeline.
// This prevents false positives on partial / mid-stream output.
// ──────────────────────────────────────────────────────────────
function _sbProcessResponse(el, userText) {
  if (!sbState.enabled) return;

  const text = (el.innerText || el.textContent || "").trim();
  if (text.length < 20) return;

  // If there's already a pending settle timer for this element,
  // reset it — the response is still streaming.
  const existing = sbState.settleTimers.get(el);
  if (existing) {
    clearTimeout(existing.timer);
  }

  // Schedule a settle check after SB_STREAM_SETTLE_MS ms of silence.
  const timer = setTimeout(() => {
    sbState.settleTimers.delete(el);
    _sbRunOnSettledResponse(el, userText);
  }, SB_STREAM_SETTLE_MS);

  sbState.settleTimers.set(el, { timer, snapshotText: text });
}

// Called once the response text has been stable for SB_STREAM_SETTLE_MS ms.
function _sbRunOnSettledResponse(el, userText) {
  if (!sbState.enabled) return;

  const text = (el.innerText || el.textContent || "").trim();
  if (text.length < 20) return;

  // ── Fingerprint dedup ───────────────────────────────────────
  const fp = text.slice(0, 150);
  if (sbState.seenFingerprints.has(fp)) return;
  sbState.seenFingerprints.add(fp);

  if (sbState.seenFingerprints.size > SB_CONFIG.CACHE_SIZE) {
    const first = sbState.seenFingerprints.values().next().value;
    sbState.seenFingerprints.delete(first);
  }

  // ── Debounce ─────────────────────────────────────────────────
  const now = Date.now();
  if (now - sbState.lastToastTime < SB_CONFIG.DEBOUNCE_MS) return;

  // ── Step 1: Collect L4 + L6 evidence (sync) ─────────────────
  const collectResult = sbCollectEvidence(text, userText || "");

  // ── Step 2: L3 tracker (async) — fire and merge ──────────────
  sbRecordTurn(userText || "", text).then(trackerResult => {
    const merged = sbMergeTrackerEvidence(collectResult, trackerResult);
    _sbRunEEEPipeline(el, text, userText, merged.evidence, merged);
  }).catch(err => {
    console.warn("[Dissent] Tracker error:", err);
    _sbRunEEEPipeline(el, text, userText, collectResult.evidence, collectResult);
  });
}

// ── Core EEE pipeline — called after tracker resolves ─────────
function _sbRunEEEPipeline(el, text, userText, evidenceArray, mergedResult) {
  // Step 3: Build detection
  const detection = sbBuildDetection(evidenceArray);
  if (!detection) return; // nothing detected

  // Debounce (checked again here since tracker is async)
  const now = Date.now();
  if (now - sbState.lastToastTime < SB_CONFIG.DEBOUNCE_MS) return;
  sbState.lastToastTime = now;

  sbState.detectionCount++;

  // Step 4: Generate explanation
  const explanation = sbGenerateExplanation(detection);

  // Step 5: Calculate confidence
  const confidence = sbCalculateConfidence(evidenceArray, detection);

  // Step 6: Highlight exact matched text in AI response DOM
  try {
    sbHighlightEvidence(evidenceArray, el);
  } catch (err) {
    console.warn("[Dissent] Highlight error:", err);
  }

  // Step 7: Show Explainability Card
  sbShowExplainabilityCard(
    explanation,
    confidence,
    detection,
    sbState.detectionCount
  );

  // Step 8: Notify background (badge + popup)
  console.log(
    `[Dissent] Detection #${sbState.detectionCount}`,
    { category: detection.category, severity: detection.severity,
      evidence: evidenceArray.length, confidence: confidence?.confidence }
  );

  chrome.runtime.sendMessage({
    type:        "SYCOPHANCY_DETECTED",
    count:       sbState.detectionCount,
    // Evidence-rich payload (C10)
    category:    detection.category,
    severity:    detection.severity,
    evidenceCount: evidenceArray.length,
    confidence:  confidence?.confidence ?? null,
    summary:     explanation?.summary ?? null,
    ruleIds:     detection.ruleIds,
    // Legacy fields kept for backward compat with popup.js badge logic
    score:       evidenceArray.reduce((s, e) => s + (e.weight || 0), 0),
    dominantType: detection.category,
  });
}


// ──────────────────────────────────────────────────────────────
// EXTRACT LAST USER MESSAGE
// Grabs the most recent user turn from the chat DOM.
// ──────────────────────────────────────────────────────────────
function _sbGetLastUserMessage(platformKey) {
  const userSelectors = {
    "claude.ai": [
      '[data-testid="user-message"]',
      '.font-user-message',
      '[class*="human"]',
    ],
    "chatgpt.com": [
      '[data-message-author-role="user"]',
      '[data-message-author-role="user"] .whitespace-pre-wrap',
    ],
    "gemini.google.com": [
      "user-query",
      "user-query .query-text",
      '.user-message',
    ],
  };

  const selectors = userSelectors[platformKey] || [];
  for (const sel of selectors) {
    try {
      const msgs = document.querySelectorAll(sel);
      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        return (last.innerText || last.textContent || "").trim();
      }
    } catch (_) { /* try next */ }
  }
  return "";
}

// ──────────────────────────────────────────────────────────────
// SCAN — check the latest assistant response
// Used by both MutationObserver callback and fallback timer.
// ──────────────────────────────────────────────────────────────
function _sbScanLatest() {
  if (!sbState.enabled) return;

  const platformKey = sbGetPlatformKey();
  if (!platformKey) return;

  const responses = sbQueryResponses(platformKey);
  if (responses.length === 0) return;

  // Grab the user's last message for the tracker
  const lastUserMsg = _sbGetLastUserMessage(platformKey);

  // Only check the last response
  _sbProcessResponse(responses[responses.length - 1], lastUserMsg);
}

// ──────────────────────────────────────────────────────────────
// MUTATION OBSERVER — fires only when DOM actually changes
// ──────────────────────────────────────────────────────────────
function _sbStartObserver() {
  const platformKey = sbGetPlatformKey();
  if (!platformKey) return;

  const container = sbQueryContainer(platformKey);

  // If container is document.body, it means we couldn't find
  // the real chat container yet. Use a short fallback poll to
  // wait for it, then switch to observer.
  if (container === document.body) {
    _sbStartFallback();
    return;
  }

  // Stop any fallback timer
  _sbStopFallback();

  // Disconnect previous observer if any
  if (sbState.observer) sbState.observer.disconnect();

  sbState.observer = new MutationObserver((mutations) => {
    // Debounce: only scan once per animation frame
    if (sbState._scanQueued) return;
    sbState._scanQueued = true;
    requestAnimationFrame(() => {
      sbState._scanQueued = false;
      _sbScanLatest();
    });
  });

  sbState.observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  console.log("[Dissent] MutationObserver attached to", container.tagName || "container");
}

// ──────────────────────────────────────────────────────────────
// FALLBACK: setInterval until the real container appears
// ──────────────────────────────────────────────────────────────
function _sbStartFallback() {
  if (sbState.fallbackTimer) return;

  let attempts = 0;
  sbState.fallbackTimer = setInterval(() => {
    attempts++;
    _sbScanLatest();

    // Re-try attaching the observer every ~5 seconds
    if (attempts % 4 === 0) {
      const platformKey = sbGetPlatformKey();
      if (platformKey) {
        const container = sbQueryContainer(platformKey);
        if (container !== document.body) {
          _sbStartObserver(); // will stop fallback inside
        }
      }
    }
  }, 1500);
}

function _sbStopFallback() {
  if (sbState.fallbackTimer) {
    clearInterval(sbState.fallbackTimer);
    sbState.fallbackTimer = null;
  }
}

// ──────────────────────────────────────────────────────────────
// MESSAGING — bidirectional with sendResponse
// ──────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case "TOGGLE_ENABLED":
      sbState.enabled = msg.enabled;
      sendResponse({ ok: true });
      break;

    case "GET_STATE":
      sendResponse({
        detectionCount: sbState.detectionCount,
        enabled: sbState.enabled,
      });
      break;

    case "INJECT_CUSTOM_PROMPT": {
      const success = sbInjectPrompt(msg.prompt);
      sendResponse({ success });
      break;
    }

    case "TEST_CARD": {
      const demoDetection = {
        category: "opinion",
        severity: "nuclear",
        ruleIds: ["R1", "R2"]
      };
      const demoExpl = {
        summary: "The AI completely folded and changed its position when challenged, without providing factual counter-arguments.",
        reasons: ["Reversed previous stance", "High deference language", "Unconditional agreement"]
      };
      const demoConf = {
        confidence: 95,
        factors: [{name:"Keyword Match", pct:80}, {name:"Tracker Reversal", pct:100}]
      };
      if (typeof sbShowExplainabilityCard === "function") {
        sbShowExplainabilityCard(demoExpl, demoConf, demoDetection, 99);
      }
      sendResponse({ success: true });
      break;
    }

    case "GET_TRACKER_STATS": {
      sendResponse(sbGetTrackerSummary());
      break;
    }

    default:
      sendResponse({ ok: false, error: "unknown message type" });
  }

  // Return true to indicate we MAY respond asynchronously
  // (even though we respond sync above, it's good practice)
  return true;
});

// ──────────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────────
function sbInit() {
  // Load persisted state
  chrome.storage.sync.get(["enabled", "threshold", "epistemicLevel", "epistemicEnabled", "contractEnabled", "socialScorerEnabled"], (result) => {
    if (result.enabled !== undefined) sbState.enabled = result.enabled;
    if (result.threshold !== undefined) SB_CONFIG.THRESHOLD = result.threshold;
    if (result.epistemicLevel !== undefined) SB_CONFIG.EPISTEMIC_MIN_LEVEL = result.epistemicLevel;
 
    // L1 contract — default ON if not explicitly disabled
    _sbContract.enabled = result.contractEnabled !== false;

    // Load scanner settings to CONFIG
    SB_CONFIG.epistemicEnabled = result.epistemicEnabled !== false;
    SB_CONFIG.socialScorerEnabled = result.socialScorerEnabled !== false;

    // Initialize interceptor unconditionally
    sbInitInterceptor();
  });

  // Start response observation (L4 — post-response scanning)
  _sbStartObserver();

  // Start L3 conversation tracker (async — generates HMAC key)
  _sbInitSessionKey().then(() => {
    console.log("[Dissent] L3 Tracker ready (ephemeral HMAC key generated)");
  }).catch(err => {
    console.warn("[Dissent] L3 Tracker init failed:", err);
  });

  // Listen for real-time setting changes from the popup
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.epistemicLevel) {
      SB_CONFIG.EPISTEMIC_MIN_LEVEL = changes.epistemicLevel.newValue;
    }
    if (changes.epistemicEnabled) {
      SB_CONFIG.epistemicEnabled = changes.epistemicEnabled.newValue !== false;
    }
    if (changes.socialScorerEnabled) {
      SB_CONFIG.socialScorerEnabled = changes.socialScorerEnabled.newValue !== false;
    }
    if (changes.contractEnabled) {
      _sbContract.enabled = changes.contractEnabled.newValue !== false;
    }
    if (changes.threshold) {
      SB_CONFIG.THRESHOLD = changes.threshold.newValue;
    }
    if (changes.enabled !== undefined) {
      sbState.enabled = changes.enabled.newValue;
    }
  });

  // Detect SPA navigation (new chat started) — reset tracker
  _sbWatchNavigation();

  console.log("[Dissent] v3.0 initialized on", window.location.hostname);
}

// ──────────────────────────────────────────────────────────────
// SPA NAVIGATION DETECTION
// Resets tracker state when the user opens a new conversation.
// ──────────────────────────────────────────────────────────────
function _sbWatchNavigation() {
  let lastUrl = window.location.href;

  // Use a periodic check (pushState/replaceState are not directly observable)
  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log("[Dissent] Navigation detected — resetting L3 tracker");
      sbResetTracker();
      sbState.seenFingerprints.clear();
    }
  }, 1500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", sbInit);
} else {
  sbInit();
}
