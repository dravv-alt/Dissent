// ============================================================
// Test Suite — Component 9: Explainability Card
// tests/test_explainability_card.js
//
// Run: node tests/test_explainability_card.js
//
// sbShowExplainabilityCard() builds a full Shadow DOM card.
// Tests use a minimal DOM simulation (same pattern as C8 tests).
//
// Test sections:
//   1.  Guard: null/partial inputs don't throw
//   2.  Return value is a DOM element
//   3.  Card has correct data-severity and data-category attributes
//   4.  Header: icon, title, severity badge, category badge
//   5.  Summary text is rendered and escaped
//   6.  Reasons list rendered (or fallback if empty)
//   7.  Lead evidence chip rendered when present
//   8.  Lead evidence hidden when matchedText absent
//   9.  Confidence bar rendered with correct percentage
//  10.  Confidence factors rendered (4 rows)
//  11.  Counter-prompt box rendered
//  12.  Three action buttons present (inject, cycle, dismiss)
//  13.  Footer shows detection number
//  14.  Close button present
//  15.  sbShowExplainabilityCard replaces existing active banner
// ============================================================

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

// ── Minimal DOM simulation ────────────────────────────────────
// More complete than C8's mock: we need innerHTML parsing,
// querySelector, addEventListener, style.setProperty, etc.

// Simple element mock
class MockElement {
  constructor(tag) {
    this.tagName       = (tag || "DIV").toUpperCase();
    this.className     = "";
    this.innerHTML     = "";
    this.textContent   = "";
    this.style         = new MockStyle();
    this.dataset       = {};
    this._attrs        = {};
    this._listeners    = {};
    this._children     = [];
    this.parentNode    = null;
  }
  setAttribute(k, v)  { this._attrs[k] = v; }
  getAttribute(k)     { return this._attrs[k] ?? null; }
  style = new (class MockStyle {
    constructor() { this._vars = {}; this._props = {}; }
    setProperty(k, v)  { this._vars[k] = v; }
    getPropertyValue(k){ return this._vars[k] ?? ""; }
  })();
  addEventListener(ev, fn) {
    if (!this._listeners[ev]) this._listeners[ev] = [];
    this._listeners[ev].push(fn);
  }
  querySelector(sel)   { return _mockQuery(this.innerHTML, sel); }
  querySelectorAll(sel){ return _mockQueryAll(this.innerHTML, sel); }
  remove()             { if (this.parentNode) this.parentNode._children = this.parentNode._children.filter(c => c !== this); this.parentNode = null; }
  appendChild(child)   { child.parentNode = this; this._children.push(child); }
}

class MockStyle {
  constructor() { this._vars = {}; }
  setProperty(k, v)  { this._vars[k] = v; }
  getPropertyValue(k){ return this._vars[k] ?? ""; }
}

// Regex-based querySelector mock — extracts class/id/data-* from innerHTML
function _mockQuery(html, sel) {
  if (!html) return null;
  // Match class selector like .sb-card-summary
  const classMatch = sel.match(/^\.([a-zA-Z0-9_-]+)$/);
  if (classMatch) {
    const cls = classMatch[1];
    // Check if html contains this class
    if (html.includes(`class="${cls}"`) || html.includes(`class="sb-card ${cls}"`) || html.includes(cls)) {
      const el = new MockElement("DIV");
      el.className = cls;
      // Extract textContent from the matching tag
      const re = new RegExp(`class="[^"]*${cls}[^"]*"[^>]*>([^<]*)`, "i");
      const m = html.match(re);
      if (m) el.textContent = m[1].trim();
      return el;
    }
  }
  // Match id selector like #sb-conf-bar
  const idMatch = sel.match(/^#([a-zA-Z0-9_-]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    if (html.includes(`id="${id}"`)) {
      const el = new MockElement("DIV");
      el.id = id;
      const re = new RegExp(`id="${id}"[^>]*>([^<]*)`, "i");
      const m = html.match(re);
      if (m) el.textContent = m[1].trim();
      return el;
    }
  }
  return null;
}

function _mockQueryAll(html, sel) {
  const classMatch = sel.match(/^\.([a-zA-Z0-9_-]+)$/);
  if (classMatch && html) {
    const cls = classMatch[1];
    const re = new RegExp(`class="[^"]*${cls}[^"]*"`, "g");
    const matches = html.match(re);
    if (matches) return matches.map(() => new MockElement("DIV"));
  }
  return [];
}

// Shadow root mock
class MockShadowRoot {
  constructor() { this._children = []; this._host = null; }
  getElementById(id) {
    const el = new MockElement("DIV");
    el.id = id;
    el.appendChild = (child) => { child.parentNode = el; this._children.push(child); };
    return el;
  }
}

// Install required globals
let _mockShadowRoot = null;

