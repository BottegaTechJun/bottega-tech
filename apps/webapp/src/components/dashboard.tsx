"use client";

import type { CompanyMatch, Profile } from "@repo/shared";
import { ArrowRight, Globe, MapPin, PenLine, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { day, money, monthsSince, roundName } from "@/lib/format";
import { answer, type Prefs } from "@/lib/prefs";
import { SlushPill } from "./confirm-step";
import { Logo } from "./logo";
import type { StepId } from "./step-cards";

interface Props {
  company: CompanyMatch;
  prefs: Prefs;
  open: (step: StepId) => void;
  reset: () => void;
}

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; profile: Profile };

const rows: { id: keyof Prefs; label: string }[] = [
  { id: "round", label: "Round" },
  { id: "size", label: "Size" },
  { id: "lead", label: "Role" },
  { id: "geo", label: "Region" },
  { id: "sector", label: "Sector" },
  { id: "timing", label: "Timing" },
];

/** Home once onboarding is complete: the company, its facts and the saved preferences. */
export function Dashboard({ company, prefs, open, reset }: Props) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [sure, setSure] = useState(false);

  const fetchProfile = useCallback(() => {
    setLoad({ kind: "loading" });
    api
      .profile(company.id)
      .then((profile) => setLoad({ kind: "done", profile }))
      .catch((err: unknown) =>
        setLoad({
          kind: "error",
          message: err instanceof ApiError ? err.message : "Could not load the company",
        }),
      );
  }, [company.id]);

  useEffect(fetchProfile, [fetchProfile]);

  const profile = load.kind === "done" ? load.profile : null;
  const website = profile?.website?.value ?? company.website;
  const hq = profile?.hq?.value ?? company.hq;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-4 pb-3">
        <Logo name={company.name} website={website} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-dim">
            {hq && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 text-faint" />
                {hq}
              </span>
            )}
            {website && (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                <Globe className="size-3.5 text-faint" />
                {website}
              </span>
            )}
          </div>
        </div>
        {profile && <SlushPill profile={profile} />}
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Link
          href="/warm-paths?run=1&fresh=1"
          className="group card flex min-h-40 animate-rise flex-col justify-between p-5 transition hover:border-edge hover:bg-raise md:col-span-3"
        >
          <span className="label">Next</span>
          <span className="flex items-end justify-between gap-4">
            <span>
              <span className="block text-lg font-medium tracking-tight">Start a new search</span>
              <span className="mt-1 block text-sm text-dim">
                Find a fresh investor shortlist from this company and its preferences.
              </span>
            </span>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition group-hover:translate-x-0.5">
              <ArrowRight className="size-4" />
            </span>
          </span>
        </Link>

        <section className="card animate-rise p-5 [animation-delay:60ms] md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="label">Facts</h2>
            <button type="button" className="btn-ghost h-8 px-3" onClick={() => open("confirm")}>
              Review
            </button>
          </div>
          {load.kind === "loading" && (
            <div className="mt-4 grid grid-cols-2 gap-4" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-10" />
              ))}
            </div>
          )}
          {load.kind === "error" && (
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-sm text-dim">{load.message}</p>
              <button type="button" className="btn-ghost h-8" onClick={fetchProfile}>
                <RotateCcw className="size-3.5" />
                Retry
              </button>
            </div>
          )}
          {profile && <Facts profile={profile} />}
        </section>

        <section className="card animate-rise p-5 [animation-delay:120ms]">
          <div className="flex items-center justify-between">
            <h2 className="label">Preferences</h2>
            <button type="button" className="btn-ghost h-8 px-3" onClick={() => open("prefs")}>
              <PenLine className="size-3.5" />
              Edit
            </button>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
            {rows.map((row) => (
              <div key={row.id} className="min-w-0">
                <dt className="text-xs text-faint">{row.label}</dt>
                <dd className="mt-0.5 truncate text-sm">{answer(prefs, row.id) || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 pt-3">
        <button type="button" className="btn-ghost" onClick={() => open("find")}>
          <Search className="size-4" />
          Change company
        </button>
        {sure ? (
          <span className="inline-flex items-center gap-2">
            <button type="button" className="btn-ghost" onClick={() => setSure(false)}>
              Keep
            </button>
            <button type="button" className="btn-primary" onClick={reset}>
              Clear everything
            </button>
          </span>
        ) : (
          <button type="button" className="btn-ghost" onClick={() => setSure(true)}>
            <RotateCcw className="size-4" />
            Start over
          </button>
        )}
      </footer>
    </div>
  );
}

function Facts({ profile }: { profile: Profile }) {
  const last = profile.rounds[0];
  const since = monthsSince(last?.date ?? null);
  const leads = profile.investors.filter((i) => i.led.length > 0).map((i) => i.name);
  const cells = [
    { label: "Last round", value: last ? roundName(last.label) : "—" },
    { label: "Amount", value: last ? money(last.amount, last.currency) : "—" },
    {
      label: "Date",
      value: last ? day(last.date) : "—",
      sub: since !== null ? `${since} mo ago` : "",
    },
    {
      label: "Investors",
      value: String(profile.investors.length),
      sub: leads.length ? `Led by ${leads.join(", ")}` : "",
    },
  ];
  return (
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0">
          <dt className="text-xs text-faint">{cell.label}</dt>
          <dd className="mt-0.5 font-mono text-lg tracking-tight">{cell.value}</dd>
          {cell.sub && <dd className="truncate text-xs text-dim">{cell.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
