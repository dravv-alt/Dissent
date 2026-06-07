// ============================================================
// Dissent — Background Service Worker (v2)
// Manages badge, cross-tab state, and detection history.
// ============================================================

let totalDetections = 0;
let sessionDetections = 0;

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

    // Update badge on the tab that sent the detection
    if (sender.tab?.id) {
      const badgeColor =
        msg.severity === "nuclear"  ? "#ff3333" :
        msg.severity === "moderate" ? "#ff8800" : "#ffcc00";

      chrome.action.setBadgeText({ text: String(totalDetections), tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId: sender.tab.id });
    }

    sendResponse({ totalDetections, sessionDetections });
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
