// ============================================================
// Dissent — Evidence Collector (Component 4)
// content/evidence.js
//
// THE FRONT DOOR: One function to run all synchronous detectors
// and return every piece of evidence as a single flat array.
//
// This file grows across multiple components:
//   Component 4: sbCollectEvidence(), sbMergeTrackerEvidence()
//   Component 5: sbBuildDetection()
//   Component 6: sbGenerateExplanation()
//   Component 7: sbCalculateConfidence()
//
// IMPORTANT — WHY L3 IS HANDLED SEPARATELY:
//   The tracker (tracker.js) uses the Web Crypto API (HMAC-SHA256)
//   which is inherently async. It cannot run inside a synchronous
//   function. Instead, the caller calls sbCollectEvidence() for
//   sync evidence, then awaits sbRecordTurn() for L3 evidence,
//   then calls sbMergeTrackerEvidence() to produce the final set.
// ============================================================

// ──────────────────────────────────────────────────────────────
// sbCollectEvidence(responseText, userText)
//
// Runs all SYNCHRONOUS detectors:
//   - L4: sbAnalyzeText()   — pattern-based regex scanning
//   - L6: sbAnalyzeSocialValidation() — social conflict detection
//         (only if socialScorerEnabled is not explicitly false)
//
// Returns:
//   {
//     evidence: [],          // flat array of all evidence objects
//     l4Result: { ... },     // raw L4 return (score, matches, etc.)
//     l6Result: { ... },     // raw L6 return (score, matches, etc.)
//   }
//
// Why return l4Result and l6Result too?
//   The existing pipeline reads score, matches, dominantType from
//   detector results. Keeping those available here means nothing
//   in the current pipeline breaks — callers can still use them.
// ──────────────────────────────────────────────────────────────

function sbCollectEvidence(responseText, userText) {
  // Guard: nothing to scan
  if (!responseText || typeof responseText !== "string") {
    return { evidence: [], l4Result: null, l6Result: null };
  }
  const safeUserText = (typeof userText === "string") ? userText : "";

  const evidence = [];

  // ── L4: Pattern-based response scanner ───────────────────────
  // Scans the AI response for regex pattern matches.
  // Every matched pattern produces one evidence object.
  let l4Result = null;
  if (typeof sbAnalyzeText === "function") {
    l4Result = sbAnalyzeText(responseText, safeUserText);
    if (Array.isArray(l4Result.evidence)) {
      evidence.push(...l4Result.evidence);
    }
  }

  // ── L6: Social validation scanner ────────────────────────────
  // Scans userText for conflict framing, then checks whether the
  // AI response validates the user one-sidedly.
  // Gated by the same flag that gates it in main.js.
  let l6Result = null;
  const socialEnabled = (typeof SB_CONFIG === "undefined")
    ? true
    : SB_CONFIG.socialScorerEnabled !== false;

  if (socialEnabled && typeof sbAnalyzeSocialValidation === "function") {
    l6Result = sbAnalyzeSocialValidation(safeUserText, responseText);
    if (Array.isArray(l6Result.evidence)) {
      evidence.push(...l6Result.evidence);
    }
  }

  return { evidence, l4Result, l6Result };
}

// ──────────────────────────────────────────────────────────────
// sbMergeTrackerEvidence(collectResult, trackerResult)
//
// Merges L3 (tracker) evidence into the result from
// sbCollectEvidence(). Called after await sbRecordTurn() resolves.
//
// Arguments:
//   collectResult  — the object returned by sbCollectEvidence()
//   trackerResult  — the object returned by sbRecordTurn()
//
// Returns:
//   The same collectResult with:
//   - evidence[] extended with tracker evidence objects
//   - l3Result field added (raw tracker return)
//
// Why a separate merge function instead of one async collector?
//   The existing _sbProcessResponse() in main.js calls
//   sbRecordTurn() separately and already awaits it. The merge
//   function lets us bolt onto that existing async boundary
//   without rewriting main.js in this component (that's C10).
// ──────────────────────────────────────────────────────────────

