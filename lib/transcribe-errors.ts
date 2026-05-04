// Pure error-mapping helpers for /api/transcribe.
// Tested in isolation by scripts/test-errors.mjs (mirrored logic).
// Keeping these pure (no Next.js / Supabase imports) so they're easy to unit-test.

export type TranscribeErrorResponse = {
  status: number;
  body: { error: string };
  log: string;
};

// Anthropic SDK errors expose `.status` (number) and a parsed
// `.error.error.message` when upstream returned a JSON body.
type AnthropicLikeError = {
  status: number;
  message?: string;
  error?: { error?: { message?: string } };
};

function isAnthropicLikeError(e: unknown): e is AnthropicLikeError {
  return (
    typeof e === "object" &&
    e !== null &&
    "status" in e &&
    typeof (e as { status: unknown }).status === "number"
  );
}

export function fromAnthropicError(e: unknown): TranscribeErrorResponse {
  if (!isAnthropicLikeError(e)) {
    // No status -> connection/timeout error from the SDK.
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: 502,
      body: { error: "AI service error. Please try again in a moment." },
      log: `Anthropic call failed without status: ${msg}`,
    };
  }
  const status = e.status;
  const inner = e.error?.error?.message ?? e.message ?? "";

  if (status === 400 && /credit balance/i.test(inner)) {
    return {
      status: 503,
      body: {
        error: "Guide builder is temporarily offline. Please try again later.",
      },
      log: `Anthropic billing failure: ${inner}`,
    };
  }
  if (status === 429) {
    return {
      status: 429,
      body: {
        error: "Too many requests right now. Wait 30 seconds and try again.",
      },
      log: "Anthropic rate limit hit",
    };
  }
  return {
    status: 502,
    body: { error: "AI service error. Please try again in a moment." },
    log: `Anthropic API error ${status}: ${inner}`,
  };
}

export function fromTranscriptError(
  e: unknown,
  videoId: string | null,
): TranscribeErrorResponse {
  const msg = e instanceof Error ? e.message : "";

  if (msg === "NO_TRANSCRIPT") {
    return {
      status: 422,
      body: {
        error: "This video has no captions. Try a video with subtitles enabled.",
      },
      log: `Transcript unavailable for video: ${videoId ?? "?"}`,
    };
  }
  if (msg === "RATE_LIMIT") {
    return {
      status: 429,
      body: {
        error: "Too many requests right now. Wait 30 seconds and try again.",
      },
      log: "Supadata rate limit hit",
    };
  }
  if (msg === "SUPADATA_AUTH") {
    return {
      status: 502,
      body: {
        error: "Could not fetch the video transcript. Please try again.",
      },
      log: "Supadata auth failure - check SUPADATA_API_KEY",
    };
  }
  return {
    status: 502,
    body: { error: "Could not fetch the video transcript. Please try again." },
    log: `Supadata error: ${msg || "unknown"}`,
  };
}

export function unhandledTranscribeError(e: unknown): TranscribeErrorResponse {
  const detail = e instanceof Error ? (e.stack ?? e.message) : String(e);
  return {
    status: 500,
    body: { error: "Something went wrong. Please try again." },
    log: `Unhandled transcribe error: ${detail}`,
  };
}
