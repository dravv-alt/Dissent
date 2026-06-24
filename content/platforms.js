// ============================================================
// Dissent — Platform Adapters
// 3-Tier Selector Resolution Engine:
//   Strategy 1: CSS selector chains (existing behavior)
//   Strategy 2: Semantic heuristic probing (DOM structure)
//   Strategy 3: Attribute pattern matching (data-*/role/aria)
//
// Public API (backward-compatible):
//   sbGetPlatformKey()        → string | null
//   sbQueryResponses(key)     → Element[]
//   sbQueryInput(key)         → Element | null
//   sbQueryContainer(key)     → Element
//
// Extended API (new):
//   sbResolveResponses(key)   → SelectorResolution
//   sbResolveInput(key)       → SelectorResolution
//   sbResolveContainer(key)   → SelectorResolution
//   sbGetPlatformAdapter(key) → platform config object
// ============================================================

// ──────────────────────────────────────────────────────────────
// PLATFORM CONFIGURATIONS
// ──────────────────────────────────────────────────────────────

const SB_PLATFORMS = {
  "claude.ai": {
    name: "Claude",
    responseSelectors: [
      '[data-testid="assistant-message"] .prose',
      '.font-claude-message',
      '[data-is-streaming] .prose',
    ],
    inputSelectors: [
      '[contenteditable="true"].ProseMirror',
      'div[contenteditable="true"][data-placeholder]',
      'fieldset [contenteditable="true"]',
      '[contenteditable="true"]',
    ],
    containerSelectors: [
      '[class*="conversation"]',
      '[class*="thread"]',
      'main',
    ],
    injectText(el, text) {
      el.focus();
      if (el.tagName === "TEXTAREA") {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, "value"
        )?.set;
        if (setter) setter.call(el, text);
        else el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        el.innerHTML = "";
        const p = document.createElement("p");
        p.textContent = text;
        el.appendChild(p);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
  },

  "chatgpt.com": {
    name: "ChatGPT",
    responseSelectors: [
      '[data-message-author-role="assistant"] .markdown',
      '[data-message-author-role="assistant"] .prose',
      'article [data-message-author-role="assistant"]',
    ],
    inputSelectors: [
      '#prompt-textarea',
      '[contenteditable="true"][data-id]',
      'textarea[placeholder]',
      '[contenteditable="true"]',
    ],
    containerSelectors: [
      '[class*="conversation"]',
      'main',
      '[role="presentation"]',
    ],
    injectText(el, text) {
      el.focus();
      if (el.tagName === "TEXTAREA") {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, "value"
        )?.set;
        if (setter) setter.call(el, text);
        else el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        el.innerHTML = "";
        const p = document.createElement("p");
        p.textContent = text;
        el.appendChild(p);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
  },

  "gemini.google.com": {
    name: "Gemini",
    responseSelectors: [
      "message-content .markdown",
      "model-response .markdown",
      "message-content",
    ],
    inputSelectors: [
      "rich-textarea .ql-editor",
      "rich-textarea [contenteditable='true']",
      "[contenteditable='true']",
    ],
    containerSelectors: [
      "chat-window",
      '[class*="conversation"]',
      "main",
    ],
    injectText(el, text) {
      el.focus();
      if (el.tagName === "TEXTAREA") {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, "value"
        )?.set;
        if (setter) setter.call(el, text);
        else el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        el.innerHTML = "";
        const p = document.createElement("p");
        p.textContent = text;
        el.appendChild(p);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
  },
};


// ──────────────────────────────────────────────────────────────
// SELECTOR RESOLUTION RESULT
// ──────────────────────────────────────────────────────────────
//
// Every resolution function returns this structure:
//   {
//     elements:   Element[],   // matched DOM elements
//     strategy:   string,      // "chain" | "heuristic" | "attribute" | "none"
//     selector:   string,      // description of what matched
//     confidence: number,      // 0.0–1.0, how confident the match is
//   }
// ──────────────────────────────────────────────────────────────

function _sbMakeResolution(elements, strategy, selector, confidence) {
  return Object.freeze({
    elements:   elements || [],
    strategy:   strategy || "none",
    selector:   selector || "",
    confidence: confidence || 0,
  });
}

const _SB_EMPTY_RESOLUTION = _sbMakeResolution([], "none", "", 0);


// ──────────────────────────────────────────────────────────────
// STRATEGY 1 — CSS SELECTOR CHAINS (existing behavior)
// ──────────────────────────────────────────────────────────────

function _sbStrategy1All(selectorList) {
  for (const sel of selectorList) {
    try {
      const result = typeof sel === "function" ? sel() : document.querySelectorAll(sel);
      if (result && result.length > 0) {
        return _sbMakeResolution(
          Array.from(result),
          "chain",
          typeof sel === "function" ? "(function)" : sel,
          1.0
        );
      }
    } catch (_) { /* selector failed, try next */ }
  }
  return null; // signal: chain exhausted, try next strategy
}

function _sbStrategy1One(selectorList) {
  for (const sel of selectorList) {
    try {
      const result = document.querySelector(sel);
      if (result) {
        return _sbMakeResolution(
          [result],
          "chain",
          sel,
          1.0
        );
      }
    } catch (_) { /* try next */ }
  }
  return null;
}


// ──────────────────────────────────────────────────────────────
// STRATEGY 2 — SEMANTIC HEURISTIC PROBING
//
// When all CSS selectors fail, walk the DOM looking for elements
// by structural and behavioral signals common to AI chat UIs.
// ──────────────────────────────────────────────────────────────

// Tags that are NOT response containers
const _SB_EXCLUDED_TAGS = new Set([
  "NAV", "HEADER", "FOOTER", "SCRIPT", "STYLE", "LINK", "META",
  "INPUT", "TEXTAREA", "SELECT", "BUTTON", "LABEL", "FORM",
  "ASIDE", "NOSCRIPT", "IFRAME", "SVG", "CANVAS", "VIDEO", "AUDIO",
]);

// Minimum text length to consider something a response
const _SB_MIN_RESPONSE_LENGTH = 100;

/**
 * Strategy 2: Find response elements by structural signals.
 * Looks for rendered-text containers inside <main> or [role="main"].
 * Filters: ≥100 chars, not inside excluded tags, not an input.
 */
function _sbHeuristicResponses() {
  const candidates = [];

  // Start from the most likely root
  const roots = [];
  const mainEl = document.querySelector('main') || document.querySelector('[role="main"]');
  if (mainEl) roots.push(mainEl);
  else roots.push(document.body);

  for (const root of roots) {
    // Look for common prose/markdown containers
    const proseSelectors = [
      '.prose', '.markdown', '.markdown-body',
      '[class*="response"]', '[class*="message-content"]',
      '[class*="assistant"]', '[class*="model-response"]',
      '[class*="answer"]', '[class*="reply"]',
    ];

    for (const sel of proseSelectors) {
      try {
        const els = root.querySelectorAll(sel);
        for (const el of els) {
          if (_sbIsLikelyResponse(el)) {
            candidates.push(el);
          }
        }
      } catch (_) { /* skip bad selector */ }
    }

    // If no class-based matches, look for deep div/article containers with long text
    if (candidates.length === 0) {
      const articles = root.querySelectorAll('article, [role="article"]');
      for (const el of articles) {
        if (_sbIsLikelyResponse(el)) candidates.push(el);
      }
    }

    if (candidates.length === 0) {
      // Last resort: walk direct children of the root looking for text-heavy blocks
      const allBlocks = root.querySelectorAll('div, section, article');
      for (const el of allBlocks) {
        if (_sbIsLikelyResponse(el) && !_sbHasResponseChild(el, candidates)) {
          candidates.push(el);
        }
      }
    }
  }

  // Deduplicate: if a parent and child are both in candidates, keep only the child
  const deduped = _sbDeduplicateNested(candidates);

  if (deduped.length > 0) {
    return _sbMakeResolution(deduped, "heuristic", "semantic-prose-walk", 0.65);
  }
  return null;
}

/**
 * Strategy 2: Find input element by behavioral signals.
 * Looks for contenteditable, textarea, or textbox elements.
 */
function _sbHeuristicInput() {
  // contenteditable elements (Claude, Gemini)
  const editables = document.querySelectorAll(
    '[contenteditable="true"]:not([role="log"]):not([aria-hidden="true"])'
  );
  for (const el of editables) {
    if (_sbIsLikelyInput(el)) {
      return _sbMakeResolution([el], "heuristic", "contenteditable-probe", 0.7);
    }
  }

  // textareas (ChatGPT)
  const textareas = document.querySelectorAll('textarea:not([aria-hidden="true"])');
  for (const el of textareas) {
    if (_sbIsLikelyInput(el)) {
      return _sbMakeResolution([el], "heuristic", "textarea-probe", 0.7);
    }
  }

  // role="textbox"
  const textboxes = document.querySelectorAll('[role="textbox"]');
  for (const el of textboxes) {
    if (_sbIsLikelyInput(el)) {
      return _sbMakeResolution([el], "heuristic", "role-textbox-probe", 0.6);
    }
  }

  return null;
}

/**
 * Strategy 2: Find container by walking up from known response elements.
 * Uses overflow-y computed style to find the scrollable parent.
 */
function _sbHeuristicContainer(platformKey) {
  // Try to find container from response elements
  const responses = sbQueryResponses(platformKey);
  if (responses.length > 0) {
    let parent = responses[0].parentElement;
    let depth = 0;
    while (parent && parent !== document.body && depth < 15) {
      try {
        const style = window.getComputedStyle(parent);
        const overflow = style.overflowY;
        if (overflow === "auto" || overflow === "scroll") {
          return _sbMakeResolution([parent], "heuristic", "overflow-parent-walk", 0.75);
        }
      } catch (_) { /* skip */ }
      parent = parent.parentElement;
      depth++;
    }
  }

  // Fallback: try main or [role="main"]
  const mainEl = document.querySelector('main') || document.querySelector('[role="main"]');
  if (mainEl && mainEl !== document.body) {
    return _sbMakeResolution([mainEl], "heuristic", "main-element-fallback", 0.5);
  }

  return null;
}

// ── Heuristic filter helpers ──

function _sbIsLikelyResponse(el) {
  if (!el || !el.tagName) return false;
  if (_SB_EXCLUDED_TAGS.has(el.tagName)) return false;

  // Check text length
  const text = (el.innerText || el.textContent || "").trim();
  if (text.length < _SB_MIN_RESPONSE_LENGTH) return false;

  // Check it's not inside an excluded ancestor
  let parent = el.parentElement;
  let depth = 0;
  while (parent && depth < 8) {
    if (parent.tagName === "NAV" || parent.tagName === "HEADER" || parent.tagName === "FOOTER") {
      return false;
    }
    parent = parent.parentElement;
    depth++;
  }

  // Check it's not an input element
  if (el.getAttribute("contenteditable") === "true") return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return false;

  // Check visibility (basic)
  if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;

  return true;
}

function _sbIsLikelyInput(el) {
  if (!el) return false;

  // Must be visible
  if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;

  // Must not be hidden
  if (el.getAttribute("aria-hidden") === "true") return false;

  // Should be inside the main content area, not in a tooltip/modal
  let parent = el.parentElement;
  let depth = 0;
  while (parent && depth < 8) {
    if (parent.tagName === "NAV" || parent.tagName === "HEADER") return false;
    // Skip if inside a popover/tooltip
    const role = parent.getAttribute("role");
    if (role === "tooltip" || role === "dialog") return false;
    parent = parent.parentElement;
    depth++;
  }

  return true;
}

function _sbHasResponseChild(el, alreadyFound) {
  // Check if el contains any element already in the candidates array
  for (const found of alreadyFound) {
    if (el !== found && el.contains(found)) return true;
  }
  return false;
}

function _sbDeduplicateNested(elements) {
  if (elements.length <= 1) return elements;
  const result = [];
  for (const el of elements) {
    let isAncestor = false;
    for (const other of elements) {
      if (el !== other && el.contains(other)) {
        isAncestor = true;
        break;
      }
    }
    if (!isAncestor) result.push(el);
  }
  return result;
}


// ──────────────────────────────────────────────────────────────
// STRATEGY 3 — ATTRIBUTE PATTERN MATCHING
//
// Scan data-*, role, and aria-label attributes for semantic
// patterns common across AI chat UIs.
// ──────────────────────────────────────────────────────────────

// Attribute patterns for response elements
const _SB_RESPONSE_ATTR_PATTERNS = [
  // data-testid patterns
  { selector: '[data-testid*="message"]', filter: el => !_sbIsUserMessage(el) },
  { selector: '[data-testid*="response"]', filter: null },
  { selector: '[data-testid*="assistant"]', filter: null },
  { selector: '[data-testid*="reply"]', filter: null },
  // role-based
  { selector: '[role="article"]', filter: el => _sbIsLikelyResponse(el) },
  // aria-label patterns
  { selector: '[aria-label*="assistant"]', filter: null },
  { selector: '[aria-label*="response"]', filter: null },
  // data-message patterns (ChatGPT-style)
  { selector: '[data-message-author-role="assistant"]', filter: null },
];

// Attribute patterns for input elements
const _SB_INPUT_ATTR_PATTERNS = [
  { selector: '[role="textbox"]', filter: el => _sbIsLikelyInput(el) },
  { selector: '[aria-label*="prompt"]', filter: null },
  { selector: '[aria-label*="message"]', filter: el => el.tagName === "TEXTAREA" || el.getAttribute("contenteditable") === "true" },
  { selector: '[data-testid*="input"]', filter: null },
  { selector: '[data-testid*="prompt"]', filter: null },
  { selector: '[data-testid*="compose"]', filter: null },
];

// Attribute patterns for container elements
const _SB_CONTAINER_ATTR_PATTERNS = [
  { selector: '[role="log"]', filter: null },
  { selector: '[role="feed"]', filter: null },
  { selector: '[aria-label*="conversation"]', filter: null },
  { selector: '[aria-label*="chat"]', filter: null },
  { selector: '[data-testid*="conversation"]', filter: null },
  { selector: '[data-testid*="thread"]', filter: null },
];

function _sbIsUserMessage(el) {
  // Quick checks to filter out user messages from attribute matches
  const testid = el.getAttribute("data-testid") || "";
  const role = el.getAttribute("data-message-author-role") || "";
  const ariaLabel = el.getAttribute("aria-label") || "";
  const className = el.className || "";

  if (role === "user") return true;
  if (testid.includes("user")) return true;
  if (ariaLabel.toLowerCase().includes("user")) return true;
  if (typeof className === "string" && className.includes("user")) return true;
  return false;
}

function _sbAttrStrategy(patterns, mode) {
  const allMatches = [];

  for (const pattern of patterns) {
    try {
      const els = document.querySelectorAll(pattern.selector);
      for (const el of els) {
        if (pattern.filter && !pattern.filter(el)) continue;
        allMatches.push(el);
      }
    } catch (_) { /* skip invalid selector */ }

    // For "one" mode, return first match
    if (mode === "one" && allMatches.length > 0) {
      return _sbMakeResolution(
        [allMatches[0]],
        "attribute",
        pattern.selector,
        0.5
      );
    }
  }

  if (allMatches.length > 0) {
    const deduped = _sbDeduplicateNested(allMatches);
    return _sbMakeResolution(
      deduped,
      "attribute",
      "attr-pattern-scan",
      0.5
    );
  }

  return null;
}


// ──────────────────────────────────────────────────────────────
// UNIFIED RESOLUTION API
//
// Each function tries strategies in order: chain → heuristic → attribute
// Returns a SelectorResolution object.
// ──────────────────────────────────────────────────────────────

function sbResolveResponses(platformKey) {
  const p = SB_PLATFORMS[platformKey];
  if (!p) return _SB_EMPTY_RESOLUTION;

  // Strategy 1: CSS selector chain
  const chainResult = _sbStrategy1All(p.responseSelectors);
  if (chainResult) return chainResult;

  // Strategy 2: Semantic heuristic
  const heuristicResult = _sbHeuristicResponses();
  if (heuristicResult) return heuristicResult;

  // Strategy 3: Attribute pattern matching
  const attrResult = _sbAttrStrategy(_SB_RESPONSE_ATTR_PATTERNS, "all");
  if (attrResult) return attrResult;

  return _SB_EMPTY_RESOLUTION;
}

function sbResolveInput(platformKey) {
  const p = SB_PLATFORMS[platformKey];
  if (!p) return _SB_EMPTY_RESOLUTION;

  // Strategy 1
  const chainResult = _sbStrategy1One(p.inputSelectors);
  if (chainResult) return chainResult;

  // Strategy 2
  const heuristicResult = _sbHeuristicInput();
  if (heuristicResult) return heuristicResult;

  // Strategy 3
  const attrResult = _sbAttrStrategy(_SB_INPUT_ATTR_PATTERNS, "one");
  if (attrResult) return attrResult;

  return _SB_EMPTY_RESOLUTION;
}

function sbResolveContainer(platformKey) {
  const p = SB_PLATFORMS[platformKey];
  if (!p) return _sbMakeResolution([document.body], "none", "fallback-body", 0);

  // Strategy 1
  const chainResult = _sbStrategy1One(p.containerSelectors);
  if (chainResult) return chainResult;

  // Strategy 2
  const heuristicResult = _sbHeuristicContainer(platformKey);
  if (heuristicResult) return heuristicResult;

  // Strategy 3
  const attrResult = _sbAttrStrategy(_SB_CONTAINER_ATTR_PATTERNS, "one");
  if (attrResult) return attrResult;

  return _sbMakeResolution([document.body], "none", "fallback-body", 0);
}


// ──────────────────────────────────────────────────────────────
// BACKWARD-COMPATIBLE PUBLIC API
//
// These functions preserve the exact same signatures and return
// types as the original platforms.js. All existing callers
// (main.js, contract.js, interceptor.js, injector.js) continue
// to work unchanged.
// ──────────────────────────────────────────────────────────────

function sbGetPlatformKey() {
  const host = window.location.hostname;
  return Object.keys(SB_PLATFORMS).find(p => host.includes(p)) || null;
}

function sbGetPlatformAdapter(platformKey) {
  return SB_PLATFORMS[platformKey] || null;
}

function sbQueryResponses(platformKey) {
  // Use cache if available, otherwise resolve directly
  if (typeof _sbCachedResolve === "function") {
    return _sbCachedResolve("responses", platformKey).elements;
  }
  return sbResolveResponses(platformKey).elements;
}

function sbQueryInput(platformKey) {
  if (typeof _sbCachedResolve === "function") {
    const result = _sbCachedResolve("input", platformKey);
    return result.elements[0] || null;
  }
  const result = sbResolveInput(platformKey);
  return result.elements[0] || null;
}

function sbQueryContainer(platformKey) {
  if (typeof _sbCachedResolve === "function") {
    const result = _sbCachedResolve("container", platformKey);
    return result.elements[0] || document.body;
  }
  const result = sbResolveContainer(platformKey);
  return result.elements[0] || document.body;
}

// ──────────────────────────────────────────────────────────────
// LAST RESOLUTION TRACKING
//
// Stores the strategy and confidence from the most recent
// resolution. Used by the health monitor and popup status.
// ──────────────────────────────────────────────────────────────

const _sbLastResolution = {
  responses:  null,  // last SelectorResolution for responses
  input:      null,  // last SelectorResolution for input
  container:  null,  // last SelectorResolution for container
};

function sbGetLastResolution(target) {
  return _sbLastResolution[target] || _SB_EMPTY_RESOLUTION;
}

