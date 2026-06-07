// ============================================================
// Tests for L1 Truthfulness Contract
// Run: node tests/test_contract.js
// ============================================================

const vm = require("vm");
const fs = require("fs");
const _load = (f) => vm.runInThisContext(fs.readFileSync(f, "utf8"), { filename: f });

// Provide stubs for browser APIs used by contract.js
globalThis.window = { location: { href: "https://claude.ai/chat/test-123" } };
globalThis.sbGetPlatformKey = () => "claude.ai";
globalThis.sbQueryResponses = () => [];

_load("content/constants.js");
_load("content/contract.js");

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else           { failed++; console.log(`  ✕ ${name}`); }
}

console.log("\n1. Contract Templates");
console.log("─".repeat(50));

assert("3 contract variants exist", SB_CONTRACTS.length === 3);
assert("All contracts are non-empty", SB_CONTRACTS.every(c => c.length > 50));
assert("All contracts end with double newline", SB_CONTRACTS.every(c => c.endsWith("\n\n")));
assert("Concise variant has numbered rules", SB_CONTRACTS[0].includes("(1)"));
assert("Collaborative variant mentions honesty", SB_CONTRACTS[1].includes("honest"));
assert("Question-form variant uses questions", SB_CONTRACTS[2].includes("?"));

console.log("\n2. Contract Injection Logic");
console.log("─".repeat(50));

// Should inject on fresh conversation (no prior AI responses)
assert("Should inject on fresh conversation", sbShouldInjectContract() === true);

// Apply contract
const original = "What is the best framework for web development?";
const result = sbApplyContract(original);
assert("Contract is prepended", result.length > original.length);
assert("Original message is preserved", result.endsWith(original));
assert("Contract text is included", result.includes("[") || result.includes("Protocol") || result.includes("commit"));

// Should NOT inject twice for same URL
assert("Should NOT inject again (same URL)", sbShouldInjectContract() === false);

console.log("\n3. URL-Based Dedup");
console.log("─".repeat(50));

// Change URL — should allow injection again
window.location.href = "https://claude.ai/chat/new-456";
assert("New URL allows fresh injection", sbShouldInjectContract() === true);

// Simulate existing conversation (has AI responses)
globalThis.sbQueryResponses = () => [{ textContent: "Here's my answer..." }];
window.location.href = "https://claude.ai/chat/existing-789";
assert("Existing conversation skips injection", sbShouldInjectContract() === false);

console.log("\n4. Contract Preview");
console.log("─".repeat(50));

const preview = sbGetContractPreview();
assert("Preview returns string", typeof preview === "string");
assert("Preview is substantial", preview.length > 50);
assert("Preview doesn't end with newlines", !preview.endsWith("\n\n"));

console.log("\n5. Reset Behavior");
console.log("─".repeat(50));

sbResetContract();
assert("Reset preserves injected URLs", sbShouldInjectContract() === false);

// Simulate disable
_sbContract.enabled = false;
window.location.href = "https://claude.ai/chat/disabled-test";
globalThis.sbQueryResponses = () => [];
assert("Disabled contract skips injection", sbShouldInjectContract() === false);

// Re-enable
_sbContract.enabled = true;
assert("Re-enabled contract allows injection", sbShouldInjectContract() === true);

// ═══════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(50));
console.log(`Result: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed === 0) {
  console.log("\n✓ All tests passed!");
} else {
  process.exitCode = 1;
}
