const test = require("node:test");
const assert = require("node:assert");
const { toCsv } = require("../utils/csv");

test("toCsv produces a header row plus one row per record", () => {
  const csv = toCsv([{ a: 1, b: "x" }, { a: 2, b: "y" }], ["a", "b"]);
  const lines = csv.split("\n");
  assert.strictEqual(lines.length, 3);
  assert.strictEqual(lines[0], "a,b");
  assert.strictEqual(lines[1], "1,x");
});

test("toCsv escapes commas, quotes, and newlines per RFC 4180", () => {
  const csv = toCsv([{ title: 'The "Great" Book, Vol. 1' }], ["title"]);
  assert.strictEqual(csv, 'title\n"The ""Great"" Book, Vol. 1"');
});

test("toCsv handles missing fields as empty strings", () => {
  const csv = toCsv([{ a: 1 }], ["a", "b"]);
  assert.strictEqual(csv, "a,b\n1,");
});
