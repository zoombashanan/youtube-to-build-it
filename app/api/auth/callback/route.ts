import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/dashboard";

  const supabase = await createClient();

  // PKCE flow path: ?code=xxx
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[callback] exchangeCodeForSession failed:", error.message);
  }

  // OTP / token_hash path (older flow): ?token_hash=xxx&type=magiclink
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
