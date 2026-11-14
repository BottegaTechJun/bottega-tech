"use client";

import type { CompanyMatch, ManualCompany } from "@repo/shared";
import { ArrowRight, ChevronLeft, MapPin, RotateCcw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { Logo } from "./logo";
import { ManualCompanyForm } from "./manual-company-form";

interface Props {
  initial: string;
  changeDraft: (value: string) => void;
  manualPick: (company: ManualCompany) => void;
  pick: (company: CompanyMatch) => void;
}

type Result =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; companies: CompanyMatch[] };

export function FindStep({ initial, changeDraft, manualPick, pick }: Props) {
  const [name, setName] = useState(initial);
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const [manualStarted, setManualStarted] = useState(false);
  const short = name.trim().length === 1;

  const setQuery = (value: string) => {
    setName(value);
    changeDraft(value);
    setManualStarted(false);
  };

  const startManual = () => {
    if (name.trim()) setManualStarted(true);
  };

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

  if (manualStarted) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <button
          type="button"
          onClick={() => setManualStarted(false)}
          className="group mb-6 inline-flex items-center gap-1.5 text-sm text-dim transition hover:text-text"
        >
          <ChevronLeft className="size-4 transition group-hover:-translate-x-0.5" />
          Search again
        </button>
        <ManualCompanyForm initialName={name} complete={manualPick} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <p className="label">Company identity</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">
        Which company are you raising for?
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-dim">
        Start with the name investors know. We'll match it to public company data and use what we
        find to shape your path.
      </p>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-line bg-raise/60 p-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
          <Search className="size-4" />
        </span>
        <div>
          <p className="text-sm font-medium">Use the name people know</p>
          <p className="mt-1 text-sm leading-relaxed text-faint">
            We'll look for a public profile first. If we don't find one, you can add the details
            yourself.
          </p>
        </div>
      </div>

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
            onChange={(e) => setQuery(e.target.value)}
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
            <p className="font-medium">We don't have a match yet.</p>
            <p className="mt-1 text-faint">
              That's okay. Add a few details and we'll keep building your investor path.
            </p>
            <button type="button" className="btn-primary mt-4" onClick={startManual}>
              Continue with {name.trim()}
              <ArrowRight className="size-4" />
            </button>
          </div>
        )}

        {result.kind === "done" && result.companies.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-1 text-sm text-faint">
            <span>Choose your company to review its public facts.</span>
            <button
              type="button"
              className="shrink-0 text-text underline-offset-4 hover:underline"
              onClick={startManual}
            >
              Not here?
            </button>
          </div>
        )}

        {result.kind === "done" &&
          result.companies.map((company) => (
            <button
              key={company.id}
              type="button"
              onClick={() => pick(company)}
              onMouseEnter={() => void api.profile(company.id).catch(() => undefined)}
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
