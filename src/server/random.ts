export type Random = {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  chance: (probability: number) => boolean;
  normal: (mean: number, deviation: number) => number;
  poisson: (lambda: number) => number;
  weighted: <T>(items: readonly T[], weight: (item: T) => number) => T;
};

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const random: Random = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) {
        throw new Error("Não é possível sortear de uma lista vazia");
      }
      return items[Math.floor(next() * items.length)]!;
    },
    chance: (probability) => next() < probability,
    normal: (mean, deviation) => {
      const u = 1 - next();
      const v = next();
      return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    poisson: (lambda) => {
      if (lambda <= 0) {
        return 0;
      }
      if (lambda > 30) {
        return Math.max(0, Math.round(random.normal(lambda, Math.sqrt(lambda))));
      }
      const limit = Math.exp(-lambda);
      let count = 0;
      let product = next();
      while (product > limit) {
        count += 1;
        product *= next();
      }
      return count;
    },
    weighted: (items, weight) => {
      const total = items.reduce((sum, item) => sum + weight(item), 0);
      let threshold = next() * total;
      for (const item of items) {
        threshold -= weight(item);
        if (threshold <= 0) {
          return item;
        }
      }
      return items.at(-1)!;
    },
  };
  return random;
}
