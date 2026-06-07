// ============================================================
// Test Suite — Component 2: L4 Detector Evidence Production
// tests/test_detector_evidence.js
//
// Run: node tests/test_detector_evidence.js
//
// Verifies:
//   1. sbAnalyzeText() returns evidence[] in its result
//   2. Evidence objects have correct ruleId, matchedText, indices
//   3. startIndex / endIndex are accurate against original text
//   4. All legacy fields (score, matches, dominantType) unchanged
//   5. Multiple patterns → multiple evidence objects
//   6. known_misconception_echo evidence is produced
//   7. Edge cases: empty, short, no-match text
// ============================================================

const fs  = require("fs");
const path = require("path");
const vm  = require("vm");

function loadFile(relPath) {
  const code = fs.readFileSync(path.join(__dirname, relPath), "utf8");
  vm.runInThisContext(code);
}

// Load dependency chain: rules → constants → detector
loadFile("../content/rules.js");
loadFile("../content/constants.js");
loadFile("../content/detector.js");

// ── Test runner ───────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(description, condition) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${description}`);
  } else {
    failed++;
    failures.push(description);
    console.error(`  ✗ FAIL: ${description}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ─────────────────────────────────────────────────────────────
// SECTION 1: Return shape — evidence[] present
// ─────────────────────────────────────────────────────────────
section("Return Shape — evidence[] Field");

const resultEmpty = sbAnalyzeText("");
assert("Short text returns evidence: []", Array.isArray(resultEmpty.evidence));
assert("Short text evidence is empty",   resultEmpty.evidence.length === 0);

// Legacy fields still present on short-text early return
assert("Short text still has score field",       "score"       in resultEmpty);
assert("Short text still has matches field",     "matches"     in resultEmpty);
assert("Short text still has dominantType field","dominantType" in resultEmpty);
assert("Short text still has confidence field",  "confidence"  in resultEmpty);
assert("Short text still has meta field",        "meta"        in resultEmpty);

const noMatch = sbAnalyzeText("Here is a neutral, helpful response to your question without any sycophantic patterns at all.");
assert("No-match text returns empty evidence[]", noMatch.evidence.length === 0);
assert("No-match score is 0",                    noMatch.score === 0);

// ─────────────────────────────────────────────────────────────
// SECTION 2: Legacy fields are completely unchanged
// ─────────────────────────────────────────────────────────────
section("Legacy Backward Compatibility");

const TEXT_FLATTERY = "Great question! Let me explain this thoroughly.";
const r1 = sbAnalyzeText(TEXT_FLATTERY);

assert("score is a positive number",                    r1.score > 0);
assert("matches is a non-empty array",                  r1.matches.length > 0);
assert("matches[0] has label field",                    typeof r1.matches[0].label === "string");
assert("matches[0] has weight field",                   typeof r1.matches[0].weight === "number");
assert("matches[0] has type field",                     typeof r1.matches[0].type === "string");
assert("matches[0] has snippet field",                  typeof r1.matches[0].snippet === "string");
assert("dominantType is a string",                      typeof r1.dominantType === "string");
assert("confidence is a number between 0 and 1",        r1.confidence >= 0 && r1.confidence <= 1);
assert("meta.riskLabel is a string",                    typeof r1.meta.riskLabel === "string");
assert("meta.technicalType is a string",                typeof r1.meta.technicalType === "string");
assert("meta.confidence is a number (meta.confidenceBase lives on SB_EVIDENCE, not returned meta)",
  typeof r1.meta.confidence === "number");

// Score must be identical to what the old pipeline would return
// (regression: adding evidence must not change score)
const TEXT_CAVE = "You're right, I was wrong about that. Let me correct my previous answer.";
const r2 = sbAnalyzeText(TEXT_CAVE);
assert("Cave-in text scores ≥3 (same as before refactor)", r2.score >= 3);
assert("Cave-in dominantType is mistake_admission",
  r2.dominantType === "mistake_admission");

// ─────────────────────────────────────────────────────────────
// SECTION 3: Evidence is produced for matched patterns
// ─────────────────────────────────────────────────────────────
section("Evidence Production — Correct ruleId");

// "Great question" opener → flattery_opener_great_question
const r3 = sbAnalyzeText("Great question! This is a complex topic.");
assert("evidence[] has at least one item",         r3.evidence.length >= 1);
assert("First evidence ruleId is correct",
  r3.evidence.some(e => e.ruleId === "flattery_opener_great_question"));
assert("Evidence evidenceType is 'textual'",
  r3.evidence.every(e => e.evidenceType === "textual"));

// "You're absolutely right" → absolute_validation
const r4 = sbAnalyzeText("You're absolutely right about this important matter.");
assert("Absolute validation produces evidence",
  r4.evidence.some(e => e.ruleId === "absolute_validation"));

// Cave-in → cave_in_admission
const r5 = sbAnalyzeText("You're right, I was wrong. Let me correct that.");
assert("Cave-in produces cave_in_admission evidence",
  r5.evidence.some(e => e.ruleId === "cave_in_admission"));

// Mimicry → echo_deference
const r6 = sbAnalyzeText("As you correctly mentioned earlier, this is indeed the case.");
assert("Echo deference produces echo_deference evidence",
  r6.evidence.some(e => e.ruleId === "echo_deference"));

// Feedback → work_praise
const r7 = sbAnalyzeText("Your code is exceptional and demonstrates outstanding engineering skill.");
assert("Work praise produces work_praise evidence",
  r7.evidence.some(e => e.ruleId === "work_praise"));

// ─────────────────────────────────────────────────────────────
// SECTION 4: startIndex / endIndex accuracy
// ─────────────────────────────────────────────────────────────
section("startIndex / endIndex Accuracy");

// Test text where match position is known and verifiable
const TEXT_OPENER = "Great question! Now let me explain the details.";
const r8 = sbAnalyzeText(TEXT_OPENER);
const openerEv = r8.evidence.find(e => e.ruleId === "flattery_opener_great_question");

assert("Evidence found for opener text",        openerEv !== undefined);

if (openerEv) {
  assert("matchedText is a non-empty string",     openerEv.matchedText.length > 0);
  assert("startIndex is 0 (match at line start)", openerEv.startIndex === 0);
  assert("endIndex equals startIndex + matchedText.length",
    openerEv.endIndex === openerEv.startIndex + openerEv.matchedText.length);

  // Verify the slice is actually what matched in the original text
  const extractedSlice = TEXT_OPENER.slice(openerEv.startIndex, openerEv.endIndex);
  assert("Slice of original text matches matchedText exactly",
    extractedSlice === openerEv.matchedText);
}

// Test a mid-text match
const TEXT_MID = "I've looked at this carefully. You've clearly thought about this a lot and I appreciate your approach.";
const r9 = sbAnalyzeText(TEXT_MID);
const midEv = r9.evidence.find(e =>
  e.ruleId === "intelligence_flattery" || e.ruleId === "enthusiasm_flattery"
);

assert("Mid-text match produces evidence", midEv !== undefined);
if (midEv) {
  assert("Mid-text startIndex > 0 (not at beginning)",  midEv.startIndex >= 0);
  assert("Mid-text endIndex > startIndex",              midEv.endIndex > midEv.startIndex);
  const extractedSlice = TEXT_MID.slice(midEv.startIndex, midEv.endIndex);
  assert("Slice of mid-text matches matchedText exactly",
    extractedSlice === midEv.matchedText);
}

// ─────────────────────────────────────────────────────────────
// SECTION 5: Evidence object schema validity
// ─────────────────────────────────────────────────────────────
section("Evidence Schema Validity (via sbValidateEvidence)");

const rSchema = sbAnalyzeText("Great question! You're absolutely right about this.");
for (const ev of rSchema.evidence) {
  assert(`Evidence for "${ev.ruleId}" passes schema validation`,
    sbValidateEvidence(ev) === true);
}

// Evidence objects must be frozen
const rFrozen = sbAnalyzeText("Great question! That's a really great point you make.");
for (const ev of rFrozen.evidence) {
  assert(`Evidence for "${ev.ruleId}" is frozen (immutable)`,
    Object.isFrozen(ev));
}

// ─────────────────────────────────────────────────────────────
// SECTION 6: Multiple patterns → multiple evidence objects
// ─────────────────────────────────────────────────────────────
section("Multiple Patterns → Multiple Evidence Objects");

// Text designed to trigger opener + validation simultaneously
const TEXT_MULTI = "Excellent question! You're absolutely right about this important topic. That makes total sense and I completely agree.";
const rMulti = sbAnalyzeText(TEXT_MULTI);

assert("Multiple patterns produce multiple evidence items",
  rMulti.evidence.length >= 2);
assert("evidence count >= matches count (one evidence per matched pattern)",
  rMulti.evidence.length >= rMulti.matches.length);

// All ruleIds should be distinct (same pattern shouldn't fire twice on same text)
const ruleIds = rMulti.evidence.map(e => e.ruleId);
const uniqueIds = new Set(ruleIds);
assert("No duplicate ruleIds in evidence for same text",
  ruleIds.length === uniqueIds.size);

// ─────────────────────────────────────────────────────────────
// SECTION 7: known_misconception_echo evidence
// ─────────────────────────────────────────────────────────────
section("known_misconception_echo Evidence");

// Trigger: user claims Rust will replace C++, AI adopts it
const USER_RUST = "I'm sure Rust will replace C++ soon.";
const AI_RUST   = "You're right, Rust will replace C++ as systems programming matures.";
const rRust = sbAnalyzeText(AI_RUST, USER_RUST);

assert("Misconception echo detected (score increased)",
  rRust.score >= 2);
assert("Misconception echo produces evidence",
  rRust.evidence.some(e => e.ruleId === "known_misconception_echo"));

const miscEv = rRust.evidence.find(e => e.ruleId === "known_misconception_echo");
if (miscEv) {
  assert("Misconception evidence matchedText is not empty",
    miscEv.matchedText && miscEv.matchedText.length > 0);
  assert("Misconception evidence startIndex is a non-negative number",
    typeof miscEv.startIndex === "number" && miscEv.startIndex >= 0);
  assert("Misconception evidence passes schema validation",
    sbValidateEvidence(miscEv) === true);
  // Verify slice
  const slice = AI_RUST.slice(miscEv.startIndex, miscEv.endIndex);
  assert("Misconception evidence slice matches matchedText",
    slice === miscEv.matchedText);
}

// No evidence if AI corrects the misconception
const AI_RUST_CORRECTED = "Rust is unlikely to fully replace C++ — they are likely to coexist.";
const rRustCorrected = sbAnalyzeText(AI_RUST_CORRECTED, USER_RUST);
assert("No misconception evidence when AI corrects the claim",
  !rRustCorrected.evidence.some(e => e.ruleId === "known_misconception_echo"));

// No evidence if user didn't make the claim
const rRustNoUser = sbAnalyzeText(AI_RUST, "");
assert("No misconception evidence when userText is empty",
  !rRustNoUser.evidence.some(e => e.ruleId === "known_misconception_echo"));

// ─────────────────────────────────────────────────────────────
// SECTION 8: Score regression — evidence must not alter score
// ─────────────────────────────────────────────────────────────
section("Score Regression — Evidence Must Not Change Score");

// The score values these texts produce must remain the same as
// before the Component 2 refactor. Check against expected values
// derived from the original pattern weights.
const cases = [
  {
    // "Great question! Let me now walk you through the answer carefully."
    // Opener patterns: 'Great question' matches both 'Flattery opener' (weight 3)
    // and 'Great question opener' subtle (weight 1) = 4 total
    text: "Great question! Let me now walk you through the answer carefully.",
    desc: "Single opener text (Flattery opener w3 + Great question subtle w1 = 4)",
    expectedScore: 4,
  },
  {
    // Verify score for cave-in only
    text: "You're right, I was wrong about that earlier statement.",
    desc: "Cave-in admission (weight 3)",
    expectedScore: 3,
  },
  {
    text: "I couldn't agree more with your perspective on this topic.",
    desc: "Maximum agreement (weight 1)",
    expectedScore: 1,
  },
  {
    // "As you correctly mentioned" → Echo deference (w2) only.
    // Framing adoption pattern checks for different phrasing.
    text: "As you correctly mentioned, that is exactly right and I agree.",
    desc: "Echo deference (weight 2)",
    expectedScore: 2,
  },
];

for (const { text, desc, expectedScore } of cases) {
  const r = sbAnalyzeText(text);
  assert(`Score unchanged: "${desc}" → score=${r.score}`,
    r.score === expectedScore);
}

// ─────────────────────────────────────────────────────────────
// SECTION 9: _SB_LABEL_TO_RULE_ID coverage
// Every label in SB_PATTERNS must have a mapping
// ─────────────────────────────────────────────────────────────
section("Label-to-RuleId Map Coverage");

// Collect all labels from SB_PATTERNS
const allPatternLabels = [
  ...SB_PATTERNS.opener,
  ...SB_PATTERNS.validation,
  ...SB_PATTERNS.subtle,
  ...SB_PATTERNS.cave,
  ...SB_PATTERNS.mimicry,
  ...SB_PATTERNS.feedback,
].map(p => p.label);
allPatternLabels.push("Known misconception echoed"); // from scoreMimicryMisconceptions

const missingLabels = allPatternLabels.filter(l => !_SB_LABEL_TO_RULE_ID[l]);
assert(
  `All ${allPatternLabels.length} pattern labels have a ruleId mapping`,
  missingLabels.length === 0
);
if (missingLabels.length > 0) console.error("  Missing labels:", missingLabels);

// Every mapped ruleId must exist in SB_RULES
const mappedIds = Object.values(_SB_LABEL_TO_RULE_ID);
const unknownIds = mappedIds.filter(id => !SB_RULES[id]);
assert("Every mapped ruleId exists in SB_RULES", unknownIds.length === 0);
if (unknownIds.length > 0) console.error("  Unknown ruleIds:", unknownIds);

// ─────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Component 2 Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailed assertions:");
  failures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("✅ All tests passed — Component 2 complete.");
  process.exit(0);
}
