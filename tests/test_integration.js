// Cross-module integration check for v3.0
const fs = require("fs");

const files = [
  "content/constants.js", "content/platforms.js", "content/detector.js",
  "content/epistemic.js", "content/tracker.js", "content/contract.js",
  "content/ui.js", "content/injector.js", "content/interceptor.js",
  "content/social.js", "content/main.js",
];

let combined = "";
files.forEach(f => { combined += fs.readFileSync(f, "utf8") + "\n"; });

const decls = new Set();
const declRegex = /^(?:async\s+)?(?:function\s+|const\s+|let\s+|var\s+)(\w+)/gm;
let m;
while ((m = declRegex.exec(combined))) decls.add(m[1]);

const crossCalls = [
  // main.js →
  { from: "main.js", fn: "sbGetPlatformKey" },
  { from: "main.js", fn: "sbQueryResponses" },
  { from: "main.js", fn: "sbQueryContainer" },
  { from: "main.js", fn: "sbAnalyzeText" },
  { from: "main.js", fn: "sbGetSeverity" },
  { from: "main.js", fn: "sbShowBanner" },
  { from: "main.js", fn: "sbGetCounterPrompt" },
  { from: "main.js", fn: "sbInjectPrompt" },
  { from: "main.js", fn: "sbInitInterceptor" },
  { from: "main.js", fn: "SB_CONFIG" },
  { from: "main.js", fn: "sbRecordTurn" },
  { from: "main.js", fn: "_sbInitSessionKey" },
  { from: "main.js", fn: "sbResetTracker" },
  { from: "main.js", fn: "sbGetTrackerSummary" },
  { from: "main.js", fn: "_sbContract" },
  // interceptor.js →
  { from: "interceptor.js", fn: "sbScanEpistemic" },
  { from: "interceptor.js", fn: "sbTransformToQuestion" },
  { from: "interceptor.js", fn: "sbShowEpistemicPanel" },
  { from: "interceptor.js", fn: "sbQueryInput" },
  { from: "interceptor.js", fn: "SB_PLATFORMS" },
  { from: "interceptor.js", fn: "sbState" },
  { from: "interceptor.js", fn: "sbShouldInjectContract" },
  { from: "interceptor.js", fn: "sbApplyContract" },
  { from: "interceptor.js", fn: "_sbBuildPromptRiskTransform" },
  { from: "interceptor.js", fn: "sbScanSocialConflict" },
  { from: "interceptor.js", fn: "sbBuildConflictPerspectiveTransform" },
  // main.js →
  { from: "main.js", fn: "sbAnalyzeSocialValidation" },
  // ui.js →
  { from: "ui.js", fn: "sbInjectPrompt" },
  { from: "ui.js", fn: "sbGetCounterPrompt" },
  { from: "ui.js", fn: "_sbInterceptor" },
  { from: "ui.js", fn: "_sbReplaceAndSend" },
  { from: "ui.js", fn: "_sbSendOriginal" },
  // tracker.js →
  { from: "tracker.js", fn: "SB_CHALLENGE_PATTERNS" },
  { from: "tracker.js", fn: "_sbTracker" },
  // contract.js →
  { from: "contract.js", fn: "SB_CONTRACTS" },
];

console.log("Cross-Module Integration Check (v3.0)");
console.log("=".repeat(55));

let ok = true;
crossCalls.forEach(({ from, fn }) => {
  const exists = decls.has(fn);
  if (exists) { console.log(`  ✓ ${from} → ${fn}`); }
  else { console.log(`  ✕ ${from} → ${fn} MISSING`); ok = false; }
});

console.log(`\n${crossCalls.length} refs checked`);
console.log(ok ? "✓ All cross-module refs resolved!" : "✕ Missing!");
process.exitCode = ok ? 0 : 1;
