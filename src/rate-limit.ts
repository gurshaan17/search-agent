export class RateLimiter {
  private entries = new Map<string, { count: number; resetAt: number }>();
  constructor(private limit = 20, private windowMs = 60000) {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1) throw new Error('Invalid rate limit.');
  }
  take(ip: string, now = Date.now()) {
    let entry = this.entries.get(ip);
    if (!entry || now >= entry.resetAt) {
      this.entries.delete(ip);
      // Bound memory without a background timer or trusting forwarded IP headers.
      if (this.entries.size >= 4096) {
        for (const [key, value] of this.entries) if (now >= value.resetAt) this.entries.delete(key);
        if (this.entries.size >= 4096) return { allowed: false, retryAfter: Math.ceil(this.windowMs / 1000) };
      }
      entry = { count: 0, resetAt: now + this.windowMs };
      this.entries.set(ip, entry);
    }
    const allowed = entry.count < this.limit;
    if (allowed) entry.count++;
    return { allowed, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
}
