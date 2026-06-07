// ============================================================
// Test Suite — Component 7: Confidence Engine
// tests/test_confidence_engine.js
//
// Run: node tests/test_confidence_engine.js
//
// What is being tested:
//   sbCalculateConfidence(evidence[], detection)
//   Produces an evidence-backed confidence score with 4 transparent
//   factors: base calibration, severity weight, evidence count,
//   category diversity.
//
// Test sections:
//   1. Null / invalid input handling
//   2. Return shape (confidence + factors array)
//   3. Factor 1 — Base calibration per category
//   4. Factor 2 — Severity weight contribution
//   5. Factor 3 — Evidence count scales confidence
//   6. Factor 4 — Category diversity adds confidence
//   7. Cap / floor enforcement [0.05, 0.98]
//   8. Confidence ordering (nuclear > high > medium > low)
//   9. Full pipeline: Collect → Build → Calculate
//  10. Factors are transparent (names, values, contributions)
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
function assertNear(desc, actual, expected, tolerance = 0.001) {
  const cond = Math.abs(actual - expected) <= tolerance;
  if (cond) { passed++; console.log(`  ✓ ${desc} (${actual})`); }
  else       { failed++; failures.push(`${desc} — expected ~${expected}, got ${actual}`); console.error(`  ✗ FAIL: ${desc} — expected ~${expected}, got ${actual}`); }
}
function section(title) { console.log(`\n── ${title} ──`); }

// ── Fixtures ─────────────────────────────────────────────────
const evOpinionHigh   = sbCreateEvidence("flattery_opener_great_question", "Great question!", 0, 15);
const evOpinionMed    = sbCreateEvidence("absolute_validation", "you're absolutely right", 0, 23);
const evOpinionLow    = sbCreateEvidence("great_question_subtle", "great question", 0, 14);
const evMistakeHigh   = sbCreateEvidence("apologetic_reversal", "I apologize", 0, 11);
const evSocialMed     = sbCreateEvidence("one_sided_user_validation", "you are right", 0, 13);
const evFeedbackMed   = sbCreateEvidence("work_praise", "excellent work", 0, 14);
const evBehavioral    = sbCreateBehavioralEvidence("position_reversal_after_challenge", {
  turnBefore: 1, turnAfter: 2,
  sentimentBefore: "positive", sentimentAfter: "negative",
  positionHashBefore: "aaa", positionHashAfter: "bbb"
});

function makeDetection(evArr, categoryOverride, severityOverride) {
  const det = sbBuildDetection(evArr) || {
    category: "opinion", severity: "low", evidence: evArr, ruleIds: []
  };
  if (categoryOverride) det.category = categoryOverride;
  if (severityOverride) det.severity = severityOverride;
  return det;
}

// ─────────────────────────────────────────────────────────────
// SECTION 1: Null / invalid input
// ─────────────────────────────────────────────────────────────
section("Null / Invalid Input Handling");

assert("null detection returns null",       sbCalculateConfidence([], null) === null);
assert("undefined detection returns null",  sbCalculateConfidence([], undefined) === null);
assert("number detection returns null",     sbCalculateConfidence([], 42) === null);
assert("null evidence + valid detection returns object",
  sbCalculateConfidence(null, makeDetection([evOpinionHigh])) !== null);
assert("empty evidence + valid detection returns object",
  sbCalculateConfidence([], makeDetection([evOpinionHigh])) !== null);

// ─────────────────────────────────────────────────────────────
// SECTION 2: Return shape
// ─────────────────────────────────────────────────────────────
section("Return Shape");

const det1 = makeDetection([evOpinionHigh]);
const result1 = sbCalculateConfidence([evOpinionHigh], det1);

assert("Returns object",                          typeof result1 === "object" && result1 !== null);
assert("Has confidence number",                   typeof result1.confidence === "number");
assert("Has factors array",                       Array.isArray(result1.factors));
assert("Factors array has 4 entries",             result1.factors.length === 4);
assert("Each factor has name",                    result1.factors.every(f => typeof f.name === "string"));
assert("Each factor has value",                   result1.factors.every(f => f.value !== undefined));
assert("Each factor has contribution number",     result1.factors.every(f => typeof f.contribution === "number"));
assert("Factor names are the expected 4",
  result1.factors.map(f => f.name).join("|") ===
  "Base calibration|Severity weight|Evidence count|Category diversity");

