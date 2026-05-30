import { describe, expect, it } from "vitest";
import { LoopDetector, requestHash, type LoopRequest } from "./index.js";

// Deterministic fake clock — never real time (CLAUDE.md: injected clock for testability).
function fakeClock(start = 0): { now: () => number; advance: (seconds: number) => void } {
  let seconds = start;
  return {
    now: () => seconds,
    advance: (delta: number) => {
      seconds += delta;
    },
  };
}

const baseRequest: LoopRequest = {
  model: "claude-sonnet-4",
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "ping" }],
  tools: [{ name: "search" }],
};

describe("requestHash", () => {
  it("is deterministic for the same logical request", () => {
    expect(requestHash(baseRequest)).toBe(requestHash(baseRequest));
  });

  it("is stable across a fresh equal object (same hash)", () => {
    const clone: LoopRequest = {
      model: "claude-sonnet-4",
      system: "You are a helpful assistant.",
      messages: [{ role: "user", content: "ping" }],
      tools: [{ name: "search" }],
    };
    expect(requestHash(clone)).toBe(requestHash(baseRequest));
  });

  it("normalizes whitespace so cosmetic spacing does not change the hash", () => {
    const spaced: LoopRequest = {
      ...baseRequest,
      system: "You   are\ta\nhelpful   assistant.",
    };
    expect(requestHash(spaced)).toBe(requestHash(baseRequest));
  });

  it("produces a different hash for a different model", () => {
    expect(requestHash({ ...baseRequest, model: "claude-opus-4" })).not.toBe(
      requestHash(baseRequest)
    );
  });

  it("produces a different hash for different message content", () => {
    expect(
      requestHash({ ...baseRequest, messages: [{ role: "user", content: "pong" }] })
    ).not.toBe(requestHash(baseRequest));
  });

  it("produces a different hash for different tools", () => {
    expect(requestHash({ ...baseRequest, tools: [{ name: "calculator" }] })).not.toBe(
      requestHash(baseRequest)
    );
  });

  it("returns a non-empty string", () => {
    expect(typeof requestHash(baseRequest)).toBe("string");
    expect(requestHash(baseRequest).length).toBeGreaterThan(0);
  });
});

describe("LoopDetector.record", () => {
  it("allows requests below the threshold (count < threshold ⇒ no loop)", () => {
    const clock = fakeClock();
    const detector = new LoopDetector({ threshold: 10, windowSeconds: 60, now: clock.now });

    let last = { loop: false, count: 0 };
    for (let i = 0; i < 9; i++) {
      last = detector.record("h1");
    }

    expect(last.count).toBe(9);
    expect(last.loop).toBe(false);
  });

  it("triggers a loop exactly at the threshold (count >= threshold)", () => {
    const clock = fakeClock();
    const detector = new LoopDetector({ threshold: 10, windowSeconds: 60, now: clock.now });

    let result = { loop: false, count: 0 };
    for (let i = 0; i < 10; i++) {
      result = detector.record("h1");
    }

    expect(result.count).toBe(10);
    expect(result.loop).toBe(true);
  });

  it("keeps flagging matches once the threshold is breached", () => {
    const clock = fakeClock();
    const detector = new LoopDetector({ threshold: 3, windowSeconds: 60, now: clock.now });

    detector.record("h1");
    detector.record("h1");
    expect(detector.record("h1").loop).toBe(true);
    expect(detector.record("h1")).toEqual({ loop: true, count: 4 });
  });

  it("prunes entries older than the window so the count resets", () => {
    const clock = fakeClock();
    const detector = new LoopDetector({ threshold: 3, windowSeconds: 60, now: clock.now });

    detector.record("h1");
    detector.record("h1");

    // Advance past the window — earlier entries must be pruned.
    clock.advance(61);

    const result = detector.record("h1");
    expect(result.count).toBe(1);
    expect(result.loop).toBe(false);
  });

  it("counts only entries within the window when partially expired", () => {
    const clock = fakeClock();
    const detector = new LoopDetector({ threshold: 3, windowSeconds: 60, now: clock.now });

    detector.record("h1"); // t=0
    clock.advance(30);
    detector.record("h1"); // t=30
    clock.advance(40); // t=70 — first entry (t=0) now older than 60s window

    const result = detector.record("h1"); // t=70
    expect(result.count).toBe(2); // t=30 and t=70 only
    expect(result.loop).toBe(false);
  });

  it("does not cross-trigger between different hashes", () => {
    const clock = fakeClock();
    const detector = new LoopDetector({ threshold: 3, windowSeconds: 60, now: clock.now });

    detector.record("h1");
    detector.record("h1");
    const other = detector.record("h2");

    expect(other.count).toBe(1);
    expect(other.loop).toBe(false);
  });

  it("respects a custom threshold", () => {
    const clock = fakeClock();
    const detector = new LoopDetector({ threshold: 2, windowSeconds: 60, now: clock.now });

    expect(detector.record("h1").loop).toBe(false);
    expect(detector.record("h1").loop).toBe(true);
  });

  it("respects a custom window", () => {
    const clock = fakeClock();
    const detector = new LoopDetector({ threshold: 2, windowSeconds: 5, now: clock.now });

    detector.record("h1"); // t=0
    clock.advance(6); // beyond the 5s window
    const result = detector.record("h1"); // t=6

    expect(result.count).toBe(1);
    expect(result.loop).toBe(false);
  });

  it("defaults to threshold=10 and windowSeconds=60 (FR-4)", () => {
    const clock = fakeClock();
    const detector = new LoopDetector({ now: clock.now });

    let result = { loop: false, count: 0 };
    for (let i = 0; i < 9; i++) {
      result = detector.record("h1");
    }
    expect(result.loop).toBe(false);

    result = detector.record("h1");
    expect(result.count).toBe(10);
    expect(result.loop).toBe(true);
  });

  it("treats the window boundary as inclusive (entry exactly at the edge still counts)", () => {
    const clock = fakeClock();
    const detector = new LoopDetector({ threshold: 2, windowSeconds: 60, now: clock.now });

    detector.record("h1"); // t=0
    clock.advance(60); // exactly windowSeconds later — boundary entry retained
    const result = detector.record("h1"); // t=60

    expect(result.count).toBe(2);
    expect(result.loop).toBe(true);
  });
});

describe("LoopDetector with requestHash", () => {
  it("flags a runaway loop of identical requests at the default threshold", () => {
    const clock = fakeClock();
    const detector = new LoopDetector({ now: clock.now });
    const hash = requestHash(baseRequest);

    let result = { loop: false, count: 0 };
    for (let i = 0; i < 10; i++) {
      result = detector.record(hash);
    }

    expect(result.loop).toBe(true);
  });
});
