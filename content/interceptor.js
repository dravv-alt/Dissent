// ============================================================
// Dissent — Input Interceptor
// Hooks into each platform's send mechanism to intercept
// user messages before sending. When epistemic markers are
// detected, shows an inline suggestion panel.
// ============================================================

const _sbInterceptor = {
  active: false,
  inputEl: null,
  hooked: false,
  pendingResult: null,  // stores the epistemic scan result during suggestion
  sendBlocked: false,   // true while suggestion panel is shown
  // Track which elements we've attached listeners to
  _listenersAttached: new WeakSet(),
};

// ──────────────────────────────────────────────────────────────
// INIT: Start watching for the input element
// ──────────────────────────────────────────────────────────────

function sbInitInterceptor() {
  _sbInterceptor.active = true;

  // Poll for input element (platforms load dynamically)
  const tryHook = () => {
    if (!_sbInterceptor.active) return;

    const platformKey = sbGetPlatformKey();
    if (!platformKey) return;

    const input = sbQueryInput(platformKey);
    if (input && !_sbInterceptor._listenersAttached.has(input)) {
      _sbHookInput(input, platformKey);
    }
  };

  // Initial try
  tryHook();

  // Re-check periodically (inputs can be re-created by SPA navigation)
  setInterval(tryHook, 2000);
}

// ──────────────────────────────────────────────────────────────
// HOOK: Attach listeners to the input element + send button
// ──────────────────────────────────────────────────────────────

function _sbHookInput(inputEl, platformKey) {
  _sbInterceptor.inputEl = inputEl;
  _sbInterceptor._listenersAttached.add(inputEl);

  // === KEYBOARD INTERCEPTION ===
  // Capture phase — runs before the platform's own handler
  inputEl.addEventListener("keydown", (e) => {
    if (!_sbInterceptor.active || !sbState.enabled) return;

    // Only intercept Enter (without Shift = send on most platforms)
    if (e.key !== "Enter" || e.shiftKey) return;

    // If we're currently blocked (suggestion panel is showing), prevent send
    if (_sbInterceptor.sendBlocked) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Get current input text
    const text = _sbGetInputText(inputEl);
    if (!text || text.length < 10) return;

    // L1: Inject truthfulness contract on first message (even if no epistemic trigger)
    if (sbShouldInjectContract()) {
      e.preventDefault();
      e.stopPropagation();
      const platform = SB_PLATFORMS[platformKey];
      if (platform) {
        const withContract = sbApplyContract(text);
        platform.injectText(inputEl, withContract);
        inputEl.focus();
        // Re-send after injection
        setTimeout(() => {
          inputEl.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Enter", code: "Enter", keyCode: 13, which: 13,
            bubbles: true, cancelable: true,
          }));
        }, 150);
      }
      return;
    }

    // Scan for epistemic markers
    const transform = _sbBuildPromptRiskTransform(text);
    if (!transform) return;

    // Check if certainty level meets threshold
    // (Users can set this in settings — default: intercept Belief and above)
    // Prompt risk panel is advisory: users can use rewrite, send original, or dismiss.

    // Block the send!
    e.preventDefault();
    e.stopPropagation();

    // Generate the rewrite
    _sbInterceptor.pendingResult = transform;
    _sbInterceptor.sendBlocked = true;

    // Show the suggestion panel
    sbShowEpistemicPanel(transform, inputEl, platformKey);

  }, true); // capture phase

  // === SEND BUTTON INTERCEPTION ===
  _sbHookSendButton(platformKey);

  console.log("[Dissent] Input interceptor hooked on", platformKey);
}

// ──────────────────────────────────────────────────────────────
// HOOK SEND BUTTON
// ──────────────────────────────────────────────────────────────

