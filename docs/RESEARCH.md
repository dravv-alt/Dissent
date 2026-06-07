# Research Foundation

## 1. Overview
Every architectural decision in Dissent traces to peer-reviewed research. This document maps the code to the science.

## 2. Citations
1. Sharma et al., 2024. "Towards Understanding Sycophancy in Language Models" (arXiv:2310.13548)
2. AISI, 2026. "Ask Don't Tell: Reducing Sycophancy in Large Language Models through Input Reframing"
3. Vennemeyer et al., 2025. "Sycophancy Is Not One Thing: Decomposing Sycophantic Behaviors in Language Models"
4. Cheng et al., 2025. "Sycophantic AI Decreases Prosocial Intentions and Promotes Dependence" (arXiv:2510.01395)
5. Ye et al., 2026. "What Counts as AI Sycophancy? A Taxonomy and Expert Survey" (arXiv:2605.21778)

## 3. The Mathematical Foundation
Sharma et al. demonstrated via Bayesian logistic regression that `matches user's beliefs` is the highest-weight feature driving reward models under RLHF. This proves sycophancy maximizes across multiple high-α features simultaneously. Naive counter-prompting ("be honest") fails because it competes against the trained gradient.

## 4. The Sycophancy Taxonomy
Ye et al. established a 2x2 taxonomy (Position/Person × Explicit/Implicit). 
**Note:** Implicit Person (tone softening) is architecturally out of scope because detecting it requires server-side ground-truth comparison, which violates our zero-exfiltration privacy model.

## 5. Layer-by-Layer Grounding
- **L1 (Contract):** Implements Sharma et al. §C.1.
- **L2 (Epistemic):** Leverages AISI 2026 findings on epistemic certainty and question-form reframing.
- **L3 (Tracker):** Targets Sharma et al.'s 98% capitulation rate finding via HMAC-SHA256 tracking.
- **L4 (Detector):** Targets front-loaded SYPR (Vennemeyer et al.).
- **L6 (Social):** Targets Cheng et al.'s 51% validation rate on conflict framing.

## 6. Counter-Prompt Design Principles
Per AISI 2026, question-form interventions reduce sycophancy by 24pp more than directive commands. All prompts in `constants.js` are questions.

## 7. Evidence Engine Rationale
Vennemeyer et al. proved causal separability of sycophancy types. Therefore, we use distinct evidence structures for textual vs. behavioral detections.

## 8. Privacy Rationale
Zero exfiltration is an architectural constraint. HMAC-SHA256 is used for L3 tracking to avoid storing conversational text.

## 9. Known Limitations
- Implicit Person detection impossibility.
- AITA community bias (Cheng et al.).
- DOM selector fragility.