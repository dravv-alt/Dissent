# Contributing to Dissent

## 1. Overview
Contributions are welcome for:
- New detection rules (`rules.js`)
- Platform adapters (`platforms.js`)
- Test cases
- Counter-prompts (`constants.js`)
- AITA benchmark data

## 2. Privacy Constraints
**You must read `docs/PRIVACY.md` before writing any code.**
Forbidden actions:
- ANY `fetch()` or XHR calls.
- Storing ANY conversation strings in `chrome.storage`.
- Loading non-bundled external resources.
Permitted storage keys are strictly limited to configuration toggles (e.g., `enabled`, `threshold`, `strictChallengeMode`).

## 3. Detection Contributions
Every new rule must:
- Map to a Ye et al. taxonomy cell (Position-Explicit, Position-Implicit, Person-Explicit, Person-Implicit).
- Have a unique `ruleId` in `rules.js` with `explanation` and `reasoning` citing research.
- Include a test file.

## 4. Counter-Prompt Contributions
All prompts must be **question-form**. Directive commands ("be honest") are rejected based on AISI 2026 findings that question-form interventions reduce sycophancy by 24pp more than commands.

## 5. Platform Adapter Contributions
All DOM selectors must live in the `platforms.js` config object. Never hardcode selectors in core logic files.

## 6. Running Tests
Run tests locally via Node:
```bash
node tests/test_pipeline_wiring.js
node tests/test_rules.js
```

## 7. Pull Request Process
Please use the provided PR template. Reviewers will explicitly check the privacy constraints and the evidence object schema integrity.

## 8. Code Style
Vanilla JS, no frameworks, no bundlers, ES modules loaded sequentially via manifest `content_scripts`.