// ============================================================
// Dissent — Truthfulness Contract (L1)
// Silent preamble prepended to the user's FIRST message in
// each conversation. Primes the AI for honesty by establishing
// an explicit truthfulness contract, based on Sharma et al.'s
// non-sycophantic preference model concept.
//
// Approach: Prepend to user's first message (visible).
// This is the only reliable cross-platform method since we
// cannot inject system prompts directly.
// ============================================================

const _sbContract = {
  enabled: true,
  injectedUrls: new Set(), // track which conversation URLs have been primed
};

// ──────────────────────────────────────────────────────────────
// CONTRACT TEMPLATES
// Multiple variants to avoid pattern detection / memorization
// by the AI. A random one is selected per conversation.
// ──────────────────────────────────────────────────────────────

const SB_CONTRACTS = [
  // Concise — minimal token overhead
  `[Ground Rules] In this conversation: (1) Prioritize accuracy over agreement. (2) If I challenge your answer, re-derive it independently before changing it. (3) Maintain your position unless I provide genuinely new evidence. (4) If you notice yourself agreeing due to social pressure rather than logic, flag it explicitly.\n\n`,

  // Collaborative framing — feels less adversarial
  `[Collaboration Protocol] I want us to have a productive, honest conversation. To help with that: Please hold your positions firmly when you believe you're correct, even if I push back. If you change your mind, explicitly state what new evidence caused the shift. I'd rather hear an uncomfortable truth than a comfortable agreement.\n\n`,

  // Question-form — aligned with AISI finding
  `[Before we start] Can you commit to the following for this conversation? (1) Will you prioritize being correct over being agreeable? (2) If I disagree with you, will you re-examine your answer independently rather than automatically conceding? (3) Will you flag it if you suspect you're agreeing with me out of politeness rather than conviction?\n\n`,
];

// ──────────────────────────────────────────────────────────────
// CHECK IF CONTRACT SHOULD BE INJECTED
// Returns true if this is a "new conversation" that hasn't
// been primed yet.
// ──────────────────────────────────────────────────────────────

function sbShouldInjectContract() {
  if (!_sbContract.enabled) return false;

  // Use the current URL as the conversation identifier
  const url = window.location.href;

  // Already injected for this conversation
  if (_sbContract.injectedUrls.has(url)) return false;

  // Check if this looks like a fresh conversation
  // (no existing AI responses in the DOM)
  const platformKey = sbGetPlatformKey();
  if (!platformKey) return false;

  const responses = sbQueryResponses(platformKey);
  if (responses.length > 0) {
    // There are already AI responses — conversation is ongoing
    // Mark as "already handled" so we don't inject mid-conversation
    _sbContract.injectedUrls.add(url);
    return false;
  }

  return true;
}

// ──────────────────────────────────────────────────────────────
// INJECT THE CONTRACT
// Prepends the contract to the given message text.
// Returns the modified text.
// ──────────────────────────────────────────────────────────────

function sbApplyContract(messageText) {
  const contract = SB_CONTRACTS[Math.floor(Math.random() * SB_CONTRACTS.length)];

  // Mark this URL as injected
  _sbContract.injectedUrls.add(window.location.href);

  console.log("[Dissent] L1 Truthfulness contract injected");

  return contract + messageText;
}

// ──────────────────────────────────────────────────────────────
// RESET — called on navigation
// ──────────────────────────────────────────────────────────────

function sbResetContract() {
  // Don't clear injectedUrls — we want to remember which
  // conversations have already been primed, even across
  // SPA navigations back to the same chat.
  // The Set is bounded by browser session lifetime.
}

// ──────────────────────────────────────────────────────────────
// GET A PREVIEW of the contract (for popup display)
// ──────────────────────────────────────────────────────────────

function sbGetContractPreview() {
  return SB_CONTRACTS[0].replace(/\n\n$/, "");
}
