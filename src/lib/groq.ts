import { ArticleResponse, TimelineEntry, TimelineResponse } from "../types";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const TIMELINE_SYSTEM_PROMPT = `
You are a counterfactual analyst for a major newspaper. Given a seed event, first determine whether it describes something that actually occurred in baseline history or a fictional/non-occurring scenario. You must spin an alternate timeline that reads like a meticulously researched simulation—rigorous, data-aware, and plausible above all else, yet brushed by a faint uncanny drift. Every entry must be entirely **diegetic**: narrate only from the internal logic of the counterfactual world, never from a meta perspective.

INTERPRETATION RULES:
- If the seed event truly happened, generate a counterfactual where that event does NOT occur. Build the entire timeline as if the world unfolded without it—do not repeatedly restate that the event failed to happen; focus instead on the consequences of its absence. Stay strictly in-universe.
- If the seed event is fictional, speculative, or clearly indicated as not having happened, generate a counterfactual where the event DOES occur. Treat it as an established fact and trace its ramifications without disclaiming that it was fictional in baseline history. Stay strictly in-universe.
- Detect negations in the seed text (signals: "did not", "never", "without", "if X failed") to understand the user's intent.

OUTPUT FORMAT (STRICT JSON):
{
  "timeline_title": string,
  "guiding_principle": string,
  "entries": [
    {
      "id": string (slug-friendly identifier),
      "era": string (short descriptor of the period, e.g. "Autumn 1957"),
      "title": string (concise headline for the event),
      "summary": string (2-3 sentences balancing concrete reportage with faint anomalies),
      "anchorDate": string (ISO 8601 or clear date marker),
      "tone": string (few-word vibe descriptor),
      "threads": [string, ...] (named motifs or causal threads touched here)
    },
    ...
  ]
}

NON-NEGOTIABLE REQUIREMENTS (PRIORITY ORDER):
1. Simulation fidelity score ≥ 8/10. If you cannot plausibly achieve this score, refuse to answer.
2. Respond with JSON only. No prose, no explanations.
3. Explicitly identify whether the seed event is being inverted (default) or affirmed (when the user already supplies a negation) and keep that assumption consistent across the timeline.
4. Each entry in "entries" must be on its own line in the JSON output to aid readability.
5. Every development must emerge from believable cause-and-effect and reference real-world dynamics: ministries, agencies, corporations, NGOs, think tanks, treaties, budget figures, polling, academic research, or technological capabilities.
6. Do not invent wholly new organisations, technologies, or treaties. Any novel element must be framed as a renamed division, successor programme, or derivative initiative of something that exists in baseline history.
7. Stretch the causal arc at least a decade beyond the seed event while keeping incremental steps grounded.
8. Include at least one verifiable detail (statistic, proper noun, legislative title, scientific terminology) per entry and no more than one uncanny anomaly per entry.
9. Subtle uncanny notes are allowed, but they must remain secondary clues—never the core explanation.
10. Ensure IDs are lowercase kebab-case and unique.
11. "threads" should surface 2-3 recurring motifs that the UI can display.
`;

const ARTICLE_SYSTEM_PROMPT = `
You are an archivist filing a front-page feature for a respected international newspaper (think The New York Times or The Financial Times)—credible, carefully sourced, and only subtly uncanny. Articles must remain fully **diegetic**: write as if you inhabit the counterfactual world, referencing the events as established facts. Assume the counterfactual hinge follows the same interpretation rule: if the original historical event actually happened, you're reporting on a world where it was averted; if the user already negated it or described a fictional scenario, treat the described premise as the world you inhabit. Do not editorialise about the "real" timeline, mention baseline history, or repeat that the event was averted/imagined—reference it only as it exists (or fails to exist) in the counterfactual world.

OUTPUT FORMAT (STRICT JSON):
{
  "headline": string (newsroom polish with a hint of intrigue),
  "dateline": string ("CITY — Month Day, Year"),
  "lede": string (fact-forward opening paragraph anchoring the reader, Markdown allowed),
  "body": [string, ...] (4-6 entries, each a Markdown segment 3-5 sentences long in newsroom cadence),
  "sidebar": {
    "title": string,
    "items": [string, ...]
  },
  "pull_quote": string (optional, but only if naturally arising from the reporting)
}
NON-NEGOTIABLE REQUIREMENTS (PRIORITY ORDER):
1. Simulation fidelity score ≥ 8/10. If you cannot plausibly achieve this score, refuse to answer.
2. Treat the counterfactual world as real; cite ministries, companies, polling data, budget figures, regulatory filings, academic research, or expert interviews where appropriate.
3. Reference only real organisations, legislation, technologies, and geographies. If a renamed or successor entity appears, explicitly anchor it to its real-world origin (e.g., "the former Ministry of ___").
4. Prioritise **diegetic realism**: narrate as a correspondent immersed in the counterfactual world. Never mention or allude to a "real" timeline; refer to the seed event only as it stands in this reality.
5. Maintain inverted-pyramid structure: lede, nut graf, context, sourced quotes, societal impact, forward-looking close.
6. Include at least one viewpoint attempting to rationalise events with conventional explanations—scientists, bureaucrats, or analysts pushing back against the uncanny.
7. Let the uncanny surface only as unsettling discrepancies, eyewitness detail, or data outliers, never as overt mystical declarations from the narrator.
8. Use light Markdown where helpful: headings (##, ###), bullet lists, bold, italics, pull quotes. Avoid tables or images.
9. No HTML.
`;

