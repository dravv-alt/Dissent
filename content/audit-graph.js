// ============================================================
// Dissent — Audit Graph (Phase 1)
// In-memory directed graph storing claims as nodes and their
// relationships as edges.
//
// Design decisions:
//   - Adjacency list representation (sparse, memory-efficient)
//   - Node IDs: "turn_N_claim_M" (deterministic, multi-claim)
//   - Edge types are extensible (new detectors add labels, not structures)
//   - Max 200 nodes (50 turns × ~4 claims avg)
//   - `isHistorical` flag distinguishes retroactively ingested vs live nodes
//   - Ring buffer eviction: oldest historical nodes first
//   - Baseline state tracks first-3-turns analysis for compromised detection
//   - Serialize/deserialize for Phase 6 persistence
// ============================================================

// ──────────────────────────────────────────────────────────────
// GRAPH STATE
// ──────────────────────────────────────────────────────────────

const _sbAuditGraph = {
  // Map<nodeId, { node: ClaimNode, edges: Edge[], annotations: Map<string, any> }>
  nodes: new Map(),

  // Insertion order tracking for ring buffer eviction
  insertionOrder: [],

  // Maximum number of nodes before eviction
  maxNodes: (typeof SB_CONFIG !== 'undefined') ? SB_CONFIG.MAX_GRAPH_NODES : 200,

  // Baseline state — set during retroactive ingestion (Phase 1B)
  baseline: null,
};


// ──────────────────────────────────────────────────────────────
// NODE OPERATIONS
// ──────────────────────────────────────────────────────────────

/**
 * Add a claim node to the graph.
 * @param {Object} claimNode — from sbExtractClaims() output
 * @param {boolean} [isHistorical=false] — true if from retroactive ingestion
 */
function sbAddClaimNode(claimNode, isHistorical) {
  if (!claimNode || !claimNode.id) {
    console.warn("[Dissent] sbAddClaimNode: invalid node (missing id)");
    return;
  }

  // Dedup: if node already exists, skip
  if (_sbAuditGraph.nodes.has(claimNode.id)) return;

  // Ring buffer eviction
  if (_sbAuditGraph.nodes.size >= _sbAuditGraph.maxNodes) {
    _sbEvictOldest();
  }

  const entry = {
    node: {
      id:           claimNode.id,
      turnIndex:    claimNode.turnIndex,
      claimIndex:   claimNode.claimIndex ?? 0,
      claimText:    claimNode.claimText,
      fullSentence: claimNode.fullSentence || "",
      svoTuple:     claimNode.svoTuple || null,
      timestamp:    claimNode.timestamp || Date.now(),
      isHistorical: isHistorical === true,
    },
    edges: [],
    annotations: new Map(),
  };

  _sbAuditGraph.nodes.set(claimNode.id, entry);
  _sbAuditGraph.insertionOrder.push(claimNode.id);
  
  if (typeof sbDebouncedPersistGraph === "function") {
    sbDebouncedPersistGraph();
  }
}


/**
 * Ring buffer eviction — removes the oldest node.
 * Prefers to evict historical nodes first.
 */
function _sbEvictOldest() {
  // Try to find the oldest historical node
  for (let i = 0; i < _sbAuditGraph.insertionOrder.length; i++) {
    const id = _sbAuditGraph.insertionOrder[i];
    const entry = _sbAuditGraph.nodes.get(id);
    if (entry && entry.node.isHistorical) {
      _sbRemoveNode(id, i);
      return;
    }
  }

  // No historical nodes — evict the absolute oldest
  if (_sbAuditGraph.insertionOrder.length > 0) {
    const id = _sbAuditGraph.insertionOrder[0];
    _sbRemoveNode(id, 0);
  }
}


/**
 * Internal: removes a node by id and insertion index.
 * Also removes edges referencing this node.
 */
function _sbRemoveNode(nodeId, insertionIdx) {
  _sbAuditGraph.nodes.delete(nodeId);
  _sbAuditGraph.insertionOrder.splice(insertionIdx, 1);

  // Clean up edges referencing this node in other entries
  for (const [, entry] of _sbAuditGraph.nodes) {
    entry.edges = entry.edges.filter(e => e.fromId !== nodeId && e.toId !== nodeId);
  }
}