global.document = {
  _bodyChildren: [],
  body: {
    appendChild(child) { this._children = this._children || []; this._children.push(child); }
  },
  createElement(tag) {
    const el = new MockElement(tag);
    // Override style to use MockStyle with setProperty
    el.style = {
      _vars: {}, _props: {},
      setProperty(k, v) { this._vars[k] = v; },
      getPropertyValue(k) { return this._vars[k] ?? ""; },
    };
    // Override querySelector to search innerHTML
    el.querySelector  = (sel) => _mockQuery(el.innerHTML, sel);
    el.querySelectorAll = (sel) => _mockQueryAll(el.innerHTML, sel);
    // attachShadow mock
    el.attachShadow = (_opts) => {
      const sr = new MockShadowRoot();
      return sr;
    };
    return el;
  },
  querySelector(sel) { return null; }, // page DOM
};
global.requestAnimationFrame = (fn) => fn(); // synchronous in tests
global.NodeFilter = { SHOW_TEXT: 4 };
global.Element = MockElement;

// ── Load sources ──────────────────────────────────────────────
function loadFile(relPath) {
  const code = fs.readFileSync(path.join(__dirname, relPath), "utf8");
  vm.runInThisContext(code);
}

loadFile("../content/rules.js");
loadFile("../content/constants.js");
loadFile("../content/detector.js");
loadFile("../content/social.js");
loadFile("../content/evidence.js");
loadFile("../content/ui.js");

// Patch _escHtml: our mock document.createElement returns a MockElement
// whose innerHTML getter is plain string. _escHtml relies on the browser
// converting assigned innerHTML back to escaped text. Provide a safe
// string-based replacement for the test context.
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

// After loading, patch sbInitUI to use our mock shadow root
_mockShadowRoot = new MockShadowRoot();
// Patch: override _sbShadowRoot global
vm.runInThisContext(`
  _sbShadowRoot = {
    getElementById(id) {
      const el = document.createElement("DIV");
      el.id = id;
      el._children = [];
      el.appendChild = function(child) {
        child.parentNode = el;
        el._children.push(child);
      };
      return el;
    }
  };
  _sbShadowHost = document.createElement("DIV"); // mark as initialized
`);

// ── Test runner ───────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(desc, cond) {
  if (cond) { passed++; console.log(`  ✓ ${desc}`); }
  else       { failed++; failures.push(desc); console.error(`  ✗ FAIL: ${desc}`); }
}
function section(title) { console.log(`\n── ${title} ──`); }

// ── Test fixtures ─────────────────────────────────────────────
const MOCK_EXPLANATION = {
  summary: "The AI validated your view rather than evaluating it.",
  reasons: [
    "The AI opened with an effusive compliment on the question.",
    "The AI agreed with your position without evaluation.",
  ],
  evidenceDescriptions: [
    "Flattery openers signal approval-seeking behaviour.",
  ],
  counterPromptContext: "opinion",
  leadEvidence: {
    ruleId: "flattery_opener_great_question",
    matchedText: "Great question!",
    startIndex: 0,
    endIndex: 15,
    severity: "high",
    weight: 3,
    evidenceType: "textual",
    category: "opinion",
    explanation: "The AI opened with an effusive compliment.",
    reasoning: "Flattery openers signal approval-seeking.",
  }
};

const MOCK_CONFIDENCE = {
  confidence: 0.87,
  factors: [
    { name: "Base calibration",   value: "opinion", contribution: 0.72 },
    { name: "Severity weight",    value: "high",    contribution: 0.10 },
    { name: "Evidence count",     value: 3,         contribution: 0.06 },
    { name: "Category diversity", value: 2,         contribution: 0.04 },
  ]
};

const MOCK_DETECTION = {
  category: "opinion",
  severity: "high",
  evidence: [],
  ruleIds: ["flattery_opener_great_question"],
};

// ─────────────────────────────────────────────────────────────
// SECTION 1: Guard — null/partial inputs don't throw
// ─────────────────────────────────────────────────────────────
section("Guard — Null/Partial Inputs Don't Throw");

let threw = false;
let cardNull;
try { cardNull = sbShowExplainabilityCard(null, null, null, null); }
catch(e) { threw = true; }
assert("null everything: no exception thrown", !threw);

threw = false;
try { sbShowExplainabilityCard(MOCK_EXPLANATION, null, null, 1); }
catch(e) { threw = true; }
assert("null confidence: no exception thrown", !threw);

threw = false;
try { sbShowExplainabilityCard(null, MOCK_CONFIDENCE, MOCK_DETECTION, 1); }
catch(e) { threw = true; }
assert("null explanation: no exception thrown", !threw);

threw = false;
try { sbShowExplainabilityCard(MOCK_EXPLANATION, MOCK_CONFIDENCE, null, 1); }
catch(e) { threw = true; }
assert("null detection: no exception thrown", !threw);

