const test = require("node:test");
const assert = require("node:assert");
const { isValidEmail, isStrongEnoughPassword, validateRegisterInput, validateBookInput } = require("../utils/validators");

test("isValidEmail accepts well-formed emails", () => {
  assert.strictEqual(isValidEmail("student@seu.edu.bd"), true);
  assert.strictEqual(isValidEmail("a.b+c@example.com"), true);
});

test("isValidEmail rejects malformed emails", () => {
  assert.strictEqual(isValidEmail("not-an-email"), false);
  assert.strictEqual(isValidEmail("missing@domain"), false);
  assert.strictEqual(isValidEmail(""), false);
  assert.strictEqual(isValidEmail(undefined), false);
});

test("isStrongEnoughPassword enforces a 6 character minimum", () => {
  assert.strictEqual(isStrongEnoughPassword("12345"), false);
  assert.strictEqual(isStrongEnoughPassword("123456"), true);
  assert.strictEqual(isStrongEnoughPassword(""), false);
});

test("validateRegisterInput flags every missing field", () => {
  const errors = validateRegisterInput({ name: "", email: "bad", password: "123" });
  assert.strictEqual(errors.length, 3);
});

test("validateRegisterInput passes for good input", () => {
  const errors = validateRegisterInput({ name: "Nusrat Jahan", email: "nusrat@seu.edu.bd", password: "password123" });
  assert.strictEqual(errors.length, 0);
});

test("validateBookInput requires title, author, isbn, category", () => {
  const errors = validateBookInput({ title: "", author: "", isbn: "", category: "" });
  assert.strictEqual(errors.length, 4);
});

test("validateBookInput passes for a complete book", () => {
  const errors = validateBookInput({
    title: "Introduction to Algorithms",
    author: "Thomas H. Cormen",
    isbn: "978-1000000000",
    category: "Computer Science",
  });
  assert.strictEqual(errors.length, 0);
});

// --- Librarian/admin registration security ---

test("resolveRegistrationRole always gives 'student' when librarian isn't requested", () => {
  const { resolveRegistrationRole } = require("../utils/validators");
  const result = resolveRegistrationRole("student", "", "SECRET123");
  assert.deepStrictEqual(result, { role: "student" });
});

test("resolveRegistrationRole ignores an 'admin' request entirely and treats it as student", () => {
  const { resolveRegistrationRole } = require("../utils/validators");
  const result = resolveRegistrationRole("admin", "", "SECRET123");
  assert.deepStrictEqual(result, { role: "student" });
});

test("resolveRegistrationRole allows librarian self-registration without a code", () => {
  const { resolveRegistrationRole } = require("../utils/validators");
  assert.deepStrictEqual(resolveRegistrationRole("librarian", "", undefined), { role: "librarian" });
});

test("resolveRegistrationRole ignores librarian code values", () => {
  const { resolveRegistrationRole } = require("../utils/validators");
  assert.deepStrictEqual(resolveRegistrationRole("librarian", "wrong-code", "SECRET123"), { role: "librarian" });
  assert.deepStrictEqual(resolveRegistrationRole("librarian", undefined, "SECRET123"), { role: "librarian" });
});

test("resolveRegistrationRole grants librarian role", () => {
  const { resolveRegistrationRole } = require("../utils/validators");
  assert.deepStrictEqual(resolveRegistrationRole("librarian"), { role: "librarian" });
});
