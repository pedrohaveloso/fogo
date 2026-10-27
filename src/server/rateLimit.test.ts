import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimit.ts";

describe("rate limiter", () => {
  it("allows up to the limit inside a window and reports when to retry", () => {
    const limiter = createRateLimiter(2, 1000);
    expect(limiter.take("a", 0).allowed).toBe(true);
    expect(limiter.take("a", 100).allowed).toBe(true);
    expect(limiter.take("a", 200)).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it("starts a new window once the old one ends", () => {
    const limiter = createRateLimiter(1, 1000);
    limiter.take("a", 0);
    expect(limiter.take("a", 999).allowed).toBe(false);
    expect(limiter.take("a", 1000).allowed).toBe(true);
  });

  it("counts each key on its own", () => {
    const limiter = createRateLimiter(1, 1000);
    limiter.take("a", 0);
    expect(limiter.take("b", 0).allowed).toBe(true);
  });
});
