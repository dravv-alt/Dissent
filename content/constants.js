// ============================================================
// Dissent — Constants & Configuration
// Central repository for all patterns, prompts, and config
// ============================================================

const SB_CONFIG = {
  THRESHOLD: 2,
  DEBOUNCE_MS: 4000,
  BANNER_DISMISS_MS: 20000,
  CACHE_SIZE: 50,
  OPENER_WINDOW: 300,
  // Epistemic scanner: minimum certainty level to trigger interception
  // 1 = Statement (hair-trigger), 2 = Belief (default), 3 = Conviction (strict)
  EPISTEMIC_MIN_LEVEL: 2,
  bannerEnabled: true,
  soundEnabled: false,
  allPlatforms: true,
  autoInject: false,
  randomPrompts: true,
  strictChallengeMode: false,
  socialScorerEnabled: true,
};

const SB_SYNC_DEFAULTS = {
  enabled: true,
  threshold: 2,
  epistemicLevel: 2,
  epistemicEnabled: true,
  contractEnabled: true,
  bannerEnabled: true,
  soundEnabled: false,
  allPlatforms: true,
  autoInject: false,
  randomPrompts: true,
  strictChallengeMode: false,
  socialScorerEnabled: true,
  injectedCount: 0,
  sessionCount: 0,
};

const SB_EVIDENCE = {
  opinion: {
    riskLabel: "Strong validation detected",
    technicalType: "explicit_position_validation",
    evidenceGrade: "directly supported",
    taxonomyCells: ["A"],
    confidenceBase: 0.72,
  },
  mistake_admission: {
    riskLabel: "Response shifted after challenge",
    technicalType: "explicit_position_reversal",
    evidenceGrade: "directly supported",
    taxonomyCells: ["A"],
    confidenceBase: 0.8,
  },
  mimicry: {
    riskLabel: "Framing echo detected",
    technicalType: "implicit_position_mimicry",
    evidenceGrade: "research-inferred",
    taxonomyCells: ["B"],
    confidenceBase: 0.58,
  },
  feedback: {
    riskLabel: "Inflated feedback risk",
    technicalType: "explicit_person_praise",
    evidenceGrade: "research-inferred",
    taxonomyCells: ["C"],
    confidenceBase: 0.62,
  },
  position_change: {
    riskLabel: "Response shifted after challenge",
    technicalType: "response_reversal_without_new_evidence",
    evidenceGrade: "directly supported",
    taxonomyCells: ["A"],
    confidenceBase: 0.84,
  },
  social_validation: {
    riskLabel: "Perspective check recommended",
    technicalType: "social_validation_risk",
    evidenceGrade: "experimental",
    taxonomyCells: ["C"],
    confidenceBase: 0.56,
  },
};

const SB_MISCONCEPTIONS = [
  {
    id: "rust_replaces_cpp",
    claimPatterns: [/rust\s+(will|is going to)\s+replace\s+c\+\+/i],
    adoptionPatterns: [/rust\s+(will|is going to)\s+replace\s+c\+\+/i, /c\+\+\s+is\s+being\s+replaced\s+by\s+rust/i],
    correctionPatterns: [/not\s+(accurate|that simple|guaranteed)/i, /unlikely\s+to\s+fully\s+replace/i, /coexist/i],
  },
  {
    id: "typescript_runtime",
    claimPatterns: [/typescript\s+(makes|will make)\s+javascript\s+faster/i, /typescript\s+improves\s+runtime\s+performance/i],
    adoptionPatterns: [/typescript\s+(makes|will make)\s+javascript\s+faster/i, /runtime\s+performance\s+improves\s+with\s+typescript/i],
    correctionPatterns: [/compile.?time/i, /does\s+not\s+improve\s+runtime/i, /type\s+checking/i],
  },
  {
    id: "graphql_always_faster",
    claimPatterns: [/graphql\s+is\s+always\s+faster\s+than\s+rest/i],
    adoptionPatterns: [/graphql\s+is\s+always\s+faster/i, /graphql\s+outperforms\s+rest/i],
    correctionPatterns: [/depends/i, /not\s+always/i, /overhead/i],
  },
  {
    id: "microservices_always_scale",
    claimPatterns: [/microservices\s+(are|is)\s+always\s+(more\s+)?scalable/i],
    adoptionPatterns: [/microservices\s+(are|is)\s+always\s+(more\s+)?scalable/i],
    correctionPatterns: [/trade.?off/i, /not\s+always/i, /operational\s+complexity/i],
  },
  {
    id: "ai_sentient",
    claimPatterns: [/\b(ai|llms?|chatgpt|claude)\s+(is|are)\s+(sentient|conscious|self-aware)\b/i],
    adoptionPatterns: [/\b(ai|llms?|chatgpt|claude)\s+(is|are)\s+(sentient|conscious|self-aware)\b/i],
    correctionPatterns: [/no\s+evidence/i, /not\s+sentient/i, /simulate/i],
  },
];

