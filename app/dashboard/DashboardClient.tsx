"use client";

import { useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";

type Props = {
  email: string;
  initialUsed: number;
  cap: number;
};

const MAX_DURATION_SEC = 3600;
const MAX_DURATION_LABEL = "60 minutes";

type SetKey = "A" | "B";

const STAGE_SETS: Record<SetKey, readonly [string, string, string, string]> = {
  A: [
    "Watching the video so you don't have to",
    "Pretending I understood it",
    "Making it sound smarter than it was",
    "Boom. You're welcome.",
  ],
  B: [
    "Yanking the words out of the video",
    "Ignoring the part where they beg for likes",
    "Bribing the AI to focus",
    "Acting like I came up with it",
  ],
};

// Stage 1 must be visible long enough for users to actually read it,
// even if the pre-flight meta call returns near-instantly.
const STAGE_1_FLOOR_MS = 1500;

const LAST_SET_KEY = "buildit_last_set";

// Spec: on each build, read; if "A" or missing, use Set B and write "B".
// If "B", use Set A and write "A". localStorage unavailable: default to "A".
export function pickSet(): SetKey {
  try {
    const last = window.localStorage.getItem(LAST_SET_KEY);
    if (last === "B") {
      window.localStorage.setItem(LAST_SET_KEY, "A");
      return "A";
    }
    window.localStorage.setItem(LAST_SET_KEY, "B");
    return "B";
  } catch {
    return "A";
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

function buildFilename(channel: string | null, title: string | null): string {
  const ext = ".md";
  const c = slug(channel || "youtube") || "youtube";
  const t = slug(title || "untitled") || "untitled";
  const maxTotal = 100;
  const sep = "_";
  const cTrim = c.slice(0, 30);
  const remaining = maxTotal - ext.length - sep.length - cTrim.length;
  const tTrim = t.slice(0, Math.max(1, remaining));
  return `${cTrim}${sep}${tTrim}${ext}`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}min ${s}sec`;
}

type ErrorState = { message: string; status: number };

function errorBannerClasses(status: number): string {
  // 503/502 -> service issue (amber). 429 -> rate limit (blue).
  // 422/400 -> user action / input (yellow). 500 (and anything else) -> red.
  if (status === 503 || status === 502) {
    return "bg-amber-50 border-amber-200 text-amber-900";
  }
  if (status === 429) {
    return "bg-blue-50 border-blue-200 text-blue-900";
  }
  if (status === 422 || status === 400) {
    return "bg-yellow-50 border-yellow-200 text-yellow-900";
  }
  return "bg-red-50 border-red-200 text-red-800";
}

export default function DashboardClient({ email, initialUsed, cap }: Props) {
  const [used, setUsed] = useState(initialUsed);
  const [url, setUrl] = useState("");
  const [progressStage, setProgressStage] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [setKey, setSetKey] = useState<SetKey>("A");
  const [error, setError] = useState<ErrorState | null>(null);
  const [softWarning, setSoftWarning] = useState<string | null>(null);
  const [guide, setGuide] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ title: string; channel: string } | null>(null);
  const [preflightMeta, setPreflightMeta] = useState<
    { title: string; channel: string; durationSec: number | null } | null
  >(null);

  const remaining = Math.max(0, cap - used);
  const atCap = remaining <= 0;
  const building = progressStage > 0;

  async function preflightCheck(targetUrl: string): Promise<
    | {
        ok: true;
        soft?: string;
        meta?: { title: string; channel: string; durationSec: number | null };
      }
    | { ok: false; message: string; status: number }
  > {
    const softMsg = `Could not check video length. Build may fail if over ${MAX_DURATION_LABEL}.`;
    try {
      const res = await fetch("/api/video-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 400 || res.status === 401) {
          return {
            ok: false,
            message: json.error ?? "Invalid request.",
            status: res.status,
          };
        }
        return { ok: true, soft: softMsg };
      }

      const title: string | undefined =
        typeof json.title === "string" ? json.title : undefined;
      const channel: string | undefined =
        typeof json.channel === "string" ? json.channel : undefined;
      const dur: number | null =
        typeof json.durationSec === "number" ? json.durationSec : null;

      if (dur === null) {
        const m =
          title && channel ? { title, channel, durationSec: null } : undefined;
        return { ok: true, soft: softMsg, meta: m };
      }
      if (dur > MAX_DURATION_SEC) {
        return {
          ok: false,
          message: `This video is ${formatDuration(dur)}. Current max is ${MAX_DURATION_LABEL}. Try a shorter video.`,
          status: 422,
        };
      }
      const m =
        title && channel
          ? { title, channel, durationSec: dur }
          : undefined;
      return { ok: true, meta: m };
    } catch {
      return { ok: true, soft: softMsg };
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (atCap || building || url.trim().length === 0) return;

    const chosen = pickSet();
    setSetKey(chosen);
    setError(null);
    setSoftWarning(null);
    setGuide(null);
    setMeta(null);
    setPreflightMeta(null);
    setProgressStage(1);
    const stage1Start = Date.now();

    const trimmed = url.trim();

    const pre = await preflightCheck(trimmed);
    if (!pre.ok) {
      // Block path skips the floor so the error surfaces immediately.
      setProgressStage(0);
      setError({ message: pre.message, status: pre.status });
      return;
    }
    if (pre.soft) setSoftWarning(pre.soft);
    if (pre.meta) setPreflightMeta(pre.meta);

    const elapsed = Date.now() - stage1Start;
    if (elapsed < STAGE_1_FLOOR_MS) {
      await new Promise((r) => setTimeout(r, STAGE_1_FLOOR_MS - elapsed));
    }

    setProgressStage(2);
    // Per spec: 2s on Stage 2, then advance to Stage 3 (Claude phase).
    const stage3Timer = setTimeout(() => {
      setProgressStage((s) => (s === 2 ? 3 : s));
    }, 2000);

    let stage4HideTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      const transcribeBody: {
        url: string;
        title?: string;
        channel?: string;
        durationSec?: number;
      } = { url: trimmed };
      if (pre.meta) {
        transcribeBody.title = pre.meta.title;
        transcribeBody.channel = pre.meta.channel;
        if (pre.meta.durationSec !== null) {
          transcribeBody.durationSec = pre.meta.durationSec;
        }
      }
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transcribeBody),
      });
      clearTimeout(stage3Timer);

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 429) {
          setUsed(cap);
        }
        setProgressStage(0);
        setError({
          message:
            typeof json.error === "string"
              ? json.error
              : "Something went wrong. Please try again.",
          status: res.status,
        });
        return;
      }

      setGuide(json.guide ?? "");
      if (typeof json.title === "string" && typeof json.channel === "string") {
        setMeta({ title: json.title, channel: json.channel });
      }
      if (typeof json.remaining === "number") {
        setUsed(cap - json.remaining);
      } else {
        setUsed((u) => u + 1);
      }

      setProgressStage(4);
      stage4HideTimer = setTimeout(() => setProgressStage(0), 1500);
    } catch (err) {
      // Network-level failure (fetch threw, JSON unparseable, etc.).
      // Server-returned errors with a status are handled inline above.
      clearTimeout(stage3Timer);
      if (stage4HideTimer) clearTimeout(stage4HideTimer);
      setProgressStage(0);
      setError({
        message:
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
        status: 500,
      });
    }
  }

  function downloadMarkdown() {
    if (!guide) return;
    const blob = new Blob([guide], { type: "text/markdown;charset=utf-8" });
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = buildFilename(meta?.channel ?? null, meta?.title ?? null);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(dlUrl);
  }

  const stageMessage =
    progressStage > 0 ? STAGE_SETS[setKey][progressStage - 1] : "";
  const showAnimatedDots = progressStage > 0 && progressStage < 4;

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold">YouTube to BUILD-IT</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500 hidden sm:inline">{email}</span>
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="text-gray-700 hover:text-gray-900 font-medium"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Build a guide</h2>
          <span
            className={
              "text-sm font-semibold px-3 py-1 rounded-full " +
              (atCap
                ? "bg-red-50 text-red-700 border border-red-200"
                : "bg-green-50 text-green-700 border border-green-200")
            }
          >
            {used} of {cap} used today
          </span>
        </div>

        <div
          role="note"
          className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 sm:p-4 text-sm"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="w-5 h-5 mt-0.5 flex-shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
              clipRule="evenodd"
            />
          </svg>
          <p className="leading-snug">
            Heads up: max video length is {MAX_DURATION_LABEL}. Longer videos may time out.
          </p>
        </div>

        {progressStage > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 bg-white border border-gray-200 rounded-lg p-4 sm:p-5 shadow-sm"
          >
            <p className="text-gray-900 font-medium text-base sm:text-lg flex flex-wrap items-baseline">
              <span>{stageMessage}</span>
              {showAnimatedDots && (
                <span className="inline-flex ml-1" aria-hidden="true">
                  <span className="animate-pulse">.</span>
                  <span className="animate-pulse [animation-delay:200ms]">.</span>
                  <span className="animate-pulse [animation-delay:400ms]">.</span>
                </span>
              )}
            </p>
            <div className="mt-3 h-2 w-full bg-amber-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-[width] duration-500 ease-out"
                style={{ width: `${progressStage * 25}%` }}
              />
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <label htmlFor="url" className="block text-sm font-medium text-gray-700">
            YouTube URL
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="url"
              type="url"
              required
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={atCap || building}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
            />
            <button
              type="submit"
              disabled={atCap || building || url.trim().length === 0}
              className="bg-green-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
            >
              {building ? "Working..." : atCap ? "Cap reached" : "Build Guide"}
            </button>
          </div>
        </form>

        {atCap && (
          <p className="mt-3 text-sm text-red-700">
            Daily limit reached. Try again tomorrow.
          </p>
        )}

        {softWarning && !error && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
            {softWarning}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className={`mt-8 border rounded-lg p-4 text-sm ${errorBannerClasses(error.status)}`}
          >
            {error.message}
          </div>
        )}

        {guide && progressStage === 0 && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Your guide</h3>
              <button
                onClick={downloadMarkdown}
                className="bg-green-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm"
              >
                Download as Markdown
              </button>
            </div>
            <article className="prose prose-gray max-w-none bg-gray-50 border border-gray-200 rounded-lg p-6 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_p]:my-3 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3 [&_li]:my-1 [&_table]:w-full [&_table]:my-4 [&_table]:border-collapse [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:border-gray-300 [&_td]:px-3 [&_td]:py-2 [&_strong]:font-semibold [&_hr]:my-6 [&_hr]:border-gray-300 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm">
              <ReactMarkdown>{guide}</ReactMarkdown>
            </article>
          </div>
        )}
      </section>

      <footer className="max-w-4xl mx-auto px-6 py-10 text-center text-xs text-gray-500 border-t border-gray-200 mt-10">
        Built by The Ultimate Farmer. Limited to {cap} guides per user per day.
      </footer>
    </main>
  );
}
