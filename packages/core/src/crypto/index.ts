// Crypto: AES-256-GCM helpers for encrypting customer Anthropic keys at rest. MIT/OSS
// (ARCHITECTURE §6, §7).
//
// TODO(ROADMAP Phase 1, task 3): AES-GCM encrypt/decrypt with a Worker-secret master key
// (FG_MASTER_KEY), per-key random IV, key_version for rotation. Plaintext customer key exists
// only transiently in memory during a forward; never logged, never persisted.

export {};
