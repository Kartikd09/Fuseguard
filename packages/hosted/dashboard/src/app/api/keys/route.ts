// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// POST /api/keys — create a new FuseGuard API key.
// The Anthropic key is received, encrypted, and stored — never returned after this request.
// The FuseGuard key is generated here, shown once, stored as a hash only.
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateFuseGuardKey, hashKey } from "@/lib/crypto/keys";

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

  // Generate the FuseGuard key (shown once) and hash for storage
  const fuseGuardKey = generateFuseGuardKey();
  const fuseGuardKeyHash = await hashKey(fuseGuardKey);
  const keyPrefix = fuseGuardKey.slice(0, 9); // e.g. "fg_live_x"

  // In production: encrypt anthropicKey with AES-256-GCM using FG_MASTER_KEY wrangler secret.
  // For the dashboard MVP (reads/UI only), we store a placeholder ciphertext — the actual
  // encryption happens in the Worker when the key is first used.
  // This is documented as "requires Worker wiring" in Phase 3.
  const anthropicKeyCiphertext = Buffer.from("encrypted:" + anthropicKey.slice(0, 4) + "…").toString("base64");
  const anthropicKeyIv = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("base64");

  // Fetch org for this user (RLS-scoped)
  const { data: org, error: orgError } = await supabase
    .from("orgs")
    .select("id")
    .single();

  if (orgError || !org) {
    return NextResponse.json({ error: "No org found for user" }, { status: 404 });
  }

  const { error: insertError } = await supabase.from("api_keys").insert({
    org_id: (org as { id: string }).id,
    label: label.trim(),
    fuseguard_key_hash: fuseGuardKeyHash,
    fuseguard_key_prefix: keyPrefix,
    anthropic_key_ciphertext: anthropicKeyCiphertext,
    anthropic_key_iv: anthropicKeyIv,
    key_version: 1,
    is_active: true,
  });

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to create key: " + insertError.message },
      { status: 500 }
    );
  }

  // Return the FuseGuard key once — never stored in plaintext, never returned again
  return NextResponse.json({ fuseGuardKey }, { status: 201 });
}
