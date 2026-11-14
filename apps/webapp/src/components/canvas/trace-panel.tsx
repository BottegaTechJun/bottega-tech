"use client";

import {
  ArrowUpRight,
  Braces,
  CircleAlert,
  FileSearch,
  LoaderCircle,
  MessageSquareText,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import type { Run, TraceItem } from "@/lib/matchup";

type Tool = Extract<TraceItem, { kind: "tool" }>;
type Thought = Extract<TraceItem, { kind: "thinking" }>;

interface Group {
  key: string;
  step: number;
  items: TraceItem[];
}

const tools: Record<string, { verb: string; icon: React.ReactNode }> = {
  entity_search: { verb: "Searched", icon: <Search /> },
  entity_lookup: { verb: "Looked up", icon: <Search /> },
  entity_retrieval: { verb: "Read", icon: <FileSearch /> },
  entity_introspection: { verb: "Checked fields of", icon: <Braces /> },
  knowledge_search: { verb: "Asked", icon: <MessageSquareText /> },
  knowledge_query: { verb: "Queried", icon: <MessageSquareText /> },
};

/** One group per agent step: what it thought, then the Cala calls it made. */
function group(trace: TraceItem[]): Group[] {
  const out: Group[] = [];
  for (const item of trace) {
    if (item.kind === "step") out.push({ key: item.key, step: item.step, items: [] });
    else if (out.length) out[out.length - 1]?.items.push(item);
    else out.push({ key: "s0", step: 0, items: [item] });
  }
  return out;
}

/** Gemini thought summaries open with a markdown title: "**Checking rounds** I'll…". */
function split(text: string): { title: string | null; body: string } {
  const match = /^\s*\*\*(.+?)\*\*\s*/s.exec(text);
  const body = (match ? text.slice(match[0].length) : text).replace(/\*\*/g, "").trim();
  return { title: match?.[1]?.trim() ?? null, body };
}

function firstSentence(text: string): string {
  const cut = text.search(/[.!?](\s|$)/);
  return cut > 0 && cut < 90 ? text.slice(0, cut) : text.slice(0, 90);
}

function headline(items: TraceItem[]): string {
  const thought = items.find((i): i is Thought => i.kind === "thinking");
  if (thought) {
    const { title, body } = split(thought.text);
    return title ?? firstSentence(body);
  }
  const calls = items.filter((i): i is Tool => i.kind === "tool");
  if (!calls.length) return "Thinking";
  const titles = calls.map((c) => describe(c).title);
  return titles.length === 1 ? (titles[0] ?? "") : `${titles[0]} and ${titles.length - 1} more`;
}

/** "Lifeline Ventures · 26 entities, 25 relations" → subject and counts. */
function describe(item: Tool): { title: string; detail: string | null } {
  const verb = tools[item.tool]?.verb ?? item.tool;
  if (!item.result) return { title: `${verb}…`, detail: null };
  const [subject, counts] = item.result.summary.split(" · ");
  if (counts) return { title: `${verb} ${subject}`, detail: counts };
  if (item.tool === "entity_search" || item.tool.startsWith("knowledge")) {
    const query = /"(?:name|input)":"([^"]+)"/.exec(item.input)?.[1];
    if (query) return { title: `${verb} “${query}”`, detail: item.result.summary };
  }
  return { title: item.result.summary, detail: null };
}

/** The agent's steps as a nested trace; the newest step opens while the run is live. */
export function TraceList({ run }: { run: Run }) {
  const groups = group(run.trace);
  const live = run.status === "running";
  const [pinned, setPinned] = useState<Record<string, boolean>>({});
  const end = useRef<HTMLDivElement>(null);
  const size = run.trace.length;

  // biome-ignore lint/correctness/useExhaustiveDependencies: follow the newest step while live
  useEffect(() => {
    if (live) end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [size, live]);

  if (groups.length === 0) {
    return (
      <p className="py-6 text-sm text-faint">
        {live ? "Connecting to Cala…" : "Each step the agent takes shows up here."}
      </p>
    );
  }

  return (
    <>
      <Trace>
        {groups.map((g, index) => {
          const last = index === groups.length - 1;
          const calls = g.items.filter((i) => i.kind === "tool").length;
          const pending = g.items.some((i) => i.kind === "tool" && !i.result);
          const failed = g.items.some((i) => i.kind === "error");
          return (
            <TraceCollapsible
              key={g.key}
              open={pinned[g.key] ?? last}
              onOpenChange={(open) => setPinned((p) => ({ ...p, [g.key]: open }))}
            >
              <TraceCollapsibleTrigger>
                <TraceLine status={failed ? "error" : last && live ? "active" : "default"}>
                  <TraceTitle>{headline(g.items)}</TraceTitle>
                  <TraceDescription>
                    {(live && last) || pending ? (
                      <LoaderCircle className="size-3.5 animate-spin text-accent" />
                    ) : calls ? (
                      `${calls} ${calls === 1 ? "call" : "calls"}`
                    ) : null}
                  </TraceDescription>
                </TraceLine>
              </TraceCollapsibleTrigger>
              <TraceCollapsibleContent>
                <Trace>
                  {g.items.map((item) => (
                    <Line key={item.key} item={item} />
                  ))}
                </Trace>
              </TraceCollapsibleContent>
            </TraceCollapsible>
          );
        })}
      </Trace>
      <div ref={end} />
    </>
  );
}

function Line({ item }: { item: TraceItem }) {
  if (item.kind === "step") return null;

  if (item.kind === "error") {
    return (
      <TraceLine status="error">
        <TraceIcon>
          <CircleAlert className="text-red-300" />
        </TraceIcon>
        <TraceTitle>{item.message}</TraceTitle>
      </TraceLine>
    );
  }

  if (item.kind === "thinking") {
    const { title, body } = split(item.text);
    return (
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceIcon>
              <Sparkles />
            </TraceIcon>
            <TraceTitle>{title ?? firstSentence(body)}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <p className="py-1.5 text-[12.5px] leading-relaxed text-dim">{body}</p>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    );
  }

  const { title, detail } = describe(item);
  const failed = item.result?.ok === false;
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>
        <TraceLine status={failed ? "error" : "default"}>
          <TraceIcon>
            {item.result ? (
              (tools[item.tool]?.icon ?? <FileSearch />)
            ) : (
              <LoaderCircle className="animate-spin text-accent" />
            )}
          </TraceIcon>
          <TraceTitle>{title}</TraceTitle>
          {detail && <TraceDescription>{detail}</TraceDescription>}
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <div className="flex flex-col gap-1 py-1.5">
          <span className="font-mono text-[11px] text-faint">{item.tool}</span>
          <code className="break-all font-mono text-[11px] leading-relaxed text-dim">
            {item.input || "No input"}
          </code>
        </div>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

export function SessionLink({ run }: { run: Run }) {
  const id = run.sessionId ?? "";
  const short = id.replace(/^warmup-/, "").slice(0, 8);
  const style = "inline-flex items-center gap-1 font-mono text-[11px] text-faint";
  return run.traceUrl ? (
    <a
      href={run.traceUrl}
      target="_blank"
      rel="noreferrer"
      title={`Langfuse session ${id}`}
      className={`${style} transition hover:text-text`}
    >
      Session {short}
      <ArrowUpRight className="size-3" />
    </a>
  ) : (
    <span title={`Langfuse session ${id}`} className={style}>
      Session {short}
    </span>
  );
}
