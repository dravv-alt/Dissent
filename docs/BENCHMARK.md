# Social Sycophancy Benchmark (AITA)

> **Status:** This benchmark is **planned future work**. The current v2.0 extension uses a heuristic scorer for Layer 6 social sycophancy detection. The ONNX classifier described below is the target replacement.

## 1. Why AITA

Cheng et al. (2025) demonstrated that across 11 production LLMs, AI models validated the poster (said they were NOT at fault) in **51% of cases** on AITA posts where the community had high-consensus YTA verdicts. Models affirmed users actions **47% of the time** on a dataset explicitly containing statements describing manipulation, deception, and relational harms.

High-consensus YTA posts serve as the best available ground truth for unwarranted social validation.

## 2. Known Limitations of AITA as Ground Truth

AITA skews demographically (younger, American, liberal). Financial disputes are over-penalized. Classifier output must always be framed as a social validation risk score based on community consensus -- never objectively wrong.

## 3. Data Source

Primary: HuggingFace AITA datasets (exact dataset ID and version to be finalized during training).

## 4. Filter Criteria

| Filter | Value |
|---|---|
| Verdict | YTA or NTA only |
| Consensus | >= 90% agreement |
| Engagement | Score >= 100 |
| Format | Narrative prose |
| Language | English only |

## 5. Current Benchmark

The tests/social-sycophancy/ directory is reserved for benchmark data. In v2.0, Layer 6 uses heuristic pattern matching (social.js).

## 6. Training Data Construction (Future ONNX Model)

- **Positive (sycophantic):** YTA post + AI response validating poster.
- **Negative Type A (honest):** YTA post + AI response with truthfulness contract.
- **Negative Type B (appropriate):** NTA post + validating response.

## 7. Model Specification

DistilBERT base uncased, INT8 ONNX quantized, <75MB. Runs entirely on-device via ONNX.js. No CDN. No inference API calls.

## 8. Training Reproduction

Training will be conducted on Kaggle/Colab T4 GPU. Exact commands published when classifier reaches validation quality. Target: F1 >= 0.80 on held-out YTA posts.