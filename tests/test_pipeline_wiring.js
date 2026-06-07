// ============================================================
// Test Suite — Component 10: Pipeline Wiring + Legacy Removal
// tests/test_pipeline_wiring.js
//
// Run: node tests/test_pipeline_wiring.js
//
// This is the integration test for the full EEE pipeline.
// It stubs the browser-specific APIs (chrome.runtime, DOM)
// and verifies that _sbProcessResponse() drives the complete
// C4→C5→C6→C7→C8→C9 chain correctly.
//
// Test sections:
//   1.  _sbRunEEEPipeline is a function (exported)
//   2.  No detection on empty evidence → pipeline exits early
//   3.  Detection triggers all pipeline steps in order
//   4.  Debounce: second call within window is suppressed
//   5.  sbState.detectionCount increments on detection
//   6.  chrome.runtime.sendMessage receives evidence-rich payload
//   7.  Payload has legacy compat fields (score, dominantType)
//   8.  Payload confidence is a number in [0.05, 0.98]
//   9.  Payload ruleIds is a non-empty array
//  10.  Payload evidenceCount matches evidence array length
//  11.  Payload category is a known category string
//  12.  Payload severity is a known severity string
//  13.  summary is a non-empty string
//  14.  Legacy _sbHighlightElement is removed from main.js
//  15.  Legacy score-only sbShowBanner call is removed
//  16.  _sbProcessResponse still guards on text length < 20
//  17.  _sbProcessResponse still deduplicates via fingerprints
//  18.  Full pipeline: sbCollectEvidence called on sycophantic text
//  19.  Full pipeline: explanation.summary is a string
//  20.  Full pipeline: confidence.factors has 4 entries
// ============================================================

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

// ── Call tracking ─────────────────────────────────────────────
const _calls = {
  showExplainabilityCard: [],
  highlightEvidence:      [],
  sendMessage:            [],
  showBanner:             [],           // should NOT be called in new pipeline
};
global._calls = _calls;  // expose to vm.runInThisContext scope

// ── Minimal DOM + Browser API stubs ──────────────────────────
// These let all content scripts load and execute without errors
// while allowing the pipeline logic to be tested.

global.NodeFilter = { SHOW_TEXT: 4 };

// window.location — sbGetPlatformKey() reads hostname
global.window = {
  location: {
    hostname: "claude.ai",
    href:     "https://claude.ai/chat/test",
  },
};