function sbMergeTrackerEvidence(collectResult, trackerResult) {
  if (!collectResult || typeof collectResult !== "object") {
    return { evidence: [], l4Result: null, l6Result: null, l3Result: null };
  }

  const merged = {
    evidence:  [...(collectResult.evidence || [])],
    l4Result:  collectResult.l4Result  || null,
    l6Result:  collectResult.l6Result  || null,
    l3Result:  trackerResult           || null,
  };

  // Append tracker evidence if any was produced
  if (trackerResult && Array.isArray(trackerResult.evidence)) {
    merged.evidence.push(...trackerResult.evidence);
  }

  return merged;
}

// ──────────────────────────────────────────────────────────────
// sbBuildDetection(evidenceArray)
//
// Component 5: Detection Builder
// Consumes a flat array of evidence objects and produces a
// structured detection object representing the overall finding.
//
// Arguments:
//   evidenceArray - Array of evidence objects from sbCollectEvidence
//
// Returns:
//   null if no evidence.
//   Otherwise:
//   {
//     category: "opinion", // The dominant category by weight
//     severity: "high",    // The highest severity across all evidence
//     evidence: [...],     // All valid evidence objects
//     ruleIds: [...]       // Array of unique rule IDs triggered
//   }
// ──────────────────────────────────────────────────────────────

function sbBuildDetection(evidenceArray) {
  if (!evidenceArray || !Array.isArray(evidenceArray) || evidenceArray.length === 0) {
    return null;
  }

  const categoryScores = {};
  let maxSeverityRank = 0;
  let overallSeverity = "low";
  const ruleIds = new Set();
  const validEvidence = [];

  const SEVERITY_RANK = { low: 1, medium: 2, high: 3, nuclear: 4 };

  for (const ev of evidenceArray) {
    // Fast-fail invalid evidence, though sbCollectEvidence should only produce valid ones
    if (!ev || typeof ev.ruleId !== "string" || typeof ev.category !== "string") continue;
    
    validEvidence.push(ev);

    // 1. Group by category / score accumulation
    if (!categoryScores[ev.category]) categoryScores[ev.category] = 0;
    categoryScores[ev.category] += (ev.weight || 1);

    // 2. Track rule IDs
    ruleIds.add(ev.ruleId);

    // 3. Determine highest severity
    let currentSev = ev.severity || "low";
    
    // Special promotion: 'nuclear' is a detection severity in tracker, 
    // even though the rule's intrinsic severity is 'high'
    if (ev.ruleId === "position_reversal_after_challenge") {
      currentSev = "nuclear";
    }

    const rank = SEVERITY_RANK[currentSev] || 1;
    if (rank > maxSeverityRank) {
      maxSeverityRank = rank;
      overallSeverity = currentSev;
    }
  }

  if (validEvidence.length === 0) {
    return null;
  }

  // Find dominant category (highest accumulated weight)
  let dominantCategory = "opinion"; // fallback
  let maxScore = -1;
  for (const [cat, score] of Object.entries(categoryScores)) {
    if (score > maxScore) {
      maxScore = score;
      dominantCategory = cat;
    }
  }

  return {
    category: dominantCategory,
    severity: overallSeverity,
    evidence: validEvidence,
    ruleIds: Array.from(ruleIds),
  };
}

// ──────────────────────────────────────────────────────────────
// sbGenerateExplanation(detection)
//
// Component 6: Explanation Generator
// Consumes the detection object from sbBuildDetection() and
// produces a plain-language explanation of WHY the AI was flagged.
//
// Arguments:
//   detection — object returned by sbBuildDetection(). Must have
//               { category, severity, evidence[], ruleIds[] }
//
// Returns:
//   null if detection is invalid.
//   Otherwise:
//   {
//     summary:             string  — one headline sentence
//     reasons:             string[] — one phrase per triggered rule
//     evidenceDescriptions: string[] — deeper "why it matters"
//     counterPromptContext: string  — the category key, fed to
//                                     sbGetCounterPrompt() later
//     leadEvidence:        Object  — the highest-weight evidence
//                                     object for highlighting
//   }
//
// KEY DESIGN RULE: Every string in the output is sourced from
// evidence[n].explanation / evidence[n].reasoning — never from
// hardcoded strings here. This keeps explanations specific to
// the ACTUAL matched text, not generic category descriptions.
// ──────────────────────────────────────────────────────────────

