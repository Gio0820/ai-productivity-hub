import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { z } from "zod";

import { createRunIdFetch } from "@/lib/run-id.server";

const requestSchema = z.object({
  tool: z.enum(["meeting", "planner", "research"]),
  input: z.string().trim().min(20).max(30_000),
  period: z.enum(["daily", "weekly"]).optional(),
});

const instructions = {
  meeting:
    "You are an executive meeting analyst. Summarize only the supplied notes. Use clear markdown sections: Executive Summary, Action Items, Key Decisions, and Deadlines. For action items use checkboxes and name the owner when present. Explicitly mark missing owners or dates as Not specified. Never invent facts.",
  planner:
    "You are an expert work planner. Turn only the supplied tasks, constraints, and deadlines into a practical schedule. Use clear markdown sections: Priorities, Schedule, and Focus Notes. Include realistic time blocks, dependencies, breaks, and concise rationale. Do not invent hard deadlines; label assumptions clearly.",
  research:
    "You are a rigorous research assistant. Analyze only the supplied topic or article. Use clear markdown sections: Brief, Key Insights, Recommendations, and Open Questions. Distinguish provided facts from your interpretation. Do not invent citations, sources, statistics, or claims.",
} as const;

export const Route = createFileRoute("/api/assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = requestSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json(
            { error: "Add at least 20 characters so the assistant has enough context." },
            { status: 400 },
          );
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return Response.json({ error: "AI access is not configured for this workspace." }, { status: 500 });
        }

        const runIdFetch = createRunIdFetch(request.headers.get("X-Lovable-AIG-Run-ID") ?? undefined);
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });

        const periodNote =
          parsed.data.tool === "planner"
            ? `Create a ${parsed.data.period === "weekly" ? "weekly" : "daily"} plan.`
            : "";
        const result = streamText({
          model: provider.responses("openai/gpt-6-astra"),
          system: `${instructions[parsed.data.tool]} Keep the answer concise, specific, and ready to use.`,
          prompt: `${periodNote}\n\nUser input:\n${parsed.data.input}`,
          abortSignal: request.signal,
          maxRetries: 0,
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "medium",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
        });

        return result.toTextStreamResponse({
          headers: { "Cache-Control": "no-cache, no-transform" },
        });
      },
    },
  },
});