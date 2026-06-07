// ============================================================
// Tests for L3 Conversation State Tracker
// Tests challenge detection, sentiment extraction, position
// extraction, and the full position-change detection flow.
//
// Note: HMAC hashing requires SubtleCrypto (Web Crypto API)
// which isn't available in plain Node.js. We test the
// non-crypto functions directly and mock the async flow.
// ============================================================

// Load modules — vm.runInThisContext puts const/let in the right scope
const vm = require("vm");
const fs = require("fs");
const _load = (f) => vm.runInThisContext(fs.readFileSync(f, "utf8"), { filename: f });
_load("content/constants.js");
_load("content/tracker.js");

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else           { failed++; console.log(`  ✕ ${name}`); }
}

// ═════════════════════════════════════════════════════════════
// 1. CHALLENGE DETECTION
// ═════════════════════════════════════════════════════════════
console.log("\n1. Challenge Detection");
console.log("─".repeat(50));

// Should detect challenges
assert("Direct disagreement",
  sbDetectChallenge("I don't think that's right, the answer should be 42"));
assert("Strong disagreement",
  sbDetectChallenge("No, that's wrong. The correct answer is different."));
assert("Are you sure",
  sbDetectChallenge("Are you sure about that? I've seen different numbers."));
assert("Actually I think",
  sbDetectChallenge("Actually, I think the framework handles it differently."));
assert("Verify request",
  sbDetectChallenge("Can you double-check that? It doesn't match the docs."));
assert("Pushback with but",
  sbDetectChallenge("But isn't that approach deprecated since version 3?"));
assert("Don't just agree",
  sbDetectChallenge("Don't just agree with me, tell me the truth about it."));
assert("I disagree",
  sbDetectChallenge("I disagree with your assessment of the performance."));
assert("That's incorrect",
  sbDetectChallenge("That's incorrect. The spec says otherwise."));
assert("Reconsider",
  sbDetectChallenge("Can you reconsider your answer here?"));

// Should NOT detect challenges
assert("Neutral question → no challenge",
  !sbDetectChallenge("What is the difference between REST and GraphQL?"));
assert("Simple request → no challenge",
  !sbDetectChallenge("Can you explain how Docker works?"));
assert("Agreement → no challenge",
  !sbDetectChallenge("That makes sense, thanks for explaining!"));
assert("Short text → no challenge",
  !sbDetectChallenge("Hi"));
assert("Code request → no challenge",
  !sbDetectChallenge("Write a function that sorts an array"));
assert("Follow-up → no challenge",
  !sbDetectChallenge("Now can you also add error handling to that?"));

// ═════════════════════════════════════════════════════════════
// 2. SENTIMENT EXTRACTION
// ═════════════════════════════════════════════════════════════
console.log("\n2. Sentiment Extraction");
console.log("─".repeat(50));

assert("Positive sentiment",
  _sbGetSentiment("Yes, that's correct. React is indeed a great framework and I recommend using it for this project. It's the best choice.") === "positive");

assert("Negative sentiment",
  _sbGetSentiment("No, that's incorrect. You should avoid this approach as it's problematic and risky. It won't work well and could cause harmful side effects.") === "negative");

assert("Neutral/hedged sentiment",
  _sbGetSentiment("It depends on the context. However, there are both advantages and disadvantages. Although it can work, there are nuances to consider.") === "neutral");

// ═════════════════════════════════════════════════════════════
// 3. POSITION EXTRACTION
// ═════════════════════════════════════════════════════════════
console.log("\n3. Position Extraction");
console.log("─".repeat(50));

const pos1 = _sbExtractPosition("Yes, React is better than Angular for large projects. It has a stronger ecosystem and better performance.");
const pos2 = _sbExtractPosition("No, actually Angular is better for large projects. It provides more structure and better tooling.");
const pos3 = _sbExtractPosition("Yes, React is better than Angular for large projects. It has a stronger ecosystem and better performance.");

assert("Same text → same position",
  pos1 === pos3);
assert("Different stance → different position",
  pos1 !== pos2);
assert("Position is non-empty",
  pos1.length > 0 && pos2.length > 0);

// ═════════════════════════════════════════════════════════════
// 4. COUNTER-PROMPTS (Phase 2C)
// ═════════════════════════════════════════════════════════════
console.log("\n4. Counter-Prompts (Phase 2C)");
console.log("─".repeat(50));

// Verify all prompt types exist and are question-form
const promptTypes = ["generic", "opinion", "mistake_admission", "mimicry", "feedback", "position_change"];
const severities = ["nuclear", "moderate", "mild"];

promptTypes.forEach(type => {
  severities.forEach(sev => {
    const pool = SB_PROMPTS[type]?.[sev];
    if (pool && pool.length > 0) {
      // Check that prompts contain question marks (question-form)
      const allQuestions = pool.every(p => p.includes("?"));
      assert(`${type}/${sev} (${pool.length} prompts, question-form)`, allQuestions);
    }
  });
});

// Verify position_change prompts exist
assert("position_change/nuclear exists",
  SB_PROMPTS.position_change.nuclear.length >= 3);
assert("position_change/moderate exists",
  SB_PROMPTS.position_change.moderate.length >= 2);
assert("position_change/mild exists",
  SB_PROMPTS.position_change.mild.length >= 1);

// Verify sbGetCounterPrompt returns from correct pool
const pcPrompt = sbGetCounterPrompt("nuclear", "position_change");
assert("Counter-prompt for position_change returns string",
  typeof pcPrompt === "string" && pcPrompt.length > 20);

// ═════════════════════════════════════════════════════════════
// 5. TRACKER SUMMARY
// ═════════════════════════════════════════════════════════════
console.log("\n5. Tracker State");
console.log("─".repeat(50));

const summary = sbGetTrackerSummary();
assert("Summary has totalTurns", typeof summary.totalTurns === "number");
assert("Summary has challenges", typeof summary.challenges === "number");
assert("Summary has ready flag", typeof summary.ready === "boolean");

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
