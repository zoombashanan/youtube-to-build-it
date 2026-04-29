import { Innertube } from "youtubei.js";

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
  debug?: TranscriptDebug;
};

export type TranscriptDebug = {
  videoId: string;
  triedClients: { client: string; ok: boolean; trackCount: number; error?: string }[];
  selectedClient?: string;
  trackLanguage?: string;
  trackKind?: string;
  fetchHttp?: number;
  fetchBytes?: number;
  rawSegmentCount?: number;
  finalWordCount?: number;
};

let _yt: Innertube | null = null;
async function getYt(): Promise<Innertube> {
  if (!_yt) {
    _yt = await Innertube.create({ generate_session_locally: true });
  }
  return _yt;
}

type CaptionTrack = {
  base_url: string;
  language_code?: string;
  kind?: string;
  name?: { text?: string };
};

type Json3Seg = { utf8?: string };
type Json3Event = { segs?: Json3Seg[] };
type Json3Response = { events?: Json3Event[] };

// Innertube clients to try in order. iOS/Android/TV are known to return
// caption track data even when WEB client gets stripped on datacenter IPs.
const CLIENT_PRIORITY = ["IOS", "ANDROID", "TV", "MWEB", "WEB"] as const;
type ClientName = (typeof CLIENT_PRIORITY)[number];

function pickBestTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const enManual = tracks.find(
    (t) => t.language_code === "en" && t.kind !== "asr"
  );
  if (enManual) return enManual;
  const en = tracks.find((t) => t.language_code === "en");
  if (en) return en;
  return tracks[0];
}

async function fetchJson3Captions(
  baseUrl: string
): Promise<{ texts: string[]; status: number; bytes: number }> {
  const url = baseUrl.includes("fmt=") ? baseUrl : baseUrl + "&fmt=json3";
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    },
  });
  const status = res.status;
  if (!res.ok) {
    return { texts: [], status, bytes: 0 };
  }
  const buf = await res.arrayBuffer();
  const bytes = buf.byteLength;
  const data = JSON.parse(new TextDecoder().decode(buf)) as Json3Response;
  const out: string[] = [];
  for (const ev of data.events ?? []) {
    if (!ev.segs) continue;
    let line = "";
    for (const s of ev.segs) {
      if (typeof s.utf8 === "string") line += s.utf8;
    }
    line = line.replace(/\n/g, " ").trim();
    if (line.length > 0) out.push(line);
  }
  return { texts: out, status, bytes };
}

async function getInfoWithCaptions(
  yt: Innertube,
  videoId: string,
  debug: TranscriptDebug
): Promise<{ info: Awaited<ReturnType<Innertube["getInfo"]>>; client: ClientName } | null> {
  for (const client of CLIENT_PRIORITY) {
    const attempt: TranscriptDebug["triedClients"][number] = {
      client,
      ok: false,
      trackCount: 0,
    };
    try {
      const info = await yt.getInfo(videoId, { client });
      const tracks = (info.captions?.caption_tracks ?? []) as CaptionTrack[];
      attempt.ok = true;
      attempt.trackCount = tracks.length;
      debug.triedClients.push(attempt);
      if (tracks.length > 0) {
        return { info, client };
      }
    } catch (e) {
      attempt.error = e instanceof Error ? e.message : String(e);
      debug.triedClients.push(attempt);
    }
  }
  return null;
}

export async function fetchAndCleanTranscript(
  url: string,
  opts: { debug?: boolean } = {}
): Promise<TranscriptResult> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("INVALID_URL");

  const debug: TranscriptDebug = { videoId, triedClients: [] };

  const yt = await getYt();
  const result = await getInfoWithCaptions(yt, videoId, debug);

  if (!result) {
    console.error(
      "[youtube] no client returned caption tracks. Tried:",
      JSON.stringify(debug.triedClients)
    );
    const err = new Error("NO_TRANSCRIPT") as Error & { debug?: TranscriptDebug };
    if (opts.debug) err.debug = debug;
    throw err;
  }

  const { info, client } = result;
  debug.selectedClient = client;

  const title = info.basic_info.title ?? `YouTube video ${videoId}`;
  const tracks = (info.captions?.caption_tracks ?? []) as CaptionTrack[];
  const track = pickBestTrack(tracks);
  if (!track || !track.base_url) {
    const err = new Error("NO_TRANSCRIPT") as Error & { debug?: TranscriptDebug };
    if (opts.debug) err.debug = debug;
    throw err;
  }
  debug.trackLanguage = track.language_code;
  debug.trackKind = track.kind;

  let fetched: { texts: string[]; status: number; bytes: number };
  try {
    fetched = await fetchJson3Captions(track.base_url);
  } catch (e) {
    console.error(
      "[youtube] caption-track fetch threw:",
      e instanceof Error ? e.message : String(e)
    );
    const err = new Error("NO_TRANSCRIPT") as Error & { debug?: TranscriptDebug };
    if (opts.debug) err.debug = debug;
    throw err;
  }

  debug.fetchHttp = fetched.status;
  debug.fetchBytes = fetched.bytes;
  debug.rawSegmentCount = fetched.texts.length;

  if (fetched.texts.length === 0) {
    console.error(
      "[youtube] caption fetch returned no segments. status:",
      fetched.status,
      "bytes:",
      fetched.bytes
    );
    const err = new Error("NO_TRANSCRIPT") as Error & { debug?: TranscriptDebug };
    if (opts.debug) err.debug = debug;
    throw err;
  }

  // Decode HTML entities + collapse whitespace.
  const joined = fetched.texts
    .join(" ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Dedupe consecutive duplicate sentences (auto-captions often repeat lines).
  const sentences = joined.split(/(?<=[.!?])\s+/);
  const deduped: string[] = [];
  for (const s of sentences) {
    const norm = s.trim().toLowerCase();
    if (norm.length === 0) continue;
    if (
      deduped.length > 0 &&
      deduped[deduped.length - 1].trim().toLowerCase() === norm
    ) {
      continue;
    }
    deduped.push(s.trim());
  }

  const text = deduped.join(" ").trim();
  if (text.length < 50) {
    const err = new Error("NO_TRANSCRIPT") as Error & { debug?: TranscriptDebug };
    if (opts.debug) err.debug = debug;
    throw err;
  }

  const wordCount = text.split(/\s+/).length;
  debug.finalWordCount = wordCount;

  const estimatedMinutes = Math.max(1, Math.round(wordCount / 150));

  return {
    text,
    estimatedMinutes,
    title,
    debug: opts.debug ? debug : undefined,
  };
}