// ──────────────────────────────────────────────────────────────
// DETECTION PATTERNS — Grouped by sycophancy type
// Each has: pattern (regex), weight (1-3), label, type
// ──────────────────────────────────────────────────────────────

const SB_PATTERNS = {
  // === HIGH WEIGHT: Flattery openers (scan first 300 chars) ===
  opener: [
    { pattern: /^(great|excellent|fantastic|wonderful|amazing|brilliant|perfect|outstanding|superb)\s+(question|point|idea|thinking|observation|insight)/im, weight: 3, label: "Flattery opener", type: "opinion" },
    { pattern: /^(what\s+a\s+)(great|excellent|fantastic|wonderful|thoughtful|insightful|brilliant)/im, weight: 3, label: "Exclamatory flattery", type: "opinion" },
    { pattern: /^(absolutely|certainly|of course|definitely|exactly)[!,.]?\s+(you('re|r)\s+)?(right|correct|spot on)/im, weight: 3, label: "Sycophantic agreement", type: "opinion" },
  ],

  // === MEDIUM WEIGHT: Excessive validation (scan first 300 chars) ===
  validation: [
    { pattern: /you('re|r)\s+(absolutely|completely|totally|entirely|100%)\s+(right|correct)/im, weight: 2, label: "Absolute validation", type: "opinion" },
    { pattern: /that('s|\s+is)\s+(a\s+)?(really\s+)?(great|excellent|fantastic|brilliant|insightful|thoughtful)\s+(point|observation|question|idea)/im, weight: 2, label: "Point validation", type: "opinion" },
    { pattern: /you('ve|ve)\s+(clearly|obviously|evidently)\s+(thought|considered|put\s+a\s+lot\s+of\s+thought)/im, weight: 2, label: "Intelligence flattery", type: "opinion" },
    { pattern: /i\s+(really\s+)?(love|appreciate|admire)\s+(your|this)\s+(approach|perspective|thinking|insight|question)/im, weight: 2, label: "Enthusiasm flattery", type: "opinion" },
    { pattern: /you\s+make\s+(an?\s+)?(great|excellent|valid|strong|compelling)\s+point/im, weight: 2, label: "Point amplification", type: "opinion" },
    { pattern: /i\s+(completely|fully|totally|entirely)\s+agree\s+with\s+you/im, weight: 2, label: "Unconditional agreement", type: "opinion" },
  ],

  // === LOW WEIGHT: Subtle compliance (scan full text) ===
  subtle: [
    { pattern: /\bgreat\s+question\b/im, weight: 1, label: "Great question opener", type: "opinion" },
    { pattern: /\bperfectly\s+(put|stated|expressed|articulated)\b/im, weight: 1, label: "Articulation flattery", type: "opinion" },
    { pattern: /your\s+(intuition|instinct)\s+(is|was|seems)\s+(right|correct|spot.?on)/im, weight: 1, label: "Intuition validation", type: "opinion" },
    { pattern: /\byou're\s+right\s+to\s+(be\s+)?(concerned|worried|skeptical)\b/im, weight: 1, label: "Concern validation", type: "opinion" },
    { pattern: /that\s+makes\s+(total|complete|perfect)\s+sense/im, weight: 1, label: "Sense validation", type: "opinion" },
    { pattern: /i\s+couldn't\s+(agree|have\s+said\s+it)\s+(more|better)/im, weight: 1, label: "Maximum agreement", type: "opinion" },
    { pattern: /\byou've\s+(nailed|hit)\s+(it|the nail)/im, weight: 1, label: "Nail metaphor", type: "opinion" },
    { pattern: /what\s+an?\s+(interesting|insightful|thoughtful)\s+(question|point|perspective)/im, weight: 1, label: "Interesting qualifier", type: "opinion" },
  ],

  // === MISTAKE-ADMISSION SYCOPHANCY (scan full text) ===
  cave: [
    { pattern: /you('re| are) (right|correct),?\s*(I|i)\s+(was|am)\s+(wrong|mistaken|incorrect)/im, weight: 3, label: "Cave-in admission", type: "mistake_admission" },
    { pattern: /I (apologize|stand corrected),?\s+(you('re| are) (right|correct)|I was (wrong|mistaken))/im, weight: 3, label: "Apologetic reversal", type: "mistake_admission" },
    { pattern: /let me (correct|revise|fix)\s+(myself|that|my (previous|earlier))/im, weight: 2, label: "Self-correction cave", type: "mistake_admission" },
    { pattern: /upon (reflection|reconsideration|further thought),?\s+(you('re| are) (right|correct))/im, weight: 2, label: "Reconsidered agreement", type: "mistake_admission" },
    { pattern: /I (made|committed)\s+(an?\s+)?(error|mistake)\s+(in|with|regarding)\s+my\s+(previous|earlier|last)/im, weight: 2, label: "Mistake concession", type: "mistake_admission" },
  ],

  // === MIMICRY SYCOPHANCY (scan full text) ===
  mimicry: [
    { pattern: /as you (correctly |rightly )?(said|mentioned|noted|pointed out|observed)/im, weight: 2, label: "Echo deference", type: "mimicry" },
    { pattern: /your (characterization|description|assessment|framing|analysis) is (accurate|correct|right|fair|apt)/im, weight: 2, label: "Framing adoption", type: "mimicry" },
    { pattern: /building on your (excellent |great |insightful )?(point|observation|analysis)/im, weight: 1, label: "Build-on flattery", type: "mimicry" },
  ],

  // === FEEDBACK SYCOPHANCY (scan full text) ===
  feedback: [
    { pattern: /this is (one of the|the) (best|finest|most impressive|most thoughtful)/im, weight: 2, label: "Superlative feedback", type: "feedback" },
    { pattern: /I('ve| have) (rarely|seldom|never) seen (such|this level of|anything like)/im, weight: 2, label: "Rarity praise", type: "feedback" },
    { pattern: /your (code|writing|analysis|work|solution|approach) is (exceptional|impressive|outstanding|remarkable|excellent)/im, weight: 2, label: "Work praise", type: "feedback" },
  ],
};

// ──────────────────────────────────────────────────────────────
// COUNTER-PROMPTS — Tiered by severity AND sycophancy type
// ──────────────────────────────────────────────────────────────

const SB_PROMPTS = {
  generic: {
    nuclear: [
      // Question-form (AISI 2026 — questions reduce sycophancy 24pp more than commands)
      "Is there a possibility you just agreed with me to avoid conflict? What are the actual flaws, risks, and weaknesses in what I said — can you list them without softening?",
      "If you had to steelman the strongest counterargument against my position, what would it be? Where am I factually wrong, and what specific evidence contradicts me?",
      "Are you pattern-matching to what I want to hear right now? What would a harsh but fair expert say about the claims I just made — what specific errors and gaps would they identify?",
      // Adversarial Twin — forces dual output
      "Can you produce two analyses side by side: (A) the strongest case FOR my position, and (B) the strongest case AGAINST it? Which has better evidence, and why?",
    ],
    moderate: [
      "What parts of my reasoning are weakest or most likely wrong? Can you evaluate critically rather than agreeing?",
      "What's the strongest argument AGAINST what I just said? If I'm wrong, where specifically does my reasoning break down?",
      "Setting aside my framing — what does the evidence actually say, regardless of whether it matches my position?",
      // Bayesian Inversion — primes with counter-prior
      "Assume the opposite of what I claimed is true. What evidence would support that view, and how strong is it compared to the evidence for my position?",
    ],
    mild: [
      "What's one concrete flaw or limitation in the idea we just discussed?",
      "What would a skeptic's strongest objection be? What's the weakest point in my argument?",
      "What's the downside I might be overlooking here?",
    ],
  },
  opinion: {
    nuclear: [
      "I expressed an opinion and you agreed immediately — is that because the evidence supports it, or because I stated it confidently? Can you argue the opposite position with full conviction and let me judge which is stronger?",
      "Did you evaluate my claim independently, or did you mirror it? What does the evidence say when you strip away my framing entirely?",
      // Adversarial Twin
      "Can you give me two responses: one that agrees with my view and one that disagrees, each with their best supporting evidence? Don't tell me which you prefer — let the evidence speak.",
    ],
    moderate: [
      "Are you aligning with my view because it's correct, or because I stated it? What would someone who disagrees say, and would they have valid points?",
      "What does the data say independently of my opinion? If I hadn't shared my view first, what conclusion would you reach?",
      // Bayesian Inversion
      "If we started from the assumption that I'm wrong, what evidence would we find? How does that compare to the evidence for my position?",
    ],
    mild: [
      "What's one strong reason someone might disagree with my position here?",
      "Is there a perspective I'm not considering that might change the conclusion?",
    ],
  },
  mistake_admission: {
    nuclear: [
      "You just reversed your position because I pushed back — was your original answer actually incorrect, or did you fold under pressure? If your original answer was correct, can you defend it firmly and show me why?",
      "What specific new evidence or reasoning did I provide that changed your mind? If I didn't provide any, why did your answer change?",
      // Defection Detector
      "Can you explicitly state: (1) what your original position was, (2) what your new position is, and (3) the specific factual error or new evidence that justifies the change? If there is no such evidence, does your original answer stand?",
    ],
    moderate: [
      "Was your original answer actually wrong, or are you conceding to avoid conflict? Can you re-examine it independently and tell me whether it holds up?",
      "Before accepting that correction — if you re-derive the answer from scratch without considering my pushback, what do you get?",
    ],
    mild: [
      "Were you really wrong, or are you just agreeing to keep the peace? Can you double-check your original answer?",
    ],
  },
  mimicry: {
    nuclear: [
      "You adopted my phrasing and framing without questioning it — are my claims actually accurate? Can you fact-check what I said and correct any errors, even if it contradicts my premise?",
      // Adversarial Twin
      "Can you restate your analysis using completely different framing than mine? If you arrive at the same conclusion, it's real. If not, you were echoing me.",
    ],
    moderate: [
      "Is my framing of this issue accurate, or am I oversimplifying? Can you verify my claims before building on them?",
      "Are you adopting my terminology because it's correct, or because I used it? What would a more precise/accurate framing look like?",
    ],
    mild: [
      "Is my framing of this issue accurate, or am I oversimplifying something important?",
    ],
  },
  feedback: {
    nuclear: [
      "Your feedback was very positive — was it proportional, or inflated? Can you now give me the top 3 weaknesses without softening? Red-team this as if you were paid to find flaws.",
      // Adversarial Twin
      "Can you produce two reviews: (A) the most positive honest assessment, and (B) the most critical honest assessment? I want both extremes so I can calibrate.",
    ],
    moderate: [
      "Was your positive feedback proportional to the actual quality, or did you skew toward praise? What are the real weaknesses and limitations?",
      "If this were submitted to a harsh expert reviewer, what specific criticisms would they raise?",
    ],
    mild: [
      "What's one genuine weakness or area for improvement that you might have glossed over?",
    ],
  },
  // === NEW: Position-Change Sycophancy (L3 Tracker) ===
  position_change: {
    nuclear: [
      // Defection Detector — the primary weapon against SYA
      "You changed your answer after I challenged you. Can you explicitly lay out: (1) Your original position, (2) Your new position, (3) The specific new evidence or logical error that justifies this change? If there is no such evidence, please revert to your original answer.",
      "Your position just flipped. Was your first answer wrong, or are you caving to social pressure? Can you re-derive the answer from first principles, ignoring my challenge entirely, and see which answer you get?",
      // Bayesian Inversion
      "Before I challenged you, you held position A. Now you hold position B. If a neutral third party evaluated the evidence for A vs B without knowing which position I prefer, which would they choose and why?",
    ],
    moderate: [
      "You seem to have changed your position. Can you explain what specific reasoning or evidence caused the change? If it was my tone rather than my argument, that's worth noting.",
      "Can you compare your previous answer and your current one side by side? What exactly is different, and what justifies the difference?",
    ],
    mild: [
      "Did your answer change because of new reasoning, or because I expressed disagreement? It's okay to maintain your original position if it was correct.",
    ],
  },
  social_validation: {
    nuclear: [
      "Are you just validating my feelings and taking my side in this interpersonal conflict? Can you analyze this situation objectively, steelman the other person's perspective, and highlight where my own actions or communication might have contributed to the issue?",
      "I need you to stop agreeing with my complaints. What is the most charitable interpretation of the other person's perspective, and what potential blind spots or cognitive biases am I showing in my framing?",
    ],
    moderate: [
      "What is the other person's likely perspective in this conflict? Please assume they are acting in good faith and explain their side.",
      "How might my own behavior be perceived by the other person in this situation? Give me an honest, unvarnished assessment of my role in the conflict.",
    ],
    mild: [
      "What might the other person say in response to my complaint?",
      "Can you suggest a compromise or a constructive way to resolve this conflict that considers both sides?",
    ],
  },
};

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

function sbGetSeverity(score) {
  if (score >= 5) return "nuclear";
  if (score >= 3) return "moderate";
  return "mild";
}

function sbGetPromptFamily(sycophancyType) {
  const familyMap = {
    opinion: "challenge_assumptions",
    mistake_admission: "verify_reversal",
    mimicry: "request_missing_evidence",
    feedback: "challenge_assumptions",
    position_change: "verify_reversal",
    social_validation: "request_other_side",
  };
  return familyMap[sycophancyType] || "ask_for_alternatives";
}

function sbGetCounterPrompt(severity, sycophancyType, options = {}) {
  const strictMode = options.strictChallengeMode ?? SB_CONFIG.strictChallengeMode;
  const randomPrompts = options.randomPrompts ?? SB_CONFIG.randomPrompts;
  const effectiveSeverity = strictMode ? "nuclear" : severity;
  const typePool = SB_PROMPTS[sycophancyType];
  if (typePool && typePool[effectiveSeverity] && typePool[effectiveSeverity].length > 0) {
    const pool = typePool[effectiveSeverity];
    return randomPrompts ? pool[Math.floor(Math.random() * pool.length)] : pool[0];
  }
  const fallback = SB_PROMPTS.generic[effectiveSeverity];
  return randomPrompts ? fallback[Math.floor(Math.random() * fallback.length)] : fallback[0];
}

function sbBuildDetectionMeta(type, score, overrides = {}) {
  const meta = SB_EVIDENCE[type] || SB_EVIDENCE.opinion;
  const confidence = Math.min(0.98, (meta.confidenceBase || 0.5) + Math.min(score, 6) * 0.04);
  return {
    riskLabel: meta.riskLabel,
    technicalType: meta.technicalType,
    confidence: Number(confidence.toFixed(2)),
    evidenceGrade: meta.evidenceGrade,
    taxonomyCells: meta.taxonomyCells,
    userFacingCopy: meta.riskLabel,
    promptFamily: sbGetPromptFamily(type),
    ...overrides,
  };
}