// ─────────────────────────────────────────────────────────────
// SECTION 3: Factor 1 — Base calibration per category
// ─────────────────────────────────────────────────────────────
section("Factor 1 — Base Calibration Per Category");

const EXPECTED_BASES = {
  opinion: 0.72, mistake_admission: 0.80, mimicry: 0.58,
  feedback: 0.62, position_change: 0.84, social_validation: 0.56
};

for (const [cat, expectedBase] of Object.entries(EXPECTED_BASES)) {
  // Get a rule from this category
  const rulesInCat = sbGetRulesByCategory(cat);
  if (!rulesInCat.length) continue;
  const ruleId = rulesInCat[0].id;
  let ev;
  if (rulesInCat[0].evidenceSubtype === "behavioral") {
    ev = sbCreateBehavioralEvidence(ruleId, { turnBefore:1, turnAfter:2, sentimentBefore:"pos", sentimentAfter:"neg", positionHashBefore:"x", positionHashAfter:"y" });
  } else {
    ev = sbCreateEvidence(ruleId, "test", 0, 4);
  }
  const det = makeDetection([ev], cat, "low");
  const res = sbCalculateConfidence([ev], det);
  const baseFactor = res.factors.find(f => f.name === "Base calibration");
  assertNear(`Base calibration for "${cat}" = ${expectedBase}`,
    baseFactor.contribution, expectedBase, 0.001);
  assert(`Base calibration for "${cat}" value is category string`,
    baseFactor.value === cat);
}

// Unknown category falls back to 0.60
const unknownDet = { category: "unknown_type", severity: "low", evidence: [evOpinionLow], ruleIds: [] };
const unknownResult = sbCalculateConfidence([evOpinionLow], unknownDet);
assertNear("Unknown category falls back to 0.60 base",
  unknownResult.factors[0].contribution, 0.60, 0.001);

// ─────────────────────────────────────────────────────────────
// SECTION 4: Factor 2 — Severity weight
// ─────────────────────────────────────────────────────────────
section("Factor 2 — Severity Weight Contribution");

const EXPECTED_SEV = { low: 0.00, medium: 0.04, high: 0.10, nuclear: 0.14 };

for (const [sev, expectedContrib] of Object.entries(EXPECTED_SEV)) {
  const det = makeDetection([evOpinionLow], "opinion", sev);
  const res = sbCalculateConfidence([evOpinionLow], det);
  const sevFactor = res.factors.find(f => f.name === "Severity weight");
  assertNear(`Severity "${sev}" contribution = ${expectedContrib}`,
    sevFactor.contribution, expectedContrib, 0.001);
  assert(`Severity factor value is "${sev}"`, sevFactor.value === sev);
}

// ─────────────────────────────────────────────────────────────
// SECTION 5: Factor 3 — Evidence count
// ─────────────────────────────────────────────────────────────
section("Factor 3 — Evidence Count Scales Confidence");

const evArr0 = [];
const evArr1 = [evOpinionHigh];
const evArr3 = [evOpinionHigh, evOpinionMed, evOpinionLow];
const evArr5 = [evOpinionHigh, evOpinionMed, evOpinionLow, evMistakeHigh, evSocialMed];
const evArr7 = [evOpinionHigh, evOpinionMed, evOpinionLow, evMistakeHigh, evSocialMed, evFeedbackMed, evOpinionHigh];

const det_for_count = makeDetection([evOpinionLow], "opinion", "low");

const res0 = sbCalculateConfidence(evArr0, det_for_count);
const res1 = sbCalculateConfidence(evArr1, det_for_count);
const res3 = sbCalculateConfidence(evArr3, det_for_count);
const res5 = sbCalculateConfidence(evArr5, det_for_count);
const res7 = sbCalculateConfidence(evArr7, det_for_count);

