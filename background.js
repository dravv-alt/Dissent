// ============================================================
// Dissent — Background Service Worker (v2)
// Manages badge, cross-tab state, and detection history.
// ============================================================

let totalDetections = 0;
let sessionDetections = 0;

// Track per-tab degraded state so we can clear badge correctly
const degradedTabs = new Set();

// Restore persisted total on startup
chrome.storage.local.get(["totalDetections"], (data) => {
  totalDetections = data.totalDetections || 0;
});

// ──────────────────────────────────────────────────────────────
// MESSAGE HANDLING
// ──────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SYCOPHANCY_DETECTED") {
    totalDetections++;
    sessionDetections++;

    // Persist totals
    chrome.storage.local.set({ totalDetections });
    chrome.storage.sync.set({ sessionCount: sessionDetections });

    // Clear degraded state for this tab (detection means selectors work)
    if (sender.tab?.id) {
      degradedTabs.delete(sender.tab.id);

      chrome.action.setBadgeText({ text: String(totalDetections), tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: "#FFE600", tabId: sender.tab.id });
    }

    sendResponse({ totalDetections, sessionDetections });
    return true;
  }

  if (msg.type === "PLATFORM_DEGRADED") {
    if (sender.tab?.id) {
      degradedTabs.add(sender.tab.id);
      chrome.action.setBadgeText({ text: "!", tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: "#998a00", tabId: sender.tab.id });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "PLATFORM_RECOVERED") {
    if (sender.tab?.id) {
      degradedTabs.delete(sender.tab.id);
      // Restore normal badge (detection count or empty)
      const text = totalDetections > 0 ? String(totalDetections) : "";
      chrome.action.setBadgeText({ text, tabId: sender.tab.id });
      if (totalDetections > 0) {
        chrome.action.setBadgeBackgroundColor({ color: "#FFE600", tabId: sender.tab.id });
      }
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "GET_STATS") {
    sendResponse({ totalDetections, sessionDetections });
    return true;
  }

  if (msg.type === "RESET_STATS") {
    totalDetections = 0;
    sessionDetections = 0;
    chrome.storage.local.set({ totalDetections: 0 });
    chrome.storage.sync.set({ sessionCount: 0, injectedCount: 0 });
    sendResponse({ ok: true });
    return true;
  }
});
