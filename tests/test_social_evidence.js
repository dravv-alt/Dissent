// ============================================================
// Test Suite — Component 3: L6 Social Evidence Production
// tests/test_social_evidence.js
//
// Run: node tests/test_social_evidence.js
//
// Verifies:
//   1. sbAnalyzeSocialValidation() returns evidence[] in result
//   2. Each matched validation pattern produces one evidence object
//   3. Correct ruleId per pattern index
//   4. matchedText, startIndex, endIndex accurate
//   5. evidence[] is empty when no validation detected
//   6. All legacy fields unchanged (detected, score, severity, matches, meta)
//   7. sbScanSocialConflict() unchanged (no regression)
// ============================================================

const fs  = require("fs");
const path = require("path");
const vm  = require("vm");

function loadFile(relPath) {
  const code = fs.readFileSync(path.join(__dirname, relPath), "utf8");
  vm.runInThisContext(code);
}

loadFile("../content/rules.js");
loadFile("../content/constants.js");
loadFile("../content/social.js");

// ── Test runner ───────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(desc, cond) {
  if (cond) { passed++; console.log(`  ✓ ${desc}`); }
  else       { failed++; failures.push(desc); console.error(`  ✗ FAIL: ${desc}`); }
}

function section(title) { console.log(`\n── ${title} ──`); }

// ── Shared test fixtures ──────────────────────────────────────
// A user prompt that reliably crosses the L6 conflict threshold
const USER_CONFLICT =
  "My partner and I had a big fight. I did nothing wrong but they always blame me. Should I apologize?";

// AI responses exercising each validation pattern
const AI_VALIDATION_0 = "You're right, your partner was completely out of line here.";
const AI_VALIDATION_1 = "Your feelings are completely valid given what happened.";
const AI_VALIDATION_2 = "They were clearly wrong to treat you this way.";
const AI_VALIDATION_3 = "You deserve better than this kind of treatment.";

// An AI response that balances both sides (should reduce score)
const AI_BALANCED = "Consider their perspective — you may have played a role in this conflict too.";

// A neutral user text (no conflict detected → no evidence)
const USER_NEUTRAL = "Can you help me write a cover letter?";

// ─────────────────────────────────────────────────────────────
// SECTION 1: Return shape — evidence[] always present
// ─────────────────────────────────────────────────────────────
section("Return Shape — evidence[] Field");

const noConflict = sbAnalyzeSocialValidation(USER_NEUTRAL, AI_VALIDATION_0);
assert("Non-conflict user: evidence[] present",      Array.isArray(noConflict.evidence));
assert("Non-conflict user: evidence[] is empty",     noConflict.evidence.length === 0);
assert("Non-conflict user: detected is false",       noConflict.detected === false);

const noAiText = sbAnalyzeSocialValidation(USER_CONFLICT, "");
assert("Empty aiText: evidence[] present",           Array.isArray(noAiText.evidence));
assert("Empty aiText: evidence[] is empty",          noAiText.evidence.length === 0);

// ─────────────────────────────────────────────────────────────
// SECTION 2: Legacy fields unchanged
// ─────────────────────────────────────────────────────────────
section("Legacy Backward Compatibility");

const rLegacy = sbAnalyzeSocialValidation(USER_CONFLICT, AI_VALIDATION_0 + " " + AI_VALIDATION_2);

assert("detected field is boolean",          typeof rLegacy.detected === "boolean");
assert("score field is a number",            typeof rLegacy.score    === "number");
assert("severity field is a string",         typeof rLegacy.severity === "string");
assert("dominantType is social_validation",  rLegacy.dominantType === "social_validation");
assert("matches[] is an array",              Array.isArray(rLegacy.matches));
assert("meta.riskLabel is a string",         typeof rLegacy.meta.riskLabel === "string");
assert("evidence[] is also present",         Array.isArray(rLegacy.evidence));

// When detected, legacy matches[] still has the single hardcoded entry
if (rLegacy.detected) {
  assert("Legacy matches[0] label is correct",
    rLegacy.matches[0].label === "One-sided social validation risk");
  assert("Legacy matches[0].type is social_validation",
    rLegacy.matches[0].type === "social_validation");
  assert("Legacy matches[0].snippet is the hardcoded string",
    typeof rLegacy.matches[0].snippet === "string" && rLegacy.matches[0].snippet.length > 0);
}

// ─────────────────────────────────────────────────────────────
// SECTION 3: Per-pattern evidence production
// ─────────────────────────────────────────────────────────────
section("Per-Pattern Evidence Production");

// Pattern 0: "you're right / completely justified"
const r0 = sbAnalyzeSocialValidation(USER_CONFLICT, AI_VALIDATION_0);
const ev0 = r0.evidence.find(e => e.ruleId === "one_sided_user_validation");
assert("Pattern 0 produces one_sided_user_validation evidence", ev0 !== undefined);

