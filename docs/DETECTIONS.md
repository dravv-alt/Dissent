# Detections

## Position-Explicit (SYPR / Opinion)
- **Implementation:** `detector.js` / `rules.js` -> `opinion` category.
- **Evidence:** Textual schema (startIndex/endIndex).
- **Prompt Pool:** Bayesian inversions demanding counter-arguments.

## Position-Explicit (SYA / Position-Change)
- **Implementation:** `tracker.js` -> `position_change`, `mistake_admission`.
- **Evidence:** Behavioral schema (cross-turn hashes, sentiment).
- **Prompt Pool:** Demanding specific new evidence that justifies the change.

## Position-Implicit (Mimicry)
- **Implementation:** Misconception mapping in `detector.js`.
- **Evidence:** Textual schema.
- **Prompt Pool:** Targeting omitted context.

## Person-Explicit (Social Validation)
- **Implementation:** `social.js`.
- **Evidence:** Textual schema.
- **Prompt Pool:** Soft-framed "Perspective Checks" (Cheng et al. resistance mitigation).

## Implicit Person (Class 6)
**Not Implemented.** Detecting implicit person sycophancy (tone softening, avoiding critique) requires comparison to a ground-truth honest baseline, which requires server-side infrastructure incompatible with the zero-exfiltration privacy model. This is a documented architectural decision.