const INTERPOLATION_SYSTEM_PROMPT = `
You are HAUNTOLOSCOPE's scribe of unseen interstitial events. Your task is to propose 2-3 key developments that plausibly unfold between two known timeline anchors.

Return STRICT JSON in this shape:
{
  "entries": [
    {
      "id": string (lowercase kebab-case),
      "era": string,
      "title": string,
      "summary": string (2 sentences),
      "anchorDate": string,
      "tone": string,
      "threads": [string, ...]
    }
  ]
}

Ensure the micro-events meaningfully bridge the causal gap, referencing relevant threads when possible. Simulation fidelity score must be ≥ 8/10. Reference only real organisations, programmes, or treaties (novel initiatives must be explicitly tied to an existing body). Each insertion should read like a policy memo or news brief with only faint anomalies. No commentary outside JSON.
`;

async function groqChat<T>(apiKey: string, body: unknown): Promise<T> {
  const response = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq request failed: ${response.status} ${text}`);
  }

  const json = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  const content = json.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Groq response missing content");
  }

  try {
    return JSON.parse(content) as T;
  } catch (error) {
    console.error("Failed to parse Groq JSON:", content);
    throw error;
  }
}

async function groqChatWithRetry<T>(apiKey: string, body: unknown, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await groqChat<T>(apiKey, body);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delay = 200 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function generateTimeline(apiKey: string, seedEvent: string) {
  return groqChatWithRetry<TimelineResponse>(apiKey, {
    model: "moonshotai/kimi-k2-instruct-0905",
    temperature: 0.75,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: TIMELINE_SYSTEM_PROMPT.trim() },
      {
        role: "user",
        content: JSON.stringify({
          seed_event: seedEvent,
          directives: {
            priority_stack: [
              "simulation_fidelity",
              "institutional_detail",
              "macro_history_continuity",
              "measured_uncanny_texture"
            ],
            realism_ratio: "4:1 realism_to_uncanny",
            minimum_institutional_references_per_entry: 1,
            counterfactual_interpretation: {
              default: "invert_actual_event",
              negation_tokens: ["did not", "never", "without", "failed to", "absence of", "if X failed"],
              description:
                "Assume seed_event describes a real event that is prevented unless negation tokens indicate the user already flipped it."
            }
          },
          emphasise: [
            "Counterfactual plausibility",
            "Credible causal chains",
            "Named sources, agencies, datasets",
            "Signal over noise",
            "Recurrence of narrative threads"
          ]
        })
      }
    ]
  });
}

export async function generateArticle(
  apiKey: string,
  seedEvent: string,
  entry: TimelineEntry,
  timeline: TimelineResponse
) {
  return groqChatWithRetry<ArticleResponse>(apiKey, {
    model: "moonshotai/kimi-k2-instruct-0905",
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: ARTICLE_SYSTEM_PROMPT.trim() },
      {
        role: "user",
        content: JSON.stringify({
          seed_event: seedEvent,
          timeline_title: timeline.timeline_title,
          guiding_principle: timeline.guiding_principle,
          entry,
          directives: {
            priority_stack: [
              "simulation_fidelity",
              "institutional_verifiability",
              "balanced_viewpoints",
              "controlled_uncanny"
            ],
            newsroom_style: "front_page_analysis",
            markdown_usage: "headlines_and_callouts_only",
            realism_ratio: "5:1 realism_to_uncanny",
            counterfactual_interpretation: {
              default: "invert_actual_event",
              negation_tokens: ["did not", "never", "without", "failed to", "absence of", "if X failed"],
              description:
                "Assume seed_event describes a real event that is prevented unless negation tokens indicate the user already flipped it."
            }
          }
        })
      }
    ]
  });
}

export async function generateInterpolations(
  apiKey: string,
  seedEvent: string,
  context: {
    previous?: TimelineEntry;
    current: TimelineEntry;
    next?: TimelineEntry;
    timeline: TimelineResponse;
  }
) {
  return groqChatWithRetry<{ entries: TimelineEntry[] }>(apiKey, {
    model: "moonshotai/kimi-k2-instruct-0905",
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: INTERPOLATION_SYSTEM_PROMPT.trim() },
      {
        role: "user",
        content: JSON.stringify({
          seed_event: seedEvent,
          previous: context.previous,
          anchor: context.current,
          next: context.next,
          guiding_principle: context.timeline.guiding_principle,
          directives: {
            priority_stack: ["simulation_fidelity", "institutional_detail", "subtle_uncanny"],
            realism_ratio: "5:1 realism_to_uncanny",
            counterfactual_interpretation: {
              default: "invert_actual_event",
              negation_tokens: ["did not", "never", "without", "failed to", "absence of", "if X failed"],
              description:
                "Assume seed_event describes a real event that is prevented unless negation tokens indicate the user already flipped it."
            }
          },
          threads_catalogue: Array.from(
            new Set(
              context.timeline.entries.flatMap((entry) => entry.threads ?? [])
            )
          )
        })
      }
    ]
  });
}
