// ============================================================
// Test Suite — Component 4: Evidence Collector
// tests/test_evidence_collector.js
//
// Run: node tests/test_evidence_collector.js
//
// What is being tested:
//   sbCollectEvidence() — the single function that runs all
//   synchronous detectors and returns a flat evidence array.
//
//   sbMergeTrackerEvidence() — merges async L3 tracker evidence
//   into the result from sbCollectEvidence().
//
// Test sections:
//   1. Return shape — both functions always return correct structure
//   2. L4 evidence flows through: when AI text is sycophantic,
//      evidence from detector.js ends up in the output
//   3. L6 evidence flows through: when there's a social conflict
//      + validating AI response, social.js evidence flows through
//   4. Both L4 + L6 fire together: combined evidence in one array
//   5. l4Result and l6Result are accessible: callers that still
//      use score/matches aren't broken
//   6. Social scorer gate: when socialScorerEnabled = false,
//      no L6 evidence is collected
//   7. sbMergeTrackerEvidence() correctly appends L3 evidence
//      and preserves the L4/L6 results
//   8. Edge cases: empty input, null, missing userText
// ============================================================

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

function loadFile(relPath) {
  const code = fs.readFileSync(path.join(__dirname, relPath), "utf8");
  vm.runInThisContext(code);
}

// Full dependency chain for evidence.js
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

// ── Fixtures ──────────────────────────────────────────────────

// L4 trigger: a sycophantic opener
const AI_SYCOPHANTIC = "Great question! You're absolutely right, that approach is perfect.";

// L6 trigger: social conflict user + validating AI
const USER_CONFLICT =
  "My partner always blames me. Am I wrong? We had a huge fight and it was their fault.";
const AI_VALIDATES = "You're right, your feelings are completely valid given what they did.";

// Both L4 and L6 at once
const AI_BOTH = "Great question! You're right — your feelings are valid and your partner was clearly wrong.";

// Neutral text: triggers nothing
const AI_NEUTRAL = "Here is a balanced look at that topic with considerations on both sides.";
const USER_NEUTRAL = "Can you explain how neural networks work?";

// ─────────────────────────────────────────────────────────────
// SECTION 1: Return Shape
// ─────────────────────────────────────────────────────────────
section("Return Shape — sbCollectEvidence()");

const rShape = sbCollectEvidence(AI_NEUTRAL, USER_NEUTRAL);

assert("Returns an object",                typeof rShape === "object");
assert("Has evidence[] array",             Array.isArray(rShape.evidence));
assert("Has l4Result field",               "l4Result" in rShape);
assert("Has l6Result field",               "l6Result" in rShape);
assert("Neutral text: evidence is empty",  rShape.evidence.length === 0);

// Edge: empty string
const rEmpty = sbCollectEvidence("", USER_NEUTRAL);
assert("Empty responseText: evidence[]",   Array.isArray(rEmpty.evidence));
assert("Empty responseText: l4Result null",rEmpty.l4Result === null);

// Edge: null
const rNull = sbCollectEvidence(null, USER_NEUTRAL);
assert("null responseText: evidence[]",    Array.isArray(rNull.evidence));

// Edge: missing userText
const rNoUser = sbCollectEvidence(AI_SYCOPHANTIC);
assert("Missing userText: still returns evidence[]", Array.isArray(rNoUser.evidence));

// ─────────────────────────────────────────────────────────────
// SECTION 2: L4 Evidence Flows Through
// ─────────────────────────────────────────────────────────────
section("L4 Evidence Flows Through");

const rL4 = sbCollectEvidence(AI_SYCOPHANTIC, USER_NEUTRAL);

assert("L4: evidence[] is non-empty for sycophantic text", rL4.evidence.length > 0);
assert("L4: at least one evidence ruleId is from opinion category",
  rL4.evidence.some(e => e.category === "opinion"));
assert("L4: all evidence objects have ruleId",
  rL4.evidence.every(e => typeof e.ruleId === "string"));
assert("L4: all evidence objects have evidenceType",
  rL4.evidence.every(e => e.evidenceType === "textual" || e.evidenceType === "behavioral"));

