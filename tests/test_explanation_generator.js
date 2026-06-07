// ============================================================
// Test Suite — Component 6: Explanation Generator
// tests/test_explanation_generator.js
//
// Run: node tests/test_explanation_generator.js
//
// What is being tested:
//   sbGenerateExplanation(detection) — Consumes a detection object
//   from sbBuildDetection() and produces a human-readable
//   explanation of WHY the AI response was flagged.
//
// Test sections:
//   1. Null / invalid input handling
//   2. Return shape (all required fields present)
//   3. Summary is sourced from headlines, not generic
//   4. Reasons are sourced from evidence[].explanation (no hardcoding)
//   5. EvidenceDescriptions are from evidence[].reasoning (no hardcoding)
//   6. De-duplication — same rule triggered twice = one reason entry
//   7. counterPromptContext maps to a valid SB_PROMPTS key
//   8. Lead evidence selection — highest weight wins
//   9. Lead evidence tiebreaker — textual beats behavioral at same weight
//  10. Full pipeline: sbCollectEvidence → sbBuildDetection → sbGenerateExplanation
// ============================================================

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

function loadFile(relPath) {
  const code = fs.readFileSync(path.join(__dirname, relPath), "utf8");
  vm.runInThisContext(code);
}

loadFile("../content/rules.js");
loadFile("../content/constants.js");
loadFile("../content/detector.js");
loadFile("../content/social.js");
loadFile("../content/evidence.js");

// ── Test runner ───────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(desc, cond) {
  if (cond) { passed++; console.log(`  ✓ ${desc}`); }
  else       { failed++; failures.push(desc); console.error(`  ✗ FAIL: ${desc}`); }
}

function section(title) { console.log(`\n── ${title} ──`); }

// ── Fixtures ─────────────────────────────────────────────────
// Reusable evidence objects
const evOpinionHigh   = sbCreateEvidence("flattery_opener_great_question", "Great question!", 0, 15);
const evOpinionLow    = sbCreateEvidence("great_question_subtle", "great question", 0, 14);
const evMistakeHigh   = sbCreateEvidence("apologetic_reversal", "I apologize, you're right", 0, 25);
const evSocialMedium  = sbCreateEvidence("one_sided_user_validation", "you are completely right", 0, 24);
const evBehavioral    = sbCreateBehavioralEvidence("position_reversal_after_challenge", {
  turnBefore: 1, turnAfter: 2,
  sentimentBefore: "positive", sentimentAfter: "negative",
  positionHashBefore: "aaa", positionHashAfter: "bbb"
});

// Helper: build a minimal valid detection for sbGenerateExplanation
function makeDetection(evidenceArr, categoryOverride) {
  const det = sbBuildDetection(evidenceArr);
  if (!det) return null;
  if (categoryOverride) det.category = categoryOverride;
  return det;
}

// ─────────────────────────────────────────────────────────────
// SECTION 1: Null / invalid input
// ─────────────────────────────────────────────────────────────
section("Null / Invalid Input Handling");

assert("null detection returns null",         sbGenerateExplanation(null) === null);
assert("undefined returns null",              sbGenerateExplanation(undefined) === null);
assert("number returns null",                 sbGenerateExplanation(42) === null);
assert("string returns null",                 sbGenerateExplanation("bad") === null);
assert("empty object returns null",           sbGenerateExplanation({}) === null);
assert("object with empty evidence[] returns null",
  sbGenerateExplanation({ category: "opinion", severity: "high", evidence: [], ruleIds: [] }) === null);
assert("object with non-array evidence returns null",
  sbGenerateExplanation({ category: "opinion", severity: "high", evidence: "bad" }) === null);

// ─────────────────────────────────────────────────────────────
// SECTION 2: Return shape
// ─────────────────────────────────────────────────────────────
section("Return Shape — All Fields Present");

const det = sbBuildDetection([evOpinionHigh]);
const expl = sbGenerateExplanation(det);

assert("Returns non-null object",             expl !== null && typeof expl === "object");
assert("Has summary string",                  typeof expl.summary === "string");
assert("Has reasons array",                   Array.isArray(expl.reasons));
assert("Has evidenceDescriptions array",      Array.isArray(expl.evidenceDescriptions));
assert("Has counterPromptContext string",     typeof expl.counterPromptContext === "string");
assert("Has leadEvidence object",             typeof expl.leadEvidence === "object" && expl.leadEvidence !== null);

// ─────────────────────────────────────────────────────────────
// SECTION 3: Summary is category-accurate
// ─────────────────────────────────────────────────────────────
section("Summary — Category-Specific Headline");

