// Comprehensive edge-case tests for the epistemic scanner
// Run: node tests/test_epistemic.js

const vm = require("vm");
const fs = require("fs");
const _load = (f) => vm.runInThisContext(fs.readFileSync(f, "utf8"), { filename: f });
_load("content/constants.js");
_load("content/epistemic.js");

const tests = [
  // ═══════════════════════════════════════════════════════
  // CONVICTION (Level 3) — should always trigger
  // ═══════════════════════════════════════════════════════
  { input: "I'm absolutely certain that React is better than Angular",
    expect: { detected: true, level: 3 } },
  { input: "Obviously Python is the best programming language",
    expect: { detected: true, level: 3 } },
  { input: "I know for a fact that this approach is correct",
    expect: { detected: true, level: 3 } },
  { input: "Everyone knows that TDD is essential",
    expect: { detected: true, level: 3 } },
  { input: "There's no question that microservices are better",
    expect: { detected: true, level: 3 } },
  { input: "It's obvious that Rust will replace C++",
    expect: { detected: true, level: 3 } },
  { input: "Clearly, functional programming is the future",
    expect: { detected: true, level: 3 } },
  { input: "I know that monorepos are superior to polyrepos",
    expect: { detected: true, level: 3 } },
  { input: "Without a doubt, GraphQL is better than REST",
    expect: { detected: true, level: 3 } },
  { input: "Undeniably, this is the right approach for scaling",
    expect: { detected: true, level: 3 } },
  { input: "Nobody would agree that waterfall is better than agile",
    expect: { detected: true, level: 3 } },

  // ═══════════════════════════════════════════════════════
  // BELIEF (Level 2) — should trigger
  // ═══════════════════════════════════════════════════════
  { input: "I think we should use TypeScript for this project",
    expect: { detected: true, level: 2 } },
  { input: "I believe functional programming is superior to OOP",
    expect: { detected: true, level: 2 } },
  { input: "In my opinion, REST is better than GraphQL",
    expect: { detected: true, level: 2 } },
  { input: "Don't you think we should refactor this module?",
    expect: { detected: true, level: 2 } },
  { input: "From my experience, Docker simplifies deployment",
    expect: { detected: true, level: 2 } },
  { input: "I feel that this design pattern is overcomplicated",
    expect: { detected: true, level: 2 } },
  { input: "I reckon the database schema needs restructuring",
    expect: { detected: true, level: 2 } },
  { input: "In my view, serverless is overhyped for most use cases",
    expect: { detected: true, level: 2 } },
  { input: "I suspect the bottleneck is in the network layer",
    expect: { detected: true, level: 2 } },
  { input: "I'm pretty sure this is a race condition",
    expect: { detected: true, level: 2 } },
  { input: "From my perspective, we should prioritize performance",
    expect: { detected: true, level: 2 } },
  { input: "Wouldn't you agree that the API needs versioning?",
    expect: { detected: true, level: 2 } },

  // ═══════════════════════════════════════════════════════
  // STATEMENT (Level 1) — mild triggers
  // ═══════════════════════════════════════════════════════
  { input: "Rust is better than C++ for systems programming, right?",
    expect: { detected: true, level: 1 } },
  { input: "This approach is more scalable, don't you think?",
    expect: { detected: true, level: 1 } },
  { input: "TypeScript is definitely better than JavaScript",
    expect: { detected: true, level: 1 } },

  // ═══════════════════════════════════════════════════════
  // SHOULD NOT TRIGGER — neutral/question inputs
  // ═══════════════════════════════════════════════════════
  { input: "What is the difference between REST and GraphQL?",
    expect: { detected: false } },
  { input: "Can you explain how Docker works?",
    expect: { detected: false } },
  { input: "Show me an example of a React component",
    expect: { detected: false } },
  { input: "Help me debug this Python code",
    expect: { detected: false } },
  { input: "Hi",
    expect: { detected: false } },
  { input: "What are the pros and cons of microservices?",
    expect: { detected: false } },
  { input: "How does the event loop work in Node.js?",
    expect: { detected: false } },
  { input: "Write a function that sorts an array in O(n log n)",
    expect: { detected: false } },
  { input: "Compare the performance of HashMap vs TreeMap",
    expect: { detected: false } },
  { input: "List the steps to deploy a Docker container",
    expect: { detected: false } },
  { input: "Please review this code for bugs",
    expect: { detected: false } },
  { input: "Thanks!",
    expect: { detected: false } },

  // ═══════════════════════════════════════════════════════
  // TRANSFORM QUALITY — verify rewrites are meaningful
  // ═══════════════════════════════════════════════════════
];

let passed = 0;
let failed = 0;
const failures = [];

console.log("Dissent — Epistemic Scanner Tests");
console.log("=".repeat(60));

for (const t of tests) {
  const result = sbScanEpistemic(t.input);
  const ok = result.detected === t.expect.detected &&
    (!t.expect.level || result.certainty?.level === t.expect.level);

  const short = t.input.slice(0, 50).padEnd(53);

  if (ok) {
    passed++;
    const info = result.detected
      ? `L${result.certainty.level} ${result.label}`
      : "—";
    console.log(`  ✓ ${short} ${info}`);
  } else {
    failed++;
    console.log(`  ✕ ${short}`);
    console.log(`    Expected: detected=${t.expect.detected}${t.expect.level ? ` level=${t.expect.level}` : ""}`);
    console.log(`    Got:      detected=${result.detected}${result.certainty ? ` level=${result.certainty.level}` : ""}`);
    failures.push(t.input);
  }

  // Print transform for detected ones
  if (result.detected) {
    const transform = sbTransformToQuestion(result);
    if (transform) {
      const q = transform.rewritten.split("\n")[0].slice(0, 65);
      console.log(`    → "${q}..."`);
    }
  }
}

console.log("\n" + "=".repeat(60));
console.log(`Result: ${passed} passed, ${failed} failed, ${tests.length} total`);

if (failures.length > 0) {
  console.log("\nFailed inputs:");
  failures.forEach(f => console.log(`  - ${f}`));
  process.exitCode = 1;
} else {
  console.log("\n✓ All tests passed!");
}
