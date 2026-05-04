export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return u.pathname.slice(1) || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const shortsMatch = u.pathname.match(/^\/shorts\/([^/]+)/);
      if (shortsMatch) return shortsMatch[1];
      const embedMatch = u.pathname.match(/^\/embed\/([^/]+)/);
      if (embedMatch) return embedMatch[1];
    }
    return null;
  } catch {
    return null;
  }
}

export function isValidYoutubeUrl(url: string): boolean {
  return extractVideoId(url) !== null;
}

export type TranscriptResult = {
  text: string;
  estimatedMinutes: number;
  title: string;
  channel: string;
  debug?: TranscriptDebug;
};

export type VideoMeta = {
  title: string;
  channel: string;
  durationSec: number | null;
};

export type TranscriptDebug = {
  videoId: string;
  source: "supadata";
  transcriptStatus?: number;
  transcriptBytes?: number;
  transcriptLang?: string;
  videoMetaStatus?: number;
  finalWordCount?: number;
  error?: string;
};

const SUPADATA_BASE = "https://api.supadata.ai/v1";

type SupadataTranscriptText = {
  content: string;
  lang?: string;
  availableLangs?: string[];
};

type SupadataVideoMeta = {
  id: string;
  title?: string;
  duration?: number;
  channel?: string | { name?: string; id?: string };
};

function extractChannelName(raw: SupadataVideoMeta["channel"]): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim();
  return (raw.name ?? "").trim();
}

function getApiKey(): string {
  const key = process.env.SUPADATA_API_KEY;
  if (!key) {
    throw new Error("SUPADATA_NOT_CONFIGURED");
  }
  return key;
}

async function supadataGet<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<{ status: number; bytes: number; data: T | null }> {
  const qs = new URLSearchParams(params).toString();
  const url = `${SUPADATA_BASE}${path}?${qs}`;
  const res = await fetch(url, {
    headers: { "x-api-key": apiKey },
    cache: "no-store",
  });
  const buf = await res.arrayBuffer();
  const bytes = buf.byteLength;
  if (bytes === 0) {
    return { status: res.status, bytes, data: null };
  }
  const text = new TextDecoder().decode(buf);
  try {
    return { status: res.status, bytes, data: JSON.parse(text) as T };
  } catch {
    return { status: res.status, bytes, data: null };
  }
}

export async function fetchAndCleanTranscript(
  url: string,
  opts: {
    debug?: boolean;
    providedMeta?: { title: string; channel: string; durationSec?: number | null };
  } = {},
): Promise<TranscriptResult> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("INVALID_URL");

  const apiKey = getApiKey();
  const debug: TranscriptDebug = { videoId, source: "supadata" };

  // Sequential, not parallel: Supadata's burst limiter rejects two simultaneous
  // calls from the same key with 429 even though we're well under 5/10s.
  const transcriptRes = await supadataGet<SupadataTranscriptText>(
    "/youtube/transcript",
    { videoId, text: "true", mode: "native" },
    apiKey,
  );
  debug.transcriptStatus = transcriptRes.status;
  debug.transcriptBytes = transcriptRes.bytes;

  // 206 = transcript unavailable per Supadata spec. 404 also means no usable captions.
  if (transcriptRes.status === 206 || transcriptRes.status === 404) {
    const err = new Error("NO_TRANSCRIPT") as Error & { debug?: TranscriptDebug };
    if (opts.debug) err.debug = debug;
    throw err;
  }

  if (transcriptRes.status === 401) {
    debug.error = "supadata 401 — check SUPADATA_API_KEY";
    console.error("[youtube] supadata auth failed");
    const err = new Error("SUPADATA_AUTH") as Error & { debug?: TranscriptDebug };
    if (opts.debug) err.debug = debug;
    throw err;
  }

  if (transcriptRes.status === 429) {
    debug.error = "supadata rate limit";
    const err = new Error("RATE_LIMIT") as Error & { debug?: TranscriptDebug };
    if (opts.debug) err.debug = debug;
    throw err;
  }

  if (transcriptRes.status !== 200 || !transcriptRes.data) {
    debug.error = `supadata transcript ${transcriptRes.status}`;
    console.error("[youtube] supadata transcript fetch failed:", transcriptRes.status);
    const err = new Error("NO_TRANSCRIPT") as Error & { debug?: TranscriptDebug };
    if (opts.debug) err.debug = debug;
    throw err;
  }

  const text = (transcriptRes.data.content ?? "").trim();
  if (text.length < 50) {
    debug.error = "transcript too short";
    const err = new Error("NO_TRANSCRIPT") as Error & { debug?: TranscriptDebug };
    if (opts.debug) err.debug = debug;
    throw err;
  }

  debug.transcriptLang = transcriptRes.data.lang;

  const wordCount = text.split(/\s+/).length;
  debug.finalWordCount = wordCount;

  // Skip the second Supadata round-trip when the caller already fetched meta
  // during a client-side pre-flight (saves 1 credit per successful build).
  let title: string;
  let channel: string;
  let estimatedMinutes: number;

  if (opts.providedMeta) {
    title = opts.providedMeta.title.trim() || `YouTube video ${videoId}`;
    channel = opts.providedMeta.channel.trim() || "youtube";
    const dur = opts.providedMeta.durationSec;
    estimatedMinutes =
      typeof dur === "number" && dur > 0
        ? Math.max(1, Math.round(dur / 60))
        : Math.max(1, Math.round(wordCount / 150));
  } else {
    // Defensive fallback: pre-flight failed (soft-warn path), so fetch meta now.
    const metaRes = await supadataGet<SupadataVideoMeta>(
      "/youtube/video",
      { id: videoId },
      apiKey,
    );
    debug.videoMetaStatus = metaRes.status;

    if (metaRes.data?.duration && metaRes.data.duration > 0) {
      estimatedMinutes = Math.max(1, Math.round(metaRes.data.duration / 60));
    } else {
      estimatedMinutes = Math.max(1, Math.round(wordCount / 150));
    }

    title = metaRes.data?.title?.trim() || `YouTube video ${videoId}`;
    channel = extractChannelName(metaRes.data?.channel) || "youtube";
  }

  return {
    text,
    estimatedMinutes,
    title,
    channel,
    debug: opts.debug ? debug : undefined,
  };
}

export async function fetchVideoMeta(url: string): Promise<VideoMeta> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("INVALID_URL");

  const apiKey = getApiKey();
  const metaRes = await supadataGet<SupadataVideoMeta>(
    "/youtube/video",
    { id: videoId },
    apiKey,
  );

  if (metaRes.status === 401) throw new Error("SUPADATA_AUTH");
  if (metaRes.status === 429) throw new Error("RATE_LIMIT");
  if (metaRes.status !== 200 || !metaRes.data) {
    throw new Error("META_UNAVAILABLE");
  }

  return {
    title: metaRes.data.title?.trim() || `YouTube video ${videoId}`,
    channel: extractChannelName(metaRes.data.channel) || "youtube",
    durationSec:
      typeof metaRes.data.duration === "number" && metaRes.data.duration > 0
        ? metaRes.data.duration
        : null,
  };
}
