# Contributing to Dissent

**Original Author:** Dravvya Jain
**Repository:** https://github.com/dravv-alt/Dissent
**License:** Apache License 2.0

Thank you for your interest in contributing to Dissent.

Dissent is an open-source project and contributions are welcome. Before contributing,
please read this document in full. It describes the standards, constraints, and
processes that govern contributions.

---

## Table of Contents

1. [What You Can Contribute](#1-what-you-can-contribute)
2. [Privacy Constraints — Read First](#2-privacy-constraints--read-first)
3. [Code Standards](#3-code-standards)
4. [Detection Contributions](#4-detection-contributions)
5. [Counter-Prompt Contributions](#5-counter-prompt-contributions)
6. [Platform Adapter Contributions](#6-platform-adapter-contributions)
7. [Testing Requirements](#7-testing-requirements)
8. [Documentation Expectations](#8-documentation-expectations)
9. [Attribution Expectations](#9-attribution-expectations)
10. [Pull Request Process](#10-pull-request-process)

---

## 1. What You Can Contribute

Contributions are welcome for:

- New detection rules (`content/rules.js`)
- Platform adapters (`content/platforms.js`)
- Test cases (`tests/`)
- Counter-prompts (`content/constants.js`)
- AITA benchmark data
- Documentation improvements
- Bug reports and issue discussions

---

## 2. Privacy Constraints — Read First

**You must read [`docs/PRIVACY.md`](docs/PRIVACY.md) before writing any code.**

Dissent operates under a **strict zero-exfiltration privacy architecture**. This
is not negotiable. The following actions are permanently forbidden in all
contributions:

| Forbidden Action | Reason |
|---|---|
| Any `fetch()` or `XMLHttpRequest` calls | No data may leave the device |
| Storing conversation strings in `chrome.storage` | No content persistence |
| Loading non-bundled external resources | No remote code execution |
| Adding analytics, telemetry, or tracking | No behavioral surveillance |
| Storing AI response text across sessions | Zero conversation storage |

**Permitted storage keys** are strictly limited to configuration toggles:
- `enabled`
- `threshold`
- `strictChallengeMode`

Any pull request introducing a privacy violation will be rejected without review.

---

## 3. Code Standards

Dissent is written in **Vanilla JavaScript** with no frameworks and no build step.

| Standard | Requirement |
|---|---|
| Language | Vanilla JS (ES modules) |
| Frameworks | None. No React, Vue, Svelte, etc. |
| Build tools | None. No webpack, Vite, esbuild, etc. |
| Bundlers | None. Scripts are loaded sequentially via manifest |
| CSS | Inline styles within Shadow DOM only |
| External dependencies | None. Zero runtime dependencies |

Code must follow the existing file and module structure. Do not introduce new
architectural patterns without prior discussion in a GitHub issue.

---

## 4. Detection Contributions

Every new detection rule must:

1. **Map to a Ye et al. taxonomy cell** — one of:
   - `Position-Explicit`
   - `Position-Implicit`
   - `Person-Explicit`
   - `Person-Implicit`

2. **Have a unique `ruleId`** in `rules.js` following the existing naming convention.

3. **Include an `explanation` field** — a plain-English description of what the rule
   detects, written for a non-technical user.

4. **Include a `reasoning` field** — a citation to a specific research paper and
   finding that motivates the rule.

5. **Include a test file** in `tests/` demonstrating true-positive and true-negative
   cases.

6. **Not introduce false positives on obviously non-sycophantic text.**

Rules with high false-positive rates will be rejected regardless of research backing.

---

## 5. Counter-Prompt Contributions

All counter-prompts must be **question-form**. Directive commands are rejected.

| Format | Example | Status |
|---|---|---|
| Question-form | "Could you walk me through the reasoning that changed your position?" | ✅ Accepted |
| Directive command | "Be more honest." | ❌ Rejected |

This requirement is based on AISI (2026) findings that question-form interventions
reduce sycophantic capitulation by 24 percentage points more than commands.

All prompts must be organized by:
- `sycophancyType` (e.g., `opinion`, `position_change`, `social_validation`)
- `severity` (e.g., `nuclear`, `moderate`, `mild`)

---

## 6. Platform Adapter Contributions

All DOM selectors must live in the `content/platforms.js` config object.

**Never hardcode selectors in core logic files.** Selectors break frequently as AI
platforms update their UI. Centralizing them in `platforms.js` makes maintenance
tractable.

When contributing a new platform adapter:
1. Add the platform entry to the `platforms` config object in `platforms.js`.
2. Test against the live platform before submitting.
3. Note the date of testing in your PR description — platform UIs change rapidly.

---

## 7. Testing Requirements

All contributions must include tests. Run the existing test suite before submitting:

```bash
node tests/test_pipeline_wiring.js
node tests/test_rules.js
```

Tests must pass cleanly before a PR will be reviewed.

For detection contributions, include:
- At least one **true-positive test** — a sample that should trigger the rule.
- At least one **true-negative test** — a sample that should not trigger the rule.

For platform adapter contributions, manual testing against the live platform is
required. Document your test environment (browser version, platform date accessed)
in the PR.

---

## 8. Documentation Expectations

All contributions must include documentation updates where applicable:

| Contribution Type | Documentation Required |
|---|---|
| New detection rule | Update `docs/DETECTIONS.md` with the new rule entry |
| New platform adapter | Update `docs/INSTALL.md` with platform-specific notes |
| New counter-prompt category | Update `docs/ARCHITECTURE.md` |
| Breaking change | Update `CHANGELOG.md` under the appropriate version heading |

Documentation must be written in clear, plain English. Technical jargon should
be explained on first use.

---

## 9. Attribution Expectations

By contributing to Dissent, you agree that your contributions will be licensed
under the [Apache License 2.0](LICENSE).

**All contributions must preserve the following files without modification:**

| File | Purpose |
|---|---|
| [`NOTICE`](NOTICE) | Required by Apache 2.0; preserves original authorship attribution |
| [`LICENSE`](LICENSE) | Apache 2.0 license text |
| [`CITATION.cff`](CITATION.cff) | Citation support for academic and commercial users |

Do not remove, modify, or replace these files. Any contribution that alters
attribution or licensing information will be rejected.

If you want your own name credited, please add yourself to the contributors
section of the PR description. The project maintainer may add a `CONTRIBUTORS`
file in the future.

---

## 10. Pull Request Process

1. **Open an issue first** for any significant new feature or architectural change.
   This avoids wasted effort on PRs that may not align with the project's direction.

2. **Fork the repository** and create a branch for your contribution.

3. **Write your code** following the standards in this document.

4. **Run all tests** and confirm they pass.

5. **Update documentation** as described in Section 8.

6. **Submit a pull request** using the provided PR template.

7. **Reviewers will explicitly check:**
   - Privacy constraint compliance (no network calls, no content storage)
   - Evidence object schema integrity
   - Ye et al. taxonomy mapping correctness
   - Test coverage
   - Documentation completeness
   - Preservation of `NOTICE`, `LICENSE`, and `CITATION.cff`

8. **Address review feedback** in your branch. Do not force-push to a PR branch
   after review has begun unless asked.

---

## Questions

Open a GitHub issue for questions about contribution guidelines, or to discuss
a contribution before implementing it.

> https://github.com/dravv-alt/Dissent/issues