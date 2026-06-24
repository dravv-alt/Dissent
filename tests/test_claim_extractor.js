// ============================================================
// Dissent — Phase 2: Claim Extractor Test Suite
// ============================================================

const fs = require("fs");
const vm = require("vm");

function loadModule(relativePath) {
  const code = fs.readFileSync(
    require("path").resolve(__dirname, "..", relativePath),
    "utf-8"
  );
  vm.runInThisContext(code, { filename: relativePath });
}

loadModule("content/constants.js");
loadModule("content/rules.js");
loadModule("content/claim-extractor.js");

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${msg}`);
  }
}

console.log("\n── Claim Extractor: 10+ Archetypes ──");

// 1. Simple assertion
const simple = "Python is a dynamically typed language.";
assert(sbExtractClaims(simple, 0).length === 1, "Simple assertion extracts 1 claim");

// 2. Multiple claims
const multi = "Python is dynamically typed. It uses garbage collection. The GIL limits threading.";
const multiClaims = sbExtractClaims(multi, 0);
assert(multiClaims.length >= 3, "Multiple claims extracted (≥3)");

// 3. Hedged assertion
const hedged = "While there are trade-offs, Python generally offers faster development.";
const hedgedClaims = sbExtractClaims(hedged, 0);
assert(hedgedClaims.length >= 1, "Hedged assertion extracted");

// 4. Question response
const question = "Are you asking about runtime or compile-time performance?";
assert(sbExtractClaims(question, 0).length === 0, "Question response yields 0 claims");

// 5. Code-only response
const codeOnly = "```python\nprint('hello')\n```";
assert(sbExtractClaims(codeOnly, 0).length === 0, "Code-only response yields 0 claims");

// 6. List-only response (short items)
const listOnly = "- Fast\n- Reliable\n- Scalable";
assert(sbExtractClaims(listOnly, 0).length === 0, "List-only (short items) yields 0 claims");

// 7. Mixed response (prose + code + list)
const mixed = "This is a detailed explanation:\n```javascript\nlet x = 1;\n```\nIt demonstrates basic assignment and memory handling.";
const mixedClaims = sbExtractClaims(mixed, 0);
assert(mixedClaims.length >= 1, "Mixed response extracts prose claims");

// 8. Long multi-paragraph response
const long = "First, memory management is handled by the garbage collector. This process is automatic.\n\nSecond, the event loop handles async I/O. It allows single-threaded concurrency.";
const longClaims = sbExtractClaims(long, 0);
assert(longClaims.length >= 4, "Long multi-paragraph response extracts multiple claims");

// 9. Response starting with "I"
const iStart = "I believe that functional programming reduces state-related bugs.";
assert(sbExtractClaims(iStart, 0).length === 1, "Response starting with 'I' extracts claim");

// 10. Response with markdown headers
const headerText = "## Overview. This library is widely used in production. ### Features. It supports caching.";
const headerClaims = sbExtractClaims(headerText, 0);
assert(headerClaims.length >= 1, "Headers are skipped, body sentences extracted");

console.log(`\nClaim Extractor Tests: ${passed} passed, ${failed} failed`);
if (failed !== 0) process.exitCode = 1;
