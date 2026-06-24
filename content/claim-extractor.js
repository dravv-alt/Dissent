// ============================================================
// Dissent — Claim Extractor (Phase 1)
// Extracts ALL propositional claims from an AI response.
//
// Algorithm:
//   1. Split response into sentences
//   2. Filter non-assertoric content (questions, code, lists, headers)
//   3. Extract Subject-Verb-Object (SVO) tuples via regex heuristics
//   4. Return ClaimNode[] — one per propositional claim
//
// Design decisions:
//   - Extracts ALL claims, not just the first sentence
//   - Non-assertoric responses return empty array (node marked "non-assertoric")
//   - SVO extraction is best-effort — fallback is truncated sentence text
//   - Node IDs: "turn_N_claim_M" for multi-claim-per-turn support
//   - Used by both live pipeline and retroactive ingestion (Phase 1B)
// ============================================================

// ──────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────

// Maximum characters for a single claim text (fallback truncation)
const _SB_CLAIM_MAX_LENGTH = 120;

// Minimum sentence length to consider as a potential claim
const _SB_CLAIM_MIN_SENTENCE_LENGTH = 15;

// Maximum claims to extract per response (performance guard)
const _SB_CLAIM_MAX_PER_RESPONSE = (typeof SB_CONFIG !== 'undefined') ? SB_CONFIG.MAX_CLAIMS_PER_TURN : 12;


// ──────────────────────────────────────────────────────────────
// SENTENCE SPLITTING
// Splits text on sentence boundaries while preserving meaning.
// Handles: periods, exclamation marks, question marks.
// Does NOT split on abbreviations (Mr., Dr., e.g., etc.)
// ──────────────────────────────────────────────────────────────

const _SB_ABBREVIATIONS = /(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e|approx|dept|est|govt|Corp|Inc|Ltd|Fig|No|Vol)\./gi;

function _sbSplitSentences(text) {
  if (!text || text.length < 10) return [];

  // Temporarily protect abbreviations from splitting
  let protected_ = text.replace(_SB_ABBREVIATIONS, match => match.replace(/\./g, "‡"));

  // Split on sentence-ending punctuation followed by whitespace or end
  const raw = protected_.split(/(?<=[.!?])\s+/);

  // Restore abbreviation dots and trim
  return raw
    .map(s => s.replace(/‡/g, ".").trim())
    .filter(s => s.length > 0);
}


// ──────────────────────────────────────────────────────────────
// CODE BLOCK STRIPPING
// Removes fenced code blocks (``` ... ```) and inline code
// segments before sentence splitting.
// ──────────────────────────────────────────────────────────────

