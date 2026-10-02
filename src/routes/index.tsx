import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckSquare2,
  ClipboardList,
  Copy,
  FileText,
  Lightbulb,
  Link2,
  Menu,
  RotateCcw,
  Search,
  Sparkle,
  WandSparkles,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ToolId = "meeting" | "planner" | "research";

const tools = {
  meeting: {
    label: "Meeting Notes",
    shortLabel: "Meeting",
    title: "Meeting Notes Summarizer",
    description: "Turn raw meeting notes into a concise brief with action items, decisions, and deadlines.",
    placeholder:
      "Paste your meeting notes here…\n\nExample: The product team agreed to move the beta launch to June 12. Maya will finalize onboarding copy by Friday…",
    action: "Summarize notes",
    emptyTitle: "Your meeting brief will appear here",
    emptyText: "Add your notes, then generate a structured summary you can review and share.",
    icon: FileText,
  },
  planner: {
    label: "Task Planner",
    shortLabel: "Planner",
    title: "AI Task Planner",
    description: "Transform your priorities, deadlines, and constraints into a realistic work plan.",
    placeholder:
      "List your tasks, estimates, deadlines, and fixed commitments…\n\nExample: Finish quarterly report (2h, due Thursday), review campaign brief (45m), team check-in at 2pm…",
    action: "Build my plan",
    emptyTitle: "Your focused schedule will appear here",
    emptyText: "Share what needs to get done and AI will organize it into a practical plan.",
    icon: CalendarDays,
  },
  research: {
    label: "Research Assistant",
    shortLabel: "Research",
    title: "AI Research Assistant",
    description: "Distill an article from a URL or pasted text into useful insights, recommendations, and open questions.",
    placeholder:
      "Paste an article URL above, or paste the article text or topic here…",
    action: "Analyze research",
    emptyTitle: "Your research brief will appear here",
    emptyText: "Provide source material or a detailed topic to receive grounded, actionable insights.",
    icon: Search,
  },
} as const;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Workplace Productivity Assistant" },
      { name: "description", content: "Summarize meetings, plan work, and research faster with an AI productivity workspace." },
      { property: "og:title", content: "AI Workplace Productivity Assistant" },
      { property: "og:description", content: "A focused AI workspace for meeting notes, task planning, and research." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function RichOutput({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm leading-7 text-foreground">
      {text.split("\n").map((line, index) => {
        const key = `${index}-${line.slice(0, 12)}`;
        if (line.startsWith("### ")) return <h3 key={key} className="pt-3 font-display text-base font-bold">{line.slice(4)}</h3>;
        if (line.startsWith("## ")) return <h2 key={key} className="pt-4 font-display text-lg font-bold">{line.slice(3)}</h2>;
        if (line.startsWith("# ")) return <h2 key={key} className="pt-2 font-display text-xl font-bold">{line.slice(2)}</h2>;
        if (/^[-*] \[[ xX]\] /.test(line)) {
          return <div key={key} className="flex gap-3"><CheckSquare2 className="mt-1.5 size-4 shrink-0 text-primary" /><span>{line.replace(/^[-*] \[[ xX]\] /, "")}</span></div>;
        }
        if (/^[-*] /.test(line)) return <div key={key} className="flex gap-3"><span className="mt-3 size-1.5 shrink-0 rounded-full bg-primary" /><span>{line.slice(2)}</span></div>;
        if (/^\d+\. /.test(line)) return <p key={key} className="pl-1">{line}</p>;
        if (!line.trim()) return <div key={key} className="h-1" />;
        return <p key={key}>{line.replaceAll("**", "")}</p>;
      })}
    </div>
  );
}

function Index() {
  const [active, setActive] = useState<ToolId>("meeting");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [period, setPeriod] = useState<"daily" | "weekly">("daily");
  const [sourceUrl, setSourceUrl] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const current = tools[active];

  function selectTool(id: ToolId) {
    abortRef.current?.abort();
    setActive(id);
    setInput("");
    setOutput("");
    setError("");
    setLoading(false);
    setSourceUrl("");
    setMenuOpen(false);
  }

  async function generate() {
    const hasUrl = active === "research" && Boolean(sourceUrl.trim());
    if (input.trim().length < 20 && !hasUrl) {
      setError("Please add a little more detail, or paste an article URL first.");
      return;
    }
    setError("");
    setOutput("");
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: active,
          input,
          period,
          ...(active === "research" && sourceUrl.trim() ? { url: sourceUrl.trim() } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "The assistant could not complete this request.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        setOutput((value) => value + decoder.decode(chunk.value, { stream: true }));
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {menuOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-overlay lg:hidden" onClick={() => setMenuOpen(false)} />}
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:translate-x-0", menuOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="grid size-10 place-items-center rounded-md bg-primary text-primary-foreground"><Sparkle className="size-5" /></div>
          <div><p className="font-display text-sm font-extrabold">AI WORKPLACE</p><p className="text-xs text-muted-foreground">Productivity assistant</p></div>
          <Button variant="ghost" size="icon" className="ml-auto lg:hidden" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X className="size-5" /></Button>
        </div>
        <nav className="flex-1 space-y-1 p-4" aria-label="Productivity tools">
          <p className="px-3 pb-2 pt-3 text-xs font-bold uppercase text-muted-foreground">Workspace</p>
          {(Object.entries(tools) as [ToolId, (typeof tools)[ToolId]][]).map(([id, tool]) => {
            const Icon = tool.icon;
            return <Button key={id} variant="ghost" className={cn("h-12 w-full justify-start px-3", active === id && "bg-sidebar-accent text-sidebar-accent-foreground")} onClick={() => selectTool(id)}><Icon className={cn("size-5", active === id ? "text-primary" : "text-muted-foreground")} />{tool.label}</Button>;
          })}
        </nav>
        <div className="m-4 border-t border-sidebar-border px-2 pt-5">
          <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">G</div><div><p className="text-sm font-semibold">Guest workspace</p><p className="text-xs text-muted-foreground">No sign-in required</p></div></div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-20 items-center border-b border-border bg-background/95 px-4 backdrop-blur md:px-8">
          <Button variant="ghost" size="icon" className="mr-3 lg:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu className="size-5" /></Button>
          <div><p className="font-display text-base font-bold md:text-lg">AI Workplace Productivity Assistant</p><p className="hidden text-xs text-muted-foreground sm:block">Work smarter, one focused task at a time.</p></div>
          <div className="ml-auto hidden items-center gap-2 text-xs font-semibold text-success sm:flex"><span className="size-2 rounded-full bg-success" />AI ready</div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-9">
          <div className="mb-7 flex items-start gap-4">
            <div className="hidden size-12 shrink-0 place-items-center rounded-md bg-primary-soft text-primary sm:grid"><current.icon className="size-6" /></div>
            <div><h1 className="font-display text-2xl font-extrabold md:text-3xl">{current.title}</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">{current.description}</p></div>
          </div>

          <div className="grid min-h-[590px] gap-px overflow-hidden rounded-lg border border-border bg-border shadow-workspace xl:grid-cols-2">
            <section className="flex min-h-[470px] flex-col bg-card p-5 md:p-7">
              <div className="mb-4 flex min-h-9 items-center justify-between gap-3"><div><p className="font-display text-sm font-bold">Your input</p><p className="text-xs text-muted-foreground">Be specific for a more useful result</p></div>
                {active === "planner" && <div className="flex rounded-md bg-secondary p-1"><Button size="sm" variant="ghost" className={cn("h-7 px-3 text-xs", period === "daily" && "bg-card text-foreground shadow-sm")} onClick={() => setPeriod("daily")}>Daily</Button><Button size="sm" variant="ghost" className={cn("h-7 px-3 text-xs", period === "weekly" && "bg-card text-foreground shadow-sm")} onClick={() => setPeriod("weekly")}>Weekly</Button></div>}
              </div>
              {active === "research" && (
                <div className="relative mb-3">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={sourceUrl}
                    onChange={(event) => { setSourceUrl(event.target.value); setError(""); }}
                    type="url"
                    placeholder="Paste an article URL (optional)…"
                    aria-label="Article URL"
                    className="h-10 w-full rounded-md border border-input bg-input-surface pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                </div>
              )}
              <div className="relative flex flex-1 flex-col">
                <textarea value={input} onChange={(event) => { setInput(event.target.value); setError(""); }} maxLength={30000} placeholder={current.placeholder} className="min-h-80 flex-1 resize-none rounded-md border border-input bg-input-surface p-4 text-sm leading-6 outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20" />
                <span className="absolute bottom-3 right-3 text-[11px] text-muted-foreground">{input.length.toLocaleString()} / 30,000</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <Button variant="ghost" size="sm" disabled={!input || loading} onClick={() => setInput("")}><RotateCcw className="size-4" />Clear</Button>
                {loading ? <Button variant="outline" onClick={() => abortRef.current?.abort()}><X className="size-4" />Stop</Button> : <Button onClick={generate}>{current.action}<ArrowRight className="size-4" /></Button>}
              </div>
              {error && <div className="mt-4 flex gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{error}</div>}
            </section>

            <section className="flex min-h-[470px] flex-col bg-output p-5 md:p-7">
              <div className="mb-4 flex min-h-9 items-center justify-between"><div><p className="font-display text-sm font-bold">AI output</p><p className="text-xs text-muted-foreground">Generated from your input</p></div>{output && <Button variant="outline" size="sm" onClick={copyOutput}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy"}</Button>}</div>
              <div className={cn("flex-1 rounded-md border border-border bg-card p-5 md:p-6", !output && "grid place-items-center")} aria-live="polite">
                {loading && !output ? <div className="w-full max-w-md space-y-5"><div className="mx-auto grid size-12 place-items-center rounded-md bg-primary-soft text-primary"><WandSparkles className="size-6 animate-pulse" /></div><p className="text-center text-sm font-semibold">Thinking through your input…</p><div className="space-y-3"><div className="h-3 w-2/3 animate-pulse rounded bg-muted" /><div className="h-3 w-full animate-pulse rounded bg-muted" /><div className="h-3 w-5/6 animate-pulse rounded bg-muted" /></div></div> : output ? <RichOutput text={output} /> : <div className="max-w-sm text-center"><div className="mx-auto mb-4 grid size-14 place-items-center rounded-md bg-primary-soft text-primary"><current.icon className="size-7" /></div><h2 className="font-display text-base font-bold">{current.emptyTitle}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{current.emptyText}</p></div>}
              </div>
            </section>
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-md border border-disclaimer-border bg-disclaimer px-4 py-3 text-xs leading-5 text-muted-foreground"><Lightbulb className="mt-0.5 size-4 shrink-0 text-disclaimer-icon" /><p><strong className="text-foreground">Responsible AI:</strong> AI-generated content may contain errors or miss context. Review and verify every output before using or sharing it professionally.</p></div>
        </main>
      </div>
    </div>
  );
}