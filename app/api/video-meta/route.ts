import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { extractVideoId, fetchVideoMeta } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 10;

const Body = z.object({ url: z.string().url() });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a URL." }, { status: 400 });
  }
  if (!extractVideoId(parsed.data.url)) {
    return NextResponse.json(
      { error: "That does not look like a YouTube URL." },
      { status: 400 },
    );
  }

  try {
    const meta = await fetchVideoMeta(parsed.data.url);
    return NextResponse.json(meta);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "SUPADATA_AUTH") {
      console.error("[video-meta] supadata auth failed");
      return NextResponse.json(
        { error: "Server config error." },
        { status: 500 },
      );
    }
    if (msg === "RATE_LIMIT") {
      return NextResponse.json(
        { error: "Too many requests. Try again in a moment." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "Could not fetch video info." },
      { status: 422 },
    );
  }
}
