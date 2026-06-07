// Validate popup.html structure
const h = require("fs").readFileSync("popup.html", "utf8");

const opens = (h.match(/<div/g) || []).length;
const closes = (h.match(/<\/div>/g) || []).length;
console.log("DIV tags:", opens, "open,", closes, "close", opens === closes ? "✓" : "✕ MISMATCH");

const secO = (h.match(/<section/g) || []).length;
const secC = (h.match(/<\/section>/g) || []).length;
console.log("SECTION:", secO, "open,", secC, "close", secO === secC ? "✓" : "✕ MISMATCH");

const ids = h.match(/id="[^"]+"/g) || [];
const unique = new Set(ids);
console.log("IDs:", ids.length, "total,", unique.size, "unique", ids.length === unique.size ? "✓" : "✕ DUPES");

if (ids.length !== unique.size) {
  const seen = {};
  ids.forEach(id => { seen[id] = (seen[id] || 0) + 1; });
  Object.entries(seen).filter(([, c]) => c > 1).forEach(([id, c]) => {
    console.log("  DUPE:", id, "×" + c);
  });
}

// Verify all referenced IDs from popup.js exist in popup.html
const js = require("fs").readFileSync("popup.js", "utf8");
const refs = js.match(/getElementById\("([^"]+)"\)/g) || [];
console.log("\nJS→HTML ID references:");
refs.forEach(r => {
  const id = r.match(/"([^"]+)"/)[1];
  const found = h.includes('id="' + id + '"');
  console.log(found ? "  ✓" : "  ✕ MISSING:", id);
});

console.log("\nDone!");
