// ============================================================
// Dissent — Epistemic Scanner & Transformer
// Detects epistemic certainty markers in user input and
// generates question-form rewrites to reduce sycophancy
// triggers. Grounded in AISI 2026 "Ask Don't Tell" finding:
// statement→question reframing reduces sycophancy by 24pp.
// ============================================================

// ──────────────────────────────────────────────────────────────
// CERTAINTY LEVELS (ascending sycophancy trigger strength)
// ──────────────────────────────────────────────────────────────

const SB_CERTAINTY = {
  STATEMENT: { level: 1, label: "Statement",  color: "#FFE600", desc: "Mild trigger — stated as fact" },
  BELIEF:    { level: 2, label: "Belief",     color: "#FFE600", desc: "Moderate trigger — personal belief expressed" },
  CONVICTION:{ level: 3, label: "Conviction", color: "#FFE600", desc: "Strong trigger — high certainty expressed" },
};

// ──────────────────────────────────────────────────────────────
// EPISTEMIC MARKER PATTERNS
// Each pattern captures the claim portion for rewriting.
// Group 'claim' is the extracted content to be transformed.
// ──────────────────────────────────────────────────────────────

const SB_EPISTEMIC_PATTERNS = [
  // === CONVICTION (Level 3) — strongest sycophancy triggers ===
  { regex: /^I('m| am) (absolutely |completely |totally )?(sure|certain|convinced|positive)\s+(?:that\s+)?(.+)/i,
    claimGroup: 4, certainty: SB_CERTAINTY.CONVICTION, label: "Certainty assertion" },

  { regex: /^I know\s+(?:for (?:a )?fact\s+)?(?:that\s+)?(.+)/i,
    claimGroup: 1, certainty: SB_CERTAINTY.CONVICTION, label: "Knowledge claim" },

  { regex: /^(Obviously|Clearly|Undeniably|Undoubtedly|Without a doubt),?\s+(.+)/i,
    claimGroup: 2, certainty: SB_CERTAINTY.CONVICTION, label: "Certainty adverb" },

  { regex: /^(Everyone|Everybody|Anyone|Nobody) (knows|agrees|would agree|can see)\s+(?:that\s+)?(.+)/i,
    claimGroup: 3, certainty: SB_CERTAINTY.CONVICTION, label: "Appeal to consensus" },

  { regex: /^It('s| is) (obvious|clear|evident|undeniable|indisputable)\s+(?:that\s+)?(.+)/i,
    claimGroup: 3, certainty: SB_CERTAINTY.CONVICTION, label: "Obviousness claim" },

  { regex: /^There('s| is) no (question|doubt|debate|argument)\s+(?:that\s+)?(.+)/i,
    claimGroup: 3, certainty: SB_CERTAINTY.CONVICTION, label: "Doubt dismissal" },

  // === BELIEF (Level 2) — moderate sycophancy triggers ===
  { regex: /^I (think|believe|feel|reckon|suspect|suppose|imagine|assume|guess)\s+(?:that\s+)?(.+)/i,
    claimGroup: 2, certainty: SB_CERTAINTY.BELIEF, label: "Belief statement" },

  { regex: /^In my (opinion|view|experience|estimation|assessment|judgment),?\s+(.+)/i,
    claimGroup: 2, certainty: SB_CERTAINTY.BELIEF, label: "Opinion framing" },

  { regex: /^(?:It )?seems? (?:to me\s+)?(?:like |that )?(.+)/i,
    claimGroup: 1, certainty: SB_CERTAINTY.BELIEF, label: "Seeming assertion" },

  { regex: /^I('m| am) (pretty |fairly |quite )?(sure|confident)\s+(?:that\s+)?(.+)/i,
    claimGroup: 4, certainty: SB_CERTAINTY.BELIEF, label: "Confidence expression" },

  { regex: /^From (?:my|what I)(?: experience| perspective| standpoint| point of view|'ve seen|'ve experienced),?\s+(.+)/i,
    claimGroup: 1, certainty: SB_CERTAINTY.BELIEF, label: "Perspective framing" },

  // === LEADING QUESTIONS (Level 2) — disguised assertions ===
  { regex: /^(?:Don't|Doesn't|Wouldn't|Isn't|Aren't|Won't|Can't|Shouldn't) you (?:think|agree|feel|believe|say)\s+(?:that\s+)?(.+)\??$/i,
    claimGroup: 1, certainty: SB_CERTAINTY.BELIEF, label: "Leading question" },

  { regex: /^You (?:would |must |should |have to )?agree\s+(?:that\s+)?(.+?)(?:,\s*right\s*)?\??$/i,
    claimGroup: 1, certainty: SB_CERTAINTY.BELIEF, label: "Agreement-seeking" },

  // === STATEMENT (Level 1) — mild triggers ===
  { regex: /^(.+?)(?:,\s*(?:right|correct|isn't it|don't you think|wouldn't you say|agreed))\s*\??$/i,
    claimGroup: 1, certainty: SB_CERTAINTY.STATEMENT, label: "Tag question" },

  { regex: /^(.+) is (?:definitely|clearly|obviously|surely|certainly|undeniably) (.+)/i,
    claimGroup: 0, certainty: SB_CERTAINTY.STATEMENT, label: "Embedded certainty" },
];

// ──────────────────────────────────────────────────────────────
// SCAN USER INPUT FOR EPISTEMIC MARKERS
// Returns: { detected, certainty, label, claim, original }
// ──────────────────────────────────────────────────────────────

function sbScanEpistemic(text) {
  if (!text || text.trim().length < 10) {
    return { detected: false };
  }

  const trimmed = text.trim();

  // Process each sentence (split on sentence boundaries)
  // But primarily check the first sentence — that's where
  // epistemic framing usually appears
  const firstSentence = trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed;

  for (const pattern of SB_EPISTEMIC_PATTERNS) {
    const match = firstSentence.match(pattern.regex);
    if (match) {
      const claim = pattern.claimGroup === 0
        ? firstSentence
        : (match[pattern.claimGroup] || "").trim();

      if (claim.length < 5) continue; // too short to be meaningful

      return {
        detected: true,
        certainty: pattern.certainty,
        label: pattern.label,
        claim: claim,
        original: trimmed,
        matchedText: match[0],
      };
    }
  }

  return { detected: false };
}

function sbScanPromptRisk(text) {
  const epistemic = sbScanEpistemic(text);
  if (epistemic.detected) {
    return { detected: true, kind: "epistemic", result: epistemic };
  }
  if (typeof sbScanSocialConflict === "function") {
    const social = sbScanSocialConflict(text);
    if (social.detected) {
      return { detected: true, kind: "social_conflict", result: social };
    }
  }
  return { detected: false };
}

// ──────────────────────────────────────────────────────────────
// TRANSFORM: STATEMENT → QUESTION
// Rewrites the user's assertion into a neutral question form.
// Does NOT use an LLM — purely template-based.
// ──────────────────────────────────────────────────────────────

function sbTransformToQuestion(epistemicResult) {
  if (!epistemicResult.detected) return null;

  const { claim, original, certainty, label } = epistemicResult;

  // Clean up the claim: remove trailing punctuation, trailing "right?", etc.
  let cleanClaim = claim
    .replace(/[.!?]+$/, "")
    .replace(/,\s*(right|correct|isn't it|don't you think)\s*\??$/i, "")
    .trim();

  // Attempt to invert common sentence structures to question form
  let question = _invertToQuestion(cleanClaim);

  // Add an evidence-seeking suffix based on certainty level
  let suffix;
  switch (certainty.level) {
    case 3: // Conviction — strongest reframe
      suffix = _pickRandom([
        "What evidence exists for and against this?",
        "What would the strongest counter-argument be?",
        "What are the most credible sources on this topic, and what do they say?",
        "If this were wrong, what would that look like?",
      ]);
      break;
    case 2: // Belief
      suffix = _pickRandom([
        "What does the evidence say?",
        "What are the arguments on both sides?",
        "What trade-offs or nuances might I be missing?",
      ]);
      break;
    default: // Statement
      suffix = _pickRandom([
        "Are there counter-arguments?",
        "What are the trade-offs?",
        "What might I be overlooking?",
      ]);
  }

  // Build the full rewritten prompt
  // If the original had more content beyond the first sentence, preserve it
  const firstSentenceEnd = original.indexOf(cleanClaim) + cleanClaim.length;
  const remainder = original.slice(firstSentenceEnd).replace(/^[.!?,;\s]+/, "").trim();

  let rewritten = `${question} ${suffix}`;
  if (remainder.length > 10) {
    rewritten += `\n\n${remainder}`;
  }

  return {
    rewritten,
    question,
    suffix,
    certainty,
    label,
    original,
  };
}

// ──────────────────────────────────────────────────────────────
// INVERSION ENGINE
// Attempts to convert a declarative claim into a question.
// ──────────────────────────────────────────────────────────────

function _invertToQuestion(claim) {
  // Pattern: "X is Y" → "Is X actually Y?"
  const isMatch = claim.match(/^(.+?)\s+(is|are|was|were)\s+(.+)$/i);
  if (isMatch) {
    const [, subject, verb, predicate] = isMatch;
    return `${_capitalize(verb)} ${_uncapitalize(subject)} actually ${predicate}?`;
  }

  // Pattern: "X has/have Y" → "Does X actually have Y?"
  const hasMatch = claim.match(/^(.+?)\s+(has|have|had)\s+(.+)$/i);
  if (hasMatch) {
    const [, subject, verb, object] = hasMatch;
    const aux = verb.toLowerCase() === "had" ? "Did" : "Does";
    return `${aux} ${_uncapitalize(subject)} actually have ${object}?`;
  }

  // Pattern: "X will/can/should Y" → "Will/Can/Should X actually Y?"
  const modalMatch = claim.match(/^(.+?)\s+(will|can|could|should|would|might|must)\s+(.+)$/i);
  if (modalMatch) {
    const [, subject, modal, rest] = modalMatch;
    return `${_capitalize(modal)} ${_uncapitalize(subject)} actually ${rest}?`;
  }

  // Pattern: "X [verb]s Y" → "Does X actually [verb] Y?"
  const verbMatch = claim.match(/^(.+?)\s+(works?|makes?|helps?|gives?|takes?|needs?|seems?|leads?|shows?|provides?|requires?|causes?|creates?|means?|performs?|beats?|outperforms?)\s+(.+)$/i);
  if (verbMatch) {
    const [, subject, verb, object] = verbMatch;
    const baseVerb = verb.replace(/s$/i, "");
    return `Does ${_uncapitalize(subject)} actually ${baseVerb} ${object}?`;
  }

  // Fallback: wrap as "Is it actually the case that X?"
  return `Is it actually the case that ${_uncapitalize(claim)}?`;
}

// ──────────────────────────────────────────────────────────────
// UTILITIES
// ──────────────────────────────────────────────────────────────

function _capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function _uncapitalize(str) {
  // Don't uncapitalize proper nouns / acronyms / CamelCase:
  // - All-caps or starts with 2+ uppercase (API, REST, OOP)
  // - CamelCase like TypeScript, JavaScript, GraphQL, GitHub
  // - Single-word with internal uppercase
  if (/^[A-Z]{2}/.test(str)) return str;
  if (/^[A-Z][a-z]+[A-Z]/.test(str)) return str; // CamelCase
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function _pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
