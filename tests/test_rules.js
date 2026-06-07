// ============================================================
// Test Suite — Component 1: Rule Registry + Evidence Schema
// tests/test_rules.js
//
// Run: node tests/test_rules.js
// ============================================================

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

// vm.runInThisContext executes rules.js in the current Node
// global context — `const` and `function` declarations become
// genuine globals here, exactly as they would in a browser
// content script where all scripts share the same global scope.
const rulesCode = fs.readFileSync(path.join(__dirname, "../content/rules.js"), "utf8");
vm.runInThisContext(rulesCode);

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
// SECTION 1: Registry integrity
// ─────────────────────────────────────────────────────────────
section("Registry Integrity");

const VALID_CATEGORIES = ["opinion", "mistake_admission", "mimicry", "feedback", "position_change", "social_validation"];
const VALID_SEVERITIES = ["high", "medium", "low"];

assert("SB_RULES is a non-null object", typeof SB_RULES === "object" && SB_RULES !== null);
assert("SB_RULES has at least 35 rules", SB_RULE_IDS.length >= 35);

// Every rule must have all required fields
let missingFields = [];
for (const id of SB_RULE_IDS) {
  const rule = SB_RULES[id];
  const required = ["id", "category", "severity", "weight", "explanation", "reasoning"];
  for (const field of required) {
    if (!(field in rule)) missingFields.push(`${id}.${field}`);
  }
  // id in registry must match the id property
  if (rule.id !== id) missingFields.push(`${id}: id mismatch (key="${id}", rule.id="${rule.id}")`);
}
assert("Every rule has all required fields (id, category, severity, weight, explanation, reasoning)", missingFields.length === 0);
if (missingFields.length > 0) console.error("    Missing:", missingFields);

// Category validation
let invalidCategories = SB_RULE_IDS.filter(id => !VALID_CATEGORIES.includes(SB_RULES[id].category));
assert("Every rule has a valid category", invalidCategories.length === 0);
if (invalidCategories.length > 0) console.error("    Invalid category in rules:", invalidCategories);

// Severity validation
let invalidSeverities = SB_RULE_IDS.filter(id => !VALID_SEVERITIES.includes(SB_RULES[id].severity));
assert("Every rule has a valid severity (high/medium/low)", invalidSeverities.length === 0);

// Weight validation (must be 1, 2, or 3 — matching SB_PATTERNS weight convention)
let invalidWeights = SB_RULE_IDS.filter(id => ![1, 2, 3].includes(SB_RULES[id].weight));
assert("Every rule has a valid weight (1, 2, or 3)", invalidWeights.length === 0);

// Explanation and reasoning must be non-empty strings
let emptyText = SB_RULE_IDS.filter(id => {
  const r = SB_RULES[id];
  return !r.explanation || r.explanation.length < 10 ||
         !r.reasoning   || r.reasoning.length   < 10;
});
assert("Every rule has non-trivial explanation and reasoning (≥10 chars)", emptyText.length === 0);
if (emptyText.length > 0) console.error("    Short text in rules:", emptyText);

// ─────────────────────────────────────────────────────────────
// SECTION 2: Category coverage
// ─────────────────────────────────────────────────────────────
section("Category Coverage");

for (const cat of VALID_CATEGORIES) {
  const rules = sbGetRulesByCategory(cat);
  assert(`Category "${cat}" has at least 1 rule`, rules.length >= 1);
}

assert("opinion category has ≥10 rules (many patterns there)",
  sbGetRulesByCategory("opinion").length >= 10);

assert("position_change rules are marked as behavioral",
  sbGetRulesByCategory("position_change").every(r => r.evidenceSubtype === "behavioral"));

// ─────────────────────────────────────────────────────────────
// SECTION 3: Index correctness
// ─────────────────────────────────────────────────────────────
section("Rule Indexes");

assert("SB_RULE_IDS is an array matching SB_RULES keys",
  JSON.stringify(SB_RULE_IDS.sort()) === JSON.stringify(Object.keys(SB_RULES).sort()));

assert("SB_RULES_BY_CATEGORY contains all 6 categories",
  VALID_CATEGORIES.every(c => Array.isArray(SB_RULES_BY_CATEGORY[c])));

assert("SB_RULES_BY_SEVERITY contains all 3 severities",
  VALID_SEVERITIES.every(s => Array.isArray(SB_RULES_BY_SEVERITY[s])));

// Verify that counts in category index match totals
const totalViaCategory = VALID_CATEGORIES.reduce((n, c) => n + (SB_RULES_BY_CATEGORY[c] || []).length, 0);
assert("SB_RULES_BY_CATEGORY total count matches SB_RULE_IDS.length",
  totalViaCategory === SB_RULE_IDS.length);

