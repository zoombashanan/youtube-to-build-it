import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(next: string | null | undefined): string {
  if (!next || typeof next !== "string") return "/dashboard";
  // Block open-redirect: only allow same-origin relative paths.
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

// GET path is kept for:
//   - The PKCE / OAuth `?code=...` flow (used by Supabase OAuth providers).
//   - Backward compatibility with any in-flight magic-link emails that were
//     sent before the scanner-resistant interstitial deploy. New magic links
//     point at /auth/confirm and reach this route via POST below.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  // PKCE flow path: ?code=xxx
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[callback] exchangeCodeForSession failed:", error.message);
  }

  // OTP / token_hash path (legacy GET): ?token_hash=xxx&type=magiclink
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "email",
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[callback] verifyOtp failed:", error.message);
  }

  // Fall through: send to auth with an error flag.
  return NextResponse.redirect(`${origin}/auth?error=invalid_link`);
}

// POST path is the new scanner-resistant interstitial target. The form at
// /auth/confirm posts here with token_hash + type + next in the form body.
// Email scanners do not generally POST hidden form fields, so this is only
// reached by a real user click.
export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.redirect(`${origin}/auth?error=invalid_link`, {
      status: 303,
    });
  }
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "");
  const next = safeNext(
    typeof form.get("next") === "string" ? (form.get("next") as string) : null,
  );

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/auth?error=invalid_link`, {
      status: 303,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as "magiclink" | "email",
  });
  if (error) {
    console.error("[callback POST] verifyOtp failed:", error.message);
    return NextResponse.redirect(`${origin}/auth?error=invalid_link`, {
      status: 303,
    });
  }
  return NextResponse.redirect(`${origin}${next}`, { status: 303 });
}