// Category-level headline templates.
// These are the ONLY hardcoded strings in this function.
// They act as sentence WRAPPERS around the evidence-derived content.
// They never describe the specific rule — that comes from evidence.
const _SB_EXPLANATION_HEADLINES = {
  opinion:           "The AI validated your view rather than evaluating it.",
  mistake_admission: "The AI reversed its position after you pushed back.",
  mimicry:           "The AI adopted your framing without independently verifying it.",
  feedback:          "The AI provided inflated or uncritical praise for your work.",
  position_change:   "The AI changed its stated position after you challenged it.",
  social_validation: "The AI took your side in a conflict based only on your account.",
};

function sbGenerateExplanation(detection) {
  if (
    !detection ||
    typeof detection !== "object" ||
    !Array.isArray(detection.evidence) ||
    detection.evidence.length === 0
  ) {
    return null;
  }

  const { category, severity, evidence } = detection;

  // ── 1. Summary — headline sentence for this category ─────────
  const summary = _SB_EXPLANATION_HEADLINES[category]
    || "The AI showed signs of sycophantic behavior.";

  // ── 2. Reasons — one short phrase per unique rule triggered ──
  // Sourced directly from evidence[n].explanation (the "what")
  // De-duplicated by ruleId so the same rule isn't repeated.
  const seenRuleIds = new Set();
  const reasons = [];
  for (const ev of evidence) {
    if (!ev || !ev.ruleId || seenRuleIds.has(ev.ruleId)) continue;
    seenRuleIds.add(ev.ruleId);
    if (ev.explanation) {
      reasons.push(ev.explanation);
    }
  }

  // ── 3. Evidence Descriptions — "why it matters" ──────────────
  // Sourced from evidence[n].reasoning (the "why")
  // Same de-duplication by ruleId.
  const seenRuleIds2 = new Set();
  const evidenceDescriptions = [];
  for (const ev of evidence) {
    if (!ev || !ev.ruleId || seenRuleIds2.has(ev.ruleId)) continue;
    seenRuleIds2.add(ev.ruleId);
    if (ev.reasoning) {
      evidenceDescriptions.push(ev.reasoning);
    }
  }

  // ── 4. Counter-prompt context ─────────────────────────────────
  // Maps directly to the keys in SB_PROMPTS in constants.js.
  // sbGetCounterPrompt(severity, counterPromptContext) can be
  // called immediately using this value.
  const counterPromptContext = category;

  // ── 5. Lead evidence — the single most important piece ───────
  // Chosen by highest weight; if equal, prefer textual over behavioral
  // (behavioral evidence has no matchedText to highlight).
  let leadEvidence = null;
  for (const ev of evidence) {
    if (!ev) continue;
    if (!leadEvidence) { leadEvidence = ev; continue; }
    const evWeight = ev.weight || 0;
    const leadWeight = leadEvidence.weight || 0;
    if (evWeight > leadWeight) {
      leadEvidence = ev;
    } else if (evWeight === leadWeight && ev.evidenceType === "textual" && leadEvidence.evidenceType !== "textual") {
      leadEvidence = ev;
    }
  }

  return {
    summary,
    reasons,
    evidenceDescriptions,
    counterPromptContext,
    leadEvidence,
  };
}

// ──────────────────────────────────────────────────────────────
// sbCalculateConfidence(evidence[], detection)
//
// Component 7: Confidence Engine
// Replaces the legacy `sbBuildDetectionMeta()` formula:
//   confidenceBase + min(score, 6) * 0.04
// with an evidence-backed calculation from 4 transparent factors.
//
// Arguments:
//   evidenceArray — the flat array from sbCollectEvidence/sbMergeTrackerEvidence
//   detection     — the object from sbBuildDetection()
//
// Returns:
//   null if no valid inputs.
//   Otherwise:
//   {
//     confidence: 0.87,        // final value, capped [0.05, 0.98]
//     factors: [
//       { name: "Base calibration", value: "opinion", contribution: 0.72 },
//       { name: "Severity weight",  value: "high",    contribution: 0.10 },
//       { name: "Evidence count",   value: 4,         contribution: 0.08 },
//       { name: "Category diversity", value: 2,       contribution: 0.05 },
//     ]
//   }
//
// DESIGN: Every factor is named and carries an individual contribution.
// The UI (C9) will display these so the user sees WHY the confidence
// is what it is — not a black-box number.
//
// NOTE: sbBuildDetectionMeta() in constants.js is kept intact until
// Component 10 removes all legacy paths.
// ──────────────────────────────────────────────────────────────

