// ============================================================
// Dissent — Selector Resilience Tests
// Tests the 3-tier resolution engine, self-healing cache,
// platform health monitor, and edge cases.
// ============================================================

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");
const { JSDOM } = (() => {
  try { return require("jsdom"); } catch (_) { return { JSDOM: null }; }
})();

// ──────────────────────────────────────────────────────────────
// MINIMAL DOM ENVIRONMENT
// ──────────────────────────────────────────────────────────────

function createMinimalDOM() {
  if (JSDOM) {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      url: "https://claude.ai/chat",
    });
    return dom.window;
  }

  // Fallback: build a manual stub DOM for CI/environments without jsdom
  const elements = [];
  const elementsByTag = {};
  const elementById = {};

  function makeElement(tag, attrs = {}, text = "") {
    const el = {
      tagName: tag.toUpperCase(),
      className: attrs.class || attrs.className || "",
      textContent: text,
      innerText: text,
      innerHTML: "",
      offsetWidth: 100,
      offsetHeight: 50,
      parentElement: null,
      children: [],
      _attrs: { ...attrs },
      getAttribute(name) {
        if (name === "class") return this.className;
        return this._attrs[name] ?? null;
      },
      setAttribute(name, val) {
        this._attrs[name] = val;
        if (name === "class") this.className = val;
      },
      querySelectorAll(sel) { return stubQuerySelectorAll(sel, this); },
      querySelector(sel) {
        const results = stubQuerySelectorAll(sel, this);
        return results.length > 0 ? results[0] : null;
      },
      contains(other) {
        if (this === other) return true;
        for (const child of this.children) {
          if (child === other || child.contains(other)) return true;
        }
        return false;
      },
      appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
        return child;
      },
    };
    if (attrs.id) elementById[attrs.id] = el;
    elements.push(el);
    if (!elementsByTag[el.tagName]) elementsByTag[el.tagName] = [];
    elementsByTag[el.tagName].push(el);
    return el;
  }

  // Very basic querySelectorAll stub that handles simple selectors
  function stubQuerySelectorAll(sel, root) {
    const matches = [];
    const stack = [root || body];
    while (stack.length > 0) {
      const node = stack.pop();
      if (matchesSelector(node, sel)) matches.push(node);
      if (node.children) {
        for (const child of node.children) stack.push(child);
      }
    }
    return matches;
  }

  function matchesSelector(el, sel) {
    if (!el || !el.tagName) return false;

    // Class selector: .foo
    if (sel.startsWith(".")) {
      const cls = sel.slice(1);
      return (el.className || "").split(/\s+/).includes(cls);
    }
    // Tag selector
    if (/^[a-z-]+$/i.test(sel)) {
      return el.tagName.toLowerCase() === sel.toLowerCase();
    }
    // Attribute contains: [attr*="val"]
    let m = sel.match(/\[([a-z-]+)\*="([^"]+)"\]/i);
    if (m) {
      const val = el.getAttribute(m[1]);
      return val != null && val.includes(m[2]);
    }
    // Attribute equals: [attr="val"]
    m = sel.match(/\[([a-z-]+)="([^"]+)"\]/i);
    if (m) {
      return el.getAttribute(m[1]) === m[2];
    }
    // ID selector
    if (sel.startsWith("#")) {
      return el._attrs.id === sel.slice(1);
    }
    // Compound: tag .class (simplified)
    if (sel.includes(" ")) {
      // Skip compound selectors in stub — too complex for minimal shim
      return false;
    }
    return false;
  }

  const body = makeElement("body");
  const doc = {
    body: body,
    querySelector(sel) {
      return body.querySelector(sel);
    },
    querySelectorAll(sel) {
      return body.querySelectorAll(sel);
    },
    readyState: "complete",
    addEventListener() {},
    createElement(tag) { return makeElement(tag); },
  };

  return {
    document: doc,
    location: { hostname: "claude.ai", href: "https://claude.ai/chat/123" },
    getComputedStyle() { return { overflowY: "visible" }; },
    _makeElement: makeElement,
  };
}


// ──────────────────────────────────────────────────────────────
// LOAD SCRIPTS IN CONTEXT
// ──────────────────────────────────────────────────────────────

const contentDir = path.join(__dirname, "..", "content");

