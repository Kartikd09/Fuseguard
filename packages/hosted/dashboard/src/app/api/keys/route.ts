// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// POST /api/keys — create a new FuseGuard API key.
// The Anthropic key is received, encrypted, and stored — never returned after this request.
// The FuseGuard key is generated here, shown once, stored as a hash only.
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateFuseGuardKey, hashKey } from "@/lib/crypto/keys";
import { encryptSecret } from "@/lib/crypto/encrypt";

interface CreateKeyBody {
  label: string;
  anthropicKey: string;
}

function isCreateKeyBody(v: unknown): v is CreateKeyBody {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>)["label"] === "string" &&
    typeof (v as Record<string, unknown>)["anthropicKey"] === "string"
  );
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isCreateKeyBody(body)) {
    return NextResponse.json({ error: "Missing label or anthropicKey" }, { status: 400 });
  }

  const { label, anthropicKey } = body;

  if (!label.trim() || label.trim().length > 64) {
    return NextResponse.json({ error: "Label must be 1–64 characters" }, { status: 400 });
  }

  // Basic Anthropic key format validation
  if (!anthropicKey.startsWith("sk-ant-") || anthropicKey.length < 20) {
    return NextResponse.json(
      { error: "Invalid Anthropic API key format (must start with sk-ant-)" },
      { status: 400 }
    );
  }

  // Free tier limit enforced atomically by DB trigger check_api_key_limit().
  // The insert error handler below translates key_limit_exceeded → 403 + upgrade:true.

  // Fail closed: real AES-256-GCM encryption is mandatory. No master key → refuse
  // (never store the customer key in plaintext or a placeholder).
  const masterKey = process.env.FG_MASTER_KEY;
  if (!masterKey) {
    console.error("[keys] FG_MASTER_KEY not configured — refusing to store key");
    return NextResponse.json({ error: "Key storage is not configured" }, { status: 503 });
  }

  // Generate the FuseGuard key (shown once) and hash for storage
  const fuseGuardKey = generateFuseGuardKey();
  const fuseGuardKeyHash = await hashKey(fuseGuardKey);
  const keyPrefix = fuseGuardKey.slice(0, 9);

  // Real AES-256-GCM encryption of the customer's Anthropic key (server-only master key).
  let anthropicKeyCiphertext: string;
  let anthropicKeyIv: string;
  try {
    const enc = await encryptSecret(anthropicKey, masterKey);
    anthropicKeyCiphertext = enc.ciphertext;
    anthropicKeyIv = enc.iv;
  } catch (err) {
    console.error("[keys] encryption failed:", err);
    return NextResponse.json({ error: "Key storage is not configured" }, { status: 503 });
  }

  // Derive org explicitly from the caller's membership (no implicit single-row trust).
  const { data: membershipForInsert, error: orgError } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (orgError || !membershipForInsert) {
    return NextResponse.json({ error: "No organization for user" }, { status: 403 });
  }

  const { error: insertError } = await supabase.from("api_keys").insert({
    org_id: (membershipForInsert as { org_id: string }).org_id,
    label: label.trim(),
    fuseguard_key_hash: fuseGuardKeyHash,
    fuseguard_key_prefix: keyPrefix,
    anthropic_key_ciphertext: anthropicKeyCiphertext,
    anthropic_key_iv: anthropicKeyIv,
    key_version: 1,
    is_active: true,
  });

  if (insertError) {
    // DB trigger fires when plan key limit is exceeded — surface as upgrade prompt.
    if (insertError.message?.includes("key_limit_exceeded")) {
      return NextResponse.json(
        { error: "Free tier allows 1 API key. Upgrade to Pro for unlimited keys.", upgrade: true },
        { status: 403 }
      );
    }
    console.error("[keys] insert failed:", insertError);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }

  // Return the FuseGuard key once — never stored in plaintext, never returned again
  return NextResponse.json({ fuseGuardKey }, { status: 201 });
}
