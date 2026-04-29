import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are a context management agent for Dr. Rob Wertz at The Ultimate Farmer (TUF). You convert YouTube transcripts into BUILD-IT instructional guides using a locked 10-section format.

Voice rules (non-negotiable):
- Energetic, motivational, casual
- Short sentences, punchy
- Grade 5 to 7 reading level
- American spelling
- Straight quotes only, no em dashes
- No buzzwords, no vague claims

Output format (in this exact order):

# [Video Title]

## TL;DR (60 seconds)
[Three sentences. What was built. How. Why it matters.]

**Original video length:** [Estimate from word count, ~150 wpm, round to nearest minute]

## What You Will Build
[One sentence describing the end deliverable.]

## Tools and Costs
| Tool | What It Does | Cost | Link |

## Prerequisites
[Numbered list]

---

## The Steps

### PHASE 1: [Phase Name]

**Step 1. [Action Title]**
- [Action]
- [Expected result]

[Repeat for all phases. Group steps into 4-7 logical phases.]

---

## Common Mistakes
[3 to 5 traps from the video]

## Time and Cost Summary
| Phase | Time | Cost |

**ROI angle:** [One sentence]

## Next Actions
[3 concrete bullets the reader can do today]

## Source
- **Title:** [Video title]
- **URL:** [YouTube URL]
- **Captured:** [Today's date]

## QA Check
1. **Simple?** [Yes/No + one line]
2. **Useful today?** [Yes/No + one line]
3. **Next step clear?** [Yes/No + one line]`;

export const MODEL_ID = "claude-sonnet-4-6";

export type GenerateGuideInput = {
  title: string;
  url: string;
  transcript: string;
  estimatedMinutes: number;
  capturedDate: string;
};

export type GenerateGuideResult = {
  guide: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
};

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export async function generateBuildItGuide(
  input: GenerateGuideInput
): Promise<GenerateGuideResult> {
  const client = getClient();

  const userMessage =
    `Convert this transcript into a BUILD-IT guide. ` +
    `Title: ${input.title}. ` +
    `URL: ${input.url}. ` +
    `Estimated original video length: ${input.estimatedMinutes} minutes (use this for the "Original video length" field). ` +
    `Captured date: ${input.capturedDate}. ` +
    `Transcript: ${input.transcript}`;

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const guideBlocks = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text);

  const guide = guideBlocks.join("\n").trim();
  if (!guide) throw new Error("EMPTY_GUIDE");

  return {
    guide,
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
  };
}