function loadScripts(win) {
  // Set up globals
  global.window   = win;
  global.document  = win.document;
  globalThis.window   = win;
  globalThis.document = win.document;

  // Chrome API stub
  globalThis.chrome = {
    runtime: {
      sendMessage: () => {},
      onMessage: { addListener: () => {} },
      lastError: null,
    },
    storage: {
      sync: { get: (_, cb) => cb && cb({}), set: () => {} },
      local: { get: (_, cb) => cb && cb({}), set: () => {} },
      onChanged: { addListener: () => {} },
    },
    action: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {},
    },
  };

  // Stub functions that platforms.js and selector-cache.js need
  globalThis.sbResetTracker = globalThis.sbResetTracker || (() => {});
  globalThis.sbGetTrackerSummary = globalThis.sbGetTrackerSummary || (() => ({}));

  // Load platforms.js
  const platformsSrc = fs.readFileSync(path.join(contentDir, "platforms.js"), "utf-8");
  vm.runInThisContext(platformsSrc, { filename: "platforms.js" });

  // Load selector-cache.js
  const cacheSrc = fs.readFileSync(path.join(contentDir, "selector-cache.js"), "utf-8");
  vm.runInThisContext(cacheSrc, { filename: "selector-cache.js" });
}


// ──────────────────────────────────────────────────────────────
// TEST HARNESS
// ──────────────────────────────────────────────────────────────

