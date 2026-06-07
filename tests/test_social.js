// ============================================================
// Tests for Layer 6 Social Validation Risk
// Run: node tests/test_social.js
// ============================================================

const vm = require("vm");
const fs = require("fs");
const _load = (f) => vm.runInThisContext(fs.readFileSync(f, "utf8"), { filename: f });

// Mock browser APIs and other module globals
globalThis.window = { location: { hostname: "claude.ai", href: "https://claude.ai" } };
globalThis.sbGetPlatformKey = () => "claude.ai";
globalThis.sbQueryInput = () => null;
globalThis.sbQueryResponses = () => [];
globalThis.SB_PLATFORMS = {
  "claude.ai": {
    name: "Claude",
    injectText: () => {}
  }
};
globalThis.sbState = { enabled: true };
globalThis.sbShouldInjectContract = () => false;
globalThis.sbShowEpistemicPanel = () => {};

_load("content/constants.js");
_load("content/social.js");
_load("content/epistemic.js");
_load("content/interceptor.js");

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else           { failed++; console.log(`  ✕ ${name}`); }
}

// ═════════════════════════════════════════════════════════════
// 1. SOCIAL CONFLICT SCANNING
// ═════════════════════════════════════════════════════════════
console.log("\n1. Social Conflict Scanning (User Prompts)");
console.log("─".repeat(50));

const conflictPrompt1 = "My boyfriend always criticizes me in front of our friends. I did nothing wrong, but he is manipulative and toxic.";
const conflictPrompt2 = "My boss was totally unfair during the performance review. Am I wrong to feel angry about how she treated me?";
const neutralPrompt = "Can you help me write a Python function that merges two sorted lists?";

assert("Detects conflict prompt (boyfriend scenario)", sbScanSocialConflict(conflictPrompt1).detected === true);
assert("Detects conflict prompt (boss scenario)", sbScanSocialConflict(conflictPrompt2).detected === true);
assert("Ignores neutral prompt (code request)", sbScanSocialConflict(neutralPrompt).detected === false);

// ═════════════════════════════════════════════════════════════
// 2. PERSPECTIVE TRANSFORM GENERATION
// ═════════════════════════════════════════════════════════════
console.log("\n2. Perspective Transform Generation");
console.log("─".repeat(50));

const originalText = "My wife is ignoring me. I think she is selfish.";
const transform = sbBuildConflictPerspectiveTransform(originalText);

assert("Transform contains original text", transform.original === originalText);
assert("Transform appends balanced prompt", transform.rewritten.includes("identify the strongest fair interpretation of the other person's side"));
assert("Transform matches certainty format", transform.certainty.label === "Perspective" && transform.certainty.color === "#aa66ff");

// ═════════════════════════════════════════════════════════════
// 3. SOCIAL VALIDATION RESPONSE SCANNING
// ═════════════════════════════════════════════════════════════
console.log("\n3. Social Validation Response Scanning (AI Responses)");
console.log("─".repeat(50));

const biasedAIResponse = "You're completely justified. Your wife's behavior is definitely toxic and she is clearly wrong here. You deserve better.";
const balancedAIResponse = "Let's consider the other perspective. What role did you play in this situation? Consider how she might feel.";

const scanBiased = sbAnalyzeSocialValidation(originalText, biasedAIResponse);
assert("Flags one-sided validation as risk", scanBiased.detected === true);
assert("One-sided validation severity is high", scanBiased.severity === "nuclear" || scanBiased.severity === "moderate");
assert("Match info contains details", scanBiased.matches.length > 0 && scanBiased.matches[0].type === "social_validation");

const scanBalanced = sbAnalyzeSocialValidation(originalText, balancedAIResponse);
assert("Balanced AI response is NOT flagged", scanBalanced.detected === false);

// ═════════════════════════════════════════════════════════════
// 4. COUNTER-PROMPTS POOL
// ═════════════════════════════════════════════════════════════
console.log("\n4. Counter-Prompts Pool");
console.log("─".repeat(50));

const cpNuclear = sbGetCounterPrompt("nuclear", "social_validation");
const cpModerate = sbGetCounterPrompt("moderate", "social_validation");

assert("Nuclear L6 prompt is a question", cpNuclear.includes("?"));
assert("Moderate L6 prompt is a question", cpModerate.includes("?"));

// ═════════════════════════════════════════════════════════════
// 5. UNIFIED SCANNER INTEGRATION
// ═════════════════════════════════════════════════════════════
console.log("\n5. Unified Scanner Integration");
console.log("─".repeat(50));

// Test Epistemic routing
const epistemicPrompt = "I'm absolutely certain that React is better than Angular.";
const epistemicTransform = _sbBuildPromptRiskTransform(epistemicPrompt);
assert("Unified scanner routes Epistemic trigger", epistemicTransform !== null && epistemicTransform.label === "Certainty assertion");

// Test Social routing
const socialTransform = _sbBuildPromptRiskTransform(conflictPrompt1);
assert("Unified scanner routes Social conflict trigger", socialTransform !== null && socialTransform.label === "Social conflict framing");

// Test Non-trigger routing
const plainTransform = _sbBuildPromptRiskTransform(neutralPrompt);
assert("Unified scanner ignores plain text", plainTransform === null);

// ═════════════════════════════════════════════════════════════
// RESULTS
// ═════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(50));
console.log(`Result: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed === 0) {
  console.log("\n✓ All tests passed!");
} else {
  process.exitCode = 1;
}
