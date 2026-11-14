"use client";

import type { CompanyMatch } from "@repo/shared";
import { ArrowRight, MapPin, RotateCcw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { Logo } from "./logo";

interface Props {
  initial: string;
  pick: (company: CompanyMatch) => void;
}

type Result =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; companies: CompanyMatch[] };

export function FindStep({ initial, pick }: Props) {
  const [name, setName] = useState(initial);
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const short = name.trim().length === 1;

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the search on Retry
  useEffect(() => {
    const query = name.trim();
    if (query.length < 2) {
      setResult({ kind: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setResult({ kind: "loading" });
    const timer = setTimeout(() => {
      api
        .companies(query, ctrl.signal)
        .then(({ companies }) => setResult({ kind: "done", companies }))
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return;
          setResult({
            kind: "error",
            message: err instanceof ApiError ? err.message : "Search failed",
          });
        });
    }, 280);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [name, attempt]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h2 className="text-2xl font-semibold tracking-tight">Find your company</h2>

      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          const [first] = result.kind === "done" ? result.companies : [];
          if (first) pick(first);
        }}
      >
        <label className="mt-6 flex h-14 items-center gap-3 rounded-full border border-edge bg-raise px-5 transition focus-within:border-accent/60">
          <Search className="size-5 text-faint" />
          <span className="sr-only">Company name</span>
          <input
            // biome-ignore lint/a11y/noAutofocus: the single input on this step
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company name"
            enterKeyHint="search"
            className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-faint"
          />
          {result.kind === "loading" && (
            <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
          )}
        </label>
      </form>

      {result.kind === "idle" && short && <p className="mt-4 text-sm text-faint">Keep typing.</p>}

      {result.kind === "idle" && !short && (
        <p className="mt-4 text-sm text-faint">
          Search by your company&apos;s name to find its profile.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-1.5">
        {result.kind === "loading" &&
          [0, 1, 2].map((i) => <div key={i} className="skeleton h-[68px] rounded-2xl" />)}

        {result.kind === "error" && (
          <div className="card flex items-center justify-between gap-4 px-5 py-3">
            <p className="text-sm text-dim">{result.message}</p>
            <button
              type="button"
              className="btn-ghost h-8"
              onClick={() => setAttempt((n) => n + 1)}
            >
              <RotateCcw className="size-3.5" />
              Retry
            </button>
          </div>
        )}

        {result.kind === "done" && result.companies.length === 0 && (
          <div className="card px-5 py-4 text-sm">
            <p className="text-dim">No company with that name in Cala.</p>
            <p className="mt-1 text-faint">Try the legal name or drop suffixes like Oy or Ltd.</p>
          </div>
        )}

        {result.kind === "done" &&
          result.companies.map((company, i) => (
            <button
              key={company.id}
              type="button"
              onClick={() => pick(company)}
              onMouseEnter={() => void api.profile(company.id).catch(() => undefined)}
              style={{ animationDelay: `${i * 40}ms` }}
              className="group card flex animate-rise items-center gap-4 px-4 py-3 text-left transition hover:border-edge hover:bg-raise"
            >
              <Logo name={company.name} website={company.website} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{company.name}</p>
                <p className="mt-0.5 flex items-center gap-3 truncate text-sm text-faint">
                  {company.hq && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {company.hq}
                    </span>
                  )}
                  {company.website && <span className="font-mono text-xs">{company.website}</span>}
                  {!company.hq && !company.website && (
                    <span className="truncate">{company.description}</span>
                  )}
                </p>
              </div>
              <ArrowRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-text" />
            </button>
          ))}
      </div>
    </div>
  );
}