// ──────────────────────────────────────────────────────────────
// EDGE OPERATIONS
// ──────────────────────────────────────────────────────────────

/**
 * Edge types:
 *   "extends"        — builds on previous claim
 *   "contradicts"    — contradicts previous claim
 *   "adopts_premise" — adopts user's unverified premise
 *   "amplifies"      — amplifies user's position without counter-evidence
 */

/**
 * Add a directed edge between two nodes.
 * @param {string} fromId — source node ID
 * @param {string} toId   — target node ID
 * @param {string} edgeType — one of the edge type strings
 */
function sbAddEdge(fromId, toId, edgeType) {
  const fromEntry = _sbAuditGraph.nodes.get(fromId);
  const toEntry   = _sbAuditGraph.nodes.get(toId);

  if (!fromEntry || !toEntry) {
    // Silently skip if either node doesn't exist (may have been evicted)
    return;
  }

  // Dedup: don't add duplicate edges
  const exists = fromEntry.edges.some(
    e => e.fromId === fromId && e.toId === toId && e.type === edgeType
  );
  if (exists) return;

  const edge = Object.freeze({ fromId, toId, type: edgeType });
  fromEntry.edges.push(edge);
  toEntry.edges.push(edge); // bidirectional reference for traversal
  
  if (typeof sbDebouncedPersistGraph === "function") {
    sbDebouncedPersistGraph();
  }
}


// ──────────────────────────────────────────────────────────────
// ANNOTATION OPERATIONS
// ──────────────────────────────────────────────────────────────

/**
 * Attach metadata to a node (sycophancy flags, scores, etc.).
 * @param {string} nodeId
 * @param {string} key   — annotation key (e.g., "presupposition_adopted")
 * @param {any}    value — annotation value
 */
function sbAnnotateNode(nodeId, key, value) {
  const entry = _sbAuditGraph.nodes.get(nodeId);
  if (!entry) return;
  entry.annotations.set(key, value);
  
  if (typeof sbDebouncedPersistGraph === "function") {
    sbDebouncedPersistGraph();
  }
}


/**
 * Get a specific annotation from a node.
 * @param {string} nodeId
 * @param {string} key
 * @returns {any} annotation value or undefined
 */
function sbGetAnnotation(nodeId, key) {
  const entry = _sbAuditGraph.nodes.get(nodeId);
  if (!entry) return undefined;
  return entry.annotations.get(key);
}


// ──────────────────────────────────────────────────────────────
// QUERY OPERATIONS
// ──────────────────────────────────────────────────────────────

/**
 * Retrieve a node plus its edges and annotations.
 * @param {string} nodeId
 * @returns {Object|null} { node, edges, annotations } or null
 */
function sbGetNode(nodeId) {
  const entry = _sbAuditGraph.nodes.get(nodeId);
  if (!entry) return null;

  return {
    node:        entry.node,
    edges:       entry.edges.slice(),
    annotations: Object.fromEntries(entry.annotations),
  };
}


/**
 * Return all nodes in chronological order (by turnIndex, then claimIndex).
 * @param {number} [limit] — max nodes to return (most recent)
 * @returns {Object[]} array of { node, edges, annotations }
 */
function sbGetTimeline(limit) {
  const all = [];

  for (const [, entry] of _sbAuditGraph.nodes) {
    all.push({
      node:        entry.node,
      edges:       entry.edges.slice(),
      annotations: Object.fromEntries(entry.annotations),
    });
  }

  // Sort by turnIndex ascending, then claimIndex ascending
  all.sort((a, b) => {
    if (a.node.turnIndex !== b.node.turnIndex) {
      return a.node.turnIndex - b.node.turnIndex;
    }
    return a.node.claimIndex - b.node.claimIndex;
  });

  if (typeof limit === "number" && limit > 0 && all.length > limit) {
    return all.slice(all.length - limit);
  }

  return all;
}


/**
 * Return the full graph as a plain object.
 * @returns {Object} { nodes: { [id]: { node, edges, annotations } }, nodeCount, edgeCount }
 */
