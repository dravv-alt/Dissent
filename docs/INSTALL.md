# Installation & Troubleshooting

## Requirements
- Chrome 114+ or Chromium-based browsers (Edge, Brave).

## Installation
1. Clone the repository.
2. Navigate to `chrome://extensions/`.
3. Enable "Developer mode".
4. Click "Load unpacked" and select the `sycophancy-breaker(v2)` folder.

## Verifying It Works
Open Claude.ai, ChatGPT, or Gemini. Check the DevTools console for the `[Dissent]` initialization log.

## Selector Update Procedure
If a platform changes its UI:
1. Inspect the new input element.
2. Open `content/platforms.js` and update `inputSelectors`.
3. Reload the extension in `chrome://extensions/`.

## Running Tests
Run `node tests/test_pipeline_wiring.js` locally.

## Troubleshooting
- **Extension not detecting on Claude:** Platform UI may have changed. Run the selector health check.
- **L2 panel not appearing:** Check if `epistemicEnabled` is true in storage.
- **Badge not updating:** Ensure `background.js` service worker is active.