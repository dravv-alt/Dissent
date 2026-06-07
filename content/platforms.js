// ============================================================
// Dissent — Platform Adapters
// Resilient DOM selectors with ordered fallback chains
// ============================================================

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
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
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
        ).set;
        setter.call(el, text);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
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
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
    },
  },
};

// ──────────────────────────────────────────────────────────────
// RESILIENT QUERY HELPERS
// Try each selector in order; first match wins.
// ──────────────────────────────────────────────────────────────

function sbGetPlatformKey() {
  const host = window.location.hostname;
  return Object.keys(SB_PLATFORMS).find(p => host.includes(p)) || null;
}

function _sbQueryAll(selectorList) {
  for (const sel of selectorList) {
    try {
      const result = typeof sel === "function" ? sel() : document.querySelectorAll(sel);
      if (result && result.length > 0) return Array.from(result);
    } catch (_) { /* selector failed, try next */ }
  }
  return [];
}

function _sbQueryOne(selectorList) {
  for (const sel of selectorList) {
    try {
      const result = document.querySelector(sel);
      if (result) return result;
    } catch (_) { /* try next */ }
  }
  return null;
}

function sbQueryResponses(platformKey) {
  const p = SB_PLATFORMS[platformKey];
  return p ? _sbQueryAll(p.responseSelectors) : [];
}

function sbQueryInput(platformKey) {
  const p = SB_PLATFORMS[platformKey];
  return p ? _sbQueryOne(p.inputSelectors) : null;
}

function sbQueryContainer(platformKey) {
  const p = SB_PLATFORMS[platformKey];
  if (!p) return document.body;
  return _sbQueryOne(p.containerSelectors) || document.body;
}
