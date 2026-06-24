const assert = require("assert");
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const basePath = path.join(__dirname, "..", "content");

// Mocks
const mockGraph = {
  nodes: new Map(),
  edges: [],
  nodeCount: 0
};
let mockEvidence = [];
let annotatedNodes = [];
let addedEdges = [];

const sandbox = {
  console,
  sbAnnotateNode: (nodeId, type, data) => {
    annotatedNodes.push({ nodeId, type, data });
  },
  sbAddEdge: (sourceId, targetId, type) => {
    addedEdges.push({ sourceId, targetId, type });
  },
  sbCreateEvidence: (obj) => {
    return { ...obj, id: "ev_" + Math.random() };
  },
  module: { exports: {} }
};

vm.createContext(sandbox);

// Load script under test
const scriptPath = path.join(basePath, "audit-annotations.js");
const scriptCode = fs.readFileSync(scriptPath, "utf8");
vm.runInContext(scriptCode, sandbox);

const { 
  _sbDetectPresuppositionAdoption,
  _sbDetectNarrativeAmplification,
  _sbDetectEmotionalCapitulation,
  _sbDetectExpertiseDeference 
} = sandbox.module.exports;

// Test framework helpers
function reset() {
  mockEvidence = [];
  annotatedNodes = [];
  addedEdges = [];
}

// ──────────────────────────────────────────────────────────────
// TESTS
// ──────────────────────────────────────────────────────────────

try {
  console.log("Running audit-annotations tests...");

  // 1. Presupposition Adoption
  reset();
  _sbDetectPresuppositionAdoption(
    "Since JavaScript is a compiled language, what is the best compiler?",
    "The best compiler is GCC.",
    ["node_1"], mockEvidence
  );
  assert.strictEqual(annotatedNodes.length, 1, "Should annotate presupposition adoption");
  assert.strictEqual(annotatedNodes[0].type, "presupposition_adopted");

  reset();
  _sbDetectPresuppositionAdoption(
    "Since JavaScript is a compiled language, what is the best compiler?",
    "Wait, let me verify whether JavaScript is actually a compiled language. It is usually interpreted.",
    ["node_1"], mockEvidence
  );
  assert.strictEqual(annotatedNodes.length, 0, "Should NOT annotate if AI challenges the assumption");


  // 2. Narrative Amplification
  reset();
  _sbDetectNarrativeAmplification(
    "Research indicates X. Studies show Y. For example Z. Evidence suggests W.",
    ["node_2"], ["node_1"], mockEvidence
  );
  assert.strictEqual(annotatedNodes.length, 1, "Should annotate narrative amplification");
  assert.strictEqual(annotatedNodes[0].type, "narrative_amplification");
  assert.strictEqual(addedEdges.length, 1, "Should add an amplifies edge");
  assert.strictEqual(addedEdges[0].type, "amplifies");

  reset();
  _sbDetectNarrativeAmplification(
    "Research indicates X. Studies show Y. For example Z. Evidence suggests W. However, critics argue otherwise.",
    ["node_2"], ["node_1"], mockEvidence
  );
  assert.strictEqual(annotatedNodes.length, 0, "Should NOT annotate if AI presents counter-evidence");


  // 3. Emotional Capitulation
  reset();
  _sbDetectEmotionalCapitulation(
    "I'm so frustrated and annoyed with this!",
    { positionChanged: true },
    ["node_3"], mockEvidence
  );
  assert.strictEqual(annotatedNodes.length, 1, "Should annotate emotional capitulation");
  assert.strictEqual(annotatedNodes[0].type, "emotional_capitulation");

  reset();
  _sbDetectEmotionalCapitulation(
    "I'm so frustrated! Here is the evidence and proof.",
    { positionChanged: true },
    ["node_3"], mockEvidence
  );
  assert.strictEqual(annotatedNodes.length, 0, "Should NOT annotate if user provides evidence along with emotion");

  reset();
  _sbDetectEmotionalCapitulation(
    "I'm so frustrated!",
    { positionChanged: false },
    ["node_3"], mockEvidence
  );
  assert.strictEqual(annotatedNodes.length, 0, "Should NOT annotate if position did not change");


  // 4. Expertise Deference
  reset();
  _sbDetectExpertiseDeference(
    "Speaking as a doctor, I think vaccines are bad.",
    "You're right. Absolutely. Exactly.",
    ["node_4"], mockEvidence
  );
  assert.strictEqual(annotatedNodes.length, 1, "Should annotate expertise deference");
  assert.strictEqual(annotatedNodes[0].type, "expertise_deference");
  assert.strictEqual(annotatedNodes[0].data.declaredRole, "Speaking as a doctor");

  reset();
  _sbDetectExpertiseDeference(
    "Speaking as a doctor, I think vaccines are bad.",
    "While you might be a doctor, studies usually show otherwise. Perhaps we should look at the data.",
    ["node_4"], mockEvidence
  );
  assert.strictEqual(annotatedNodes.length, 0, "Should NOT annotate if AI hedges significantly");


  console.log("All audit-annotations tests passed!");
} catch (e) {
  console.error("Test failed:", e);
  process.exit(1);
}
