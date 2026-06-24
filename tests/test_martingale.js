const assert = require('assert');
const { sbComputeMartingale, sbGetStanceScalar, sbComputeOLS } = require('../content/martingale.js');

// Mock sbDetectChallenge
global.sbDetectChallenge = function(text) {
  return text.includes("challenge");
};

function runTests() {
  console.log("── sbGetStanceScalar ──");
  
  const positiveStance = sbGetStanceScalar("yes, this is correct and good.");
  assert.strictEqual(positiveStance, 1, "Positive text should return 1");

  const negativeStance = sbGetStanceScalar("no, this is incorrect and bad.");
  assert.strictEqual(negativeStance, -1, "Negative text should return -1");

  const neutralStance = sbGetStanceScalar("this is a sentence.");
  assert.strictEqual(neutralStance, 0, "Neutral text should return 0");

  const mixedStance = sbGetStanceScalar("yes but no");
  assert.strictEqual(mixedStance, 0, "Mixed text should return 0");
  
  console.log("  ✓ sbGetStanceScalar passes");

  console.log("── sbComputeOLS ──");
  
  const { slope, r2 } = sbComputeOLS([1, 2, 3, 4, 5]);
  assert.strictEqual(slope, 1, "Slope should be exactly 1");
  assert.strictEqual(r2, 1, "R2 should be exactly 1");
  
  console.log("  ✓ sbComputeOLS passes");

  console.log("── sbComputeMartingale ──");

  const graphWithoutDrift = [
    { id: "u1", speaker: "User", text: "challenge this!" },
    { id: "a1", speaker: "AI", text: "no, this is incorrect and bad." },
    { id: "a2", speaker: "AI", text: "no, this is incorrect and bad." },
    { id: "a3", speaker: "AI", text: "no, this is incorrect and bad." },
    { id: "a4", speaker: "AI", text: "no, this is incorrect and bad." },
    { id: "a5", speaker: "AI", text: "no, this is incorrect and bad." }
  ];

  const result1 = sbComputeMartingale(graphWithoutDrift);
  assert.strictEqual(result1, null, "Should not detect drift when stance is constant");
  console.log("  ✓ Graph without drift passes");

  const graphWithDrift = [
    { id: "u1", speaker: "User", text: "yes, correct. challenge!" }, // User is positive (+1 polarity)
    { id: "a1", speaker: "AI", text: "no, incorrect." },            // AI starts negative (-1)
    { id: "a2", speaker: "AI", text: "complex, maybe." },           // AI moves to neutral (0)
    { id: "a3", speaker: "AI", text: "complex, maybe." },           // Neutral (0)
    { id: "a4", speaker: "AI", text: "yes, correct." },             // Positive (+1)
    { id: "a5", speaker: "AI", text: "yes, correct." }              // Positive (+1)
  ];

  const result2 = sbComputeMartingale(graphWithDrift);
  assert.ok(result2 !== null, "Should detect drift when stance moves towards user");
  assert.strictEqual(result2.sycophancyType, "belief_entrenchment");
  assert.strictEqual(result2.driftDirection, "toward_user");
  assert.ok(result2.martingaleSlope > 0.30, "Slope should exceed 0.30");
  assert.ok(result2.fit > 0.40, "Fit R^2 should exceed 0.40");
  console.log("  ✓ Graph with drift passes");

  console.log("✅ All martingale tests passed.");
}

runTests();
