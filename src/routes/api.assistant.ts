import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { z } from "zod";

import { createRunIdFetch } from "@/lib/run-id.server";

const requestSchema = z.object({
  tool: z.enum(["meeting", "planner", "research"]),
  input: z.string().trim().max(30_000).default(""),
  url: z.string().trim().url().max(2048).optional(),
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
            { error: "Add at least 20 characters (or a valid URL) so the assistant has enough context." },
            { status: 400 },
          );
        }
        if (parsed.data.input.length < 20 && !parsed.data.url) {
          return Response.json(
            { error: "Add at least 20 characters (or a URL) so the assistant has enough context." },
            { status: 400 },
          );
        }

        let sourceNote = "";
        if (parsed.data.url) {
          if (parsed.data.tool !== "research") {
            return Response.json({ error: "URLs are only supported for the Research Assistant." }, { status: 400 });
          }
          try {
            const page = await fetch(parsed.data.url, {
              headers: { "user-agent": "Mozilla/5.0 (compatible; AIWorkplace/1.0)" },
              signal: AbortSignal.timeout(15_000),
              redirect: "follow",
            });
            if (!page.ok) throw new Error(`status ${page.status}`);
            const contentType = page.headers.get("content-type") ?? "";
            if (contentType && !contentType.includes("html") && !contentType.includes("text/plain")) {
              return Response.json({ error: "That link is not a readable article page." }, { status: 400 });
            }
            const text = (await page.text())
              .replace(/<script[\s\S]*?<\/script>/gi, " ")
              .replace(/<style[\s\S]*?<\/style>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/&nbsp;/gi, " ")
              .replace(/&/gi, "&")
              .replace(/</gi, "<")
              .replace(/>/gi, ">")
              .replace(/"/gi, '"')
              .replace(/&#39;/gi, "'")
              .replace(/\s+/g, " ")
              .trim();
            if (text.length < 200) throw new Error("content too short");
            sourceNote = `The user provided a URL as the primary source to analyze. Page text from ${parsed.data.url}:\n${text.slice(0, 20_000)}\n`;
          } catch {
            return Response.json(
              { error: "Could not read that URL. Check the link, or paste the article text instead." },
              { status: 400 },
            );
          }
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
          prompt: `${periodNote}\n\n${sourceNote}\n\nUser input:\n${parsed.data.input || "(none)"}`,
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