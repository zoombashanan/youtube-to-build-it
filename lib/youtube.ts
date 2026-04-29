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

export async function fetchAndCleanTranscript(
  url: string
): Promise<TranscriptResult> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("INVALID_URL");

  const yt = await getYt();

  const info = await yt.getInfo(videoId);
  const title = info.basic_info.title ?? `YouTube video ${videoId}`;

  let transcriptData;
  try {
    transcriptData = await info.getTranscript();
  } catch {
    throw new Error("NO_TRANSCRIPT");
  }

  const segments =
    transcriptData?.transcript?.content?.body?.initial_segments ?? [];

  if (segments.length === 0) {
    throw new Error("NO_TRANSCRIPT");
  }

  // Extract plain text from each segment.
  const rawTexts: string[] = [];
  for (const seg of segments) {
    // Each segment has snippet.text or snippet.runs[].text
    const snippet = (seg as { snippet?: { text?: string } }).snippet;
    const text = snippet?.text;
    if (typeof text === "string" && text.trim().length > 0) {
      rawTexts.push(text.trim());
    }
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
