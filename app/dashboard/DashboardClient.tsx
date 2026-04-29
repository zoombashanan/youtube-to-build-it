"use client";

import { useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";

type Props = {
  email: string;
  initialUsed: number;
  cap: number;
};

type Stage = "idle" | "transcript" | "guide" | "done";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  transcript: "Grabbing transcript...",
  guide: "Building guide...",
  done: "Done",
};

export default function DashboardClient({ email, initialUsed, cap }: Props) {
  const [used, setUsed] = useState(initialUsed);
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState<string | null>(null);

  const remaining = Math.max(0, cap - used);
  const atCap = remaining <= 0;
  const submitting = stage === "transcript" || stage === "guide";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (atCap || submitting || url.trim().length === 0) return;

    setError(null);
    setGuide(null);
    setStage("transcript");

    // Brief artificial split between the two stages so the user sees both messages.
    const guideStageTimer = setTimeout(() => setStage("guide"), 1200);

    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      clearTimeout(guideStageTimer);

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 429) {
          setUsed(cap);
        }
        throw new Error(json.error ?? "Something went wrong.");
      }

      setGuide(json.guide ?? "");
      if (typeof json.remaining === "number") {
        setUsed(cap - json.remaining);
      } else {
        setUsed((u) => u + 1);
      }
      setStage("done");
    } catch (err) {
      clearTimeout(guideStageTimer);
      setStage("idle");
      setError(err instanceof Error ? err.message : "Unknown error.");
    }
  }

  function downloadMarkdown() {
    if (!guide) return;
    const blob = new Blob([guide], { type: "text/markdown;charset=utf-8" });
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = `build-it-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(dlUrl);
  }

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
              disabled={atCap || submitting}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
            />
            <button
              type="submit"
              disabled={atCap || submitting || url.trim().length === 0}
              className="bg-green-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
            >
              {submitting ? "Working..." : atCap ? "Cap reached" : "Build Guide"}
            </button>
          </div>
        </form>

        {atCap && (
          <p className="mt-3 text-sm text-red-700">
            Daily limit reached. Try again tomorrow.
          </p>
        )}

        {submitting && (
          <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <div className="inline-block animate-spin h-6 w-6 border-2 border-green-600 border-t-transparent rounded-full mb-3" />
            <p className="text-gray-700 font-medium">{STAGE_LABEL[stage]}</p>
            <p className="text-xs text-gray-500 mt-1">This usually takes 30 to 90 seconds.</p>
          </div>
        )}

        {error && (
          <div className="mt-8 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {guide && stage === "done" && (
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
