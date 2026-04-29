import { YoutubeTranscript } from "youtube-transcript";

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
};

export async function fetchAndCleanTranscript(
  url: string
): Promise<TranscriptResult> {
  const segments = await YoutubeTranscript.fetchTranscript(url);

  if (!segments || segments.length === 0) {
    throw new Error("NO_TRANSCRIPT");
  }

  // Decode HTML entities, collapse whitespace, dedupe consecutive duplicate sentences.
  const decoded = segments
    .map((s) =>
      s.text
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  // Dedupe consecutive duplicate sentences (caption auto-gen often repeats lines)
  const sentences = decoded.split(/(?<=[.!?])\s+/);
  const deduped: string[] = [];
  for (const s of sentences) {
    const norm = s.trim().toLowerCase();
    if (norm.length === 0) continue;
    if (deduped.length > 0 && deduped[deduped.length - 1].trim().toLowerCase() === norm) {
      continue;
    }
    deduped.push(s.trim());
  }

  const text = deduped.join(" ").trim();
  if (text.length < 50) {
    throw new Error("NO_TRANSCRIPT");
  }

  // Estimate video length: ~150 words per minute, round to nearest minute.
  const wordCount = text.split(/\s+/).length;
  const estimatedMinutes = Math.max(1, Math.round(wordCount / 150));

  return { text, estimatedMinutes };
}
