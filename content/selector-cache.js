// ============================================================
// Dissent — Selector Cache (Self-Healing)
// content/selector-cache.js
//
// Session-scoped cache that remembers which resolution strategy
// succeeded for each (platform, target) pair. Provides fast-path
// lookups on subsequent calls, with TTL-based re-validation and
// SPA navigation invalidation.
//
// Loaded after platforms.js, before contract.js.
//
// Public API:
//   _sbCachedResolve(target, platformKey) → SelectorResolution
//   _sbInvalidateCache()                  — clears all entries
//   _sbGetCacheStats()                    → { hits, misses, revalidations }
// ============================================================

// Cache TTL — re-validate after this many milliseconds
const _SB_CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes

// Max retries when DOM is not yet ready (lazy-loaded)
const _SB_LAZY_MAX_RETRIES = 3;
const _SB_LAZY_BASE_DELAY_MS = 2000;

// ──────────────────────────────────────────────────────────────
// CACHE STORE
// Key format: "responses:claude.ai" → CacheEntry
// ──────────────────────────────────────────────────────────────

const _sbSelectorCache = new Map();

// Stats for diagnostics
const _sbCacheStats = {
  hits: 0,
  misses: 0,
  revalidations: 0,
  invalidations: 0,
};

// Pending lazy retries — Map of cacheKey → { retries, timerId }
const _sbPendingRetries = new Map();


// ──────────────────────────────────────────────────────────────
// CACHE ENTRY
// ──────────────────────────────────────────────────────────────

function _sbMakeCacheEntry(resolution, timestamp) {
  return {
    resolution: resolution,
    timestamp:  timestamp || Date.now(),
    strategy:   resolution.strategy,
    selector:   resolution.selector,
  };
}

function _sbCacheKey(target, platformKey) {
  return target + ":" + platformKey;
}


// ──────────────────────────────────────────────────────────────
// CORE: CACHED RESOLVE
//
// Called by sbQueryResponses/sbQueryInput/sbQueryContainer in
// platforms.js. Checks cache first, then resolves if miss/expired.
// ──────────────────────────────────────────────────────────────

function _sbCachedResolve(target, platformKey) {
  if (!platformKey) {
    return (typeof _SB_EMPTY_RESOLUTION !== "undefined")
      ? _SB_EMPTY_RESOLUTION
      : { elements: [], strategy: "none", selector: "", confidence: 0 };
  }

  const key = _sbCacheKey(target, platformKey);
  const now = Date.now();

  // ── Cache hit? ──
  const entry = _sbSelectorCache.get(key);
  if (entry) {
    // Check TTL
    if (now - entry.timestamp < _SB_CACHE_TTL_MS) {
      // Try the cached strategy first (fast path)
      const fastResult = _sbRetryCachedStrategy(target, platformKey, entry);
      if (fastResult && fastResult.elements.length > 0) {
        _sbCacheStats.hits++;
        // Update the resolution tracking
        _sbUpdateLastResolution(target, fastResult);
        return fastResult;
      }
      // Cached strategy failed — fall through to full resolution
      _sbCacheStats.revalidations++;
    } else {
      // TTL expired — need re-validation
      _sbCacheStats.revalidations++;
    }
  } else {
    _sbCacheStats.misses++;
  }

  // ── Full resolution ──
  const resolution = _sbFullResolve(target, platformKey);

  // Cache the result (even if empty — to avoid repeated full scans)
  _sbSelectorCache.set(key, _sbMakeCacheEntry(resolution, now));

  // Update resolution tracking
  _sbUpdateLastResolution(target, resolution);

  // If nothing found and we haven't exhausted retries, schedule lazy retry
  if (resolution.elements.length === 0 && resolution.strategy === "none") {
    _sbScheduleLazyRetry(target, platformKey);
  } else {
    // Found something — clear any pending retry
    _sbCancelLazyRetry(target, platformKey);
  }

  return resolution;
}


// ──────────────────────────────────────────────────────────────
// FAST PATH — retry the cached strategy specifically
// ──────────────────────────────────────────────────────────────

function _sbRetryCachedStrategy(target, platformKey, entry) {
  const p = (typeof SB_PLATFORMS !== "undefined") ? SB_PLATFORMS[platformKey] : null;
  if (!p) return null;

  // If the cached strategy was "chain", re-try only that specific selector
  if (entry.strategy === "chain" && entry.selector) {
    try {
      if (target === "responses") {
        const result = document.querySelectorAll(entry.selector);
        if (result && result.length > 0) {
          return _sbMakeResolution(
            Array.from(result), "chain", entry.selector, 1.0
          );
        }
      } else {
        const result = document.querySelector(entry.selector);
        if (result) {
          return _sbMakeResolution([result], "chain", entry.selector, 1.0);
        }
      }
    } catch (_) { /* selector may have become invalid */ }
  }

  // For non-chain strategies, we can't cache-shortcut easily,
  // so return null to trigger full resolution
  return null;
}


