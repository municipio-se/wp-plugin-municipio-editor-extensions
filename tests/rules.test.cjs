const { test } = require("node:test");
const assert = require("node:assert/strict");
const { warnings, sameSelection } = require("../assets/editor.js");

test("known parent and heading jumps", () => {
  assert.deepEqual(warnings([1], 1), [
    { type: "parent", level: 1, expected: 2 },
  ]);
  assert.deepEqual(warnings([3], 1), [{ type: "skip", level: 3, expected: 2 }]);
  assert.deepEqual(warnings([2, 4], 1), [
    null,
    { type: "skip", level: 4, expected: 3 },
  ]);
  assert.deepEqual(warnings([2, 3, 3, 4, 2], 1), [
    null,
    null,
    null,
    null,
    null,
  ]);
  assert.deepEqual(warnings([4, 3, 2], 3).map(Boolean), [false, true, true]);
});

test("unknown context only checks internal downward jumps", () => {
  assert.deepEqual(warnings([3], null), [null]);
  assert.deepEqual(warnings([3, 3, 4, 2], null), [null, null, null, null]);
  assert.deepEqual(warnings([2, 4], null), [
    null,
    { type: "skip", level: 4, expected: 3 },
  ]);
  assert.deepEqual(warnings([1], undefined), [null]);
});

test("Escape compares actual selection, including direction and node identity", () => {
  const a = {},
    b = {};
  assert.equal(sameSelection([a, 0, b, 2], [a, 0, b, 2]), true);
  assert.equal(sameSelection([a, 0, b, 2], [a, 1, b, 2]), false);
  assert.equal(sameSelection([a, 0, b, 2], [b, 2, a, 0]), false);
  assert.equal(sameSelection([a, 0, b, 2], [{}, 0, b, 2]), false);
});