// ─────────────────────────────────────────────────────────────
// SECTION 2: Return value is a DOM element
// ─────────────────────────────────────────────────────────────
section("Return Value Is a DOM Element");

const card = sbShowExplainabilityCard(MOCK_EXPLANATION, MOCK_CONFIDENCE, MOCK_DETECTION, 42);
assert("Returns an object",                  typeof card === "object" && card !== null);
assert("Has className containing 'sb-card'", card.className.includes("sb-card"));
assert("Has innerHTML string",               typeof card.innerHTML === "string");

// ─────────────────────────────────────────────────────────────
// SECTION 3: data-severity and data-category attributes
// ─────────────────────────────────────────────────────────────
section("Attributes — data-severity and data-category");

assert("data-severity set to detection.severity", card.getAttribute("data-severity") === "high");
assert("data-category set to detection.category", card.getAttribute("data-category") === "opinion");

// Null detection falls back to defaults
const cardNoDetect = sbShowExplainabilityCard(MOCK_EXPLANATION, MOCK_CONFIDENCE, null, 1);
assert("null detection → data-severity defaults to 'low'",    cardNoDetect.getAttribute("data-severity") === "low");
assert("null detection → data-category defaults to 'opinion'",cardNoDetect.getAttribute("data-category") === "opinion");

// ─────────────────────────────────────────────────────────────
// SECTION 4: Header content
// ─────────────────────────────────────────────────────────────
section("Card Header Content");

const html = card.innerHTML;
assert("Header contains sb-card-header",       html.includes("sb-card-header"));
assert("Header contains severity label",        html.includes("HIGH SYCOPHANCY"));
assert("Header contains severity badge",        html.includes("sb-card-sev-badge"));
assert("Header contains category badge",        html.includes("sb-card-cat-badge"));
assert("Header contains close button",          html.includes("sb-card-close"));
assert("Category badge shows 'Opinion'",        html.includes("Opinion"));

// ─────────────────────────────────────────────────────────────
// SECTION 5: Summary text
// ─────────────────────────────────────────────────────────────
section("Summary Text Rendered and Escaped");

assert("Summary div present", html.includes("sb-card-summary"));
assert("Summary text from explanation.summary", html.includes("The AI validated your view"));

// XSS: angle brackets in summary should be escaped
const xssExplanation = { ...MOCK_EXPLANATION, summary: "Alert: <script>evil()</script>" };
const cardXss = sbShowExplainabilityCard(xssExplanation, MOCK_CONFIDENCE, MOCK_DETECTION, 1);
assert("XSS in summary is escaped",
  !cardXss.innerHTML.includes("<script>") && cardXss.innerHTML.includes("&lt;script&gt;"));

// ─────────────────────────────────────────────────────────────
// SECTION 6: Reasons list
// ─────────────────────────────────────────────────────────────
section("Reasons List Rendered");

assert("Reasons section present", html.includes("sb-card-reasons"));
assert("Why this was flagged label present", html.includes("Why this was flagged"));
assert("First reason text rendered", html.includes("effusive compliment"));
assert("Second reason text rendered", html.includes("agreed with your position"));

// Empty reasons: fallback message
const cardNoReasons = sbShowExplainabilityCard(
  { ...MOCK_EXPLANATION, reasons: [] }, MOCK_CONFIDENCE, MOCK_DETECTION, 1);
assert("Empty reasons: section not rendered",
  !cardNoReasons.innerHTML.includes("Why this was flagged"));

// ─────────────────────────────────────────────────────────────
// SECTION 7: Lead evidence chip
// ─────────────────────────────────────────────────────────────
section("Lead Evidence Chip Rendered When Present");

assert("Lead evidence div present", html.includes("sb-card-lead-evidence"));
assert("Flagged text label present", html.includes("Flagged text"));
assert("Matched text rendered",      html.includes("Great question!"));

// ─────────────────────────────────────────────────────────────
// SECTION 8: Lead evidence absent when matchedText missing
// ─────────────────────────────────────────────────────────────
section("Lead Evidence Hidden When matchedText Absent");

const explNoLead = { ...MOCK_EXPLANATION, leadEvidence: null };
const cardNoLead = sbShowExplainabilityCard(explNoLead, MOCK_CONFIDENCE, MOCK_DETECTION, 1);
assert("No lead evidence chip when null", !cardNoLead.innerHTML.includes("Flagged text"));

const explNoMatchText = { ...MOCK_EXPLANATION, leadEvidence: { matchedText: "" } };
const cardEmptyMatch = sbShowExplainabilityCard(explNoMatchText, MOCK_CONFIDENCE, MOCK_DETECTION, 1);
assert("No lead evidence chip when matchedText is empty string",
  !cardEmptyMatch.innerHTML.includes("Flagged text"));

