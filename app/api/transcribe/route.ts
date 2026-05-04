import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  extractVideoId,
  fetchAndCleanTranscript,
} from "@/lib/youtube";
import { generateBuildItGuide } from "@/lib/anthropic";
import {
  DAILY_CAP,
  getTodayCount,
  incrementUsage,
  logEvent,
} from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120; // seconds; covers transcript fetch + Anthropic round trip

const Body = z.object({
  url: z.string().url(),
  // Optional pre-flight meta (passed when the client successfully called
  // /api/video-meta first). Lets us skip a second Supadata round-trip.
  title: z.string().min(1).max(200).optional(),
  channel: z.string().min(1).max(200).optional(),
  durationSec: z.number().int().positive().max(86400).optional(),
});

export async function POST(request: Request) {
  // 1. Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // 2. Validate URL
  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a URL." }, { status: 400 });
  }
  const videoId = extractVideoId(parsed.data.url);
  if (!videoId) {
    return NextResponse.json(
      { error: "That does not look like a YouTube URL." },
      { status: 400 }
    );
  }
  const url = parsed.data.url;
  const debugMode = new URL(request.url).searchParams.get("debug") === "1";
  const providedMeta =
    parsed.data.title && parsed.data.channel
      ? {
          title: parsed.data.title,
          channel: parsed.data.channel,
          durationSec: parsed.data.durationSec ?? null,
        }
      : undefined;

  const admin = createAdminClient();

  // 3. Daily cap check (read-only). User row exists via auth-trigger.
  let count = 0;
  try {
    count = await getTodayCount(admin, user.id);
  } catch (e) {
    console.error("[transcribe] usage read failed:", e);
    return NextResponse.json({ error: "Server error reading usage." }, { status: 500 });
  }
  if (count >= DAILY_CAP) {
    return NextResponse.json(
      {
        error: "Daily limit reached. Try again tomorrow.",
        remaining: 0,
      },
      { status: 429 }
    );
  }

  // 4. Fetch + clean transcript
  let transcript: Awaited<ReturnType<typeof fetchAndCleanTranscript>>;
  try {
    transcript = await fetchAndCleanTranscript(url, {
      debug: debugMode,
      providedMeta,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const debugInfo = debugMode
      ? (e as Error & { debug?: unknown }).debug
      : undefined;
    await logEvent(admin, "transcribe_error", user.id);
    if (msg === "NO_TRANSCRIPT") {
      return NextResponse.json(
        {
          error: "This video does not have captions. Try another video.",
          ...(debugInfo ? { _debug: debugInfo } : {}),
        },
        { status: 422 }
      );
    }
    console.error("[transcribe] transcript fetch failed:", e);
    return NextResponse.json(
      {
        error:
          "Could not fetch the transcript. YouTube may be blocking it. Try another video.",
        ...(debugInfo ? { _debug: debugInfo } : {}),
      },
      { status: 422 }
    );
  }

  // 5. Generate guide
  const capturedDate = new Date().toISOString().slice(0, 10);
  const title = transcript.title;

  let guideResult;
  try {
    guideResult = await generateBuildItGuide({
      title,
      url,
      transcript: transcript.text,
      estimatedMinutes: transcript.estimatedMinutes,
      capturedDate,
    });
  } catch (e) {
    await logEvent(admin, "transcribe_error", user.id);
    console.error("[transcribe] anthropic failed:", e);
    return NextResponse.json(
      { error: "Could not generate the guide. Please try again." },
      { status: 502 }
    );
  }

  // 6. Increment usage + log success (analytics is event-only, no URL/content)
  let newCount = count + 1;
  try {
    newCount = await incrementUsage(admin, user.id);
  } catch (e) {
    console.error("[transcribe] usage increment failed (guide already generated):", e);
  }
  await logEvent(admin, "transcribe_success", user.id);

  return NextResponse.json({
    guide: guideResult.guide,
    title: transcript.title,
    channel: transcript.channel,
    remaining: Math.max(0, DAILY_CAP - newCount),
  });
}
