// Deterministic pseudo-random helpers for demo/mock UI data.
// A given seed string always produces the same sequence, so mocked
// values stay stable across re-renders instead of flickering, but
// still vary with the filters you seed them with.

function seededRng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Deterministic float in [min, max) for the given seed string. */
export function seededRange(seed, min, max) {
  return min + seededRng(seed)() * (max - min);
}

/** Deterministic pick from an array for the given seed string. */
export function seededPick(seed, options) {
  return options[Math.floor(seededRng(seed)() * options.length)];
}