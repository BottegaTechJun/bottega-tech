"use client";

import type { QueryResponse, SearchResponse } from "@repo/shared";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { QueryResult } from "@/components/query-result";
import { SearchResult } from "@/components/search-result";
import { Button } from "@/components/ui/button";
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

const MODES: Record<Mode, { label: string; placeholder: string; empty: string }> = {
  search: {
    label: "Search",
    placeholder: "Which investors led seed rounds in Finnish startups in 2025?",
    empty: "Ask a question in plain language to get a sourced answer.",
  },
  query: {
    label: "Query",
    placeholder: "startups.location=Spain.funding>10M.funding<50M",
    empty: "Run a structured Dot-Notation query to get a table of results.",
  },
};

export function Explorer() {
  const [mode, setMode] = useState<Mode>("search");
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  const loading = state.status === "loading";

  function changeMode(next: Mode) {
    setMode(next);
    setState({ status: "idle" });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
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

  return (
    <div className="stack">
      <Tabs value={mode} onValueChange={(value) => changeMode(value as Mode)}>
        <TabsList>
          <TabsTrigger value="search">{MODES.search.label}</TabsTrigger>
          <TabsTrigger value="query">{MODES.query.label}</TabsTrigger>
        </TabsList>
      </Tabs>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={MODES[mode].placeholder}
          aria-label={MODES[mode].label}
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          {loading ? "Loading…" : MODES[mode].label}
        </Button>
      </form>

      {state.status === "idle" && <p className="empty-state">{MODES[mode].empty}</p>}
      {state.status === "loading" && <LoadingSkeleton />}
      {state.status === "search" && <SearchResult data={state.data} />}
      {state.status === "query" && <QueryResult data={state.data} />}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="stack" aria-busy="true">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
