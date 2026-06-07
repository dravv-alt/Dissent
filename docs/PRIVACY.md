# Privacy Policy

## 1. Commitment
Dissent operates on a strict zero-exfiltration privacy model. All computation occurs locally on your device.

## 2. What the Extension Reads
- **AI Response Text:** Scanned in memory to generate local evidence.
- **User Input:** Scanned in memory for epistemic certainty.
- **Position Fingerprints:** Hashed in memory using an ephemeral session key.

## 3. What the Extension Never Does
- **No external network requests:** No `fetch()`, XHR, analytics, or CDN calls.
- **No conversation text in storage:** `chrome.storage.sync` contains only configuration booleans/numbers.
- **No persistent cryptographic keys:** The HMAC key is held in a JS closure and garbage collected on tab close.
- **No cross-tab tracking.**
- **No `eval()` or dynamic script execution.**

## 4. Manifest Permissions
- `storage`: Saving user preferences (e.g., enable/disable toggle).
- `activeTab`: Accessing the DOM of the active chat interface.
- `scripting`: Injecting the content script.

## 5. Cryptographic Design
L3 tracking uses `crypto.subtle.sign("HMAC")` with a one-time `crypto.getRandomValues(new Uint8Array(32))` key generated per session.

## 6. ONNX Models
All inference models (when fully implemented) run locally via ONNX.js. No cloud APIs are used.