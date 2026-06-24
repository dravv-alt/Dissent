# Architecture

## 1. Overview
The 10-component Explainability Evidence Engine replaces raw scoring with structured evidence tracking.

## 2. Content Script Load Order
`rules.js → constants.js → platforms.js → selector-cache.js → contract.js → epistemic.js → tracker.js → detector.js → social.js → evidence.js → injector.js → interceptor.js → ui.js → main.js`
Strict sequential loading is required because there is no bundler.

## 3. Module Responsibilities
- `rules.js`: Central registry containing 37 rules with explanations and reasoning. Factories: `sbCreateEvidence()`, `sbCreateBehavioralEvidence()`.
- `evidence.js`: Houses the collector, builder, explanation generator, and deterministic global confidence engine.
- `detector.js` (L4): Dual return (evidence[] + legacy score). Scans first 300 chars. Captures startIndex/endIndex.
- `tracker.js` (L3): HMAC-SHA256 ephemeral key tracking. Produces behavioral evidence.
- `social.js` (L6): Heuristic social validation detection.
- `epistemic.js` (L2): Scanner for certainty tier language.
- `contract.js` (L1): Pre-conversation truthfulness framing.
- `platforms.js`: 3-tier selector resolution engine (CSS chains → heuristic probing → attribute matching). Provides `sbResolve*` and backward-compatible `sbQuery*` APIs.
- `selector-cache.js`: Self-healing selector cache with TTL, lazy DOM retries, and SPA navigation invalidation.
- `injector.js`: DOM prompt injection.
- `interceptor.js`: Pre-send event hooks.
- `ui.js`: Shadow DOM Explainability Card and `sbHighlightEvidence`.
- `main.js`: Orchestration via `_sbRunEEEPipeline()` + platform health monitor.

## 4. Evidence Object Schemas
**Textual:** `{ ruleId, category, severity, weight, matchedText, startIndex, endIndex, explanation, reasoning, evidenceType: "textual" }`
**Behavioral:** `{ ruleId, category, severity, weight, explanation, reasoning, evidenceType: "behavioral", behavioralData: { turnBefore, turnAfter, sentimentBefore, sentimentAfter } }`
*Note: Global confidence is computed separately.*

## 5. Chrome Storage Schema
`enabled`, `threshold`, `epistemicLevel`, `epistemicEnabled`, `contractEnabled`, `bannerEnabled`, `soundEnabled`, `allPlatforms`, `autoInject`, `randomPrompts`, `strictChallengeMode`, `socialScorerEnabled`, `injectedCount`, `sessionCount`.
No conversation text is stored.

## 6. Shadow DOM Design
Uses `mode: 'closed'` to ensure host page CSS/JS cannot interfere with the Explainability Card.