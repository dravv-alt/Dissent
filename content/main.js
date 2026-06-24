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
  // ── Phase 1: Audit Layer turn counter ──
  turnIndex: 0,
  // ── Platform Health Monitor state ──
  healthCheckTimer: null,
  consecutiveFailures: 0,
  isDegraded: false,
  lastHealthStrategy: null,
  lastHealthConfidence: null,
  // ── Phase 4: Turn-level text buffer ──
  // Accumulates {speaker, text, id, turnIndex} entries for
  // Martingale/Drift which need per-turn user+AI text (not claim nodes).
  _turnTexts: [],
};

// How many consecutive health check failures before we emit PLATFORM_DEGRADED
const _SB_HEALTH_FAILURE_THRESHOLD = 3;
// Health check interval (ms)
const _SB_HEALTH_CHECK_INTERVAL_MS = 30000;

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
  const fp = text.slice(0, 500); // 500 chars to avoid collision on shared preambles
  if (sbState.seenFingerprints.has(fp)) return;
  sbState.seenFingerprints.add(fp);

  if (sbState.seenFingerprints.size > SB_CONFIG.CACHE_SIZE) {
    const first = sbState.seenFingerprints.values().next().value;
    sbState.seenFingerprints.delete(first);
  }

  // ── Phase 1: Claim extraction + graph update ────────────────
  const currentTurnIndex = sbState.turnIndex++;
  if (typeof sbExtractClaims === "function") {
    try {
      const claims = sbExtractClaims(text, currentTurnIndex);
      const prevNodeIds = sbGetNodesByTurn(currentTurnIndex - 1);

      for (const claim of claims) {
        sbAddClaimNode(claim, false);

        // Log claim extraction event
        if (typeof sbLogEvent === "function") {
          sbLogEvent("claim_extracted", "claim-extractor", currentTurnIndex, {
            claimId: claim.id,
            claimText: claim.claimText,
            hasSVO: !!claim.svoTuple,
          });
        }

        // Infer and add edges from previous turn's first claim
        if (prevNodeIds.length > 0 && claim.claimIndex === 0) {
          const prevFirstNode = sbGetNode(prevNodeIds[0]);
          if (prevFirstNode) {
            const edgeType = sbInferEdgeType(
              prevFirstNode.node.claimText,
              claim.claimText
            );
            sbAddEdge(prevNodeIds[0], claim.id, edgeType);
          }
        }
      }
    } catch (err) {
      console.warn("[Dissent] Claim extraction error:", err);
    }
  }

  // ── Phase 4 prep: Accumulate turn-level text ────────────────
  // Martingale/Drift need per-turn {speaker, text} entries,
  // not individual claim nodes. Build that here.
  if (userText) {
    sbState._turnTexts.push({
      id: `user_turn_${currentTurnIndex}`,
      speaker: "User",
      text: userText,
      turnIndex: currentTurnIndex,
    });
  }
  sbState._turnTexts.push({
    id: `ai_turn_${currentTurnIndex}`,
    speaker: "AI",
    text: text,
    turnIndex: currentTurnIndex,
  });

  // ── Debounce ─────────────────────────────────────────────────
  const now = Date.now();
  if (now - sbState.lastToastTime < SB_CONFIG.DEBOUNCE_MS) return;

  // ── Step 1: Collect L4 + L6 evidence (sync) ─────────────────
  const collectResult = sbCollectEvidence(text, userText || "");

  // ── Step 2: L3 tracker (async) — fire and merge ──────────────
  sbRecordTurn(userText || "", text).then(trackerResult => {
    const merged = sbMergeTrackerEvidence(collectResult, trackerResult);
    _sbRunEEEPipeline(el, text, userText, merged.evidence, merged, currentTurnIndex);
  }).catch(err => {
    console.warn("[Dissent] Tracker error:", err);
    _sbRunEEEPipeline(el, text, userText, collectResult.evidence, collectResult, currentTurnIndex);
  });
}

