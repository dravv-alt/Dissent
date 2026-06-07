# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-06

### Added
- **10-Component Explainability Evidence Engine:** Entirely new pipeline replacing the legacy score-and-warn system.
- `content/rules.js`: Central rule registry containing 37 sycophancy rules mapped to the Ye et al. taxonomy, complete with human-readable explanations and research reasoning.
- `content/evidence.js`: New collector, detection builder, explanation generator, and deterministic confidence engine.
- **Behavioral Evidence Schema:** L3 Tracker now produces structured behavioral evidence (cross-turn HMAC state) instead of simple boolean flags.
- **Explainability Card UI:** Shadow DOM isolated card replacing the legacy score banner. Shows severity, category, human-readable explanations, evidence snippets, and a confidence factor breakdown.
- **In-Text Highlighting:** `sbHighlightEvidence` accurately wraps sycophantic text matches in `<mark>` elements directly within the AI response.
- **Belief Conformity Detection:** Scanner extensions for detecting AI adherence to weakly stated user beliefs.
- **Mimicry Cross-Reference:** Initial implementation of misconception mapping for Class 4 sycophancy.
- **Counter-Prompt Restructure:** Prompts are now organized by technical `sycophancyType` (`opinion`, `position_change`, `social_validation`, etc.) and `severity` (`nuclear`, `moderate`, `mild`). All prompts are question-form based on AISI 2026 findings.

### Changed
- `detector.js` (L4) and `social.js` (L6) refactored to dual-return `evidence[]` arrays alongside legacy scores.
- `main.js` completely rewritten to use `_sbRunEEEPipeline()` for asynchronous evidence aggregation.
- Legacy `chrome.runtime.sendMessage` payload expanded to carry full evidence object structures.
- Alert framing for social validation (Layer 6) changed to "PERSPECTIVE CHECK" to mitigate Cheng et al. resistance effects.

### Removed
- Legacy `sbShowBanner()` and `_sbHighlightElement()` functions removed from the primary execution pipeline.
- Arbitrary `confidenceBase + score * 0.04` math replaced by deterministic 4-factor confidence engine.

## [1.0.0] - 2026-05

### Added
- Initial five-layer intervention pipeline (L1-L6).
- Platform adapters for Claude.ai, ChatGPT, and Gemini.
- Pre-conversation truthfulness contract injection (L1).
- Epistemic Input Scanner (L2) with question-form rewrite panel.
- Conversation Position Tracker (L3) using HMAC-SHA256 and ephemeral keys.
- Response Pattern Scanner (L4) using weighted regex on first 300 characters.
- Social Sycophancy Heuristic Scorer (L6).
- Shadow DOM UI rendering system.
- Strict zero-exfiltration privacy architecture.