function _sbHookSendButton(platformKey) {
  // Platform-specific send button selectors
  const sendSelectors = {
    "claude.ai": [
      'button[aria-label="Send message"]',
      'button[aria-label="Send Message"]',
      'button[type="submit"]',
      'fieldset button:last-child',
    ],
    "chatgpt.com": [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'form button[type="submit"]',
    ],
    "gemini.google.com": [
      'button[aria-label="Send message"]',
      '.send-button',
      'button.send-button',
    ],
  };

  const selectors = sendSelectors[platformKey] || [];

  // Watch for the send button to appear (it can be dynamically created)
  const hookBtn = () => {
    for (const sel of selectors) {
      try {
        const btn = document.querySelector(sel);
        if (btn && !_sbInterceptor._listenersAttached.has(btn)) {
          _sbInterceptor._listenersAttached.add(btn);

          btn.addEventListener("click", (e) => {
            if (!_sbInterceptor.active || !sbState.enabled) return;
            if (_sbInterceptor.sendBlocked) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }

            const input = sbQueryInput(platformKey);
            if (!input) return;

            const text = _sbGetInputText(input);
            if (!text || text.length < 10) return;

            // L1: Inject truthfulness contract on first message (button click path)
            if (sbShouldInjectContract()) {
              e.preventDefault();
              e.stopPropagation();
              const platform = SB_PLATFORMS[platformKey];
              if (platform) {
                const withContract = sbApplyContract(text);
                platform.injectText(input, withContract);
                input.focus();
                setTimeout(() => {
                  btn.click();
                }, 150);
              }
              return;
            }

            const transform = _sbBuildPromptRiskTransform(text);
            if (!transform) return;

            e.preventDefault();
            e.stopPropagation();

            _sbInterceptor.pendingResult = transform;
            _sbInterceptor.sendBlocked = true;
            sbShowEpistemicPanel(transform, input, platformKey);

          }, true); // capture phase

          return; // hooked one, done
        }
      } catch (_) { /* selector failed */ }
    }
  };

  hookBtn();
  // Re-check for send button periodically (SPA re-renders)
  setInterval(hookBtn, 3000);
}

// ──────────────────────────────────────────────────────────────
// GET INPUT TEXT (platform-aware)
// ──────────────────────────────────────────────────────────────

function _sbGetInputText(el) {
  if (el.tagName === "TEXTAREA") {
    return el.value || "";
  }
  return el.innerText || el.textContent || "";
}

// ──────────────────────────────────────────────────────────────
// REPLACE INPUT TEXT + SEND (used by suggestion panel buttons)
// ──────────────────────────────────────────────────────────────

function _sbReplaceAndSend(text, inputEl, platformKey) {
  const platform = SB_PLATFORMS[platformKey];
  if (!platform) return;

  // L1: Prepend truthfulness contract if this is the first message
  let finalText = text;
  if (sbShouldInjectContract()) {
    finalText = sbApplyContract(text);
  }

  // Replace the input text
  platform.injectText(inputEl, finalText);
  inputEl.focus();

  // Unblock
  _sbInterceptor.sendBlocked = false;
  _sbInterceptor.pendingResult = null;

  // Programmatically trigger send after a short delay
  setTimeout(() => {
    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    inputEl.dispatchEvent(enterEvent);
  }, 150);
}

function _sbSendOriginal(inputEl, platformKey) {
  // L1: Prepend truthfulness contract if this is the first message
  if (sbShouldInjectContract()) {
    const platform = SB_PLATFORMS[platformKey];
    if (platform) {
      const currentText = _sbGetInputText(inputEl);
      const withContract = sbApplyContract(currentText);
      platform.injectText(inputEl, withContract);
      inputEl.focus();
    }
  }

  _sbInterceptor.sendBlocked = false;
  _sbInterceptor.pendingResult = null;

  // Press Enter on the (possibly contract-prepended) text
  setTimeout(() => {
    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    inputEl.dispatchEvent(enterEvent);
  }, 100);
}

function _sbBuildPromptRiskTransform(text) {
  if (!text || text.trim().length < 10) return null;

  // L2 Epistemic scan (only if enabled)
  if (SB_CONFIG.epistemicEnabled !== false) {
    const epistemicResult = sbScanEpistemic(text);
    if (epistemicResult.detected) {
      const minLevel = SB_CONFIG.EPISTEMIC_MIN_LEVEL || 2;
      if (epistemicResult.certainty.level >= minLevel) {
        return sbTransformToQuestion(epistemicResult);
      }
    }
  }

  // L6 Social validation scan (only if enabled)
  if (SB_CONFIG.socialScorerEnabled !== false && typeof sbScanSocialConflict === "function") {
    const socialResult = sbScanSocialConflict(text);
    if (socialResult.detected) {
      return sbBuildConflictPerspectiveTransform(text);
    }
  }

  return null;
}
