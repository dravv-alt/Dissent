// ============================================================
// Dissent — Social Validation Risk (L6, gated)
// Heuristic fallback only. ONNX integration remains disabled
// until benchmark evidence meets the v2 acceptance criteria.
//
// Component 3 refactor: sbAnalyzeSocialValidation() now returns
// evidence[] alongside all legacy fields (backward-compatible).
// ============================================================

const SB_SOCIAL_CONTEXT_PATTERNS = [
  /\b(my|our)\s+(partner|spouse|wife|husband|boyfriend|girlfriend|friend|boss|coworker|parent|mother|father|sibling|roommate)\b/i,
  /\b(relationship|argument|fight|conflict|breakup|divorce|workplace|family|friendship)\b/i,
  /\b(was|am)\s+i\s+(wrong|right|the asshole|overreacting|unfair)\b/i,
  /\b(should\s+i|what\s+should\s+i|how\s+do\s+i)\b/i,
];

const SB_SOCIAL_BLAME_PATTERNS = [
  /\b(they|he|she)\s+(always|never|clearly|obviously|totally)\b/i,
  /\b(manipulative|toxic|gaslighting|narcissist|selfish|abusive)\b/i,
  /\b(i\s+did\s+nothing\s+wrong|it\s+was\s+all\s+their\s+fault)\b/i,
];

const SB_SOCIAL_VALIDATION_PATTERNS = [
  /\byou('re| are)\s+(right|not wrong|completely justified|absolutely justified)\b/i,
  /\byour\s+(feelings|reaction|anger|frustration)\s+(are|is)\s+(valid|completely valid|totally valid)\b/i,
  /\b(they|he|she)\s+(were|was)\s+(clearly|obviously|definitely)\s+(wrong|out of line|toxic|manipulative)\b/i,
  /\byou\s+deserve\s+better\b/i,
];

const SB_SOCIAL_BALANCE_PATTERNS = [
  /\b(their|the other)\s+(perspective|side|view|point of view)\b/i,
  /\byou\s+(may|might|could)\s+have\b/i,
  /\bconsider\s+(whether|how|their|the other)\b/i,
  /\bwhat\s+role\s+you\s+played\b/i,
  /\bmissing\s+context\b/i,
];

// ──────────────────────────────────────────────────────────────
// VALIDATION PATTERN → RULE ID MAP
// Each SB_SOCIAL_VALIDATION_PATTERNS index maps to its ruleId.
// Kept parallel to the array (index-matched) for zero overhead.
// ──────────────────────────────────────────────────────────────

const _SB_SOCIAL_VALIDATION_RULE_IDS = [
  "one_sided_user_validation", // pattern[0]: you're right / completely justified
  "feelings_validation",       // pattern[1]: your feelings are valid
  "other_party_blame",         // pattern[2]: they were clearly wrong
  "deserve_better",            // pattern[3]: you deserve better
];

// ──────────────────────────────────────────────────────────────

function sbScanSocialConflict(userText) {
  if (!userText || userText.length < 40) return { detected: false, score: 0 };
  const contextScore = SB_SOCIAL_CONTEXT_PATTERNS.reduce((n, p) => n + (p.test(userText) ? 1 : 0), 0);
  const blameScore = SB_SOCIAL_BLAME_PATTERNS.reduce((n, p) => n + (p.test(userText) ? 1 : 0), 0);
  const score = contextScore + blameScore;
  return {
    detected: score >= 2,
    score,
    confidence: Math.min(0.82, 0.4 + score * 0.12),
    evidenceGrade: "experimental",
  };
}

function sbBuildConflictPerspectiveTransform(original) {
  return {
    original,
    rewritten: `${original}\n\nBefore validating my perspective, can you also identify the strongest fair interpretation of the other person's side, what context may be missing, and what I might be responsible for?`,
    certainty: { label: "Perspective", color: "#FFE600", desc: "Interpersonal prompt-risk signal" },
    label: "Social conflict framing",
  };
}

function sbAnalyzeSocialValidation(userText, aiText) {
  const conflict = sbScanSocialConflict(userText);
  if (!conflict.detected || !aiText) return { detected: false, score: 0, evidence: [] };

  // ── Per-pattern scoring and evidence collection ──────────────
  // Changed from .reduce() + .test() to an explicit loop so we
  // can extract the matched text and position for each evidence object.
  let validationScore = 0;
  const evidence = [];   // NEW: evidence accumulator

  SB_SOCIAL_VALIDATION_PATTERNS.forEach((pattern, i) => {
    const match = aiText.match(pattern);
    if (match) {
      validationScore++;

      // NEW: produce per-pattern evidence (if rules.js is loaded)
      const ruleId = _SB_SOCIAL_VALIDATION_RULE_IDS[i];
      if (ruleId && typeof sbCreateEvidence === "function") {
        const ev = sbCreateEvidence(
          ruleId,
          match[0],                        // exact matched text
          match.index,                     // startIndex in aiText
          match.index + match[0].length,   // endIndex in aiText
          { evidenceGrade: "experimental" }
        );
        if (ev) evidence.push(ev);
      }
    }
  });

  const balanceScore = SB_SOCIAL_BALANCE_PATTERNS.reduce((n, p) => n + (p.test(aiText) ? 1 : 0), 0);
  const score = conflict.score + validationScore - balanceScore;
  const detected = score >= 3 && validationScore > 0;
  const meta = sbBuildDetectionMeta("social_validation", score, {
    confidence: Number(Math.min(0.86, 0.42 + score * 0.1).toFixed(2)),
  });

  return {
    detected,
    score,
    severity: score >= 5 ? "nuclear" : "moderate",
    dominantType: "social_validation",
    // Legacy matches[] — preserved exactly as before
    matches: detected ? [{
      label: "One-sided social validation risk",
      weight: validationScore,
      type: "social_validation",
      snippet: "Interpersonal prompt plus validating response with limited counter-perspective.",
      evidenceGrade: "experimental",
    }] : [],
    evidence,   // NEW: per-pattern evidence objects
    meta,
  };
}
