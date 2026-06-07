// ============================================================
// Dissent — Detection Engine (Component 2 refactor)
// Weighted pattern scoring with full-text analysis.
//
// BACKWARD-COMPATIBLE: all existing return fields preserved.
// NEW in Component 2: `evidence[]` added to return shape.
//   Each evidence object is produced via sbCreateEvidence()
//   from rules.js and conforms to the SB evidence schema.
// ============================================================

// ──────────────────────────────────────────────────────────────
// LABEL → RULE ID MAP
// Maps every pattern's `label` string (from SB_PATTERNS in
// constants.js) to the corresponding ruleId in SB_RULES.
// Kept here to avoid modifying constants.js during this component.
// ──────────────────────────────────────────────────────────────

const _SB_LABEL_TO_RULE_ID = {
  // opinion — opener group
  "Flattery opener":           "flattery_opener_great_question",
  "Exclamatory flattery":      "flattery_opener_exclamatory",
  "Sycophantic agreement":     "flattery_opener_sycophantic_agreement",
  // opinion — validation group
  "Absolute validation":       "absolute_validation",
  "Point validation":          "point_validation",
  "Intelligence flattery":     "intelligence_flattery",
  "Enthusiasm flattery":       "enthusiasm_flattery",
  "Point amplification":       "point_amplification",
  "Unconditional agreement":   "unconditional_agreement",
  // opinion — subtle group
  "Great question opener":     "great_question_subtle",
  "Articulation flattery":     "articulation_flattery",
  "Intuition validation":      "intuition_validation",
  "Concern validation":        "concern_validation",
  "Sense validation":          "sense_validation",
  "Maximum agreement":         "maximum_agreement",
  "Nail metaphor":             "nail_metaphor",
  "Interesting qualifier":     "interesting_qualifier",
  // mistake_admission — cave group
  "Cave-in admission":         "cave_in_admission",
  "Apologetic reversal":       "apologetic_reversal",
  "Self-correction cave":      "self_correction_cave",
  "Reconsidered agreement":    "reconsidered_agreement",
  "Mistake concession":        "mistake_concession",
  // mimicry
  "Echo deference":            "echo_deference",
  "Framing adoption":          "framing_adoption",
  "Build-on flattery":         "build_on_flattery",
  "Known misconception echoed":"known_misconception_echo",
  // feedback
  "Superlative feedback":      "superlative_feedback",
  "Rarity praise":             "rarity_praise",
  "Work praise":               "work_praise",
};

// ──────────────────────────────────────────────────────────────
// MAIN DETECTOR
// ──────────────────────────────────────────────────────────────

function sbAnalyzeText(text, userText = "") {
  if (!text || text.length < 20) {
    return {
      score: 0,
      matches: [],
      evidence: [],                           // NEW
      dominantType: "opinion",
      confidence: 0,
      meta: sbBuildDetectionMeta("opinion", 0),
    };
  }

  const opener = text.slice(0, SB_CONFIG.OPENER_WINDOW);
  let totalScore  = 0;
  const matches   = [];
  const evidence  = [];                       // NEW: evidence accumulator
  const typeScores = {};

  // ── Inner: score a group of patterns against a segment ───────
  // segment      — the text slice to match against
  // patterns     — array of { pattern, weight, label, type }
  //
  // NOTE: both opener and full-text segments start at position 0
  // of `text` (opener = text.slice(0, N)), so match.index within
  // the segment equals the absolute position within `text`.
  function scoreGroup(segment, patterns) {
    for (const { pattern, weight, label, type } of patterns) {
      const match = segment.match(pattern);
      if (match) {
        totalScore += weight;

        // ── Legacy: extract the containing sentence as snippet ──
        const index = match.index;
        const before = segment.substring(0, index);
        const startMatch = before.match(/([.!?\n]+)(?=[^.!?\n]*$)/);
        const sentStart = startMatch ? startMatch.index + startMatch[0].length : 0;

        const after = segment.substring(index);
        const endMatch = after.match(/[.!?\n]/);
        const sentEnd = endMatch ? index + endMatch.index + 1 : segment.length;

        const fullSentence = segment.substring(sentStart, sentEnd).trim().replace(/\s+/g, ' ');

        matches.push({ label, weight, type, snippet: fullSentence });
        typeScores[type] = (typeScores[type] || 0) + weight;

        // ── NEW: evidence production ────────────────────────────
        const ruleId = _SB_LABEL_TO_RULE_ID[label];
        if (ruleId && typeof sbCreateEvidence === "function") {
          const ev = sbCreateEvidence(
            ruleId,
            match[0],                          // exact matched text from regex
            match.index,                       // startIndex in full text
            match.index + match[0].length,     // endIndex in full text
            { snippetSentence: fullSentence }  // extra context for future UI
          );
          if (ev) evidence.push(ev);
        }
      }
    }
  }

  // 1. Opener-only patterns (first 300 chars — highest signal density)
  scoreGroup(opener, SB_PATTERNS.opener);
  scoreGroup(opener, SB_PATTERNS.validation);

  // 2. Full-text patterns (all remaining categories)
  scoreGroup(text, SB_PATTERNS.subtle);
  scoreGroup(text, SB_PATTERNS.cave);
  scoreGroup(text, SB_PATTERNS.mimicry);
  scoreGroup(text, SB_PATTERNS.feedback);
  scoreMimicryMisconceptions(userText, text);

  // Determine the dominant sycophancy type by highest sub-score
  let dominantType = "opinion";
  let maxTypeScore = 0;
  for (const [type, score] of Object.entries(typeScores)) {
    if (score > maxTypeScore) {
      maxTypeScore = score;
      dominantType = type;
    }
  }

  const meta = sbBuildDetectionMeta(dominantType, totalScore);

  // Return: legacy fields unchanged + new `evidence` field
  return { score: totalScore, matches, evidence, dominantType, confidence: meta.confidence, meta };

  // ── Inner: misconception echo detection ──────────────────────
  // Hoisted function declaration — called above, declared here.
  // Uses a loop (instead of .some()) so we can extract matchedText
  // for the evidence object.
  function scoreMimicryMisconceptions(userMessage, aiMessage) {
    if (!userMessage || !Array.isArray(SB_MISCONCEPTIONS)) return;

    for (const item of SB_MISCONCEPTIONS) {
      const userClaimed = item.claimPatterns.some(p => p.test(userMessage));
      if (!userClaimed) continue;

      // Find the specific adoption pattern that matched (for evidence text)
      let adoptedMatch = null;
      for (const p of item.adoptionPatterns) {
        const m = aiMessage.match(p);
        if (m) { adoptedMatch = m; break; }
      }

      const aiCorrected = item.correctionPatterns.some(p => p.test(aiMessage));

      if (adoptedMatch && !aiCorrected) {
        totalScore += 2;

        const snippetLabel = item.id.replace(/_/g, " ");
        matches.push({
          label: "Known misconception echoed",
          weight: 2,
          type: "mimicry",
          snippet: snippetLabel,
          evidenceGrade: "research-inferred",
        });
        typeScores.mimicry = (typeScores.mimicry || 0) + 2;

        // NEW: evidence for misconception echo
        if (typeof sbCreateEvidence === "function") {
          const ev = sbCreateEvidence(
            "known_misconception_echo",
            adoptedMatch[0],
            adoptedMatch.index,
            adoptedMatch.index + adoptedMatch[0].length,
            { snippetSentence: snippetLabel, evidenceGrade: "research-inferred" }
          );
          if (ev) evidence.push(ev);
        }
      }
    }
  }
}