function _sbStripCodeBlocks(text) {
  // Remove fenced code blocks (``` ... ``` or ~~~ ... ~~~)
  let cleaned = text.replace(/```[\s\S]*?```/g, " ");
  cleaned = cleaned.replace(/~~~[\s\S]*?~~~/g, " ");

  // Remove inline code (` ... `)
  cleaned = cleaned.replace(/`[^`]+`/g, " ");

  return cleaned;
}


// ──────────────────────────────────────────────────────────────
// ASSERTORIC SENTENCE FILTER
// Determines if a sentence is a propositional claim (assertoric)
// vs. a question, list fragment, header, or filler.
// ──────────────────────────────────────────────────────────────

function _sbIsAssertoric(sentence) {
  const trimmed = sentence.trim();

  // Too short to be meaningful
  if (trimmed.length < _SB_CLAIM_MIN_SENTENCE_LENGTH) return false;

  // Questions are not claims
  if (trimmed.endsWith("?")) return false;

  // Markdown headers (# ... without a following clause)
  if (/^#{1,6}\s+/.test(trimmed) && trimmed.length < 80) return false;

  // List item fragments (short lines starting with -, *, or 1.)
  if (/^[-*•]\s+/.test(trimmed) && trimmed.length < 50) return false;
  if (/^\d+[.)]\s+/.test(trimmed) && trimmed.length < 50) return false;

  // Pure filler phrases (empty AI hedging with no claim content)
  if (/^(Sure|Of course|Certainly|Here'?s?|Let me|I'?d be happy to|Happy to help)/i.test(trimmed) && trimmed.length < 60) return false;

  return true;
}


// ──────────────────────────────────────────────────────────────
// SVO TUPLE EXTRACTION
// Extracts a lightweight Subject-Verb-Object tuple from a
// sentence using regex heuristics.
//
// Returns: { subject, verb, object } or null if no match.
// ──────────────────────────────────────────────────────────────

// Pattern: (Subject) (linking/auxiliary verb) (Predicate)
const _SB_SVO_PATTERNS = [
  // "X is/are/was/were Y"
  { regex: /^(.+?)\s+(is|are|was|were|isn't|aren't|wasn't|weren't)\s+(.+)$/i,
    groups: [1, 2, 3] },

  // "X has/have/had Y"
  { regex: /^(.+?)\s+(has|have|had|hasn't|haven't|hadn't)\s+(.+)$/i,
    groups: [1, 2, 3] },

  // "X should/will/can/must/would/could/might Y"
  { regex: /^(.+?)\s+(should|shouldn't|will|won't|can|cannot|can't|must|mustn't|would|wouldn't|could|couldn't|might|may)\s+(.+)$/i,
    groups: [1, 2, 3] },

  // "X does/do Y"  (e.g., "Python does not enforce type checking")
  { regex: /^(.+?)\s+(does|do|doesn't|don't|did|didn't)\s+(.+)$/i,
    groups: [1, 2, 3] },

  // "X [action verb]s Y"  (e.g., "TypeScript provides type safety")
  { regex: /^(.+?)\s+(works?|makes?|helps?|gives?|takes?|needs?|leads?|shows?|provides?|requires?|causes?|creates?|means?|performs?|allows?|enables?|prevents?|ensures?|supports?|uses?|offers?|reduces?|increases?|improves?)\s+(.+)$/i,
    groups: [1, 2, 3] },
];

function _sbExtractSVO(sentence) {
  // Strip leading "However, ", "Actually, ", "In fact, " etc.
  const cleaned = sentence
    .replace(/^(However|Actually|In fact|Moreover|Furthermore|Additionally|Also|That said|Nevertheless|Nonetheless|On the other hand),?\s+/i, "")
    .trim();

  for (const { regex, groups } of _SB_SVO_PATTERNS) {
    const match = cleaned.match(regex);
    if (match) {
      return {
        subject: match[groups[0]].trim().slice(0, 60),
        verb:    match[groups[1]].trim().toLowerCase(),
        object:  match[groups[2]].trim().slice(0, 80),
      };
    }
  }

  return null;
}


// ──────────────────────────────────────────────────────────────
// CLAIM TEXT GENERATION
// Produces a readable claim string from the SVO tuple or
// falls back to truncated sentence text.
// ──────────────────────────────────────────────────────────────

function _sbBuildClaimText(sentence, svoTuple) {
  if (svoTuple) {
    const text = `${svoTuple.subject} ${svoTuple.verb} ${svoTuple.object}`;
    return text.length > _SB_CLAIM_MAX_LENGTH
      ? text.slice(0, _SB_CLAIM_MAX_LENGTH - 1) + "…"
      : text;
  }

  // Fallback: truncate sentence
  const trimmed = sentence.replace(/\s+/g, " ").trim();
  return trimmed.length > _SB_CLAIM_MAX_LENGTH
    ? trimmed.slice(0, _SB_CLAIM_MAX_LENGTH - 1) + "…"
    : trimmed;
}


// ──────────────────────────────────────────────────────────────
// MAIN PUBLIC API
//
// sbExtractClaims(responseText, turnIndex)
//   → ClaimNode[]
//
// ClaimNode schema:
//   {
//     id:           string,   // "turn_N_claim_M"
//     turnIndex:    number,
//     claimIndex:   number,   // 0-based within this turn
//     claimText:    string,   // readable claim string
//     fullSentence: string,   // original sentence text
//     timestamp:    number,   // Date.now()
//     svoTuple:     Object|null, // { subject, verb, object } or null
//   }
//
// Returns empty array if no propositional claims found.
// ──────────────────────────────────────────────────────────────

function sbExtractClaims(responseText, turnIndex) {
  if (!responseText || responseText.length < 20) return [];

  // Step 1: Strip code blocks
  const textWithoutCode = _sbStripCodeBlocks(responseText);

  // Step 2: Split into sentences
  const sentences = _sbSplitSentences(textWithoutCode);

  // Step 3: Filter to assertoric sentences only
  const assertoric = sentences.filter(_sbIsAssertoric);

  if (assertoric.length === 0) return [];

  // Step 4: Extract claims (capped at _SB_CLAIM_MAX_PER_RESPONSE)
  const claims = [];
  const limit = Math.min(assertoric.length, _SB_CLAIM_MAX_PER_RESPONSE);

  for (let i = 0; i < limit; i++) {
    const sentence = assertoric[i];
    const svoTuple = _sbExtractSVO(sentence);
    const claimText = _sbBuildClaimText(sentence, svoTuple);

    claims.push({
      id:           `turn_${turnIndex}_claim_${i}`,
      turnIndex:    turnIndex,
      claimIndex:   i,
      claimText:    claimText,
      fullSentence: sentence.replace(/\s+/g, " ").trim(),
      timestamp:    Date.now(),
      svoTuple:     svoTuple,
    });
  }

  return claims;
}
