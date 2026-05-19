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
    const redirectTo = `${appUrl}/api/auth/callback?next=/dashboard`;

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
        return NextResponse.json({ error: "Could not create account.", _debug: { createUserError: created.error } }, { status: 500 });
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
      // TEMP DEBUG — remove after diagnosis
      return NextResponse.json({
        error: "Could not generate sign-in link.",
        _debug: {
          supabaseError: linkRes.error,
          hashedTokenPresent: !!hashedToken,
          dataKeys: linkRes.data ? Object.keys(linkRes.data) : null,
          propertiesKeys: linkRes.data?.properties ? Object.keys(linkRes.data.properties) : null,
          appUrl,
          redirectTo,
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
    // TEMP DEBUG — remove after diagnosis
    return NextResponse.json({
      error: "Server error.",
      _debug: { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack?.slice(0, 500) : null },
    }, { status: 500 });
  }
}
