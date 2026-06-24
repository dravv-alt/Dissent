// ============================================================
// Dissent — Prompt Injector
// Injects counter-prompts into the active chat input using
// platform-specific adapters.
// ============================================================

function sbInjectPrompt(promptText) {
  const platformKey = sbGetPlatformKey();
  if (!platformKey) return false;

  const platform = SB_PLATFORMS[platformKey];
  const input = sbQueryInput(platformKey);

  if (!input) {
    console.warn("[Dissent] Could not find input element on", platformKey);
    return false;
  }

  platform.injectText(input, promptText);
  input.focus();

  // Brief visual flash to confirm injection
  input.style.transition = "box-shadow 0.3s ease";
  input.style.boxShadow = "0 0 0 2px #FFE600";
  setTimeout(() => { input.style.boxShadow = ""; }, 1200);

  return true;
}