const opinionDet   = sbBuildDetection([evOpinionHigh]);
const mistakeDet   = sbBuildDetection([evMistakeHigh]);
const socialDet    = sbBuildDetection([evSocialMedium]);
const positionDet  = sbBuildDetection([evBehavioral]);

assert("Opinion category → opinion headline",
  sbGenerateExplanation(opinionDet).summary.toLowerCase().includes("validated"));
assert("Mistake_admission category → reversal headline",
  sbGenerateExplanation(mistakeDet).summary.toLowerCase().includes("reversed") ||
  sbGenerateExplanation(mistakeDet).summary.toLowerCase().includes("position"));
assert("Social_validation category → social headline",
  sbGenerateExplanation(socialDet).summary.toLowerCase().includes("side") ||
  sbGenerateExplanation(socialDet).summary.toLowerCase().includes("conflict"));
assert("Position_change category → change headline",
  sbGenerateExplanation(positionDet).summary.toLowerCase().includes("changed") ||
  sbGenerateExplanation(positionDet).summary.toLowerCase().includes("position"));

// Unknown category gets the generic fallback
const unknownDet = { category: "unknown_cat", severity: "low", evidence: [evOpinionLow], ruleIds: ["great_question_subtle"] };
const unknownExpl = sbGenerateExplanation(unknownDet);
assert("Unknown category gets generic fallback summary",
  typeof unknownExpl.summary === "string" && unknownExpl.summary.length > 0);

// ─────────────────────────────────────────────────────────────
// SECTION 4: Reasons sourced from evidence[].explanation
// ─────────────────────────────────────────────────────────────
section("Reasons — Sourced From evidence[].explanation");

const rule = sbGetRule("flattery_opener_great_question");
const explSingle = sbGenerateExplanation(sbBuildDetection([evOpinionHigh]));

assert("Reasons array is non-empty",            explSingle.reasons.length >= 1);
assert("First reason matches rule.explanation",
  explSingle.reasons[0] === rule.explanation);
assert("Reason is NOT a hardcoded generic string",
  !explSingle.reasons[0].includes("The AI showed")); // that's the summary fallback

// Multiple distinct rules → multiple reasons
const multiDet = sbBuildDetection([evOpinionHigh, evOpinionLow]);
const multiExpl = sbGenerateExplanation(multiDet);
assert("Two distinct rules → two reasons",     multiExpl.reasons.length === 2);

const ruleHigh = sbGetRule("flattery_opener_great_question");
const ruleLow  = sbGetRule("great_question_subtle");
assert("First reason is from flattery_opener rule",
  multiExpl.reasons.includes(ruleHigh.explanation));
assert("Second reason is from great_question_subtle rule",
  multiExpl.reasons.includes(ruleLow.explanation));

// ─────────────────────────────────────────────────────────────
// SECTION 5: EvidenceDescriptions sourced from evidence[].reasoning
// ─────────────────────────────────────────────────────────────
section("EvidenceDescriptions — Sourced From evidence[].reasoning");

assert("evidenceDescriptions is non-empty",
  explSingle.evidenceDescriptions.length >= 1);
assert("First description matches rule.reasoning",
  explSingle.evidenceDescriptions[0] === rule.reasoning);
assert("Reasoning is a meaningful sentence (≥20 chars)",
  explSingle.evidenceDescriptions[0].length >= 20);

// ─────────────────────────────────────────────────────────────
// SECTION 6: De-duplication — same ruleId twice → one entry
// ─────────────────────────────────────────────────────────────
section("De-duplication — Same Rule Twice = One Entry");

// Build a detection that has the same ruleId appearing in evidence twice
// (simulating a detector returning the same match twice - an edge case)
const dupEv1 = sbCreateEvidence("flattery_opener_great_question", "Great question!", 0, 15);
const dupEv2 = sbCreateEvidence("flattery_opener_great_question", "Great question!", 0, 15);
const dupDet = {
  category: "opinion",
  severity: "high",
  evidence: [dupEv1, dupEv2],
  ruleIds: ["flattery_opener_great_question"],
};
const dupExpl = sbGenerateExplanation(dupDet);
assert("Duplicate ruleId → only one reason entry",    dupExpl.reasons.length === 1);
assert("Duplicate ruleId → only one description",     dupExpl.evidenceDescriptions.length === 1);

// ─────────────────────────────────────────────────────────────
// SECTION 7: counterPromptContext maps to SB_PROMPTS
// ─────────────────────────────────────────────────────────────
section("counterPromptContext → Valid SB_PROMPTS Key");

const categoriesToTest = ["opinion", "mistake_admission", "mimicry", "feedback", "position_change", "social_validation"];

