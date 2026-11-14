"use client";

import type { CompanyMatch, ManualCompany } from "@repo/shared";
import { ArrowRight, Check, ChevronDown, ChevronUp, MapPin, Search, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { Logo } from "./logo";

interface Props {
  initialName: string;
  complete: (company: ManualCompany) => void;
}

type SimilarResult =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; companies: CompanyMatch[] };

const inputClass =
  "mt-2 h-11 w-full rounded-xl border border-line bg-panel px-3.5 text-sm outline-none transition placeholder:text-faint focus:border-accent/60";

/** Collects the context needed to make the investor search useful. */
export function ManualCompanyForm({ initialName, complete }: Props) {
  const [name, setName] = useState(initialName);
  const [website, setWebsite] = useState("");
  const [hq, setHq] = useState("");
  const [industry, setIndustry] = useState("");
  const [stage, setStage] = useState("");
  const [targetRound, setTargetRound] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [similarQuery, setSimilarQuery] = useState("");
  const [similarResult, setSimilarResult] = useState<SimilarResult>({ kind: "idle" });
  const [similar, setSimilar] = useState<CompanyMatch[]>([]);
  const [roundOpen, setRoundOpen] = useState(false);
  const [similarOpen, setSimilarOpen] = useState(false);

  useEffect(() => {
    const query = similarQuery.trim();
    if (query.length < 2) {
      setSimilarResult({ kind: "idle" });
      return;
    }

    const ctrl = new AbortController();
    setSimilarResult({ kind: "loading" });
    const timer = setTimeout(() => {
      api
        .companies(query, ctrl.signal)
        .then(({ companies }) => setSimilarResult({ kind: "done", companies }))
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return;
          setSimilarResult({
            kind: "error",
            message: err instanceof ApiError ? err.message : "Similar-company search failed",
          });
        });
    }, 280);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [similarQuery]);

  const addSimilar = (company: CompanyMatch) => {
    setSimilar((current) => {
      if (current.some((item) => item.id === company.id) || current.length >= 5) return current;
      return [...current, company];
    });
  };

  const removeSimilar = (id: string) => {
    setSimilar((current) => current.filter((company) => company.id !== id));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    complete({
      name: name.trim(),
      website: normalizeWebsite(website),
      hq: clean(hq),
      industry: clean(industry),
      stage: clean(stage),
      targetRound: clean(targetRound),
      targetAmount: clean(targetAmount),
      similarCompanies: similar,
    });
  };

  return (
    <section className="rounded-[20px] border border-edge bg-raise/70 p-5 sm:p-6">
      <header>
        <p className="label">A little more context</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">
          Tell us a little more about your company.
        </h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-dim">
          We couldn't match a public profile yet. Start with the basics and add more only if it
          helps describe where you are going.
        </p>
      </header>

      <form className="mt-6" onSubmit={submit}>
        <label className="block text-sm">
          <span className="text-dim">Company name</span>
          <input
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="The name you use publicly"
            autoComplete="organization"
            required
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-dim">Website</span>
            <input
              className={inputClass}
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="company.com"
              autoComplete="url"
            />
          </label>
          <label className="block text-sm">
            <span className="text-dim">HQ or main market</span>
            <input
              className={inputClass}
              value={hq}
              onChange={(event) => setHq(event.target.value)}
              placeholder="Helsinki, Finland"
              autoComplete="address-level2"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-dim">What do you build?</span>
            <input
              className={inputClass}
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              placeholder="AI software for logistics"
            />
          </label>
          <label className="block text-sm">
            <span className="text-dim">Current stage</span>
            <input
              className={inputClass}
              value={stage}
              onChange={(event) => setStage(event.target.value)}
              placeholder="Seed, Series A..."
            />
          </label>
        </div>

        <Disclosure
          open={roundOpen}
          onClick={() => setRoundOpen((open) => !open)}
          title="Add fundraising details"
          detail="Optional - helps tailor the investor search"
        />
        {roundOpen && (
          <div className="grid gap-4 border-b border-line pb-5 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-dim">Next round</span>
              <input
                className={inputClass}
                value={targetRound}
                onChange={(event) => setTargetRound(event.target.value)}
                placeholder="Series A"
              />
            </label>
            <label className="block text-sm">
              <span className="text-dim">Target amount</span>
              <input
                className={inputClass}
                value={targetAmount}
                onChange={(event) => setTargetAmount(event.target.value)}
                placeholder="$5M"
              />
            </label>
          </div>
        )}

        <Disclosure
          open={similarOpen}
          onClick={() => setSimilarOpen((open) => !open)}
          title="Add similar companies"
          detail="Optional - use examples to sharpen the search"
        />
        {similarOpen && (
          <div className="border-b border-line pb-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-faint">Choose up to five companies that feel similar.</p>
              <span className="font-mono text-xs text-faint">{similar.length}/5</span>
            </div>

            <label className="mt-4 flex h-11 items-center gap-3 rounded-xl border border-line bg-panel px-3.5 transition focus-within:border-accent/60">
              <Search className="size-4 text-faint" />
              <span className="sr-only">Search for similar companies</span>
              <input
                value={similarQuery}
                onChange={(event) => setSimilarQuery(event.target.value)}
                placeholder="Search a comparable company"
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
              />
              {similarResult.kind === "loading" && (
                <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
              )}
            </label>

            {similarResult.kind === "error" && (
              <p className="mt-2 text-sm text-amber-200">{similarResult.message}</p>
            )}
            {similarResult.kind === "done" && similarResult.companies.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                {similarResult.companies.map((company) => {
                  const selected = similar.some((item) => item.id === company.id);
                  return (
                    <button
                      key={company.id}
                      type="button"
                      disabled={selected || similar.length >= 5}
                      onClick={() => addSimilar(company)}
                      className="group flex items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-line hover:bg-panel disabled:cursor-default disabled:opacity-60"
                    >
                      <Logo name={company.name} website={company.website} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{company.name}</span>
                        <span className="mt-0.5 flex items-center gap-2 truncate text-xs text-faint">
                          {company.hq && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3" />
                              {company.hq}
                            </span>
                          )}
                          {company.website && <span className="font-mono">{company.website}</span>}
                        </span>
                      </span>
                      {selected ? (
                        <Check className="size-4 shrink-0 text-accent" />
                      ) : (
                        <span className="text-xs text-faint transition group-hover:text-text">
                          Add
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {similar.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {similar.map((company) => (
                  <span
                    key={company.id}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 py-1.5 pr-2 pl-3 text-xs"
                  >
                    <span className="max-w-48 truncate">{company.name}</span>
                    <button
                      type="button"
                      onClick={() => removeSimilar(company.id)}
                      aria-label={`Remove ${company.name}`}
                      className="grid size-4 place-items-center rounded-full text-accent transition hover:bg-accent/20"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <footer className="mt-6 flex justify-end">
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={!name.trim()}>
            Continue
            <ArrowRight className="size-4" />
          </button>
        </footer>
      </form>
    </section>
  );
}

function Disclosure({
  open,
  onClick,
  title,
  detail,
}: {
  open: boolean;
  onClick: () => void;
  title: string;
  detail: string;
}) {
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 flex w-full items-center justify-between gap-4 border-t border-line py-4 text-left transition hover:text-text"
      aria-expanded={open}
    >
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-sm text-faint">{detail}</span>
      </span>
      <Icon className="size-4 shrink-0 text-faint" />
    </button>
  );
}

function clean(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}
