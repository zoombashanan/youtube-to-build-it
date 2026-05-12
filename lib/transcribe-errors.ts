// Pure error-mapping helpers for /api/transcribe.
// Tested in isolation by scripts/test-errors.mjs (mirrored logic).
// Keeping these pure (no Next.js / Supabase imports) so they're easy to unit-test.

// Categorical event_type values written to public.analytics. Schema column is
// TEXT (no enum constraint), so this union is the source of truth.
export type TranscribeErrorEventType =
  | "transcribe_error_no_captions"
  | "transcribe_error_supadata_rate_limit"
  | "transcribe_error_supadata_auth"
  | "transcribe_error_supadata_other"
  | "transcribe_error_anthropic_billing"
  | "transcribe_error_anthropic_rate_limit"
  | "transcribe_error_anthropic_other"
  | "transcribe_error_unhandled";

export type TranscribeErrorResponse = {
  status: number;
  body: { error: string };
  log: string;
  eventType: TranscribeErrorEventType;
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
      eventType: "transcribe_error_anthropic_other",
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
      eventType: "transcribe_error_anthropic_billing",
    };
  }
  if (status === 429) {
    return {
      status: 429,
      body: {
        error: "Too many requests right now. Wait 30 seconds and try again.",
      },
      log: "Anthropic rate limit hit",
      eventType: "transcribe_error_anthropic_rate_limit",
    };
  }
  return {
    status: 502,
    body: { error: "AI service error. Please try again in a moment." },
    log: `Anthropic API error ${status}: ${inner}`,
    eventType: "transcribe_error_anthropic_other",
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
      eventType: "transcribe_error_no_captions",
    };
  }
  if (msg === "RATE_LIMIT") {
    return {
      status: 429,
      body: {
        error: "Too many requests right now. Wait 30 seconds and try again.",
      },
      log: "Supadata rate limit hit",
      eventType: "transcribe_error_supadata_rate_limit",
    };
  }
  if (msg === "SUPADATA_AUTH") {
    return {
      status: 502,
      body: {
        error: "Could not fetch the video transcript. Please try again.",
      },
      log: "Supadata auth failure - check SUPADATA_API_KEY",
      eventType: "transcribe_error_supadata_auth",
    };
  }
  return {
    status: 502,
    body: { error: "Could not fetch the video transcript. Please try again." },
    log: `Supadata error: ${msg || "unknown"}`,
    eventType: "transcribe_error_supadata_other",
  };
}

export function unhandledTranscribeError(e: unknown): TranscribeErrorResponse {
  const detail = e instanceof Error ? (e.stack ?? e.message) : String(e);
  return {
    status: 500,
    body: { error: "Something went wrong. Please try again." },
    log: `Unhandled transcribe error: ${detail}`,
    eventType: "transcribe_error_unhandled",
  };
}
