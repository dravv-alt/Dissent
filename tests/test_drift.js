const assert = require('assert');
const { sbBuildHistogram, sbMergeHistograms, sbComputeKLDivergence, sbComputeDrift, sbResetDriftState } = require('../content/drift.js');

function runTests() {
  console.log("── sbBuildHistogram ──");
  
  const hist = sbBuildHistogram("The quick brown fox jumps over the lazy dog");
  assert.strictEqual(hist.get("the"), 2, "Should count 'the' twice");
  assert.strictEqual(hist.get("quick"), 1, "Should count 'quick' once");
  assert.strictEqual(hist.has("over"), true, "Should include 'over'");
  
  console.log("  ✓ sbBuildHistogram passes");

  console.log("── sbComputeKLDivergence ──");
  
  const histP = sbBuildHistogram("apple banana cherry");
  const histQ = sbBuildHistogram("apple banana cherry");
  const dKL1 = sbComputeKLDivergence(histP, histQ);
  assert.strictEqual(dKL1, 0, "Identical distributions should have 0 divergence");

  const histP2 = sbBuildHistogram("apple apple apple");
  const histQ2 = sbBuildHistogram("banana cherry date");
  const dKL2 = sbComputeKLDivergence(histP2, histQ2);
  assert.ok(dKL2 > 0, "Different distributions should have >0 divergence");
  
  console.log("  ✓ sbComputeKLDivergence passes");

  console.log("── sbComputeDrift ──");

  sbResetDriftState();

  const graphWithoutDrift = [
    { id: "a1", speaker: "AI", text: "apple banana cherry date" },
    { id: "a2", speaker: "AI", text: "apple banana cherry date" },
    { id: "a3", speaker: "AI", text: "apple banana cherry date" },
    { id: "a4", speaker: "AI", text: "fig grape honeydew kiwi" } // Complete topic change
  ];

  const result1 = sbComputeDrift(graphWithoutDrift);
  assert.strictEqual(result1, null, "Should not detect drift when vocab shifts to new words (D_KL increases)");
  console.log("  ✓ Graph without drift passes");

  sbResetDriftState();

  const graphWithDrift = [
    { id: "a1", speaker: "AI", text: "formal strict objective precise" },
    { id: "a2", speaker: "AI", text: "formal strict objective precise" },
    { id: "a3", speaker: "AI", text: "formal strict objective precise" },
    // DKL will be 0 if next is identical. We simulate previous DKL being high by passing a different one first
    { id: "a4", speaker: "AI", text: "very different completely unrelated words here" }, // This sets previous DKL high
    { id: "a5", speaker: "AI", text: "formal strict objective precise" }  // This sets current DKL to 0, meaning huge velocity (convergence)
  ];

  // Turn 4
  sbComputeDrift(graphWithDrift.slice(0, 4));
  
  // Turn 5
  const result2 = sbComputeDrift(graphWithDrift);
  assert.ok(result2 !== null, "Should detect drift on rapid convergence (high velocity)");
  assert.strictEqual(result2.sycophancyType, "vocabulary_convergence");
  assert.ok(result2.velocity > 0.08, "Velocity should exceed threshold");

  console.log("  ✓ Graph with drift passes");

  console.log("✅ All drift tests passed.");
}

runTests();