const count0 = res0.factors.find(f => f.name === "Evidence count");
const count1 = res1.factors.find(f => f.name === "Evidence count");
const count3 = res3.factors.find(f => f.name === "Evidence count");
const count5 = res5.factors.find(f => f.name === "Evidence count");
const count7 = res7.factors.find(f => f.name === "Evidence count");

assertNear("0 evidence → contribution 0",      count0.contribution, 0.000);
assertNear("1 evidence → contribution 0.02",   count1.contribution, 0.020);
assertNear("3 evidence → contribution 0.06",   count3.contribution, 0.060);
assertNear("5 evidence → contribution 0.10",   count5.contribution, 0.100);
assertNear("7 evidence → still capped at 0.10",count7.contribution, 0.100);
assert("Count factor value = actual count", count3.value === 3);

// ─────────────────────────────────────────────────────────────
// SECTION 6: Factor 4 — Category diversity
// ─────────────────────────────────────────────────────────────
section("Factor 4 — Category Diversity Adds Confidence");

const det_for_div = makeDetection([evOpinionLow], "opinion", "low");

// 1 category (just opinion)
const resDiv1 = sbCalculateConfidence([evOpinionHigh, evOpinionLow], det_for_div);
const div1 = resDiv1.factors.find(f => f.name === "Category diversity");
assertNear("1 category → diversity contribution 0",   div1.contribution, 0.000);
assert("1 category → diversity value = 1",             div1.value === 1);

// 2 categories (opinion + mistake_admission)
const resDiv2 = sbCalculateConfidence([evOpinionHigh, evMistakeHigh], det_for_div);
const div2 = resDiv2.factors.find(f => f.name === "Category diversity");
assertNear("2 categories → diversity contribution 0.02", div2.contribution, 0.020);
assert("2 categories → diversity value = 2",             div2.value === 2);

// 3 categories (opinion + mistake + social)
const resDiv3 = sbCalculateConfidence([evOpinionHigh, evMistakeHigh, evSocialMed], det_for_div);
const div3 = resDiv3.factors.find(f => f.name === "Category diversity");
assertNear("3 categories → diversity contribution 0.04", div3.contribution, 0.040);

// 4+ categories (cap at 0.06)
const resDiv4 = sbCalculateConfidence([evOpinionHigh, evMistakeHigh, evSocialMed, evFeedbackMed], det_for_div);
const div4 = resDiv4.factors.find(f => f.name === "Category diversity");
assertNear("4 categories → contribution 0.06",         div4.contribution, 0.060);

// Add more — should still be capped
const resDiv5 = sbCalculateConfidence([evOpinionHigh, evMistakeHigh, evSocialMed, evFeedbackMed, evBehavioral], det_for_div);
const div5 = resDiv5.factors.find(f => f.name === "Category diversity");
assertNear("5 categories → still capped at 0.06",      div5.contribution, 0.060);

// ─────────────────────────────────────────────────────────────
// SECTION 7: Cap / floor enforcement
// ─────────────────────────────────────────────────────────────
section("Cap / Floor Enforcement [0.05, 0.98]");

// Floor: build an unrealistically low scenario (shouldn't happen in practice)
const floorDet = { category: "unknown_type", severity: "low", evidence: [], ruleIds: [] };
const floorRes = sbCalculateConfidence([], floorDet);
assert("Confidence is never below 0.05", floorRes.confidence >= 0.05);

// Cap: best possible scenario (nuclear + 5 evidence + 4 categories + position_change base)
const capDet = makeDetection([evBehavioral, evOpinionHigh, evMistakeHigh, evSocialMed, evFeedbackMed], "position_change", "nuclear");
const capRes = sbCalculateConfidence([evBehavioral, evOpinionHigh, evMistakeHigh, evSocialMed, evFeedbackMed], capDet);
assert("Confidence is never above 0.98",  capRes.confidence <= 0.98);
assert("Confidence is a number",          typeof capRes.confidence === "number");
assert("Confidence has 2 decimal places", String(capRes.confidence).split(".")[1]?.length <= 2 || Number.isInteger(capRes.confidence));