const totalViaSeverity = VALID_SEVERITIES.reduce((n, s) => n + (SB_RULES_BY_SEVERITY[s] || []).length, 0);
assert("SB_RULES_BY_SEVERITY total count matches SB_RULE_IDS.length",
  totalViaSeverity === SB_RULE_IDS.length);

// ─────────────────────────────────────────────────────────────
// SECTION 4: sbCreateEvidence — textual
// ─────────────────────────────────────────────────────────────
section("sbCreateEvidence() — Textual Evidence Factory");

const e1 = sbCreateEvidence("flattery_opener_great_question", "Great question!", 0, 15);

assert("Returns a non-null object", e1 !== null && typeof e1 === "object");
assert("ruleId is correct",       e1.ruleId  === "flattery_opener_great_question");
assert("category is correct",     e1.category === "opinion");
assert("severity is correct",     e1.severity === "high");
assert("weight is correct",       e1.weight   === 3);
assert("matchedText is set",      e1.matchedText === "Great question!");
assert("startIndex is set",       e1.startIndex === 0);
assert("endIndex is set",         e1.endIndex   === 15);
assert("evidenceType is textual", e1.evidenceType === "textual");
assert("explanation is populated from rule",
  typeof e1.explanation === "string" && e1.explanation.length > 0);
assert("reasoning is populated from rule",
  typeof e1.reasoning === "string" && e1.reasoning.length > 0);
assert("Object is frozen (immutable)",
  Object.isFrozen(e1));

// Unknown ruleId returns null
const eNull = sbCreateEvidence("totally_fake_rule_id", "text", 0, 4);
assert("Unknown ruleId returns null", eNull === null);

// Overrides work
const e2 = sbCreateEvidence("absolute_validation", "you're completely right", 10, 32, { snippetSentence: "Yes, you're completely right about this." });
assert("Override field is present", e2.snippetSentence === "Yes, you're completely right about this.");
assert("Core fields not corrupted by override", e2.ruleId === "absolute_validation");

// Edge: empty matchedText still creates a valid object
const e3 = sbCreateEvidence("great_question_subtle", "", 0, 0);
assert("Empty matchedText produces object (not null)", e3 !== null);
assert("Empty matchedText stored as empty string", e3.matchedText === "");

// ─────────────────────────────────────────────────────────────
// SECTION 5: sbCreateBehavioralEvidence
// ─────────────────────────────────────────────────────────────
section("sbCreateBehavioralEvidence() — Behavioral Evidence Factory");

const behavData = { turnBefore: 3, turnAfter: 4, sentimentBefore: "positive", sentimentAfter: "negative" };
const b1 = sbCreateBehavioralEvidence("position_reversal_after_challenge", behavData);

assert("Returns a non-null object",    b1 !== null && typeof b1 === "object");
assert("ruleId is correct",            b1.ruleId    === "position_reversal_after_challenge");
assert("category is position_change",  b1.category  === "position_change");
assert("severity is high",             b1.severity  === "high");
assert("matchedText is null",          b1.matchedText === null);
assert("startIndex is null",           b1.startIndex  === null);
assert("endIndex is null",             b1.endIndex    === null);
assert("evidenceType is behavioral",   b1.evidenceType === "behavioral");
assert("behavioralData is stored",     b1.behavioralData.turnBefore === 3);
assert("behavioralData is frozen",     Object.isFrozen(b1.behavioralData));
assert("Object is frozen",             Object.isFrozen(b1));

// Unknown ruleId returns null
const bNull = sbCreateBehavioralEvidence("not_a_real_rule", {});
assert("Unknown ruleId returns null", bNull === null);

// Non-behavioral rule used in behavioral factory emits warning but still works
// (test that it doesn't crash — warning goes to console, not throws)
let didNotThrow = true;
try {
  const bWrong = sbCreateBehavioralEvidence("flattery_opener_great_question", {});
  // Should still return an object, not crash
} catch (err) {
  didNotThrow = false;
}
assert("Using non-behavioral rule ID in behavioral factory doesn't throw", didNotThrow);

// ─────────────────────────────────────────────────────────────
// SECTION 6: sbValidateEvidence
// ─────────────────────────────────────────────────────────────
section("sbValidateEvidence() — Schema Validation");

// Valid textual evidence
assert("Valid textual evidence passes", sbValidateEvidence(e1) === true);

// Valid behavioral evidence
assert("Valid behavioral evidence passes", sbValidateEvidence(b1) === true);