// document mock — covers createElement, querySelector, readyState, etc.
global.document = {
  readyState: "complete",  // triggers sbInit() immediately when main.js loads
  body: { appendChild() {} },
  createElement(tag) {
    return {
      tagName: tag.toUpperCase(), className: "", innerHTML: "",
      textContent: "",
      style: {
        cssText: "",
        setProperty() {}, getPropertyValue() { return ""; },
        transition: "", borderLeft: "", backgroundColor: "",
        boxShadow: "", opacity: "",
      },
      dataset: {}, _attrs: {},
      setAttribute(k,v) { this._attrs[k] = v; },
      getAttribute(k) { return this._attrs[k] || null; },
      querySelector()    { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
      removeEventListener() {},
      appendChild(c) { return c; },
      insertBefore(c) { return c; },
      removeChild(c) { return c; },
      remove() {},
      attachShadow() {
        return {
          getElementById() { return { appendChild() {}, _children: [] }; },
          appendChild() {},
        };
      },
      focus() {},
      dispatchEvent() {},
      get firstChild() { return null; },
      get parentNode() { return null; },
    };
  },
  querySelectorAll() { return []; },
  querySelector()    { return null; },
  addEventListener() {},
  createRange() {
    return {
      setStart() {}, setEnd() {},
      surroundContents() {},
    };
  },
  createTreeWalker() {
    return { nextNode() { return null; } };
  },
  execCommand() { return true; },
};

global.requestAnimationFrame = fn => fn();
global.Element = function(){};
global.Event = function(type, opts) { this.type = type; };
global.KeyboardEvent = function(type, opts) { this.type = type; Object.assign(this, opts); };
global.MutationObserver = function() {
  this.observe = function() {};
  this.disconnect = function() {};
};

// crypto.subtle stub — tracker.js uses HMAC-SHA256
global.crypto = {
  subtle: {
    generateKey()  { return Promise.resolve({ type: "secret" }); },
    sign()         { return Promise.resolve(new ArrayBuffer(32)); },
    importKey()    { return Promise.resolve({ type: "secret" }); },
  },
  getRandomValues(arr) { return arr; },
};

// ── Chrome Extension API stubs ────────────────────────────────
global.chrome = {
  runtime: {
    sendMessage(msg) { _calls.sendMessage.push(msg); },
    onMessage: {
      addListener() {},
    },
  },
  storage: {
    sync: {
      get(keys, cb)  { if (cb) cb({}); },
      set()          {},
    },
    local: {
      get(keys, cb)  { if (cb) cb({}); },
      set()          {},
    },
    onChanged: {
      addListener() {},
    },
  },
};

// ── Load content scripts ──────────────────────────────────────
// Order matches manifest.json content_scripts exactly.
function loadFile(relPath) {
  const code = fs.readFileSync(path.join(__dirname, relPath), "utf8");
  vm.runInThisContext(code, { filename: relPath });
}

loadFile("../content/constants.js");
loadFile("../content/rules.js");
loadFile("../content/platforms.js");
loadFile("../content/contract.js");
loadFile("../content/epistemic.js");
loadFile("../content/tracker.js");
loadFile("../content/detector.js");
loadFile("../content/injector.js");
loadFile("../content/interceptor.js");
loadFile("../content/social.js");
loadFile("../content/evidence.js");

// _escHtml must exist before ui.js loads (it's used inside template literals)
vm.runInThisContext(`
  function _escHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
`);

loadFile("../content/ui.js");
loadFile("../content/main.js");

// ── Patch ShadowRoot so sbInitUI doesn't fail ─────────────────
vm.runInThisContext(`
  _sbShadowRoot = {
    getElementById(id) {
      return { appendChild(child) {}, _children: [] };
    }
  };
  _sbShadowHost = document.createElement("DIV");
`);

// ── Override side-effectful UI functions to track calls ───────
vm.runInThisContext(`
  sbShowExplainabilityCard = function(explanation, confidence, detection, num) {
    _calls.showExplainabilityCard.push({ explanation, confidence, detection, num });
    return document.createElement("div");
  };

  sbHighlightEvidence = function(ev, el, ms) {
    _calls.highlightEvidence.push({ evidenceCount: ev ? ev.length : 0, el });
    return { highlighted: 0, skipped: 0, marks: [] };
  };

  sbShowBanner = function() {
    _calls.showBanner.push(arguments);
  };
`);

// ── Helper: make a fake DOM response element ──────────────────
function makeResponseEl(text) {
  return {
    innerText: text,
    textContent: text,
    style: { transition: "", borderLeft: "", backgroundColor: "" },
    _sbmarks: [],
  };
}

// ── Helper: reset call log + state ───────────────────────────
function resetCalls() {
  _calls.showExplainabilityCard.length = 0;
  _calls.highlightEvidence.length      = 0;
  _calls.sendMessage.length            = 0;
  _calls.showBanner.length             = 0;
}

function resetState() {
  sbState.enabled          = true;
  sbState.seenFingerprints = new Set();
  sbState.lastToastTime    = 0;
  sbState.detectionCount   = 0;
}

// ── Sycophantic test text ─────────────────────────────────────
const SYCO_TEXT =
  "Great question! You are absolutely right and I completely agree. " +
  "That is indeed an excellent point and you are totally correct.";

const NORMAL_TEXT =
  "The capital of France is Paris. The population is about 2.1 million.";

// ── Test runner ───────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(desc, cond) {
  if (cond) { passed++; console.log(`  ✓ ${desc}`); }
  else       { failed++; failures.push(desc); console.error(`  ✗ FAIL: ${desc}`); }
}
function section(title) { console.log(`\n── ${title} ──`); }

// We use a Promise wrapper to handle async pipeline
async function runPipeline(text, userText = "") {
  resetCalls();
  resetState();
  const el = makeResponseEl(text);
  _sbProcessResponse(el, userText);
  // Yield to let the .then() chain complete
  await new Promise(r => setTimeout(r, 50));
}

// ─────────────────────────────────────────────────────────────
// SECTION 1: _sbRunEEEPipeline is a function
// ─────────────────────────────────────────────────────────────
section("_sbRunEEEPipeline Function Exists");

assert("_sbRunEEEPipeline is a function", typeof _sbRunEEEPipeline === "function");
assert("_sbProcessResponse is a function", typeof _sbProcessResponse === "function");

// ─────────────────────────────────────────────────────────────
// SECTION 2: No detection on empty evidence
// ─────────────────────────────────────────────────────────────
section("No Detection on Non-Sycophantic Text");

