"use client";

import type { QueryResponse, SearchResponse } from "@repo/shared";
import {
  ArrowRightIcon,
  BracesIcon,
  Loader2Icon,
  type LucideIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { QueryResult } from "@/components/query-result";
import { SearchResult } from "@/components/search-result";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api } from "@/lib/api";

type Mode = "search" | "query";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "search"; data: SearchResponse }
  | { status: "query"; data: QueryResponse };

interface ModeConfig {
  label: string;
  icon: LucideIcon;
  placeholder: string;
  hint: string;
  emptyTitle: string;
  emptyText: string;
  loadingText: string;
  examples: string[];
}

const MODES: Record<Mode, ModeConfig> = {
  search: {
    label: "Search",
    icon: SearchIcon,
    placeholder: "Ask a question…",
    hint: "Natural language",
    emptyTitle: "Ask in plain language",
    emptyText: "Get a written answer with its sources and the companies and people it mentions.",
    loadingText: "Searching the knowledge graph…",
    examples: [
      "Which investors led seed rounds in Finnish startups in 2025?",
      "Who founded Mistral AI and who has invested in it?",
      "Largest climate tech rounds in Southern Europe this year",
    ],
  },
  query: {
    label: "Query",
    icon: BracesIcon,
    placeholder: "startups.location=Spain.funding>10M.funding<50M",
    hint: "Dot-Notation",
    emptyTitle: "Run a structured query",
    emptyText: "Filter entities with Dot-Notation and get the matches back as a table.",
    loadingText: "Running query…",
    examples: [
      "startups.location=Spain.funding>10M.funding<50M",
      "startups.location=Spain.funding>10M.order_by=funding DESC.limit=5.return(name, funding, sector)",
      "companies.investors=Sequoia Capital,Andreessen Horowitz",
    ],
  },
};

/** Removes the default input chrome; the surrounding composer panel draws the field. */
const INPUT_CLASS =
  "h-11 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent";

export function Explorer() {
  const [mode, setMode] = useState<Mode>("search");
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  const config = MODES[mode];
  const loading = state.status === "loading";

  function changeMode(next: Mode) {
    setMode(next);
    setInput("");
    setState({ status: "idle" });
  }

  async function run(raw: string) {
    const value = raw.trim();
    if (!value || loading) return;

    setState({ status: "loading" });
    try {
      setState(
        mode === "search"
          ? { status: "search", data: await api.search(value) }
          : { status: "query", data: await api.query(value) },
      );
    } catch (error) {
      setState({ status: "idle" });
      toast.error(error instanceof ApiError ? error.message : "Something went wrong");
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void run(input);
  }

  function pickExample(example: string) {
    setInput(example);
    void run(example);
  }

  return (
    <div className="explorer">
      <div className="composer">
        <div className="composer-bar">
          <Tabs value={mode} onValueChange={(value) => changeMode(value as Mode)}>
            <TabsList>
              <TabsTrigger value="search">
                <SearchIcon aria-hidden="true" />
                {MODES.search.label}
              </TabsTrigger>
              <TabsTrigger value="query">
                <BracesIcon aria-hidden="true" />
                {MODES.query.label}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="composer-hint">{config.hint}</span>
        </div>

        <form onSubmit={handleSubmit} className="composer-form">
          <config.icon className="composer-icon" aria-hidden="true" />
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={config.placeholder}
            aria-label={config.label}
            className={mode === "query" ? `${INPUT_CLASS} font-mono` : INPUT_CLASS}
          />
          <Button type="submit" size="lg" disabled={loading || !input.trim()}>
            {loading ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <>
                {config.label}
                <ArrowRightIcon className="submit-arrow" aria-hidden="true" />
              </>
            )}
          </Button>
        </form>
      </div>

      {state.status === "idle" && (
        <div className="empty-state" key={mode}>
          <div className="empty-icon">
            <SparklesIcon aria-hidden="true" />
          </div>
          <p className="empty-title">{config.emptyTitle}</p>
          <p className="empty-text">{config.emptyText}</p>
          <div className="examples">
            {config.examples.map((example) => (
              <Button
                key={example}
                type="button"
                variant="outline"
                size="sm"
                className={
                  mode === "query"
                    ? "max-w-full truncate rounded-full font-mono"
                    : "max-w-full truncate rounded-full"
                }
                onClick={() => pickExample(example)}
              >
                {example}
              </Button>
            ))}
          </div>
        </div>
      )}
      {state.status === "loading" && <LoadingState text={config.loadingText} />}
      {state.status === "search" && <SearchResult data={state.data} />}
      {state.status === "query" && <QueryResult data={state.data} />}
    </div>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div className="stack reveal" aria-busy="true" aria-live="polite">
      <p className="loading-status">
        <span className="pulse-dot" />
        {text}
      </p>
      <Card className="shimmer">
        <CardContent className="stack">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    </div>
  );
}
