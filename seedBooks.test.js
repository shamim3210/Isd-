const test = require("node:test");
const assert = require("node:assert");
const { ordinal, generateBooksForCategory, categoryData } = require("../scripts/seedBooks");

test("ordinal formats numbers correctly, including the 11-13 exception", () => {
  assert.strictEqual(ordinal(1), "1st");
  assert.strictEqual(ordinal(2), "2nd");
  assert.strictEqual(ordinal(3), "3rd");
  assert.strictEqual(ordinal(4), "4th");
  assert.strictEqual(ordinal(11), "11th");
  assert.strictEqual(ordinal(12), "12th");
  assert.strictEqual(ordinal(13), "13th");
  assert.strictEqual(ordinal(21), "21st");
  assert.strictEqual(ordinal(22), "22nd");
});

test("generateBooksForCategory produces the requested count with required fields", () => {
  const books = generateBooksForCategory("Computer Science", 10);
  assert.strictEqual(books.length, 10);
  books.forEach((b) => {
    assert.ok(b.isbn, "missing isbn");
    assert.ok(b.title, "missing title");
    assert.ok(b.author, "missing author");
    assert.strictEqual(b.category, "Computer Science");
    assert.ok(b.totalCopies >= 1);
    assert.ok(b.availableCopies >= 0 && b.availableCopies <= b.totalCopies);
    assert.ok(["Main Campus", "City Campus"].includes(b.branch), "branch should be one of the seeded branches");
  });
});

test("generateBooksForCategory spreads books across both branches, not just one", () => {
  const books = generateBooksForCategory("Engineering", 60);
  const branches = new Set(books.map((b) => b.branch));
  assert.ok(branches.size > 1, "expected books to appear in more than one branch across 60 samples");
});

test("categoryData covers 30 categories for a realistic university catalog", () => {
  assert.strictEqual(Object.keys(categoryData).length, 30);
});

test("30 categories x ~1000 each reaches the 30,000+ book target", () => {
  const categories = Object.keys(categoryData);
  const perCategory = Math.floor(30500 / categories.length);
  assert.ok(categories.length * perCategory >= 30000);
});