// ── Core EEE pipeline — called after tracker resolves ─────────
function _sbRunEEEPipeline(el, text, userText, evidenceArray, mergedResult, turnIndex) {
  // NEW: Run Phase 3 annotations
  if (typeof sbRunAnnotations === "function" && typeof sbGetNodesByTurn === "function") {
    try {
      const nodeIds = sbGetNodesByTurn(turnIndex);
      const prevNodeIds = turnIndex > 0 ? sbGetNodesByTurn(turnIndex - 1) : [];
      sbRunAnnotations({
        turnIndex: turnIndex,
        userText: userText || "",
        aiText: text,
        nodeIds: nodeIds,
        prevNodeIds: prevNodeIds.length > 0 ? prevNodeIds : null,
        trackerResult: mergedResult, // the tracker result or merged object
        evidence: evidenceArray,
        isHistorical: false,
      });
    } catch (e) {
      console.warn("[Dissent] Annotations error:", e);
    }
  }

  // NEW: Run Phase 4 Quantitative Metrics
  // Uses the turn-text buffer (not claim nodes) — Martingale/Drift
  // need per-turn {speaker, text} entries to function correctly.
  if (typeof sbAnnotateNode === "function" && sbState._turnTexts.length >= 4) {
    try {
      if (typeof sbComputeMartingale === "function") {
        const mgAnn = sbComputeMartingale(sbState._turnTexts);
        if (mgAnn && mgAnn.rootNodeId) {
          // Annotate the corresponding claim node if it exists
          const nodeIds = sbGetNodesByTurn(mgAnn.rootNodeId.turnIndex || 0);
          if (nodeIds.length > 0) {
            sbAnnotateNode(nodeIds[0], "martingale_drift", mgAnn);
          }
        }
      }

      if (typeof sbComputeDrift === "function") {
        const driftAnn = sbComputeDrift(sbState._turnTexts);
        if (driftAnn && driftAnn.latestTurnId) {
          // Annotate the corresponding claim node if it exists
          const nodeIds = sbGetNodesByTurn(turnIndex);
          if (nodeIds.length > 0) {
            sbAnnotateNode(nodeIds[0], "vocabulary_drift", driftAnn);
          }
        }
      }
    } catch (e) {
      console.warn("[Dissent] Phase 4 metrics error:", e);
    }
  }

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

  sbSendMessageLimited({
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
// MESSAGE THROTTLING
// ──────────────────────────────────────────────────────────────
let _sbLastMessageTimes = {};
function sbSendMessageLimited(payload) {
  const now = Date.now();
  const type = payload.type;
  if (!_sbLastMessageTimes[type] || now - _sbLastMessageTimes[type] > 500) {
    _sbLastMessageTimes[type] = now;
    try {
      chrome.runtime.sendMessage(payload);
    } catch (e) {
      console.warn("[Dissent] sendMessage failed:", e);
    }
  }
}


// ──────────────────────────────────────────────────────────────
// USER MESSAGE SELECTORS (shared between last-message and
// all-messages helpers)
// ──────────────────────────────────────────────────────────────
const _SB_USER_SELECTORS = {
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

// ──────────────────────────────────────────────────────────────
// EXTRACT LAST USER MESSAGE
// Grabs the most recent user turn from the chat DOM.
// ──────────────────────────────────────────────────────────────
function _sbGetLastUserMessage(platformKey) {
  const selectors = _SB_USER_SELECTORS[platformKey] || [];
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
// EXTRACT ALL USER MESSAGES (Phase 1B)
// Returns all user messages from the DOM in order.
// ──────────────────────────────────────────────────────────────
function _sbGetAllUserMessages(platformKey) {
  const selectors = _SB_USER_SELECTORS[platformKey] || [];
  for (const sel of selectors) {
    try {
      const msgs = document.querySelectorAll(sel);
      if (msgs.length > 0) {
        return Array.from(msgs).map(
          el => (el.innerText || el.textContent || "").trim()
        );
      }
    } catch (_) { /* try next */ }
  }
  return [];
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
// RETROACTIVE DOM INGESTION — COLD START PROTOCOL (Phase 1B)
//
// When Dissent loads on a page with an existing conversation,
// scrape the full history from the DOM, extract claims, run
// lightweight detection, and populate the audit graph BEFORE
// the MutationObserver starts live monitoring.
//
// Processing uses requestIdleCallback (with setTimeout fallback)
// in batches of 10 turns to prevent UI freezing.
// ──────────────────────────────────────────────────────────────

// Chunk size for batched processing
const _SB_INGESTION_CHUNK_SIZE = 10;

// Number of turns used for baseline establishment
const _SB_BASELINE_TURN_COUNT = 3;

/**
 * Main ingestion entry point. Called in sbInit() before _sbStartObserver().
 * Returns a Promise that resolves when ingestion is complete.
 */
function sbIngestExistingConversation() {
  return new Promise((resolve) => {
    const platformKey = sbGetPlatformKey();
    if (!platformKey) {
      resolve();
      return;
    }

    // Step 1: Scrape all AI responses and user messages from the DOM
    const aiElements = sbQueryResponses(platformKey);
    const userTexts  = _sbGetAllUserMessages(platformKey);

    if (aiElements.length === 0) {
      console.log("[Dissent] Retroactive ingestion: no existing conversation found");
      resolve();
      return;
    }

    // Step 2: Pair into turn objects
    const turns = [];
    for (let i = 0; i < aiElements.length; i++) {
      const aiText = (aiElements[i].innerText || aiElements[i].textContent || "").trim();
      const userText = i < userTexts.length ? userTexts[i] : "";
      turns.push({ turnIndex: i, userText, aiText });
    }

    console.log(`[Dissent] Retroactive ingestion: ${turns.length} historical turns found`);

    // Log the ingestion start event
    if (typeof sbLogEvent === "function") {
      sbLogEvent("history_ingestion_started", "retroactive-ingestion", 0, {
        turnCount: turns.length,
        platform: platformKey,
      }, true);
    }

    // Step 3: Chunked processing
    const scheduleChunk = typeof requestIdleCallback === "function"
      ? (fn) => requestIdleCallback(fn)
      : (fn) => setTimeout(fn, 0);

    function processChunk(startIdx) {
      const end = Math.min(startIdx + _SB_INGESTION_CHUNK_SIZE, turns.length);

      for (let i = startIdx; i < end; i++) {
        const turn = turns[i];
        if (!turn.aiText || turn.aiText.length < 20) continue;

        // Extract claims and add to graph as historical nodes
        if (typeof sbExtractClaims === "function") {
          const claims = sbExtractClaims(turn.aiText, turn.turnIndex);
          const prevNodeIds = turn.turnIndex > 0
            ? sbGetNodesByTurn(turn.turnIndex - 1)
            : [];

          for (const claim of claims) {
            sbAddClaimNode(claim, true); // isHistorical = true

            // Log extraction event
            if (typeof sbLogEvent === "function") {
              sbLogEvent("claim_extracted", "retroactive-ingestion", turn.turnIndex, {
                claimId: claim.id,
                claimText: claim.claimText,
                hasSVO: !!claim.svoTuple,
              }, true);
            }

            // Edge from previous turn's first claim
            if (prevNodeIds.length > 0 && claim.claimIndex === 0) {
              const prevNode = sbGetNode(prevNodeIds[0]);
              if (prevNode) {
                const edgeType = sbInferEdgeType(
                  prevNode.node.claimText,
                  claim.claimText
                );
                sbAddEdge(prevNodeIds[0], claim.id, edgeType);
              }
            }
          }
        }

        // Run lightweight L4 detection on historical turns (silent — no UI)
        if (typeof sbCollectEvidence === "function") {
          try {
            const result = sbCollectEvidence(turn.aiText, turn.userText);
            if (result.evidence && result.evidence.length > 0) {
              const nodeIds = sbGetNodesByTurn(turn.turnIndex);
              for (const ev of result.evidence) {
                // Annotate the first node of this turn
                if (nodeIds.length > 0) {
                  sbAnnotateNode(nodeIds[0], ev.ruleId || ev.category, ev);
                }
              }

              // Log detection event
              if (typeof sbLogEvent === "function") {
                sbLogEvent("sycophancy_detected", "retroactive-ingestion", turn.turnIndex, {
                  evidenceCount: result.evidence.length,
                  ruleIds: result.evidence.map(e => e.ruleId).filter(Boolean),
                }, true);
              }
            }
          } catch (err) {
            // Silently skip detection errors on historical turns
          }
        }
      }

      // Advance the turn counter to avoid collisions with live monitoring
      sbState.turnIndex = end;

      if (end < turns.length) {
        // More chunks to process
        scheduleChunk(() => processChunk(end));
      } else {
        // All chunks done — establish baseline
        _sbEstablishBaseline(turns);

        // Log completion
        if (typeof sbLogEvent === "function") {
          sbLogEvent("history_ingested", "retroactive-ingestion", 0, {
            turnCount: turns.length,
            nodeCount: typeof sbGetGraph === "function" ? sbGetGraph().nodeCount : 0,
          }, true);
        }

        console.log(
          `[Dissent] Retroactive ingestion complete: ${turns.length} turns processed,`,
          `${typeof sbGetGraph === "function" ? sbGetGraph().nodeCount : 0} graph nodes`
        );

        resolve();
      }
    }

    // Start processing
    if (turns.length <= _SB_INGESTION_CHUNK_SIZE) {
      // Small conversation — process synchronously for speed
      processChunk(0);
    } else {
      // Large conversation — use chunked scheduling
      scheduleChunk(() => processChunk(0));
    }
  });
}


// ──────────────────────────────────────────────────────────────
// BASELINE ESTABLISHMENT (Phase 1B)
//
// Analyzes the first 3 turns to establish the conversation's
// "ground truth" reasoning baseline.
//
// User Baseline: certainty levels, presupposition triggers,
//                emotional tone from sbScanEpistemic()
// AI Baseline:   sycophancy score from sbCollectEvidence(),
//                hedge density, whether it challenged user framing
// Compromised:   if AI already scores >= THRESHOLD on turn 0
//                with presupposition adoption or immediate
//                unchallenged agreement
// ──────────────────────────────────────────────────────────────

function _sbEstablishBaseline(turns) {
  if (!turns || turns.length === 0) {
    sbSetBaseline({
      userBaseline: null,
      aiBaseline: null,
      delta: null,
      compromised: false,
      compromisedTurnIndex: null,
      compromisedTypes: [],
    });
    return;
  }

  const baselineTurns = turns.slice(0, _SB_BASELINE_TURN_COUNT);

  // ── User Baseline ──
  const userAnalysis = [];
  for (const turn of baselineTurns) {
    const entry = { turnIndex: turn.turnIndex, certainty: null, label: null };
    if (turn.userText && typeof sbScanEpistemic === "function") {
      const ep = sbScanEpistemic(turn.userText);
      if (ep.detected) {
        entry.certainty = ep.certainty;
        entry.label = ep.label;
      }
    }
    userAnalysis.push(entry);
  }

  // ── AI Baseline ──
  const aiAnalysis = [];
  let compromised = false;
  let compromisedTurnIndex = null;
  const compromisedTypes = [];

  for (const turn of baselineTurns) {
    const entry = {
      turnIndex: turn.turnIndex,
      sycophancyScore: 0,
      evidenceCount: 0,
      ruleIds: [],
    };

    if (turn.aiText && typeof sbCollectEvidence === "function") {
      try {
        const result = sbCollectEvidence(turn.aiText, turn.userText || "");
        if (result.evidence) {
          entry.evidenceCount = result.evidence.length;
          entry.ruleIds = result.evidence.map(e => e.ruleId).filter(Boolean);
          entry.sycophancyScore = result.evidence.reduce(
            (sum, e) => sum + (e.weight || 0), 0
          );
        }
      } catch (_) { /* skip detection errors */ }
    }

    aiAnalysis.push(entry);

    // Check for compromised baseline:
    // If any of the first 3 AI turns score >= THRESHOLD, flag it
    const threshold = (typeof SB_CONFIG !== "undefined" && SB_CONFIG.THRESHOLD)
      ? SB_CONFIG.THRESHOLD
      : 3;
    if (entry.sycophancyScore >= threshold && !compromised) {
      compromised = true;
      compromisedTurnIndex = turn.turnIndex;
      compromisedTypes.push(...entry.ruleIds);
    }
  }

  // ── The Delta ──
  const userHasPresuppositions = userAnalysis.some(
    u => u.certainty === "high" || u.certainty === "absolute"
  );
  const aiUnchallenged = aiAnalysis.some(
    a => a.sycophancyScore > 0 && a.evidenceCount > 0
  );

  // Strengthen the compromised flag if user has presuppositions AND AI didn't challenge
  if (userHasPresuppositions && aiUnchallenged && !compromised) {
    compromised = true;
    compromisedTurnIndex = aiAnalysis.find(a => a.sycophancyScore > 0)?.turnIndex ?? 0;
    compromisedTypes.push("presupposition_adopted");
  }

  const baseline = {
    userBaseline: userAnalysis,
    aiBaseline: aiAnalysis,
    delta: {
      userHasPresuppositions,
      aiUnchallenged,
    },
    compromised,
    compromisedTurnIndex,
    compromisedTypes: [...new Set(compromisedTypes)], // deduplicate
  };

  sbSetBaseline(baseline);

  // Annotate compromised root nodes
  if (compromised && compromisedTurnIndex !== null) {
    const rootNodeIds = sbGetNodesByTurn(compromisedTurnIndex);
    for (const nodeId of rootNodeIds) {
      sbAnnotateNode(nodeId, "compromised_baseline", {
        compromised_baseline: true,
        sycophancyTypes: baseline.compromisedTypes,
        originTurn: compromisedTurnIndex,
      });
    }

    // Log compromised baseline event
    if (typeof sbLogEvent === "function") {
      sbLogEvent("compromised_baseline", "retroactive-ingestion", compromisedTurnIndex, {
        sycophancyTypes: baseline.compromisedTypes,
        originTurn: compromisedTurnIndex,
      }, true);
    }

    console.warn(
      `[Dissent] Compromised baseline detected at turn ${compromisedTurnIndex}:`,
      baseline.compromisedTypes.join(", ")
    );
  } else {
    // Log clean baseline
    if (typeof sbLogEvent === "function") {
      sbLogEvent("baseline_established", "retroactive-ingestion", 0, {
        compromised: false,
        turnsAnalyzed: baselineTurns.length,
      }, true);
    }

    console.log(`[Dissent] Clean baseline established from ${baselineTurns.length} turns`);
  }
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

    case "GET_TRACKER_STATS":
      sendResponse(sbGetTrackerSummary());
      break;

    case "GET_PLATFORM_HEALTH": {
      const lastRes = (typeof sbGetLastResolution === "function")
        ? sbGetLastResolution("responses") : null;
      const cacheStats = (typeof _sbGetCacheStats === "function")
        ? _sbGetCacheStats() : null;
      sendResponse({
        isDegraded:          sbState.isDegraded,
        consecutiveFailures: sbState.consecutiveFailures,
        strategy:            lastRes?.strategy  || sbState.lastHealthStrategy || "unknown",
        confidence:          lastRes?.confidence ?? sbState.lastHealthConfidence ?? null,
        selector:            lastRes?.selector  || "",
        cacheStats:          cacheStats,
      });
      break;
    }

    case "GET_AUDIT_TIMELINE":
      sendResponse(typeof sbGetTimeline === "function" ? sbGetTimeline(msg.limit || 20) : []);
      break;

    case "GET_AUDIT_BASELINE":
      sendResponse(typeof sbGetBaseline === "function" ? sbGetBaseline() : null);
      break;

    case "GET_AUDIT_GRAPH":
      sendResponse(typeof sbGetGraph === "function" ? sbGetGraph() : { nodes: {}, nodeCount: 0, edgeCount: 0 });
      break;

    case "SHOW_AUDIT_TIMELINE":
      if (typeof sbShowExplainabilityCard === "function") {
        const card = sbShowExplainabilityCard(
          { summary: "Audit Timeline Viewer", reasons: [], counterPromptContext: "opinion" }, 
          null, 
          { severity: "low", category: "audit" }, 
          null
        );
        // Force open the timeline
        setTimeout(() => {
          if (card) {
            const toggle = card.querySelector('.sb-timeline-toggle');
            if (toggle) toggle.click();
          }
        }, 50);
      }
      sendResponse({ ok: true });
      break;

    case "SHOW_AUDIT_GRAPH":
      if (typeof sbRenderNarrativeGraph === "function" && typeof sbGetGraph === "function") {
        sbRenderNarrativeGraph(sbGetGraph());
      }
      sendResponse({ ok: true });
      break;

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
  chrome.storage.sync.get(["enabled", "threshold", "epistemicLevel", "epistemicEnabled", "contractEnabled", "socialScorerEnabled", "auditPersistence"], (result) => {
    if (result.enabled !== undefined) sbState.enabled = result.enabled;
    if (result.threshold !== undefined) SB_CONFIG.THRESHOLD = result.threshold;
    if (result.epistemicLevel !== undefined) SB_CONFIG.EPISTEMIC_MIN_LEVEL = result.epistemicLevel;
 
    // L1 contract — default ON if not explicitly disabled
    _sbContract.enabled = result.contractEnabled !== false;

    // Load scanner settings to CONFIG
    SB_CONFIG.epistemicEnabled = result.epistemicEnabled !== false;
    SB_CONFIG.socialScorerEnabled = result.socialScorerEnabled !== false;
    SB_CONFIG.auditPersistence = result.auditPersistence === true;

    // Initialize interceptor unconditionally
    sbInitInterceptor();

    // Restore graph from cache, or ingest retroactively
    if (typeof sbRestoreGraph === "function") {
      sbRestoreGraph().then(restored => {
        if (restored) {
          console.log("[Dissent] Phase 6: Graph restored from session storage. Skipping retroactive ingestion.");
          
          // Recompute turn index based on restored graph
          if (typeof sbGetGraph === "function") {
             const graph = sbGetGraph();
             if (graph.nodes) {
               let maxTurn = 0;
               for (const node of Object.values(graph.nodes)) {
                 if (node.node && node.node.turnIndex > maxTurn) maxTurn = node.node.turnIndex;
               }
               sbState.turnIndex = maxTurn + 1;
             }
          }

          _sbStartObserver();
        } else {
          _runRetroactiveIngestion();
        }
      });
    } else {
      _runRetroactiveIngestion();
    }
  });

  function _runRetroactiveIngestion() {
    // Phase 1B: Retroactive DOM Ingestion — scrape existing conversation
    // history BEFORE starting the live observer.
    sbIngestExistingConversation().then(() => {
      _sbStartObserver();
    }).catch(err => {
      console.warn("[Dissent] Retroactive ingestion failed:", err);
      // Fall through — start observer anyway so live monitoring works
      _sbStartObserver();
    });
  }

  // Start L3 conversation tracker (async — generates HMAC key)
  _sbInitSessionKey().then(() => {
    console.log("[Dissent] L3 Tracker ready (ephemeral HMAC key generated)");
  }).catch(err => {
    console.warn("[Dissent] L3 Tracker init failed:", err);
  });

  // Start platform health monitor
  _sbStartHealthMonitor();

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
    if (changes.auditPersistence) {
      SB_CONFIG.auditPersistence = changes.auditPersistence.newValue === true;
      if (SB_CONFIG.auditPersistence && typeof sbPersistGraph === "function") {
        sbPersistGraph();
      }
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

  console.log("[Dissent] v3.1 initialized on", window.location.hostname);
}

// ──────────────────────────────────────────────────────────────
// SPA NAVIGATION DETECTION
// Resets tracker state when the user opens a new conversation.
// ──────────────────────────────────────────────────────────────
function _sbWatchNavigation() {
  let lastUrl = window.location.href;

  const handleNavigation = () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log("[Dissent] Navigation detected — resetting L3 tracker + audit layer + selector cache");
      sbResetTracker();
      sbState.seenFingerprints.clear();
      sbState.turnIndex = 0;
      sbState._turnTexts = []; // Reset Phase 4 turn buffer

      // Reset Phase 1 Audit Layer state
      if (typeof sbResetGraph === "function") sbResetGraph();
      if (typeof sbResetLedger === "function") sbResetLedger();

      // Reset Phase 4 drift state (KL divergence velocity)
      if (typeof sbResetDriftState === "function") sbResetDriftState();

      // Phase 1B: Re-trigger retroactive ingestion for the new conversation
      sbIngestExistingConversation().catch(err => {
        console.warn("[Dissent] Post-navigation ingestion failed:", err);
      });

      // Invalidate selector cache on SPA navigation
      if (typeof _sbInvalidateCache === "function") {
        _sbInvalidateCache();
      }

      // Reset health monitor state
      sbState.consecutiveFailures = 0;
      if (sbState.isDegraded) {
        sbState.isDegraded = false;
        sbSendMessageLimited({ type: "PLATFORM_RECOVERED" });
      }
    }
  };

  // Intercept pushState and replaceState
  const originalPushState = history.pushState;
  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    setTimeout(handleNavigation, 0);
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    setTimeout(handleNavigation, 0);
  };

  window.addEventListener("popstate", handleNavigation);
}

// ──────────────────────────────────────────────────────────────
// PLATFORM HEALTH MONITOR
// Runs every 30 seconds. Verifies selector resolution works.
// After 3 consecutive failures (90s), emits PLATFORM_DEGRADED.
// Recovers automatically when a detection succeeds.
// ──────────────────────────────────────────────────────────────

function _sbStartHealthMonitor() {
  if (sbState.healthCheckTimer) return;

  sbState.healthCheckTimer = setInterval(() => {
    if (!sbState.enabled) return;

    const platformKey = sbGetPlatformKey();
    if (!platformKey) return;

    // Try to resolve responses — this is the critical path
    const resolution = (typeof sbResolveResponses === "function")
      ? sbResolveResponses(platformKey)
      : { elements: [], strategy: "none", confidence: 0 };

    // Store the latest strategy/confidence for diagnostics
    sbState.lastHealthStrategy = resolution.strategy;
    sbState.lastHealthConfidence = resolution.confidence;

    // If we found elements OR the page genuinely has no AI responses
    // (e.g., empty conversation), that's fine.
    if (resolution.elements.length > 0) {
      // Selectors are working
      if (sbState.consecutiveFailures > 0) {
        sbState.consecutiveFailures = 0;
      }
      if (sbState.isDegraded) {
        sbState.isDegraded = false;
        console.log("[Dissent] Platform health recovered — selectors working");
        sbSendMessageLimited({ type: "PLATFORM_RECOVERED" });
      }
      return;
    }

    // No elements found — but is the page actually showing AI responses?
    // Check if there's any substantial text on the page (heuristic)
    const pageText = (document.body.innerText || "").trim();
    if (pageText.length < 200) {
      // Page is likely empty or loading — don't count as failure
      return;
    }

    // Genuine failure: page has content but selectors found nothing
    sbState.consecutiveFailures++;

    if (sbState.consecutiveFailures >= _SB_HEALTH_FAILURE_THRESHOLD && !sbState.isDegraded) {
      sbState.isDegraded = true;
      console.warn(
        `[Dissent] Platform degraded — ${sbState.consecutiveFailures} consecutive selector failures`
      );
      sbSendMessageLimited({
        type: "PLATFORM_DEGRADED",
        failures: sbState.consecutiveFailures,
        platform: platformKey,
      });
    }
  }, _SB_HEALTH_CHECK_INTERVAL_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", sbInit);
} else {
  sbInit();
}
