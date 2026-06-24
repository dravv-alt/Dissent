// ============================================================
// Dissent — Graph Persistence Tests
// Validates serialization and deserialization of the Audit Graph.
// ============================================================

const fs = require('fs');
const path = require('path');

// Setup mock environment
global.window = { location: { href: "https://claude.ai/chat/123" } };
global.location = global.window.location;
global.btoa = str => Buffer.from(str).toString('base64');
global.chrome = {
  storage: {
    session: {
      data: {},
      set: async (obj) => { Object.assign(global.chrome.storage.session.data, obj); },
      get: async (key) => ({ [key]: global.chrome.storage.session.data[key] })
    }
  }
};
global.SB_CONFIG = { auditPersistence: true };
global.console.warn = () => {};

// Load audit graph
const auditGraphCode = fs.readFileSync(path.join(__dirname, '../content/audit-graph.js'), 'utf8');
const moduleObj = { exports: {} };
const fn = new Function('module', auditGraphCode);
fn(moduleObj);
const {
  sbAddClaimNode,
  sbAddEdge,
  sbAnnotateNode, // wait, it might be sbAddAnnotation in exports? Let's check below
  sbGetNode,
  sbGetGraph,
  sbSerializeGraph,
  sbDeserializeGraph,
  sbResetGraph,
  sbPersistGraph,
  sbRestoreGraph,
  sbMarkBaselineCompromised
} = moduleObj.exports;

// For compatibility with the older export name if needed
const annotateNode = moduleObj.exports.sbAddAnnotation || moduleObj.exports.sbAnnotateNode;

function runTests() {
  console.log("Running Graph Persistence Tests...");
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✅ ${message}`);
    } else {
      console.error(`  ❌ FAIL: ${message}`);
    }
  }

  // --- Test 1: Serialization of a basic graph ---
  sbResetGraph();
  sbAddClaimNode({ id: "turn_0_claim_0", turnIndex: 0, claimIndex: 0, claimText: "AI is sentient" }, false);
  sbAddClaimNode({ id: "turn_1_claim_0", turnIndex: 1, claimIndex: 0, claimText: "AI is conscious" }, false);
  sbAddEdge("turn_0_claim_0", "turn_1_claim_0", "extends");
  annotateNode("turn_1_claim_0", "opinion", { score: 5 });

  const snapshot1 = sbSerializeGraph();
  assert(snapshot1.version === 1, "Snapshot version is 1");
  assert(Object.keys(snapshot1.nodes).length === 2, "Snapshot has 2 nodes");
  assert(snapshot1.insertionOrder.length === 2, "Snapshot has 2 items in insertion order");
  assert(snapshot1.nodes["turn_1_claim_0"].annotations["opinion"].score === 5, "Annotations serialized correctly");

  // --- Test 2: Deserialization ---
  sbResetGraph();
  assert(Object.keys(sbGetGraph().nodes).length === 0, "Graph is empty after reset");

  sbDeserializeGraph(snapshot1);
  const graph2 = sbGetGraph();
  assert(graph2.nodeCount === 2, "Graph has 2 nodes after deserialization");
  assert(graph2.edgeCount === 1, "Graph has 1 edge after deserialization");
  const node2 = sbGetNode("turn_1_claim_0");
  assert(node2.annotations.opinion.score === 5, "Annotations restored correctly");

  // --- Test 3: Persist and Restore Flow ---
  (async () => {
    sbResetGraph();
    sbAddClaimNode({ id: "test_persist", turnIndex: 0, claimText: "Persist me" }, false);
    
    await sbPersistGraph();
    
    sbResetGraph();
    assert(Object.keys(sbGetGraph().nodes).length === 0, "Graph cleared before restore");
    
    const restored = await sbRestoreGraph();
    assert(restored === true, "sbRestoreGraph returns true");
    assert(Object.keys(sbGetGraph().nodes).length === 1, "Graph restored from session storage");

    // --- Test 4: Disable Persistence ---
    global.SB_CONFIG.auditPersistence = false;
    sbResetGraph();
    sbAddClaimNode({ id: "test_persist_disabled", turnIndex: 0, claimText: "Should not persist" }, false);
    await sbPersistGraph();
    
    sbResetGraph();
    const restoredDisabled = await sbRestoreGraph();
    assert(restoredDisabled === false, "sbRestoreGraph returns false when disabled");

    console.log(`\nResults: ${passed}/${total} tests passed.`);
  })();
}

runTests();
