export function createRateLimiter(limit: number, windowMs: number) {
  const windows = new Map<string, { count: number; since: number }>();

  function prune(now: number): void {
    for (const [key, entry] of windows) {
      if (now - entry.since >= windowMs) {
        windows.delete(key);
      }
    }
  }

  function take(key: string, now: number): { allowed: boolean; retryAfterSeconds: number } {
    if (windows.size > 10_000) {
      prune(now);
    }
    const entry = windows.get(key);
    if (!entry || now - entry.since >= windowMs) {
      windows.set(key, { count: 1, since: now });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    return {
      allowed: entry.count <= limit,
      retryAfterSeconds: Math.ceil((entry.since + windowMs - now) / 1000),
    };
  }

  return { take };
}
