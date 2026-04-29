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

function pickBestTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  // Prefer manual English, then auto English, then any.
  const enManual = tracks.find(
    (t) => t.language_code === "en" && t.kind !== "asr"
  );
  if (enManual) return enManual;
  const en = tracks.find((t) => t.language_code === "en");
  if (en) return en;
  return tracks[0];
}

async function fetchJson3Captions(baseUrl: string): Promise<string[]> {
  const url = baseUrl.includes("fmt=") ? baseUrl : baseUrl + "&fmt=json3";
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`caption fetch HTTP ${res.status}`);
  }
  const data = (await res.json()) as Json3Response;
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
  return out;
}

export async function fetchAndCleanTranscript(
  url: string
): Promise<TranscriptResult> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("INVALID_URL");

  const yt = await getYt();

  const info = await yt.getInfo(videoId);
  const title = info.basic_info.title ?? `YouTube video ${videoId}`;

  const tracks = (info.captions?.caption_tracks ?? []) as CaptionTrack[];
  const track = pickBestTrack(tracks);
  if (!track || !track.base_url) {
    console.error(
      "[youtube] no caption tracks for",
      videoId,
      "captions object present:",
      Boolean(info.captions)
    );
    throw new Error("NO_TRANSCRIPT");
  }

  let rawTexts: string[];
  try {
    rawTexts = await fetchJson3Captions(track.base_url);
  } catch (e) {
    console.error(
      "[youtube] caption-track fetch failed:",
      e instanceof Error ? e.message : String(e)
    );
    throw new Error("NO_TRANSCRIPT");
  }

  if (rawTexts.length === 0) {
    throw new Error("NO_TRANSCRIPT");
  }

  // Decode HTML entities + collapse whitespace.
  const joined = rawTexts
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
    throw new Error("NO_TRANSCRIPT");
  }

  // Estimate video length: ~150 wpm, round to nearest minute.
  const wordCount = text.split(/\s+/).length;
  const estimatedMinutes = Math.max(1, Math.round(wordCount / 150));

  return { text, estimatedMinutes, title };
}