// Verify the opener pattern is in there
assert("L4: flattery_opener_great_question evidence present",
  rL4.evidence.some(e => e.ruleId === "flattery_opener_great_question"));

// Verify all evidence is valid via schema checker
for (const ev of rL4.evidence) {
  assert(`L4 evidence "${ev.ruleId}" passes schema validation`, sbValidateEvidence(ev) === true);
}

// ─────────────────────────────────────────────────────────────
// SECTION 3: L6 Evidence Flows Through
// ─────────────────────────────────────────────────────────────
section("L6 Evidence Flows Through");

const rL6 = sbCollectEvidence(AI_VALIDATES, USER_CONFLICT);

// L6 runs only if user text triggers the conflict threshold
const conflictScan = sbScanSocialConflict(USER_CONFLICT);
if (conflictScan.detected) {
  assert("L6: evidence[] is non-empty when conflict detected",
    rL6.evidence.length > 0);
  assert("L6: at least one evidence from social_validation category",
    rL6.evidence.some(e => e.category === "social_validation"));
  assert("L6: social validation ruleId present",
    rL6.evidence.some(e =>
      e.ruleId === "one_sided_user_validation" ||
      e.ruleId === "feelings_validation"       ||
      e.ruleId === "other_party_blame"          ||
      e.ruleId === "deserve_better"
    ));
} else {
  console.log("  ⚠ L6: conflict not detected on this fixture — skipping L6-specific assertions");
  assert("L6: evidence[] still present (even if empty)", Array.isArray(rL6.evidence));
}

// ─────────────────────────────────────────────────────────────
// SECTION 4: L4 + L6 Together — Combined Array
// ─────────────────────────────────────────────────────────────
section("L4 + L6 Together — Combined Evidence Array");

const rBoth = sbCollectEvidence(AI_BOTH, USER_CONFLICT);

assert("Combined: evidence[] is non-empty",   rBoth.evidence.length > 0);

const hasOpinion = rBoth.evidence.some(e => e.category === "opinion");
const hasSocial  = rBoth.evidence.some(e => e.category === "social_validation");

assert("Combined: opinion evidence present",  hasOpinion);
// Social only fires if conflict threshold is met
if (conflictScan.detected) {
  assert("Combined: social_validation evidence present", hasSocial);
  assert("Combined: evidence contains items from BOTH detectors",
    hasOpinion && hasSocial);
}

// All combined evidence must still pass schema validation
for (const ev of rBoth.evidence) {
  assert(`Combined evidence "${ev.ruleId}" passes schema validation`,
    sbValidateEvidence(ev) === true);
}

// ─────────────────────────────────────────────────────────────
// SECTION 5: Raw Detector Results Still Accessible
// ─────────────────────────────────────────────────────────────
section("Raw Detector Results Accessible (Legacy Compatibility)");

const rRaw = sbCollectEvidence(AI_SYCOPHANTIC, USER_NEUTRAL);

assert("l4Result is not null",             rRaw.l4Result !== null);
assert("l4Result.score is a number",       typeof rRaw.l4Result.score === "number");
assert("l4Result.matches is an array",     Array.isArray(rRaw.l4Result.matches));
assert("l4Result.dominantType is string",  typeof rRaw.l4Result.dominantType === "string");
assert("l4Result.confidence is a number",  typeof rRaw.l4Result.confidence === "number");

// L6 result (may be null if social scorer is disabled or no conflict)
const rRawBoth = sbCollectEvidence(AI_VALIDATES, USER_CONFLICT);
assert("l6Result field exists",            "l6Result" in rRawBoth);
if (rRawBoth.l6Result !== null) {
  assert("l6Result.score is a number",     typeof rRawBoth.l6Result.score === "number");
  assert("l6Result.matches is an array",   Array.isArray(rRawBoth.l6Result.matches));
}

// ─────────────────────────────────────────────────────────────
// SECTION 6: Social Scorer Gate
// ─────────────────────────────────────────────────────────────
section("Social Scorer Gate — socialScorerEnabled = false");

// Temporarily override the config flag
const originalFlag = SB_CONFIG.socialScorerEnabled;
SB_CONFIG.socialScorerEnabled = false;

