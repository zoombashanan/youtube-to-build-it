// Smoke test: import the real lib/youtube.ts (via tsx-style strip) and call it.
// Run: node --experimental-strip-types scripts/smoke-supadata.mjs
import { fetchAndCleanTranscript } from "../lib/youtube.ts";

const URLS = [
  "https://www.youtube.com/watch?v=96jN2OCOfLs", // Karpathy: Vibe Coding → Agentic Engineering (manual captions)
];

for (const url of URLS) {
  const t0 = Date.now();
  try {
    const res = await fetchAndCleanTranscript(url, { debug: true });
    console.log(JSON.stringify({
      url,
      ok: true,
      elapsedMs: Date.now() - t0,
      title: res.title,
      estimatedMinutes: res.estimatedMinutes,
      wordCount: res.text.split(/\s+/).length,
      preview: res.text.slice(0, 200),
      debug: res.debug,
    }, null, 2));
  } catch (e) {
    const debug = (e && typeof e === "object" && "debug" in e) ? e.debug : undefined;
    console.log(JSON.stringify({
      url,
      ok: false,
      elapsedMs: Date.now() - t0,
      message: e?.message,
      debug,
    }, null, 2));
  }
  console.log("---");
}