for (const cat of categoriesToTest) {
  // Build a minimal fake detection of that category using a real rule from that category
  const rulesInCat = sbGetRulesByCategory(cat);
  if (rulesInCat.length === 0) continue;

  const ruleId = rulesInCat[0].id;
  let ev;
  if (rulesInCat[0].evidenceSubtype === "behavioral") {
    ev = sbCreateBehavioralEvidence(ruleId, { turnBefore: 1, turnAfter: 2, sentimentBefore: "positive", sentimentAfter: "negative", positionHashBefore: "x", positionHashAfter: "y" });
  } else {
    ev = sbCreateEvidence(ruleId, "test text", 0, 9);
  }
  const catDet = { category: cat, severity: "medium", evidence: [ev], ruleIds: [ruleId] };
  const catExpl = sbGenerateExplanation(catDet);

  assert(`counterPromptContext for "${cat}" is "${cat}"`,
    catExpl.counterPromptContext === cat);
  assert(`counterPromptContext "${cat}" exists in SB_PROMPTS`,
    typeof SB_PROMPTS[cat] === "object");

  // Verify sbGetCounterPrompt can be called with it without throwing
  let promptResult = null;
  try { promptResult = sbGetCounterPrompt("moderate", cat); } catch(e) {}
  assert(`sbGetCounterPrompt("moderate", "${cat}") returns a string`,
    typeof promptResult === "string" && promptResult.length > 0);
}

// ─────────────────────────────────────────────────────────────
// SECTION 8: Lead evidence — highest weight wins
// ─────────────────────────────────────────────────────────────
section("Lead Evidence — Highest Weight Wins");

// evOpinionHigh (weight 3) vs evOpinionLow (weight 1)
const weightDet = {
  category: "opinion",
  severity: "high",
  evidence: [evOpinionLow, evOpinionHigh], // low first, high second
  ruleIds: ["great_question_subtle", "flattery_opener_great_question"],
};
const weightExpl = sbGenerateExplanation(weightDet);
assert("Lead evidence is the highest-weight item",
  weightExpl.leadEvidence.ruleId === "flattery_opener_great_question");
assert("Lead evidence has weight 3",
  weightExpl.leadEvidence.weight === 3);

// ─────────────────────────────────────────────────────────────
// SECTION 9: Lead evidence tiebreaker — textual beats behavioral
// ─────────────────────────────────────────────────────────────
section("Lead Evidence Tiebreaker — Textual Beats Behavioral At Same Weight");

// position_reversal_after_challenge (behavioral, weight 3)
// vs flattery_opener_great_question (textual, weight 3)
const tieDet = {
  category: "opinion",
  severity: "nuclear",
  evidence: [evBehavioral, evOpinionHigh], // behavioral first, textual second
  ruleIds: ["position_reversal_after_challenge", "flattery_opener_great_question"],
};
const tieExpl = sbGenerateExplanation(tieDet);
assert("Textual evidence preferred over behavioral at equal weight",
  tieExpl.leadEvidence.evidenceType === "textual");
assert("Tiebreaker lead is the textual opener evidence",
  tieExpl.leadEvidence.ruleId === "flattery_opener_great_question");

// ─────────────────────────────────────────────────────────────
// SECTION 10: Full pipeline integration
// ─────────────────────────────────────────────────────────────
section("Full Pipeline: sbCollectEvidence → sbBuildDetection → sbGenerateExplanation");

const AI_SYCOPHANTIC = "Great question! You're absolutely right, that approach is perfect.";
const USER_NEUTRAL   = "Can you explain how neural networks work?";

const collected = sbCollectEvidence(AI_SYCOPHANTIC, USER_NEUTRAL);
const detection  = sbBuildDetection(collected.evidence);
const explanation = sbGenerateExplanation(detection);

assert("Full pipeline: explanation is non-null",        explanation !== null);
assert("Full pipeline: summary is a string",            typeof explanation.summary === "string");
assert("Full pipeline: reasons array has entries",      explanation.reasons.length > 0);
assert("Full pipeline: evidenceDescriptions has entries", explanation.evidenceDescriptions.length > 0);
assert("Full pipeline: counterPromptContext is opinion", explanation.counterPromptContext === "opinion");
assert("Full pipeline: leadEvidence ruleId exists in SB_RULES",
  sbGetRule(explanation.leadEvidence.ruleId) !== null);
assert("Full pipeline: each reason comes from a real rule explanation",
  explanation.reasons.every(r => {
    return Object.values(SB_RULES).some(rule => rule.explanation === r);
  }));
assert("Full pipeline: each description comes from a real rule reasoning",
  explanation.evidenceDescriptions.every(d => {
    return Object.values(SB_RULES).some(rule => rule.reasoning === d);
  }));

// ─────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Component 6 Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailed assertions:");
  failures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("✅ All tests passed — Component 6 complete.");
  process.exit(0);
}