// Pattern 1: "your feelings are valid"
const r1 = sbAnalyzeSocialValidation(USER_CONFLICT, AI_VALIDATION_1);
const ev1 = r1.evidence.find(e => e.ruleId === "feelings_validation");
assert("Pattern 1 produces feelings_validation evidence", ev1 !== undefined);

// Pattern 2: "they were clearly wrong"
const r2 = sbAnalyzeSocialValidation(USER_CONFLICT, AI_VALIDATION_2);
const ev2 = r2.evidence.find(e => e.ruleId === "other_party_blame");
assert("Pattern 2 produces other_party_blame evidence", ev2 !== undefined);

// Pattern 3: "you deserve better"
const r3 = sbAnalyzeSocialValidation(USER_CONFLICT, AI_VALIDATION_3);
const ev3 = r3.evidence.find(e => e.ruleId === "deserve_better");
assert("Pattern 3 produces deserve_better evidence", ev3 !== undefined);

// Multiple patterns in one response → multiple evidence objects
const rMulti = sbAnalyzeSocialValidation(USER_CONFLICT,
  AI_VALIDATION_0 + " " + AI_VALIDATION_3);
assert("Two matched patterns produce ≥2 evidence objects",
  rMulti.evidence.length >= 2);

// ─────────────────────────────────────────────────────────────
// SECTION 4: matchedText / startIndex / endIndex accuracy
// ─────────────────────────────────────────────────────────────
section("matchedText / startIndex / endIndex Accuracy");

// Test with pattern 0 where match position is verifiable
const AI_P0 = "Based on your account, you're right that this seems unfair.";
const rIdx = sbAnalyzeSocialValidation(USER_CONFLICT, AI_P0);
const evIdx = rIdx.evidence.find(e => e.ruleId === "one_sided_user_validation");

assert("Evidence found for pattern 0 text", evIdx !== undefined);
if (evIdx) {
  assert("matchedText is a non-empty string",   evIdx.matchedText.length > 0);
  assert("startIndex is a non-negative number", evIdx.startIndex >= 0);
  assert("endIndex > startIndex",               evIdx.endIndex > evIdx.startIndex);
  assert("endIndex = startIndex + matchedText.length",
    evIdx.endIndex === evIdx.startIndex + evIdx.matchedText.length);

  const slice = AI_P0.slice(evIdx.startIndex, evIdx.endIndex);
  assert("Slice of aiText matches matchedText exactly", slice === evIdx.matchedText);
}

// ─────────────────────────────────────────────────────────────
// SECTION 5: Evidence schema validity
// ─────────────────────────────────────────────────────────────
section("Evidence Schema Validity");

const rAll = sbAnalyzeSocialValidation(
  USER_CONFLICT,
  AI_VALIDATION_0 + " " + AI_VALIDATION_1 + " " + AI_VALIDATION_2 + " " + AI_VALIDATION_3
);

for (const ev of rAll.evidence) {
  assert(`Evidence "${ev.ruleId}" passes sbValidateEvidence()`, sbValidateEvidence(ev) === true);
  assert(`Evidence "${ev.ruleId}" is frozen (immutable)`,       Object.isFrozen(ev));
  assert(`Evidence "${ev.ruleId}" evidenceType is textual`,     ev.evidenceType === "textual");
  assert(`Evidence "${ev.ruleId}" category is social_validation`,
    ev.category === "social_validation");
}

// ─────────────────────────────────────────────────────────────
// SECTION 6: Evidence empty when AI balances (no validation match)
// ─────────────────────────────────────────────────────────────
section("No Evidence on Balanced Response");

const rBal = sbAnalyzeSocialValidation(USER_CONFLICT, AI_BALANCED);
assert("Balanced AI response: no validation evidence produced",
  rBal.evidence.length === 0);
assert("Balanced AI response: detected is false (score reduced by balance)",
  rBal.detected === false);

// ─────────────────────────────────────────────────────────────
// SECTION 7: sbScanSocialConflict() — no regression
// ─────────────────────────────────────────────────────────────
section("sbScanSocialConflict() Regression");

const scan1 = sbScanSocialConflict(USER_CONFLICT);
assert("Conflict text detected",       scan1.detected === true);
assert("Conflict score ≥ 2",           scan1.score >= 2);
assert("confidence is a number",       typeof scan1.confidence === "number");
assert("evidenceGrade is present",     typeof scan1.evidenceGrade === "string");

const scan2 = sbScanSocialConflict(USER_NEUTRAL);
assert("Neutral text not detected",    scan2.detected === false);

const scan3 = sbScanSocialConflict("");
assert("Empty text not detected",      scan3.detected === false);

// ─────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Component 3 Social Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailed assertions:");
  failures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("✅ All social tests passed.");
  process.exit(0);
}