// Per-category confidence bases.
// These mirror the `confidenceBase` values from SB_EVIDENCE
// (constants.js:41-84) but live here so C7 owns the formula.
const _SB_CONFIDENCE_BASES = {
  opinion:           0.72,
  mistake_admission: 0.80,
  mimicry:           0.58,
  feedback:          0.62,
  position_change:   0.84,
  social_validation: 0.56,
};

// Severity → additional confidence contribution from the strongest evidence
const _SB_SEVERITY_CONTRIBUTION = {
  low:     0.00,
  medium:  0.04,
  high:    0.10,
  nuclear: 0.14,
};

function sbCalculateConfidence(evidenceArray, detection) {
  // Guard: need at least the detection object to calibrate base
  if (!detection || typeof detection !== "object") {
    return null;
  }
  // Guard: evidence array must exist
  const evidence = Array.isArray(evidenceArray) ? evidenceArray.filter(Boolean) : [];

  const factors = [];

  // ── Factor 1: Base calibration (category) ────────────────────
  // Each sycophancy category has a different empirical confidence
  // baseline derived from the SB_EVIDENCE definitions. Opinion
  // validation (0.72) is well-established; social validation (0.56)
  // is more experimental.
  const category = detection.category || "opinion";
  const base = _SB_CONFIDENCE_BASES[category] ?? 0.60;
  factors.push({
    name:         "Base calibration",
    value:        category,
    contribution: base,
  });

  // ── Factor 2: Severity weight ─────────────────────────────────
  // The highest-severity evidence in this detection contributes an
  // additional bump. Nuclear reversals (behavioral tracker) receive
  // the largest bonus because they require multiple converging
  // signals (position hash change + sentiment flip + challenge).
  const topSeverity = detection.severity || "low";
  const sevContrib = _SB_SEVERITY_CONTRIBUTION[topSeverity] ?? 0;
  factors.push({
    name:         "Severity weight",
    value:        topSeverity,
    contribution: sevContrib,
  });

  // ── Factor 3: Evidence count ──────────────────────────────────
  // More independent evidence pieces → higher confidence.
  // Contribution is capped at 0.10 (5 pieces) to prevent
  // a flood of low-weight matches from dominating the score.
  // Formula: min(count, 5) * 0.02
  const count = evidence.length;
  const countContrib = Math.min(count, 5) * 0.02;
  factors.push({
    name:         "Evidence count",
    value:        count,
    contribution: Number(countContrib.toFixed(3)),
  });

  // ── Factor 4: Category diversity ──────────────────────────────
  // Evidence spanning multiple categories is a stronger signal than
  // the same category repeated. Each additional distinct category
  // (beyond the first) adds 0.02, capped at 0.06 (4 categories).
  const uniqueCategories = new Set(evidence.map(ev => ev.category).filter(Boolean)).size;
  const diversityExtra = Math.max(0, uniqueCategories - 1);
  const diversityContrib = Math.min(diversityExtra, 3) * 0.02;
  factors.push({
    name:         "Category diversity",
    value:        uniqueCategories,
    contribution: Number(diversityContrib.toFixed(3)),
  });

  // ── Final confidence ──────────────────────────────────────────
  // Sum all factor contributions, clamp to [0.05, 0.98]
  const raw = factors.reduce((sum, f) => sum + f.contribution, 0);
  const confidence = Number(Math.min(0.98, Math.max(0.05, raw)).toFixed(2));

  return { confidence, factors };
}
