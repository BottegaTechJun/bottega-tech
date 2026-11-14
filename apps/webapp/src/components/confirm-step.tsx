"use client";

import type { CompanyMatch, Profile } from "@repo/shared";
import { ArrowRight, Globe, MapPin, RotateCcw, Ticket } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { day, industry, initials, money, monthsSince, roundName } from "@/lib/format";
import { Logo } from "./logo";
import { Source } from "./source";

interface Props {
  company: CompanyMatch;
  confirm: (profile: Profile) => void;
  back: () => void;
}

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; profile: Profile };

export function ConfirmStep({ company, confirm, back }: Props) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });

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

  if (load.kind === "loading") return <Skeleton />;
  if (load.kind === "error") {
    return (
      <div className="card mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-10 text-center">
        <p className="text-sm text-dim">{load.message}</p>
        <button type="button" className="btn-ghost" onClick={fetchProfile}>
          <RotateCcw className="size-4" />
          Retry
        </button>
      </div>
    );
  }

  const { profile } = load;
  const lastRound = profile.rounds[0];
  const since = monthsSince(lastRound?.date ?? null);

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-4 pb-3">
        <Logo name={profile.name} website={profile.website?.value ?? company.website} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">{profile.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-dim">
            {profile.hq && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 text-faint" />
                {profile.hq.value}
                <Source cites={profile.hq.sources} />
              </span>
            )}
            {profile.website && (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                <Globe className="size-3.5 text-faint" />
                {profile.website.value}
                <Source cites={profile.website.sources} />
              </span>
            )}
          </div>
        </div>
        <SlushPill profile={profile} />
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <section className="card animate-rise p-5 md:col-span-2">
          <div className="flex items-baseline justify-between">
            <h3 className="label">Funding rounds</h3>
            {since !== null && (
              <span className="font-mono text-xs text-faint">{since} mo since last round</span>
            )}
          </div>
          {profile.rounds.length === 0 ? (
            <p className="mt-6 text-sm text-faint">No rounds recorded in Cala.</p>
          ) : (
            <ol className="mt-4 flex flex-col gap-2">
              {profile.rounds.map((round) => (
                <li key={round.id} className="rounded-xl bg-panel/70 p-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-medium">{roundName(round.label)}</span>
                    <span className="font-mono text-sm text-dim">{day(round.date)}</span>
                    <span className="ml-auto font-mono text-lg tracking-tight">
                      {money(round.amount, round.currency)}
                    </span>
                    <Source cites={round.sources} />
                  </div>
                  {round.backers.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {round.backers.map((backer) => (
                        <span
                          key={backer.id}
                          className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs ${backer.lead ? "border-accent/50 text-text" : "border-line text-dim"}`}
                        >
                          {backer.name}
                          {backer.lead && (
                            <span className="font-mono text-[10px] text-accent">LEAD</span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card animate-rise p-5 [animation-delay:60ms]">
          <h3 className="label">Company</h3>
          <dl className="mt-4 flex flex-col gap-4">
            <Fact label="Founded" value={profile.founded ? day(profile.founded.value) : "—"}>
              {profile.founded && <Source cites={profile.founded.sources} />}
            </Fact>
            <Fact label="Stage" value={profile.stage ? roundName(profile.stage.value) : "—"}>
              {profile.stage && <Source cites={profile.stage.sources} />}
            </Fact>
            {profile.industries.length === 0 ? (
              <Fact label="Industry" value="—" />
            ) : (
              profile.industries.map((item) => (
                <Fact key={item.value} label="Industry" value={industry(item.value)}>
                  <Source cites={item.sources} />
                </Fact>
              ))
            )}
          </dl>
        </section>

        <section className="card animate-rise p-5 md:col-span-2 [animation-delay:120ms]">
          <h3 className="label">Current investors</h3>
          {profile.investors.length === 0 ? (
            <p className="mt-6 text-sm text-faint">No investors recorded in Cala.</p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {profile.investors.map((investor) => (
                <li
                  key={investor.id}
                  className="flex items-center gap-3 rounded-xl bg-panel/70 p-3"
                >
                  <Logo name={investor.name} website={investor.website} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{investor.name}</p>
                    <p className="mt-0.5 font-mono text-[11px]">
                      {investor.led.length > 0 ? (
                        <span className="text-accent">
                          Led {investor.led.map(roundName).join(", ")}
                        </span>
                      ) : (
                        <span className="text-faint">Participated</span>
                      )}
                    </p>
                  </div>
                  <Source cites={investor.sources} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card animate-rise p-5 [animation-delay:180ms]">
          <h3 className="label">Team</h3>
          {profile.people.length === 0 ? (
            <p className="mt-6 text-sm text-faint">No founders recorded in Cala.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {profile.people.map((person) => (
                <li key={person.id} className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-hover font-mono text-[11px] text-dim">
                    {initials(person.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{person.name}</p>
                    <p className="font-mono text-[11px] text-faint">
                      {person.roles.map((role) => (role === "CEO" ? "CEO" : "Founder")).join(" · ")}
                    </p>
                  </div>
                  <Source cites={person.sources} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="flex items-center justify-end gap-2 pt-3">
        <button type="button" className="btn-ghost" onClick={back}>
          Not my company
        </button>
        <button type="button" className="btn-primary" onClick={() => confirm(profile)}>
          Looks right
          <ArrowRight className="size-4" />
        </button>
      </footer>
    </div>
  );
}

function Fact({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <dt className="text-xs text-faint">{label}</dt>
        <dd className="mt-0.5 text-sm">{value}</dd>
      </div>
      {children}
    </div>
  );
}

function SlushPill({ profile }: { profile: Profile }) {
  if (!profile.slush.listed) {
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-full border border-dashed border-line px-4 text-sm text-faint">
        <Ticket className="size-4" />
        Not listed for Slush 2026
      </span>
    );
  }
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-full border border-accent/40 bg-accent/10 pr-1.5 pl-4 text-sm">
      <Ticket className="size-4 text-accent" />
      Listed for Slush 2026
      <Source cites={profile.slush.sources} />
    </span>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="flex items-center gap-4 pb-3">
        <div className="skeleton size-14 rounded-xl" />
        <div className="flex flex-col gap-2">
          <div className="skeleton h-6 w-48" />
          <div className="skeleton h-4 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="skeleton h-56 rounded-2xl md:col-span-2" />
        <div className="skeleton h-56 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl md:col-span-2" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    </div>
  );
}