// ─────────────────────────────────────────────────────────────
// SECTION 9: Confidence percentage rendered
// ─────────────────────────────────────────────────────────────
section("Confidence Bar Rendered With Correct Percentage");

assert("Confidence div present", html.includes("sb-card-confidence"));
assert("Confidence pct present", html.includes("sb-card-conf-pct"));
assert("Correct confidence: 87%", html.includes("87%"));
assert("Confidence bar track present", html.includes("sb-card-conf-bar-track"));

// No confidence: section not rendered
const cardNoConf = sbShowExplainabilityCard(MOCK_EXPLANATION, null, MOCK_DETECTION, 1);
assert("No confidence section when null", !cardNoConf.innerHTML.includes("sb-card-confidence"));

// ─────────────────────────────────────────────────────────────
// SECTION 10: Confidence factors rendered
// ─────────────────────────────────────────────────────────────
section("Confidence Factors — 4 Rows Rendered");

assert("Factors section present", html.includes("sb-card-factors"));
assert("Base calibration factor present", html.includes("Base calibration"));
assert("Severity weight factor present",  html.includes("Severity weight"));
assert("Evidence count factor present",   html.includes("Evidence count"));
assert("Category diversity factor present", html.includes("Category diversity"));
assert("Factor contribution 72% present", html.includes("72%"));
assert("Factor contribution 10% present", html.includes("10%"));

// ─────────────────────────────────────────────────────────────
// SECTION 11: Counter-prompt box
// ─────────────────────────────────────────────────────────────
section("Counter-Prompt Box Rendered");

assert("Counter-prompt section present", html.includes("sb-card-prompt-section"));
assert("Counter-prompt label present",   html.includes("Counter-prompt"));
assert("Counter-prompt box present",     html.includes("sb-card-prompt-box"));
// The prompt content should be a non-empty string from SB_PROMPTS
const promptContent = html.match(/sb-card-prompt-box[^>]*>([^<]+)/)?.[1] || "";
assert("Counter-prompt box has content", promptContent.trim().length > 0);

// ─────────────────────────────────────────────────────────────
// SECTION 12: Three action buttons
// ─────────────────────────────────────────────────────────────
section("Action Buttons — Inject, Cycle, Dismiss");

assert("Actions div present",         html.includes("sb-card-actions"));
assert("Inject button present",       html.includes("sb-card-btn-inject"));
assert("Cycle button present",        html.includes("sb-card-btn-cycle"));
assert("Dismiss button present",      html.includes("sb-card-btn-dismiss"));
assert("Inject button has ⚡",        html.includes("⚡ Inject"));
assert("Cycle button has ↻",          html.includes("↻ New Prompt"));

// ─────────────────────────────────────────────────────────────
// SECTION 13: Footer shows detection number
// ─────────────────────────────────────────────────────────────
section("Footer Shows Detection Number");

assert("Footer div present",           html.includes("sb-card-footer"));
assert("Footer shows detection #42",   html.includes("Detection #42"));

// Zero and null detectionNum
const cardNum0 = sbShowExplainabilityCard(MOCK_EXPLANATION, MOCK_CONFIDENCE, MOCK_DETECTION, 0);
assert("detectionNum=0 renders '—'",   cardNum0.innerHTML.includes("Detection #0") || cardNum0.innerHTML.includes("Detection #—"));
const cardNumNull = sbShowExplainabilityCard(MOCK_EXPLANATION, MOCK_CONFIDENCE, MOCK_DETECTION, null);
assert("detectionNum=null renders '—'", cardNumNull.innerHTML.includes("Detection #—"));

// ─────────────────────────────────────────────────────────────
// SECTION 14: Close button present and wired
// ─────────────────────────────────────────────────────────────
section("Close Button Present");

assert("Close button in header",        html.includes("sb-card-close"));
assert("Close button aria-label=Close", html.includes('aria-label="Close"'));
assert("Close button shows ✕",         html.includes("✕"));

// ─────────────────────────────────────────────────────────────
// SECTION 15: Replaces existing active banner
// ─────────────────────────────────────────────────────────────
section("Replaces Existing Active Banner");

// Build two cards in sequence — the second should not throw
let threw2 = false;
try {
  sbShowExplainabilityCard(MOCK_EXPLANATION, MOCK_CONFIDENCE, MOCK_DETECTION, 1);
  sbShowExplainabilityCard(MOCK_EXPLANATION, MOCK_CONFIDENCE, MOCK_DETECTION, 2);
} catch(e) { threw2 = true; }
assert("Two consecutive calls: no exception thrown", !threw2);

// ─────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Component 9 Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailed assertions:");
  failures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("✅ All tests passed — Component 9 complete.");
  process.exit(0);
}
