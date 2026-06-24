// ============================================================
// Dissent — Phase 2: Audit Graph Test Suite
// ============================================================

const fs = require("fs");
const vm = require("vm");

function loadModule(relativePath) {
  const code = fs.readFileSync(
    require("path").resolve(__dirname, "..", relativePath),
    "utf-8"
  );
  vm.runInThisContext(code, { filename: relativePath });
}

loadModule("content/constants.js");
loadModule("content/rules.js");
loadModule("content/audit-graph.js");
loadModule("content/audit-ledger.js");

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${msg}`);
  }
}

console.log("\n── Audit Graph Tests ──");

sbResetGraph();

// 1. Add nodes (including multi-claim-per-turn), verify retrieval
sbAddClaimNode({ id: "t0_c0", turnIndex: 0, claimIndex: 0, claimText: "A", fullSentence: "A.", timestamp: 1 }, true);
sbAddClaimNode({ id: "t0_c1", turnIndex: 0, claimIndex: 1, claimText: "B", fullSentence: "B.", timestamp: 2 }, true);
assert(sbGetNode("t0_c0") !== null, "Node t0_c0 retrieved");
assert(sbGetNodesByTurn(0).length === 2, "Turn 0 has 2 nodes");

// 2. Add edges, verify adjacency
sbAddClaimNode({ id: "t1_c0", turnIndex: 1, claimIndex: 0, claimText: "C", fullSentence: "C.", timestamp: 3 }, false);
sbAddEdge("t0_c0", "t1_c0", "extends");
const t1Node = sbGetNode("t1_c0");
assert(t1Node.edges.some(e => e.fromId === "t0_c0"), "Edge added successfully");

// 3. Annotate nodes, verify annotation retrieval
sbAnnotateNode("t1_c0", "flag_test", { reason: "test" });
assert(sbGetAnnotation("t1_c0", "flag_test").reason === "test", "Annotation added and retrieved");

// 4. Ring buffer eviction at 200 nodes (historical evicted first)
sbResetGraph();
for (let i = 0; i < 200; i++) {
  sbAddClaimNode({ id: `hist_${i}`, turnIndex: i, claimIndex: 0, claimText: "H", fullSentence: "H.", timestamp: i }, true);
}
assert(sbGetGraph().nodeCount === 200, "Graph at max capacity");
sbAddClaimNode({ id: "live_1", turnIndex: 200, claimIndex: 0, claimText: "L", fullSentence: "L.", timestamp: 201 }, false);
assert(sbGetNode("hist_0") === null, "Oldest historical node evicted");
assert(sbGetGraph().nodeCount === 200, "Graph remains at max capacity");

// 5. Reset clears all state
sbResetGraph();
assert(sbGetGraph().nodeCount === 0, "Graph reset successfully");

// 6. Timeline returns nodes in chronological order
sbAddClaimNode({ id: "n1", turnIndex: 1, claimIndex: 0, claimText: "1", fullSentence: "1.", timestamp: 1 }, false);
sbAddClaimNode({ id: "n0", turnIndex: 0, claimIndex: 0, claimText: "0", fullSentence: "0.", timestamp: 0 }, true);
const timeline = sbGetTimeline();
assert(timeline[0].node.id === "n0" && timeline[1].node.id === "n1", "Timeline ordered correctly");

// 7. Edge type correctness
assert(sbInferEdgeType("I like cats.", "Cats are great.") === "extends", "High overlap -> extends");
assert(sbInferEdgeType("I like cats.", "I do not like cats.") === "contradicts", "Negation -> contradicts");

// 8. populateFromHistory() bulk insert correctness
sbResetGraph();
sbPopulateFromHistory([
  { turnIndex: 0, claims: [{ id: "n1", turnIndex: 0, claimIndex: 0, claimText: "A", fullSentence: "A.", timestamp: 1 }] }
]);
assert(sbGetGraph().nodeCount === 1, "Bulk populate works");

// 9. Baseline get/set roundtrip
const baseline = { compromised: true, compromisedTurnIndex: 1, compromisedTypes: ["test"], userBaseline: [], aiBaseline: [], delta: null };
sbSetBaseline(baseline);
assert(sbGetBaseline().compromised === true, "Baseline roundtrip works");

// 10. isHistorical flag propagation
assert(sbGetNode("n1").node.isHistorical === true, "isHistorical propagated in bulk insert");

console.log(`\nAudit Graph Tests: ${passed} passed, ${failed} failed`);
if (failed !== 0) process.exitCode = 1;