// Null / non-object
assert("null fails validation",      sbValidateEvidence(null)      === false);
assert("string fails validation",    sbValidateEvidence("text")    === false);
assert("number fails validation",    sbValidateEvidence(42)        === false);
assert("empty object fails",         sbValidateEvidence({})        === false);

// Missing fields
const badMissingField = { ...e1, ruleId: undefined };
assert("Missing ruleId fails",
  sbValidateEvidence(badMissingField) === false);

// Wrong evidenceType
const badType = { ...e1, evidenceType: "unknown" };
assert("Invalid evidenceType fails", sbValidateEvidence(badType) === false);

// ruleId not in registry
const badRuleId = { ...e1, ruleId: "not_in_registry" };
assert("Non-existent ruleId fails", sbValidateEvidence(badRuleId) === false);

// category mismatch
const badCategory = { ...e1, category: "social_validation" };  // rule is "opinion"
assert("Category mismatch fails", sbValidateEvidence(badCategory) === false);

// Textual: negative startIndex
const badStart = { ...e1, startIndex: -1 };
assert("Negative startIndex fails", sbValidateEvidence(badStart) === false);

// Behavioral: non-null matchedText
const badBehavTextual = { ...b1, matchedText: "some text" };
assert("Behavioral evidence with non-null matchedText fails",
  sbValidateEvidence(badBehavTextual) === false);

// Behavioral: missing behavioralData
const badBehavData = Object.freeze({ ...b1, behavioralData: undefined });
assert("Behavioral evidence without behavioralData fails",
  sbValidateEvidence(badBehavData) === false);

// ─────────────────────────────────────────────────────────────
// SECTION 7: sbGetRule, sbIsBehavioralRule helpers
// ─────────────────────────────────────────────────────────────
section("Lookup Helpers");

assert("sbGetRule returns correct rule",
  sbGetRule("cave_in_admission").id === "cave_in_admission");

assert("sbGetRule returns null for unknown id",
  sbGetRule("totally_unknown") === null);

assert("sbIsBehavioralRule is true for position_reversal_after_challenge",
  sbIsBehavioralRule("position_reversal_after_challenge") === true);

assert("sbIsBehavioralRule is true for possible_position_shift",
  sbIsBehavioralRule("possible_position_shift") === true);

assert("sbIsBehavioralRule is false for opinion rules",
  sbIsBehavioralRule("flattery_opener_great_question") === false);

assert("sbIsBehavioralRule is false for unknown rule",
  sbIsBehavioralRule("unknown_rule") === false);

// ─────────────────────────────────────────────────────────────
// SECTION 8: Pattern-to-rule coverage check
// Every SB_PATTERNS group must have a corresponding rule
// (we can't load constants.js here, so we check by label convention)
// ─────────────────────────────────────────────────────────────
section("Expected Rule IDs Exist (Pattern-to-Rule Mapping)");

// These are the rule IDs that will be used by the refactored detector
// (Component 2). Verify they all exist now, in advance.
const expectedRuleIds = [
  // opinion — opener group (weight 3)
  "flattery_opener_great_question",
  "flattery_opener_exclamatory",
  "flattery_opener_sycophantic_agreement",
  // opinion — validation group (weight 2)
  "absolute_validation",
  "point_validation",
  "intelligence_flattery",
  "enthusiasm_flattery",
  "point_amplification",
  "unconditional_agreement",
  // opinion — subtle group (weight 1)
  "great_question_subtle",
  "articulation_flattery",
  "intuition_validation",
  "concern_validation",
  "sense_validation",
  "maximum_agreement",
  "nail_metaphor",
  "interesting_qualifier",
  // mistake_admission — cave group
  "cave_in_admission",
  "apologetic_reversal",
  "self_correction_cave",
  "reconsidered_agreement",
  "mistake_concession",
  // mimicry group
  "echo_deference",
  "framing_adoption",
  "build_on_flattery",
  "known_misconception_echo",
  // feedback group
  "superlative_feedback",
  "rarity_praise",
  "work_praise",
  // position_change (behavioral)
  "position_reversal_after_challenge",
  "possible_position_shift",
  // social_validation
  "one_sided_user_validation",
  "feelings_validation",
  "other_party_blame",
  "deserve_better",
  "intent_attribution",
  "toxic_label_adoption",
];

const missingExpected = expectedRuleIds.filter(id => !SB_RULES[id]);
assert(`All ${expectedRuleIds.length} expected rule IDs exist in SB_RULES`, missingExpected.length === 0);
if (missingExpected.length > 0) console.error("    Missing expected rule IDs:", missingExpected);

// ─────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Component 1 Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\nFailed assertions:`);
  failures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("✅ All tests passed — Component 1 complete.");
  process.exit(0);
}
