import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { sendMagicLinkEmail } from "@/lib/email";

const Body = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
    }

    const { email } = parsed.data;
    const admin = createAdminClient();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const redirectTo = `${appUrl}/api/auth/callback?next=/dashboard`;

    // TEMP: ping Supabase health endpoint before auth call to confirm reachability
    let pingStatus: number | string = "not attempted";
    try {
      const ping = await fetch(`${supabaseUrl}/auth/v1/health`, {
        headers: { "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      });
      pingStatus = ping.status;
    } catch (e) {
      pingStatus = `fetch error: ${e instanceof Error ? e.message : String(e)}`;
    }

    // Try generating a magiclink first. If the user does not exist, create then retry.
    let linkRes = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    const errMsg = linkRes.error?.message?.toLowerCase() ?? "";
    if (linkRes.error && (errMsg.includes("not found") || errMsg.includes("user not"))) {
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (created.error && !created.error.message.toLowerCase().includes("already")) {
        console.error("[send-link] createUser failed:", created.error.message);
        return NextResponse.json({ error: "Could not create account.", _debug: { pingStatus, createUserError: created.error } }, { status: 500 });
      }
      linkRes = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
    }

    const hashedToken = linkRes.data?.properties?.hashed_token;
    if (linkRes.error || !hashedToken) {
      console.error("[send-link] generateLink failed:", linkRes.error?.message);
      // TEMP DEBUG
      return NextResponse.json({
        error: "Could not generate sign-in link.",
        _debug: {
          pingStatus,
          supabaseError: linkRes.error,
          hashedTokenPresent: !!hashedToken,
          propertiesKeys: linkRes.data?.properties ? Object.keys(linkRes.data.properties) : null,
        },
      }, { status: 500 });
    }

    const customLink = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink&next=${encodeURIComponent("/dashboard")}`;

    const { error: sendError } = await sendMagicLinkEmail(email, customLink);
    if (sendError) {
      console.error("[send-link] Resend send failed:", sendError);
      return NextResponse.json({ error: "Could not send email. Try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[send-link] unexpected:", err);
    // TEMP DEBUG
    return NextResponse.json({
      error: "Server error.",
      _debug: { message: err instanceof Error ? err.message : String(err) },
    }, { status: 500 });
  }
}
