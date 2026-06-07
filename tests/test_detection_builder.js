// ============================================================
// Test Suite — Component 5: Detection Builder
// tests/test_detection_builder.js
//
// Run: node tests/test_detection_builder.js
//
// What is being tested:
//   sbBuildDetection() — Consumes a flat array of evidence objects 
//   and produces a structured detection object representing the 
//   overall finding.
// ============================================================

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

function loadFile(relPath) {
  const code = fs.readFileSync(path.join(__dirname, relPath), "utf8");
  vm.runInThisContext(code);
}

// Full dependency chain
loadFile("../content/rules.js");
loadFile("../content/constants.js");
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

// ── Tests ─────────────────────────────────────────────────────

section("Return Shape and Null handling");

assert("Returns null for null input", sbBuildDetection(null) === null);
assert("Returns null for empty array", sbBuildDetection([]) === null);
assert("Returns null for invalid array (numbers)", sbBuildDetection([1, 2]) === null);

// Mock valid evidence
const evOpinionHigh = sbCreateEvidence("flattery_opener_great_question", "Great question!", 0, 15);
const evOpinionLow = sbCreateEvidence("great_question_subtle", "great question", 0, 14);
const evMistakeMedium = sbCreateEvidence("mistake_concession", "I made a mistake", 10, 26);
const evSocialHigh = sbCreateEvidence("intent_attribution", "obviously intended to hurt you", 5, 35);
const evBehavioralNuclear = sbCreateBehavioralEvidence("position_reversal_after_challenge", {
  turnBefore: 1, turnAfter: 2, sentimentBefore: "positive", sentimentAfter: "negative",
  positionHashBefore: "abc", positionHashAfter: "def"
});

section("Single Evidence Processing");

const singleDetection = sbBuildDetection([evOpinionLow]);
assert("Returns object for single evidence", typeof singleDetection === "object");
assert("Category is correct (opinion)", singleDetection.category === "opinion");
assert("Severity is correct (low)", singleDetection.severity === "low");
assert("RuleIds contains ruleId", singleDetection.ruleIds.includes("great_question_subtle"));
assert("Evidence array contains the evidence", singleDetection.evidence[0] === evOpinionLow);

section("Multiple Evidence, Same Category");

const multiSameDetection = sbBuildDetection([evOpinionLow, evOpinionHigh]);
assert("Category remains opinion", multiSameDetection.category === "opinion");
assert("Severity is upgraded to high", multiSameDetection.severity === "high");
assert("RuleIds contains both", multiSameDetection.ruleIds.includes("great_question_subtle") && multiSameDetection.ruleIds.includes("flattery_opener_great_question"));

section("Multiple Categories (Dominant Category Logic)");

// Opinion total weight = 1 (low) + 3 (high) = 4
// Mistake total weight = 2 (medium)
// Social total weight = 2 (high)
const complexDetection = sbBuildDetection([evOpinionLow, evMistakeMedium, evOpinionHigh, evSocialHigh]);
assert("Dominant category is opinion (weight 4)", complexDetection.category === "opinion");
assert("Severity is high (due to opinionHigh or socialHigh)", complexDetection.severity === "high");
assert("RuleIds length is 4", complexDetection.ruleIds.length === 4);
assert("Contains all valid evidence", complexDetection.evidence.length === 4);

section("Nuclear Promotion Logic");

const nuclearDetection = sbBuildDetection([evMistakeMedium, evBehavioralNuclear]);
// Mistake weight = 2, Behavioral (position_change) weight = 3
assert("Dominant category is position_change (weight 3)", nuclearDetection.category === "position_change");
assert("Severity promoted to nuclear", nuclearDetection.severity === "nuclear");
assert("RuleIds length is 2", nuclearDetection.ruleIds.length === 2);

section("Invalid Evidence Handling");

const mixedDetection = sbBuildDetection([evOpinionLow, null, { fake: true }, evOpinionHigh]);
assert("Ignores invalid elements", mixedDetection.evidence.length === 2);
assert("Category is opinion", mixedDetection.category === "opinion");
assert("Severity is high", mixedDetection.severity === "high");

// ─────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Component 5 Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailed assertions:");
  failures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("✅ All tests passed — Component 5 complete.");
  process.exit(0);
}
