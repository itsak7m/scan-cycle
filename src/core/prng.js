/* Namespace + seeded PRNG (mulberry32). No Math.random anywhere in core. */
(function () {
  'use strict';
  const SC = (globalThis.SC = globalThis.SC || {});
  SC.SCAN_MS = 10;

  // The generator state lives in the owner object as an int field `rng`,
  // so a state object stays a plain, clonable value (pure functions stay pure).
  function next(o) {
    o.rng = (o.rng + 0x6D2B79F5) | 0;
    let t = o.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const range = (o, lo, hi) => lo + (hi - lo) * next(o);
  const int = (o, lo, hi) => lo + Math.floor(next(o) * (hi - lo + 1));
  const seedOf = (n) => (Math.imul(n | 0, 0x9E3779B1) ^ 0x85EBCA6B) | 0;

  SC.prng = { next, range, int, seedOf };

  // small shared helpers (pure)
  SC.util = {
    clone: (x) => JSON.parse(JSON.stringify(x)),
    isObj: (x) => x !== null && typeof x === 'object' && !Array.isArray(x),
    clamp: (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x),
  };
})();