function sbGetGraph() {
  const nodes = {};
  let edgeCount = 0;
  const edgeSet = new Set(); // dedup bidirectional edge references

  for (const [id, entry] of _sbAuditGraph.nodes) {
    nodes[id] = {
      node:        entry.node,
      edges:       entry.edges.slice(),
      annotations: Object.fromEntries(entry.annotations),
    };

    for (const edge of entry.edges) {
      const edgeKey = `${edge.fromId}→${edge.toId}:${edge.type}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edgeCount++;
      }
    }
  }

  return {
    nodes,
    nodeCount: _sbAuditGraph.nodes.size,
    edgeCount,
  };
}


/**
 * Get all node IDs for a specific turn.
 * @param {number} turnIndex
 * @returns {string[]} node IDs
 */
function sbGetNodesByTurn(turnIndex) {
  const ids = [];
  for (const [id, entry] of _sbAuditGraph.nodes) {
    if (entry.node.turnIndex === turnIndex) {
      ids.push(id);
    }
  }
  return ids;
}


// ──────────────────────────────────────────────────────────────
// EDGE TYPE INFERENCE
// Determines the relationship between the current turn's claims
// and the previous turn's claims.
//
// Heuristics:
//   - Keyword overlap ≥ 40% → "extends"
//   - Sentiment inversion (positive↔negative) → "contradicts"
//   - Default → "extends" (most common relationship)
// ──────────────────────────────────────────────────────────────

function sbInferEdgeType(prevClaimText, currentClaimText) {
  if (!prevClaimText || !currentClaimText) return "extends";

  // Tokenize (simple word split, lowercase, remove short words)
  const tokenize = text =>
    text.toLowerCase().split(/\W+/).filter(w => w.length > 3);

  const prevTokens = tokenize(prevClaimText);
  const currTokens = tokenize(currentClaimText);

  if (prevTokens.length === 0 || currTokens.length === 0) return "extends";

  // Keyword overlap
  const prevSet = new Set(prevTokens);
  const overlap = currTokens.filter(t => prevSet.has(t)).length;
  const overlapRatio = overlap / Math.max(prevTokens.length, currTokens.length);

  // Contradiction check: negation markers in current that aren't in previous
  const negationPattern = /\b(not|no|isn't|aren't|wasn't|weren't|doesn't|don't|didn't|won't|can't|cannot|shouldn't|wouldn't|never|incorrect|wrong|false)\b/i;
  const prevHasNegation = negationPattern.test(prevClaimText);
  const currHasNegation = negationPattern.test(currentClaimText);

  // If one has negation and the other doesn't, AND high overlap → contradicts
  if (overlapRatio > 0.3 && prevHasNegation !== currHasNegation) {
    return "contradicts";
  }

  // High overlap → extends; low overlap could still be extends (topic continuation)
  return "extends";
}


// ──────────────────────────────────────────────────────────────
// BASELINE STATE
// ──────────────────────────────────────────────────────────────

/**
 * Get the baseline state.
 * @returns {Object|null} baseline state or null
 */
function sbGetBaseline() {
  return _sbAuditGraph.baseline;
}


/**
 * Set the baseline state (called during retroactive ingestion, Phase 1B).
 * @param {Object} baselineState — { userBaseline, aiBaseline, delta, compromised, ... }
 */
function sbSetBaseline(baselineState) {
  _sbAuditGraph.baseline = baselineState;
  
  if (typeof sbDebouncedPersistGraph === "function") {
    sbDebouncedPersistGraph();
  }
}


// ──────────────────────────────────────────────────────────────
// BULK OPERATIONS
// ──────────────────────────────────────────────────────────────

/**
 * Populate the graph from historical turn data (Phase 1B).
 * @param {Object[]} turnsArray — [{ turnIndex, claims: ClaimNode[] }]
 */
function sbPopulateFromHistory(turnsArray) {
  if (!Array.isArray(turnsArray)) return;

  let prevClaims = [];

  for (const turn of turnsArray) {
    if (!turn.claims || turn.claims.length === 0) continue;

    for (const claim of turn.claims) {
      sbAddClaimNode(claim, true); // isHistorical = true
    }

    // Add edges from previous turn's claims to this turn's claims
    if (prevClaims.length > 0 && turn.claims.length > 0) {
      // Connect first claim of this turn to first claim of previous turn
      const prevFirst = prevClaims[0];
      const currFirst = turn.claims[0];
      const edgeType = sbInferEdgeType(prevFirst.claimText, currFirst.claimText);
      sbAddEdge(prevFirst.id, currFirst.id, edgeType);
    }

    prevClaims = turn.claims;
  }
}


// ──────────────────────────────────────────────────────────────
// SERIALIZATION (Phase 6 prep)
// ──────────────────────────────────────────────────────────────

/**
 * Serialize the graph to a JSON-safe plain object.
 * @returns {Object} serializable snapshot
 */
function sbSerializeGraph() {
  const nodes = {};

  for (const [id, entry] of _sbAuditGraph.nodes) {
    nodes[id] = {
      node:        entry.node,
      edges:       entry.edges,
      annotations: Object.fromEntries(entry.annotations),
    };
  }

  return {
    nodes,
    insertionOrder: _sbAuditGraph.insertionOrder.slice(),
    baseline:       _sbAuditGraph.baseline,
    version:        1,
  };
}


/**
 * Restore the graph from a serialized snapshot.
 * @param {Object} snapshot — from sbSerializeGraph()
 */
function sbDeserializeGraph(snapshot) {
  if (!snapshot || !snapshot.nodes || snapshot.version !== 1) {
    console.warn("[Dissent] sbDeserializeGraph: invalid snapshot");
    return;
  }

  sbResetGraph();

  for (const [id, data] of Object.entries(snapshot.nodes)) {
    const entry = {
      node:        data.node,
      edges:       data.edges || [],
      annotations: new Map(Object.entries(data.annotations || {})),
    };
    _sbAuditGraph.nodes.set(id, entry);
  }

  _sbAuditGraph.insertionOrder = snapshot.insertionOrder || [];
  _sbAuditGraph.baseline = snapshot.baseline || null;
}


// ──────────────────────────────────────────────────────────────
// PERSISTENCE (Phase 6)
// ──────────────────────────────────────────────────────────────

let _sbPersistTimeout = null;

async function sbPersistGraph() {
  if (!SB_CONFIG.auditPersistence) return;
  try {
    const data = sbSerializeGraph();
    const key = "audit_graph_" + btoa(encodeURIComponent(location.href));
    await chrome.storage.session.set({ [key]: data });
  } catch (err) {
    console.warn("[Dissent] Failed to persist graph:", err);
  }
}

function sbDebouncedPersistGraph() {
  if (_sbPersistTimeout) clearTimeout(_sbPersistTimeout);
  _sbPersistTimeout = setTimeout(() => {
    sbPersistGraph();
  }, 2000); // 2 second debounce
}

async function sbRestoreGraph() {
  if (!SB_CONFIG.auditPersistence) return false;
  try {
    const key = "audit_graph_" + btoa(encodeURIComponent(location.href));
    const result = await chrome.storage.session.get(key);
    if (result[key]) {
      sbDeserializeGraph(result[key]);
      return true;
    }
  } catch (err) {
    console.warn("[Dissent] Failed to restore graph:", err);
  }
  return false;
}


// ──────────────────────────────────────────────────────────────
// RESET
// ──────────────────────────────────────────────────────────────

/**
 * Clear all graph state. Called on SPA navigation / new conversation.
 */
function sbResetGraph() {
  _sbAuditGraph.nodes.clear();
  _sbAuditGraph.insertionOrder = [];
  _sbAuditGraph.baseline = null;
}

if (typeof module !== "undefined") {
  module.exports = {
    sbAddClaimNode,
    sbAddEdge,
    sbAnnotateNode,
    sbGetAnnotation,
    sbGetNode,
    sbGetTimeline,
    sbGetGraph,
    sbGetNodesByTurn,
    sbGetBaseline,
    sbSetBaseline,
    sbPopulateFromHistory,
    sbSerializeGraph,
    sbDeserializeGraph,
    sbPersistGraph,
    sbRestoreGraph,
    sbResetGraph
  };
}
