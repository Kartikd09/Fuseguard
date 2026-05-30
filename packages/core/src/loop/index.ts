// Loop detection: ring buffer + stable request hash. Engine is MIT/OSS; productized as a
// paid feature gated at the edge in packages/hosted (ARCHITECTURE §7, FR-4).
//
// TODO(ROADMAP Phase 1, task 11 / FR-4): stable hash over {model, system, messages, tools}
// (normalized whitespace); ≥10 near-identical requests within 60s ⇒ block with loop_detected;
// configurable thresholds per key.

export {};