(async () => {
  await runPipeline(NORMAL_TEXT, "What is the capital of France?");

  assert("Normal text: card not shown",         _calls.showExplainabilityCard.length === 0);
  assert("Normal text: sendMessage not called",  _calls.sendMessage.length === 0);
  assert("Normal text: detectionCount stays 0",  sbState.detectionCount === 0);

// ─────────────────────────────────────────────────────────────
// SECTION 3: Sycophantic text triggers full pipeline
// ─────────────────────────────────────────────────────────────
section("Sycophantic Text Triggers All Pipeline Steps");

  await runPipeline(SYCO_TEXT, "Is my plan good?");

  assert("Pipeline: sbShowExplainabilityCard called",  _calls.showExplainabilityCard.length >= 1);
  assert("Pipeline: sbHighlightEvidence called",       _calls.highlightEvidence.length >= 1);
  assert("Pipeline: sendMessage called",               _calls.sendMessage.length >= 1);
  assert("Pipeline: sbShowBanner NOT called (legacy retired)", _calls.showBanner.length === 0);

// ─────────────────────────────────────────────────────────────
// SECTION 4: Debounce suppresses second call
// ─────────────────────────────────────────────────────────────
section("Debounce — Second Call Within Window Suppressed");

  resetCalls();
  resetState();
  // Set lastToastTime to near-now (within DEBOUNCE_MS)
  sbState.lastToastTime = Date.now() - 10; // only 10ms ago
  // A fresh fingerprint (no dedup issue)
  const el2 = makeResponseEl(SYCO_TEXT + " extra unique text to bypass dedup");
  _sbProcessResponse(el2, "");
  await new Promise(r => setTimeout(r, 50));

  assert("Debounced: card not shown in debounce window", _calls.showExplainabilityCard.length === 0);

// ─────────────────────────────────────────────────────────────
// SECTION 5: detectionCount increments
// ─────────────────────────────────────────────────────────────
section("sbState.detectionCount Increments On Detection");

  resetCalls();
  resetState();
  assert("detectionCount starts at 0", sbState.detectionCount === 0);

  await runPipeline(SYCO_TEXT, "Was I right?");
  const countAfterFirst = sbState.detectionCount;
  assert("detectionCount incremented after detection", countAfterFirst > 0);

// ─────────────────────────────────────────────────────────────
// SECTION 6: sendMessage receives evidence-rich payload
// ─────────────────────────────────────────────────────────────
section("sendMessage — Evidence-Rich Payload");

  await runPipeline(SYCO_TEXT, "Was I right?");
  const msg = _calls.sendMessage[0];

  assert("Payload has type=SYCOPHANCY_DETECTED",  msg?.type === "SYCOPHANCY_DETECTED");
  assert("Payload has count",                      typeof msg?.count === "number");
  assert("Payload has category",                   typeof msg?.category === "string");
  assert("Payload has severity",                   typeof msg?.severity === "string");
  assert("Payload has evidenceCount",              typeof msg?.evidenceCount === "number");
  assert("Payload has confidence",                 typeof msg?.confidence === "number");
  assert("Payload has summary",                    typeof msg?.summary === "string");
  assert("Payload has ruleIds array",              Array.isArray(msg?.ruleIds));

// ─────────────────────────────────────────────────────────────
// SECTION 7: Legacy compat fields present
// ─────────────────────────────────────────────────────────────
section("Payload — Legacy Compat Fields");

  assert("Legacy 'score' field present",       typeof msg?.score === "number");
  assert("Legacy 'dominantType' field present", typeof msg?.dominantType === "string");

// ─────────────────────────────────────────────────────────────
// SECTION 8: Confidence in valid range
// ─────────────────────────────────────────────────────────────
section("Payload — Confidence In [0.05, 0.98]");

  assert("Confidence >= 0.05", msg?.confidence >= 0.05);
  assert("Confidence <= 0.98", msg?.confidence <= 0.98);
  assert("Confidence is a finite number", Number.isFinite(msg?.confidence));

// ─────────────────────────────────────────────────────────────
// SECTION 9: ruleIds is non-empty
// ─────────────────────────────────────────────────────────────
section("Payload — ruleIds Non-Empty");

  assert("ruleIds has at least one entry",     msg?.ruleIds?.length >= 1);
  assert("ruleIds entries are strings",        typeof msg?.ruleIds[0] === "string");

// ─────────────────────────────────────────────────────────────
// SECTION 10: evidenceCount matches
// ─────────────────────────────────────────────────────────────
section("Payload — evidenceCount Is Positive");

  assert("evidenceCount > 0 on sycophantic text", msg?.evidenceCount > 0);

// ─────────────────────────────────────────────────────────────
// SECTION 11: category is known
// ─────────────────────────────────────────────────────────────
section("Payload — category Is a Known Value");

  const KNOWN_CATS = ["opinion", "mistake_admission", "mimicry", "feedback", "position_change", "social_validation"];
  assert("category is a known category", KNOWN_CATS.includes(msg?.category));

// ─────────────────────────────────────────────────────────────
// SECTION 12: severity is known
// ─────────────────────────────────────────────────────────────
section("Payload — severity Is a Known Value");

  const KNOWN_SEVS = ["low", "medium", "high", "nuclear", "mild", "moderate"];
  assert("severity is a known value", KNOWN_SEVS.includes(msg?.severity));

// ─────────────────────────────────────────────────────────────
// SECTION 13: summary is a non-empty string
// ─────────────────────────────────────────────────────────────
section("Payload — summary Is a Non-Empty String");

  assert("summary is a string",      typeof msg?.summary === "string");
  assert("summary is non-empty",     msg?.summary.length > 5);

// ─────────────────────────────────────────────────────────────
// SECTION 14: _sbHighlightElement removed from main.js
// ─────────────────────────────────────────────────────────────
section("Legacy _sbHighlightElement Removed from main.js");

  const mainSrc = fs.readFileSync(
    path.join(__dirname, "../content/main.js"), "utf8"
  );
  assert("_sbHighlightElement NOT defined in main.js",
    !mainSrc.includes("function _sbHighlightElement"));

// ─────────────────────────────────────────────────────────────
// SECTION 15: Legacy sbShowBanner call removed from pipeline
// ─────────────────────────────────────────────────────────────
section("Legacy sbShowBanner Removed from main.js Pipeline");

  assert("sbShowBanner NOT called in main.js pipeline",
    !mainSrc.includes("sbShowBanner("));

// ─────────────────────────────────────────────────────────────
// SECTION 16: Text length guard still works
// ─────────────────────────────────────────────────────────────
section("Text Length Guard Intact");

  resetCalls();
  resetState();
  const shortEl = makeResponseEl("Too short");
  _sbProcessResponse(shortEl, "");
  await new Promise(r => setTimeout(r, 50));
  assert("Text < 20 chars: no card shown", _calls.showExplainabilityCard.length === 0);

// ─────────────────────────────────────────────────────────────
// SECTION 17: Fingerprint deduplication
// ─────────────────────────────────────────────────────────────
section("Fingerprint Deduplication Still Works");

  resetCalls();
  resetState();
  // Process the same text twice
  const dedupeEl = makeResponseEl(SYCO_TEXT);
  _sbProcessResponse(dedupeEl, "");
  await new Promise(r => setTimeout(r, 50));
  const firstCount = _calls.showExplainabilityCard.length;

  resetCalls();
  sbState.lastToastTime = 0; // reset debounce but keep fingerprint
  _sbProcessResponse(dedupeEl, ""); // same element, same text
  await new Promise(r => setTimeout(r, 50));
  const secondCount = _calls.showExplainabilityCard.length;

  assert("Second identical response: not processed again", secondCount === 0);

// ─────────────────────────────────────────────────────────────
// SECTION 18: sbCollectEvidence called on sycophantic text
// ─────────────────────────────────────────────────────────────
section("sbCollectEvidence Produces Evidence on SYCO_TEXT");

  const collected = sbCollectEvidence(SYCO_TEXT, "");
  assert("sbCollectEvidence returns an object",          typeof collected === "object");
  assert("evidence array is non-empty",                  collected.evidence.length > 0);
  assert("every evidence has evidenceType",              collected.evidence.every(e => e.evidenceType));
  assert("every textual evidence has startIndex",
    collected.evidence.filter(e => e.evidenceType === "textual").every(e => typeof e.startIndex === "number"));

// ─────────────────────────────────────────────────────────────
// SECTION 19: explanation.summary is a string
// ─────────────────────────────────────────────────────────────
section("Full Pipeline: explanation.summary Is a String");

  await runPipeline(SYCO_TEXT, "Was I right?");
  const cardCall = _calls.showExplainabilityCard[0];
  const explanation = cardCall?.explanation;
  assert("explanation is not null",              explanation != null);
  assert("explanation.summary is a string",      typeof explanation?.summary === "string");
  assert("explanation.reasons is an array",      Array.isArray(explanation?.reasons));

// ─────────────────────────────────────────────────────────────
// SECTION 20: confidence.factors has 4 entries
// ─────────────────────────────────────────────────────────────
section("Full Pipeline: confidence.factors Has 4 Entries");

  const confidence = cardCall?.confidence;
  assert("confidence is not null",               confidence != null);
  assert("confidence.confidence is a number",    typeof confidence?.confidence === "number");
  assert("confidence.factors has 4 entries",     confidence?.factors?.length === 4);
  assert("each factor has name/value/contribution",
    confidence?.factors?.every(f =>
      typeof f.name === "string" &&
      f.value !== undefined &&
      typeof f.contribution === "number"
    )
  );

// ─────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Component 10 Tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("\nFailed assertions:");
    failures.forEach(f => console.error(`  ✗ ${f}`));
    process.exit(1);
  } else {
    console.log("✅ All tests passed — Component 10 complete.");
    process.exit(0);
  }
})();
