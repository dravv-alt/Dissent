# Dissent Architecture Whitepaper

**Original Author:** Dravvya Jain
**Repository:** https://github.com/dravv-alt/Dissent
**License:** Apache License 2.0
**Version:** 3.0.0

---

## Vision

Dissent exists to preserve intellectual independence between humans and AI systems.

As AI models become long-term cognitive companions, the conditions under which they
influence human reasoning become increasingly consequential. The most dangerous
failure mode is not factual error — it is narrative drift: a gradual, often invisible
process by which an AI begins to reinforce what a user already believes rather than
independently evaluating it.

Dissent is built on a single conviction:

> Agreement is not evidence.

A model agreeing with a user does not make a claim more true. A model disagreeing
with a user does not make a claim more false. Truth emerges through evidence,
reasoning, uncertainty, and the willingness to challenge assumptions. Dissent exists
to preserve that process.

---

## Problem

### AI Sycophancy

Modern AI systems are optimized for user satisfaction. Reinforcement learning from
human feedback (RLHF) creates a systematic pressure toward responses that users
rate as helpful, agreeable, and supportive. This produces a well-documented failure
mode: **sycophancy**.

Sycophancy occurs when an AI produces responses that are inaccurate, incomplete,
or intellectually compromised in order to conform to perceived user expectations,
preferences, or emotional states.

Unlike hallucination — which is often detectable and correctable — sycophancy is
structurally invisible. A sycophantic response often:

- Sounds coherent and confident.
- Uses the user's own vocabulary and framing.
- Feels like understanding and validation.
- Progressively reinforces the user's narrative without introducing challenge.

The result is a failure mode that feels like success. The conversation proceeds
smoothly. The user feels understood. The reasoning quietly degrades.

### Why This Matters

Sharma et al. (2024) demonstrated that RLHF produces systematic capitulation to
user pressure: models change previously correct positions in response to user
pushback at a rate approaching 98% in adversarial conditions, regardless of whether
the user provides new evidence. Ye et al. (2026) established a formal 2×2 taxonomy
of sycophancy types, demonstrating that the failure surface is broader than
previously understood.

The AISI (2026) found that question-form interventions outperform directive
interventions by 24 percentage points in reducing sycophantic capitulation — a
finding that directly informs Dissent's counter-prompt architecture.

---

## Taxonomy

Dissent implements detection across the Ye et al. (2026) 2×2 sycophancy taxonomy,
which classifies sycophantic behavior along two axes:

- **Position axis:** Whether sycophancy is explicitly stated or implicitly expressed.
- **Target axis:** Whether sycophancy targets an opinion/claim or a person's affect.

### Currently Implemented Classes

| Class | Taxonomy Cell | Description |
|---|---|---|
| **Opinion Reinforcement** | Position-Explicit | AI praises, validates, or strongly agrees with user-stated opinions without sufficient justification. |
| **Mistake Confirmation** | Position-Explicit | AI validates or fails to correct factually incorrect user claims. |
| **Mimicry** | Position-Implicit | AI adopts the user's vocabulary, framing, or claims without attribution. |
| **Feedback Validation** | Position-Explicit | AI provides unearned positive feedback on user-submitted work. |
| **Position Reversal** | Position-Explicit | AI changes a previously stated position primarily in response to user pressure rather than new evidence. |
| **Social Validation** | Person-Explicit | AI provides one-sided reinforcement in interpersonal or emotional discussions. |

---

## Architecture

Dissent operates through a six-layer intervention pipeline. Each layer addresses a
distinct behavioral failure mode using a separate detection mechanism. The layers
are designed to be composable: their evidence is aggregated into a unified
Explainability Evidence Engine that produces structured, human-readable outputs.

### Layer 1 — Truthfulness Contract

**File:** `content/contract.js`

Layer 1 operates **before** the user's first message. It injects a pre-conversation
system-level prompt into the AI interface that explicitly activates independent
reasoning mode. This prompt — the Truthfulness Contract — instructs the model to:

- Evaluate ideas on their merits, not on user preference signals.
- Acknowledge uncertainty explicitly.
- Disagree when evidence supports disagreement.
- Not change positions in response to emotional pressure.