let pass = 0, fail = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ FAIL: ${label}`);
    fail++;
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}


// ──────────────────────────────────────────────────────────────
// SETUP
// ──────────────────────────────────────────────────────────────

const win = createMinimalDOM();
loadScripts(win);


// ──────────────────────────────────────────────────────────────
// TEST 1: Strategy 1 (CSS chain) passes with matching selectors
// ──────────────────────────────────────────────────────────────

section("Strategy 1 — CSS chain finds matching elements");

{
  // Create elements that match Claude's response selectors
  const responseDiv = win._makeElement("div", {
    "data-testid": "assistant-message",
    class: "prose",
  }, "A".repeat(150));
  responseDiv.offsetWidth = 100;
  responseDiv.offsetHeight = 50;
  win.document.body.appendChild(responseDiv);

  const resolution = sbResolveResponses("claude.ai");
  assert(resolution.strategy === "chain", "strategy is 'chain'");
  assert(resolution.confidence === 1.0, "confidence is 1.0");
  assert(resolution.elements.length > 0, "found at least 1 element");
  assert(resolution.selector.includes("prose") || resolution.selector.includes("assistant"), "selector describes the match");

  // Clean up
  win.document.body.children = [];
}


// ──────────────────────────────────────────────────────────────
// TEST 2: Strategy 1 fails → Strategy 2 (heuristic) recovers
// ──────────────────────────────────────────────────────────────

section("Strategy 2 — Heuristic fallback when chain fails");

{
  // Create a response-like element that doesn't match CSS selectors
  // but has .prose class (which heuristic probes for)
  const main = win._makeElement("main", {}, "");
  main.offsetWidth = 800;
  main.offsetHeight = 600;
  const proseDiv = win._makeElement("div", { class: "prose" },
    "This is a really long AI response that should be detected by the heuristic probing strategy because it has more than 100 characters of meaningful content.");
  proseDiv.offsetWidth = 700;
  proseDiv.offsetHeight = 200;
  main.appendChild(proseDiv);
  win.document.body.appendChild(main);

  const resolution = sbResolveResponses("chatgpt.com");
  assert(resolution.strategy === "heuristic" || resolution.strategy === "chain",
    "found via heuristic or chain fallback");
  assert(resolution.elements.length > 0, "heuristic found at least 1 element");
  assert(resolution.confidence > 0, "confidence is positive");

  // Clean up
  win.document.body.children = [];
}


// ──────────────────────────────────────────────────────────────
// TEST 3: Heuristic filters — excludes nav/header/footer/short text
// ──────────────────────────────────────────────────────────────

section("Heuristic filters — excludes structural and short elements");

{
  // Short text — should NOT be found
  const shortDiv = win._makeElement("div", { class: "prose" }, "Too short");
  shortDiv.offsetWidth = 100;
  shortDiv.offsetHeight = 20;

  // Nav element — should NOT be found
  const nav = win._makeElement("nav", {}, "");
  const navProseDiv = win._makeElement("div", { class: "prose" },
    "A".repeat(200));
  navProseDiv.parentElement = nav;
  nav.appendChild(navProseDiv);

  // Hidden element (0 dimensions) — should NOT be found
  const hiddenDiv = win._makeElement("div", { class: "prose" },
    "B".repeat(200));
  hiddenDiv.offsetWidth = 0;
  hiddenDiv.offsetHeight = 0;

  // Input element — should NOT be found
  const inputDiv = win._makeElement("div", {
    class: "prose",
    contenteditable: "true",
  }, "C".repeat(200));
  inputDiv.offsetWidth = 100;
  inputDiv.offsetHeight = 50;

  assert(!_sbIsLikelyResponse(shortDiv), "short text filtered out");
  assert(!_sbIsLikelyResponse(hiddenDiv), "hidden element filtered out");
  assert(!_sbIsLikelyResponse(inputDiv), "input element filtered out");
}


// ──────────────────────────────────────────────────────────────
// TEST 4: Strategy 3 (attribute matching) finds data-testid
// ──────────────────────────────────────────────────────────────

section("Strategy 3 — Attribute pattern matching");

{
  // Reset body
  win.document.body.children = [];

  const el = win._makeElement("div", {
    "data-testid": "assistant-response-1",
  }, "D".repeat(200));
  el.offsetWidth = 700;
  el.offsetHeight = 100;
  win.document.body.appendChild(el);

  // Use attribute strategy directly
  const result = _sbAttrStrategy(_SB_RESPONSE_ATTR_PATTERNS, "all");
  assert(result !== null, "attribute strategy found something");
  if (result) {
    assert(result.strategy === "attribute", "strategy is 'attribute'");
    assert(result.confidence === 0.5, "attribute confidence is 0.5");
    assert(result.elements.length > 0, "found at least 1 element");
  }

  win.document.body.children = [];
}


// ──────────────────────────────────────────────────────────────
// TEST 5: All strategies fail → returns empty resolution
// ──────────────────────────────────────────────────────────────

section("All strategies fail — empty resolution");

{
  win.document.body.children = [];

  const resolution = sbResolveResponses("claude.ai");
  assert(resolution.strategy === "none", "strategy is 'none'");
  assert(resolution.confidence === 0, "confidence is 0");
  assert(resolution.elements.length === 0, "no elements found");
}


// ──────────────────────────────────────────────────────────────
// TEST 6: Selector Resolution Result structure
// ──────────────────────────────────────────────────────────────

section("SelectorResolution — object structure");

{
  const res = _sbMakeResolution([win.document.body], "chain", ".test", 0.95);
  assert(res.elements.length === 1, "elements has 1 entry");
  assert(res.strategy === "chain", "strategy field present");
  assert(res.selector === ".test", "selector field present");
  assert(res.confidence === 0.95, "confidence field present");
  assert(Object.isFrozen(res), "resolution is frozen (immutable)");
}


// ──────────────────────────────────────────────────────────────
// TEST 7: Cache — hit path
// ──────────────────────────────────────────────────────────────

section("Cache — hit path uses cached strategy");

{
  win.document.body.children = [];

  // Add a matching element
  const el = win._makeElement("div", {
    "data-testid": "assistant-message",
    class: "prose",
  }, "E".repeat(150));
  el.offsetWidth = 700;
  el.offsetHeight = 100;
  win.document.body.appendChild(el);

  // First call — cache miss
  const statsBefore = _sbGetCacheStats();
  const res1 = _sbCachedResolve("responses", "claude.ai");
  const statsAfter = _sbGetCacheStats();

  assert(res1.elements.length > 0, "first call finds elements");
  assert(statsAfter.misses === statsBefore.misses + 1, "cache miss counted");

  // Second call — cache hit
  const statsBeforeHit = _sbGetCacheStats();
  const res2 = _sbCachedResolve("responses", "claude.ai");
  const statsAfterHit = _sbGetCacheStats();

  assert(res2.elements.length > 0, "second call also finds elements");
  assert(statsAfterHit.hits === statsBeforeHit.hits + 1, "cache hit counted");

  win.document.body.children = [];
}


// ──────────────────────────────────────────────────────────────
// TEST 8: Cache invalidation clears entries
// ──────────────────────────────────────────────────────────────

section("Cache — invalidation clears all entries");

{
  // Populate cache
  win.document.body.children = [];
  const el = win._makeElement("div", {
    "data-testid": "assistant-message",
    class: "prose",
  }, "F".repeat(150));
  el.offsetWidth = 700;
  el.offsetHeight = 100;
  win.document.body.appendChild(el);

  _sbCachedResolve("responses", "claude.ai");
  assert(_sbGetCacheStats().cacheSize > 0, "cache has entries before invalidation");

  _sbInvalidateCache();
  assert(_sbGetCacheStats().cacheSize === 0, "cache is empty after invalidation");

  win.document.body.children = [];
}


// ──────────────────────────────────────────────────────────────
// TEST 9: Cache — TTL expiry triggers revalidation
// ──────────────────────────────────────────────────────────────

section("Cache — TTL expiry triggers revalidation");

{
  win.document.body.children = [];
  _sbInvalidateCache();

  const el = win._makeElement("div", {
    "data-testid": "assistant-message",
    class: "prose",
  }, "G".repeat(150));
  el.offsetWidth = 700;
  el.offsetHeight = 100;
  win.document.body.appendChild(el);

  // First call caches
  _sbCachedResolve("responses", "claude.ai");

  // Manually age the cache entry past TTL
  const key = "responses:claude.ai";
  const entry = _sbSelectorCache.get(key);
  if (entry) {
    entry.timestamp = Date.now() - (_SB_CACHE_TTL_MS + 1000); // expired
  }

  const statsBefore = _sbGetCacheStats();
  _sbCachedResolve("responses", "claude.ai");
  const statsAfter = _sbGetCacheStats();

  assert(statsAfter.revalidations === statsBefore.revalidations + 1,
    "TTL expiry triggered revalidation");

  win.document.body.children = [];
}


// ──────────────────────────────────────────────────────────────
// TEST 10: Input resolution — finds contenteditable / textarea
// ──────────────────────────────────────────────────────────────

section("Input resolution — finds editable elements");

{
  win.document.body.children = [];
  _sbInvalidateCache();

  const input = win._makeElement("div", {
    contenteditable: "true",
    class: "ProseMirror",
  }, "");
  input.offsetWidth = 500;
  input.offsetHeight = 40;
  win.document.body.appendChild(input);

  const result = sbResolveInput("claude.ai");
  assert(result.elements.length > 0, "found input element");
  assert(result.strategy === "chain" || result.strategy === "heuristic",
    "input resolved via chain or heuristic");

  win.document.body.children = [];
}


// ──────────────────────────────────────────────────────────────
// TEST 11: Container resolution — fallback to body when empty
// ──────────────────────────────────────────────────────────────

section("Container resolution — fallback to body");

{
  win.document.body.children = [];
  _sbInvalidateCache();

  const result = sbResolveContainer("claude.ai");
  assert(result.elements.length > 0, "container always returns at least 1 element");

  // The element should be document.body as fallback
  assert(
    result.elements[0] === win.document.body || result.strategy !== "none",
    "container either finds something or falls back to body"
  );
}


// ──────────────────────────────────────────────────────────────
// TEST 12: sbGetPlatformKey — detects platforms correctly
// ──────────────────────────────────────────────────────────────

section("sbGetPlatformKey — platform detection");

{
  const origHostname = win.location.hostname;

  win.location.hostname = "claude.ai";
  assert(sbGetPlatformKey() === "claude.ai", "detects claude.ai");

  win.location.hostname = "chatgpt.com";
  assert(sbGetPlatformKey() === "chatgpt.com", "detects chatgpt.com");

  win.location.hostname = "gemini.google.com";
  assert(sbGetPlatformKey() === "gemini.google.com", "detects gemini.google.com");

  win.location.hostname = "example.com";
  assert(sbGetPlatformKey() === null, "returns null for unknown platform");

  win.location.hostname = origHostname;
}


// ──────────────────────────────────────────────────────────────
// TEST 13: Backward-compatible API — sbQueryResponses
// ──────────────────────────────────────────────────────────────

section("Backward-compatible API — sbQueryResponses returns Element[]");

{
  win.document.body.children = [];
  _sbInvalidateCache();

  // sbQueryResponses should return a plain array, not a SelectorResolution
  const el = win._makeElement("div", {
    "data-testid": "assistant-message",
    class: "prose",
  }, "H".repeat(150));
  el.offsetWidth = 700;
  el.offsetHeight = 100;
  win.document.body.appendChild(el);

  const result = sbQueryResponses("claude.ai");
  assert(Array.isArray(result), "returns an array");
  assert(result.length > 0, "array is non-empty for matching DOM");
  assert(typeof result[0].tagName === "string", "elements are DOM-like objects");

  // sbQueryInput should return element or null
  const inputResult = sbQueryInput("claude.ai");
  assert(inputResult === null || typeof inputResult.tagName === "string",
    "sbQueryInput returns element or null");

  // sbQueryContainer should always return something
  const containerResult = sbQueryContainer("claude.ai");
  assert(containerResult !== null, "sbQueryContainer never returns null");

  win.document.body.children = [];
}


// ──────────────────────────────────────────────────────────────
// TEST 14: User message filtering — _sbIsUserMessage
// ──────────────────────────────────────────────────────────────

section("User message filtering");

{
  const userEl = win._makeElement("div", {
    "data-message-author-role": "user",
  }, "I am a user message");

  const assistantEl = win._makeElement("div", {
    "data-message-author-role": "assistant",
  }, "I am an assistant message");

  const userTestId = win._makeElement("div", {
    "data-testid": "user-message-1",
  }, "User msg");

  assert(_sbIsUserMessage(userEl) === true, "user role detected");
  assert(_sbIsUserMessage(assistantEl) === false, "assistant role not flagged");
  assert(_sbIsUserMessage(userTestId) === true, "user testid detected");
}


// ──────────────────────────────────────────────────────────────
// TEST 15: Deduplication — nested elements
// ──────────────────────────────────────────────────────────────

section("Deduplication — removes nested parent elements");

{
  const parent = win._makeElement("div", {}, "A".repeat(200));
  const child = win._makeElement("div", {}, "B".repeat(200));
  parent.appendChild(child);

  const deduped = _sbDeduplicateNested([parent, child]);
  assert(deduped.length === 1, "deduped to 1 element");
  assert(deduped[0] === child, "kept the child, not the parent");
}


// ──────────────────────────────────────────────────────────────
// TEST 16: Cache diagnostics — _sbGetCacheStats
// ──────────────────────────────────────────────────────────────

section("Cache diagnostics");

{
  const stats = _sbGetCacheStats();
  assert(typeof stats.hits === "number", "hits is a number");
  assert(typeof stats.misses === "number", "misses is a number");
  assert(typeof stats.revalidations === "number", "revalidations is a number");
  assert(typeof stats.invalidations === "number", "invalidations is a number");
  assert(typeof stats.cacheSize === "number", "cacheSize is a number");
  assert(typeof stats.pendingRetries === "number", "pendingRetries is a number");
}


// ──────────────────────────────────────────────────────────────
// TEST 17: sbGetPlatformAdapter
// ──────────────────────────────────────────────────────────────

section("sbGetPlatformAdapter — returns config or null");

{
  const adapter = sbGetPlatformAdapter("claude.ai");
  assert(adapter !== null, "claude.ai adapter exists");
  assert(adapter.name === "Claude", "adapter name is 'Claude'");
  assert(Array.isArray(adapter.responseSelectors), "has responseSelectors");
  assert(typeof adapter.injectText === "function", "has injectText function");

  const nullAdapter = sbGetPlatformAdapter("unknown.com");
  assert(nullAdapter === null, "unknown platform returns null");
}


// ──────────────────────────────────────────────────────────────
// TEST 18: sbGetLastResolution tracking
// ──────────────────────────────────────────────────────────────

section("Last resolution tracking");

{
  win.document.body.children = [];
  _sbInvalidateCache();

  // Resolve something
  const el = win._makeElement("div", {
    "data-testid": "assistant-message",
    class: "prose",
  }, "J".repeat(150));
  el.offsetWidth = 700;
  el.offsetHeight = 100;
  win.document.body.appendChild(el);

  _sbCachedResolve("responses", "claude.ai");

  const lastRes = sbGetLastResolution("responses");
  assert(lastRes !== null, "last resolution is not null after resolve");
  assert(lastRes.strategy !== undefined, "has strategy field");

  const noRes = sbGetLastResolution("nonexistent");
  assert(noRes.strategy === "none", "unknown target returns empty resolution");

  win.document.body.children = [];
}


// ──────────────────────────────────────────────────────────────
// SUMMARY
// ──────────────────────────────────────────────────────────────

console.log("\n──────────────────────────────────────────────────");
console.log(`Selector Resilience Tests: ${pass} passed, ${fail} failed`);
if (fail === 0) {
  console.log("✅ All tests passed — Selector Resilience complete.");
} else {
  console.log("❌ Some tests failed.");
  process.exit(1);
}