// ──────────────────────────────────────────────────────────────
// FULL RESOLUTION — delegates to sbResolve* functions
// ──────────────────────────────────────────────────────────────

function _sbFullResolve(target, platformKey) {
  switch (target) {
    case "responses":
      return (typeof sbResolveResponses === "function")
        ? sbResolveResponses(platformKey)
        : { elements: [], strategy: "none", selector: "", confidence: 0 };
    case "input":
      return (typeof sbResolveInput === "function")
        ? sbResolveInput(platformKey)
        : { elements: [], strategy: "none", selector: "", confidence: 0 };
    case "container":
      return (typeof sbResolveContainer === "function")
        ? sbResolveContainer(platformKey)
        : { elements: [document.body], strategy: "none", selector: "fallback-body", confidence: 0 };
    default:
      return { elements: [], strategy: "none", selector: "", confidence: 0 };
  }
}


// ──────────────────────────────────────────────────────────────
// RESOLUTION TRACKING
// ──────────────────────────────────────────────────────────────

function _sbUpdateLastResolution(target, resolution) {
  if (typeof _sbLastResolution !== "undefined" && _sbLastResolution) {
    _sbLastResolution[target] = resolution;
  }
}


// ──────────────────────────────────────────────────────────────
// LAZY DOM RETRY
//
// When the DOM hasn't loaded yet (e.g., SPA still rendering),
// schedule retries with exponential backoff. Max 3 retries.
// ──────────────────────────────────────────────────────────────

function _sbScheduleLazyRetry(target, platformKey) {
  const key = _sbCacheKey(target, platformKey);
  const pending = _sbPendingRetries.get(key);

  // Already at max retries
  const currentRetries = pending ? pending.retries : 0;
  if (currentRetries >= _SB_LAZY_MAX_RETRIES) return;

  // Calculate delay with exponential backoff: 2s, 4s, 8s
  const delay = _SB_LAZY_BASE_DELAY_MS * Math.pow(2, currentRetries);

  const timerId = setTimeout(() => {
    _sbPendingRetries.delete(key);

    // Re-resolve
    const resolution = _sbFullResolve(target, platformKey);
    if (resolution.elements.length > 0) {
      // Success! Update cache
      _sbSelectorCache.set(key, _sbMakeCacheEntry(resolution));
      _sbUpdateLastResolution(target, resolution);
      console.log(
        `[Dissent] Lazy retry succeeded for ${target} (attempt ${currentRetries + 1})`,
        resolution.strategy
      );
    } else {
      // Schedule another retry
      _sbScheduleLazyRetry(target, platformKey);
    }
  }, delay);

  _sbPendingRetries.set(key, {
    retries: currentRetries + 1,
    timerId: timerId,
  });
}

function _sbCancelLazyRetry(target, platformKey) {
  const key = _sbCacheKey(target, platformKey);
  const pending = _sbPendingRetries.get(key);
  if (pending) {
    clearTimeout(pending.timerId);
    _sbPendingRetries.delete(key);
  }
}


// ──────────────────────────────────────────────────────────────
// INVALIDATION
//
// Called on SPA navigation (URL change) or manual reset.
// ──────────────────────────────────────────────────────────────

function _sbInvalidateCache() {
  _sbSelectorCache.clear();
  _sbCacheStats.invalidations++;

  // Cancel all pending lazy retries
  for (const [key, pending] of _sbPendingRetries) {
    clearTimeout(pending.timerId);
  }
  _sbPendingRetries.clear();

  // Clear resolution tracking
  if (typeof _sbLastResolution !== "undefined" && _sbLastResolution) {
    _sbLastResolution.responses = null;
    _sbLastResolution.input = null;
    _sbLastResolution.container = null;
  }
}


// ──────────────────────────────────────────────────────────────
// DIAGNOSTICS
// ──────────────────────────────────────────────────────────────

function _sbGetCacheStats() {
  return {
    hits:           _sbCacheStats.hits,
    misses:         _sbCacheStats.misses,
    revalidations:  _sbCacheStats.revalidations,
    invalidations:  _sbCacheStats.invalidations,
    cacheSize:      _sbSelectorCache.size,
    pendingRetries: _sbPendingRetries.size,
  };
}