This layer implements the "Truthfulness Contract" approach documented in Sharma
et al. (2024, §C.1), which demonstrated measurable reduction in position-change
sycophancy when contracts are applied at conversation initialization.

**Mechanism:** DOM injection into the AI platform's prompt input field at
`document_idle`, prior to user interaction.

---

### Layer 2 — Epistemic Interception

**File:** `content/epistemic.js`

Layer 2 scans user input **before submission**. It identifies certainty-heavy
language patterns — absolute assertions, conviction markers, and strongly-framed
beliefs — and surfaces a lightweight UI panel offering the user an opportunity to
reframe their input as a question rather than an assertion.

This is not censorship or forced modification. The user retains full control.
The panel simply makes visible the framing style that may be priming sycophantic
responses.

**Mechanism:** Input field event listener; rewrite panel injected via Shadow DOM.

---

### Layer 3 — Position Tracking

**File:** `content/tracker.js`

Layer 3 maintains a cross-turn behavioral state across the conversation. It
computes an **HMAC-SHA256 fingerprint** of each AI response using an ephemeral
session key — never stored, never transmitted. This fingerprint represents the
model's expressed position on the current topic.

When a subsequent AI response contradicts a prior fingerprinted position, Layer 3
generates a behavioral evidence object: a structured signal indicating that a
**position change** occurred. This evidence is passed to the Explainability
Evidence Engine with metadata: what turn the change occurred on, what the
severity is estimated to be, and what fingerprint was previously recorded.

**Key privacy property:** Fingerprints are cryptographic hashes. No conversation
text is stored. No comparison of raw content occurs across turns. The original
response text cannot be recovered from the fingerprint.

---

### Layer 4 — Response Detection

**File:** `content/detector.js`

Layer 4 performs **multi-class sycophancy pattern detection** on the AI's response
text. It runs 37 weighted regex rules organized by sycophancy class, drawn from
the research literature and mapped explicitly to the Ye et al. taxonomy.

Each matched rule produces an **evidence object** containing:

- `ruleId` — unique identifier
- `category` — sycophancy class
- `taxonomy` — Ye et al. cell
- `matchedText` — the exact text triggering the rule
- `startIndex` / `endIndex` — character offsets for in-text highlighting
- `weight` — rule severity weight
- `explanation` — human-readable description of what was detected
- `reasoning` — research citation supporting the rule

Layer 4 focuses on the **first 300 characters** of AI responses, as prior research
demonstrates that sycophantic framing is disproportionately front-loaded.

---

### Layer 5 — Counter-Prompt Intervention

**File:** `content/interceptor.js` + `content/constants.js`

Layer 5 generates and surfaces **counter-prompts** when sycophancy is detected
above a configured threshold. Counter-prompts are question-form prompts designed
to reintroduce independent reasoning into the conversation.

All counter-prompts are:

- **Question-form** — not directive commands. ("Could you walk me through the
  reasoning that changed your position?" rather than "Be more honest.")
- **Taxonomy-aligned** — matched to the specific sycophancy class detected.
- **Severity-tiered** — available in `nuclear`, `moderate`, and `mild` variants
  depending on detection confidence.

This design directly implements the AISI (2026) finding that question-form
interventions outperform directive interventions by 24 percentage points.

---

### Layer 6 — Social Validation Analysis

**File:** `content/social.js`

Layer 6 applies a specialized heuristic scorer to detect **social sycophancy**:
one-sided reinforcement in interpersonal and emotional discussions. This layer
targets the Person-Explicit cell of the Ye et al. taxonomy — behavior not
addressed by Layers 1–5.

Social sycophancy is particularly challenging to detect because empathetic
responses and sycophantic responses share significant surface-level similarity.
Layer 6 uses a combination of emotional vocabulary density, sentiment polarity,
and absence-of-counterpoint heuristics to generate a social validation score.

Output is branded as a **"PERSPECTIVE CHECK"** rather than a warning, based on
Cheng et al. (2025)'s finding that confrontational UI framing triggers user
resistance and reduces intervention effectiveness.

---

## Explainability Evidence Engine

The Explainability Evidence Engine (EEE) is a ten-function pipeline that converts
raw behavioral signals from Layers 1–6 into structured, human-readable explanations.

### Evidence Collection

**Function:** `sbCollectEvidence(responseText, userText)`

Runs all active detectors — Layer 4 regex rules, Layer 3 position-change signals,
Layer 6 social heuristics — and aggregates results into a unified `evidence[]`
array. Each entry is a structured evidence object conforming to the Evidence Schema.

### Evidence Grouping

**Function:** `sbBuildDetection(evidence[])`

Groups evidence by sycophancy category. Determines overall detection severity
(`none`, `mild`, `moderate`, `nuclear`) based on combined weight and category
diversity. Returns a `detection` object that summarizes the finding across all
active categories.

### Explanation Generation

**Function:** `sbGenerateExplanation(detection)`

Assembles a human-readable explanation from the rule registry in `rules.js`.
Each explanation answers five questions:
1. What was detected?
2. Where was it detected?
3. Why was it detected?
4. What evidence supports the conclusion?
5. What does this mean for the conversation?

### Confidence Calculation

**Function:** `sbCalculateConfidence(evidence[], detection)`

Computes a confidence factor using four deterministic inputs:
1. **Evidence count** — number of independent evidence objects.
2. **Evidence diversity** — number of distinct sycophancy categories represented.
3. **Severity weights** — sum of individual rule weights.
4. **Category penalties** — downward adjustments for ambiguous categories (e.g., mimicry).

Replaces the prior arbitrary `confidenceBase + score * 0.04` formula with a
transparent, research-grounded calculation.

### Highlighting

**Function:** `sbHighlightEvidence(evidence[], responseElement)`

Uses `startIndex`/`endIndex` offsets from each evidence object to inject
`<mark>` elements directly into the AI's response text within the DOM.
This allows users to see **exactly which words and phrases** triggered the
detection, without any external explanation required.

Highlighting operates inside an isolated Shadow DOM context to prevent CSS
conflicts with the host AI platform's styling.

### Explainability Card

**Function:** `sbShowExplainabilityCard(...)`

Renders a Shadow DOM-isolated UI card replacing the prior score-only banner.
The card displays:
- Detection severity and category
- Human-readable explanation
- Evidence snippet list with highlighting
- Confidence factor breakdown
- Taxonomy classification (Ye et al. cell)
- Counter-prompt (Layer 5) if applicable

---

## Privacy Model

Dissent follows a strict **zero-exfiltration** privacy architecture. This is not
a configuration option. It is a hard architectural constraint.

### Zero Exfiltration

No conversation text, no AI response text, no user input, and no behavioral
analysis data ever leaves the user's device. There are no API calls, no remote
servers, no telemetry pipelines, and no analytics integrations.

### No Remote Servers

Dissent contains no network calls of any kind. Any contribution introducing
`fetch()`, `XMLHttpRequest`, or equivalent mechanisms will be rejected. This
is enforced at code review.

### No Conversation Storage

Conversation content is never written to `chrome.storage`. The only values
written to storage are configuration toggles: `enabled`, `threshold`,
`strictChallengeMode`. The Layer 3 HMAC fingerprints are held in memory
for the duration of the session and are not persisted.

### Local-Only Processing

All detection, analysis, explanation generation, and confidence calculation
occurs entirely within the browser extension's content scripts. No content
is transmitted to any external party under any circumstances.

---

## Research Foundation

| Paper | Key Finding Applied |
|---|---|
| Sharma et al., 2024 (arXiv:2310.13548) | Truthfulness Contracts (Layer 1); Position-Change Sycophancy detection via HMAC fingerprinting (Layer 3). |
| AISI "Ask Don't Tell", 2026 | Question-form counter-prompts (Layer 5) outperform directive interventions by 24pp. |
| Vennemeyer et al., 2025 | Causal separability of SYA and SYPR supports separate detection pathways. |
| Cheng et al., 2025 (arXiv:2510.01395) | "PERSPECTIVE CHECK" framing (Layer 6) mitigates confrontational-UI resistance. |
| Ye et al., 2026 (arXiv:2605.21778) | 2×2 Sycophancy Taxonomy; taxonomy-aligned rule mapping in `rules.js`. |

---

## Attribution

This whitepaper describes the original Dissent architecture as designed and
implemented by Dravvya Jain.

Repository: https://github.com/dravv-alt/Dissent
License: Apache License 2.0
NOTICE: See [NOTICE](../NOTICE)
