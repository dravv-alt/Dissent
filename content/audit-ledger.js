// ============================================================
// Dissent — Audit Ledger (Phase 1)
// Canonical chronological log of all behavioral events.
// Single source of truth for both real-time UI and historical
// analysis.
//
// Design decisions:
//   - Append-only log (events are never modified or deleted)
//   - Monotonically incrementing event IDs
//   - Supports filtering by eventType, source, turnIndex
//   - isHistorical flag for retroactive ingestion events
//   - Max 500 events (ring buffer to prevent unbounded growth)
// ============================================================

// ──────────────────────────────────────────────────────────────
// LEDGER STATE
// ──────────────────────────────────────────────────────────────

const _sbAuditLedger = {
  events: [],
  nextId: 1,
  maxEvents: (typeof SB_CONFIG !== 'undefined') ? SB_CONFIG.MAX_LEDGER_EVENTS : 500,
};


// ──────────────────────────────────────────────────────────────
// EVENT LOGGING
// ──────────────────────────────────────────────────────────────

/**
 * Append a behavioral event to the ledger.
 *
 * @param {string} eventType    — e.g., "claim_extracted", "sycophancy_detected",
 *                                 "position_changed", "annotation_added",
 *                                 "history_ingested", "baseline_established",
 *                                 "compromised_baseline"
 * @param {string} source       — e.g., "claim-extractor", "detector", "tracker",
 *                                 "audit-annotations", "retroactive-ingestion"
 * @param {number} turnIndex    — which conversation turn this event relates to
 * @param {Object} payload      — event-specific data
 * @param {boolean} [isHistorical=false] — true if generated during retroactive ingestion
 * @returns {Object} the created event
 */
function sbLogEvent(eventType, source, turnIndex, payload, isHistorical) {
  const event = {
    eventId:      "evt_" + _sbAuditLedger.nextId++,
    timestamp:    Date.now(),
    turnIndex:    typeof turnIndex === "number" ? turnIndex : -1,
    eventType:    eventType || "unknown",
    source:       source || "unknown",
    payload:      payload || {},
    isHistorical: isHistorical === true,
  };

  _sbAuditLedger.events.push(event);

  // Ring buffer eviction
  if (_sbAuditLedger.events.length > _sbAuditLedger.maxEvents) {
    _sbAuditLedger.events.shift();
  }

  return event;
}


// ──────────────────────────────────────────────────────────────
// EVENT QUERYING
// ──────────────────────────────────────────────────────────────

/**
 * Get events matching an optional filter.
 *
 * @param {Object} [filter] — optional filter object
 * @param {string} [filter.eventType]    — filter by eventType
 * @param {string} [filter.source]       — filter by source
 * @param {boolean} [filter.isHistorical]— filter by historical flag
 * @param {number} [filter.limit]        — max events to return (most recent)
 * @returns {Object[]} matching events (chronological order)
 */
function sbGetEvents(filter) {
  let result = _sbAuditLedger.events;

  if (filter) {
    if (filter.eventType) {
      result = result.filter(e => e.eventType === filter.eventType);
    }
    if (filter.source) {
      result = result.filter(e => e.source === filter.source);
    }
    if (typeof filter.isHistorical === "boolean") {
      result = result.filter(e => e.isHistorical === filter.isHistorical);
    }
    if (typeof filter.limit === "number" && filter.limit > 0 && result.length > filter.limit) {
      result = result.slice(result.length - filter.limit);
    }
  }

  return result;
}


/**
 * Get all events for a specific turn.
 * @param {number} turnIndex
 * @returns {Object[]} events for that turn (chronological order)
 */
function sbGetEventsByTurn(turnIndex) {
  return _sbAuditLedger.events.filter(e => e.turnIndex === turnIndex);
}


/**
 * Get the total number of events in the ledger.
 * @returns {number}
 */
function sbGetEventCount() {
  return _sbAuditLedger.events.length;
}


// ──────────────────────────────────────────────────────────────
// RESET
// ──────────────────────────────────────────────────────────────

/**
 * Clear all ledger state. Called on SPA navigation / new conversation.
 */
function sbResetLedger() {
  _sbAuditLedger.events = [];
  _sbAuditLedger.nextId = 1;
}
