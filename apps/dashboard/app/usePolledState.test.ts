import { describe, it, expect } from "vitest";
import { pollBackoffMs } from "./usePolledState";

// The hook itself can't run under this project's node (no-DOM) test environment, so the
// backoff curve is extracted as a pure function and tested here. These lock in the two
// properties that matter for the "board stopped refreshing" class of bug: a healthy poll
// stays at the base interval, and a failing one recovers to a bounded ceiling rather than
// the old 30s that read as frozen.
describe("pollBackoffMs", () => {
  const BASE = 1000;

  it("polls at the base interval when the last request succeeded", () => {
    expect(pollBackoffMs(0, BASE)).toBe(BASE);
  });

  it("backs off exponentially on consecutive failures", () => {
    expect(pollBackoffMs(1, BASE)).toBe(2000);
    expect(pollBackoffMs(2, BASE)).toBe(4000);
    expect(pollBackoffMs(3, BASE)).toBe(8000);
  });

  it("caps the backoff so a recovered server is picked up promptly", () => {
    // 2^4 * 1000 = 16000 would exceed the ceiling; it must clamp.
    expect(pollBackoffMs(4, BASE)).toBe(8000);
    expect(pollBackoffMs(50, BASE)).toBe(8000);
  });

  it("never returns a delay above the ceiling regardless of interval", () => {
    for (let f = 0; f <= 20; f++) {
      expect(pollBackoffMs(f, 3000)).toBeLessThanOrEqual(8000);
    }
  });
});