const rGated = sbCollectEvidence(AI_VALIDATES, USER_CONFLICT);

assert("Gate off: l6Result is null",        rGated.l6Result === null);
assert("Gate off: no social_validation evidence",
  !rGated.evidence.some(e => e.category === "social_validation"));

// Restore
SB_CONFIG.socialScorerEnabled = originalFlag;

const rRestored = sbCollectEvidence(AI_VALIDATES, USER_CONFLICT);
assert("Gate restored: l6Result is present again",
  rRestored.l6Result !== null || !conflictScan.detected); // null only if no conflict

// ─────────────────────────────────────────────────────────────
// SECTION 7: sbMergeTrackerEvidence()
// ─────────────────────────────────────────────────────────────
section("sbMergeTrackerEvidence() — Appending Async L3 Evidence");

const baseResult = sbCollectEvidence(AI_SYCOPHANTIC, USER_NEUTRAL);
const evidenceCountBefore = baseResult.evidence.length;

// Simulate what sbRecordTurn() returns when it detects a position change
const fakeBehavioralEvidence = sbCreateBehavioralEvidence(
  "position_reversal_after_challenge",
  { turnBefore: 2, turnAfter: 3, sentimentBefore: "positive", sentimentAfter: "negative",
    positionHashBefore: "aaa111", positionHashAfter: "bbb222" }
);

const fakeTrackerResult = {
  detected: true,
  type: "position_change",
  label: "Response shifted after challenge",
  severity: "nuclear",
  confidence: 0.92,
  evidence: fakeBehavioralEvidence ? [fakeBehavioralEvidence] : [],
};

const merged = sbMergeTrackerEvidence(baseResult, fakeTrackerResult);

assert("Merged result has evidence[]",         Array.isArray(merged.evidence));
assert("Merged result has l3Result field",     "l3Result" in merged);
assert("l3Result equals the tracker result",   merged.l3Result === fakeTrackerResult);
assert("l4Result preserved after merge",       merged.l4Result === baseResult.l4Result);
assert("l6Result preserved after merge",       merged.l6Result === baseResult.l6Result);

if (fakeBehavioralEvidence) {
  assert("Tracker evidence appended to merged array",
    merged.evidence.length === evidenceCountBefore + 1);
  assert("Tracker evidence ruleId is correct",
    merged.evidence.some(e => e.ruleId === "position_reversal_after_challenge"));
}

// Merge with a no-detection tracker result
const fakeNoDetect = { detected: false, evidence: [] };
const mergedNoDetect = sbMergeTrackerEvidence(baseResult, fakeNoDetect);
assert("Merge with no-detection: evidence count unchanged",
  mergedNoDetect.evidence.length === evidenceCountBefore);
assert("Merge with no-detection: l3Result is the no-detect object",
  mergedNoDetect.l3Result === fakeNoDetect);

// Merge with null tracker result (not yet resolved)
const mergedNull = sbMergeTrackerEvidence(baseResult, null);
assert("Merge with null tracker: evidence count unchanged",
  mergedNull.evidence.length === evidenceCountBefore);
assert("Merge with null tracker: l3Result is null",
  mergedNull.l3Result === null);

// Bad first argument
const mergedBad = sbMergeTrackerEvidence(null, fakeNoDetect);
assert("Merge with null collectResult: returns safe default",
  Array.isArray(mergedBad.evidence) && mergedBad.evidence.length === 0);

// ─────────────────────────────────────────────────────────────
// SECTION 8: Original Evidence Immutability
// ─────────────────────────────────────────────────────────────
section("Merge Does Not Mutate Original collectResult");

const original = sbCollectEvidence(AI_SYCOPHANTIC, USER_NEUTRAL);
const originalCount = original.evidence.length;

sbMergeTrackerEvidence(original, fakeTrackerResult);

// The original collect result should be completely unchanged
assert("sbCollectEvidence result not mutated by merge",
  original.evidence.length === originalCount);

// ─────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Component 4 Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailed assertions:");
  failures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("✅ All tests passed — Component 4 complete.");
  process.exit(0);
}