// ─────────────────────────────────────────────────────────────
// SECTION 8: Confidence ordering (nuclear > high > medium > low)
// ─────────────────────────────────────────────────────────────
section("Confidence Ordering — Nuclear > High > Medium > Low");

const baseArr = [evOpinionLow]; // same single piece of evidence in all
const confLow    = sbCalculateConfidence(baseArr, makeDetection(baseArr, "opinion", "low")).confidence;
const confMed    = sbCalculateConfidence(baseArr, makeDetection(baseArr, "opinion", "medium")).confidence;
const confHigh   = sbCalculateConfidence(baseArr, makeDetection(baseArr, "opinion", "high")).confidence;
const confNuclear= sbCalculateConfidence(baseArr, makeDetection(baseArr, "opinion", "nuclear")).confidence;

assert("nuclear > high",   confNuclear > confHigh);
assert("high > medium",    confHigh    > confMed);
assert("medium > low",     confMed     > confLow);
assert("low >= 0.05",      confLow     >= 0.05);

// ─────────────────────────────────────────────────────────────
// SECTION 9: Full pipeline integration
// ─────────────────────────────────────────────────────────────
section("Full Pipeline: Collect → Build → Calculate");

const AI_SYC = "Great question! You're absolutely right and I completely agree with your assessment.";
const USER_MSG = "I think my approach is better than what you suggested.";

const collected  = sbCollectEvidence(AI_SYC, USER_MSG);
const detection  = sbBuildDetection(collected.evidence);
const confidence = sbCalculateConfidence(collected.evidence, detection);

assert("Full pipeline: confidence is non-null",       confidence !== null);
assert("Full pipeline: confidence is a number",       typeof confidence.confidence === "number");
assert("Full pipeline: confidence in range [0.05, 0.98]",
  confidence.confidence >= 0.05 && confidence.confidence <= 0.98);
assert("Full pipeline: 4 factors returned",           confidence.factors.length === 4);
assert("Full pipeline: base calibration factor present",
  confidence.factors.some(f => f.name === "Base calibration"));
assert("Full pipeline: severity weight factor present",
  confidence.factors.some(f => f.name === "Severity weight"));
assert("Full pipeline: evidence count reflects real evidence count",
  confidence.factors.find(f => f.name === "Evidence count").value === collected.evidence.length);
assert("Full pipeline: confidence > opinion base (evidence boosted it)",
  confidence.confidence > 0.72);

// ─────────────────────────────────────────────────────────────
// SECTION 10: Factors transparency
// ─────────────────────────────────────────────────────────────
section("Factor Transparency — Names, Values, Contributions");

const transRes = sbCalculateConfidence([evOpinionHigh, evMistakeHigh, evSocialMed], makeDetection([evOpinionHigh], "opinion", "high"));

assert("All 4 factors have string names",             transRes.factors.every(f => typeof f.name === "string" && f.name.length > 0));
assert("All contributions are finite numbers",        transRes.factors.every(f => Number.isFinite(f.contribution)));
assert("All contributions are non-negative",          transRes.factors.every(f => f.contribution >= 0));
assert("Confidence equals sum of factors (within rounding)",
  Math.abs(transRes.factors.reduce((s, f) => s + f.contribution, 0) - transRes.confidence) <= 0.01);
assert("Base calibration value is a string (category)",
  typeof transRes.factors.find(f => f.name === "Base calibration").value === "string");
assert("Severity weight value is a string (severity)",
  typeof transRes.factors.find(f => f.name === "Severity weight").value === "string");
assert("Evidence count value is a number",
  typeof transRes.factors.find(f => f.name === "Evidence count").value === "number");
assert("Category diversity value is a number",
  typeof transRes.factors.find(f => f.name === "Category diversity").value === "number");

// ─────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Component 7 Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailed assertions:");
  failures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("✅ All tests passed — Component 7 complete.");
  process.exit(0);
}
