"use client";

import type { ManualCompany } from "@repo/shared";
import { ArrowRight, Check, ChevronLeft, Network, RotateCcw, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { questions, suggest } from "@/lib/prefs";
import { fresh, type Progress, useProgress } from "@/lib/store";
import { ConfirmStep } from "./confirm-step";
import { Dashboard } from "./dashboard";
import { FindStep } from "./find-step";
import { Logo } from "./logo";
import { PrefsStep } from "./prefs-step";
import { ProgressBar } from "./progress-bar";
import { Shell } from "./shell";

type View = "welcome" | "home" | "find" | "confirm" | "prefs";

const titles: Record<Exclude<View, "welcome" | "home">, string> = {
  find: "Connect company",
  confirm: "Facts",
  prefs: "Preferences",
};

/** A step can open only once the steps before it are done. */
function allowed(view: string | null, state: Progress): View {
  if (view === "welcome") return state.company ? firstOpen(state) : "welcome";
  if (view === "find") return "find";
  if (view === "confirm") return state.manualCompany ? "find" : state.company ? "confirm" : "find";
  if (view === "prefs") return state.confirmed ? "prefs" : state.company ? "confirm" : "find";
  return firstOpen(state);
}

function firstOpen(state: Progress): View {
  if (!state.company) return "welcome";
  if (!state.confirmed) return "confirm";
  if (!state.prefsDone) return "prefs";
  return "home";
}

/** The active onboarding form stays front and center; the dashboard appears once complete. */
export function Onboarding() {
  const { state, setState, ready } = useProgress();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const asked = params.get("step");
  const view = ready ? (asked ? allowed(asked, state) : firstOpen(state)) : "home";
  const complete = state.confirmed && state.prefsDone;
  const [sure, setSure] = useState(false);

  useEffect(() => {
    if (!ready || !asked) return;
    const to = allowed(asked, state);
    if (to !== asked) router.replace(to === "home" ? path : `${path}?step=${to}`);
  }, [ready, asked, state, router, path]);

  const go = (to: View) => {
    setSure(false);
    router.push(to === "home" ? path : `${path}?step=${to}`, { scroll: true });
  };
  const home = () => go("home");
  const previous = state.manualCompany
    ? "find"
    : view === "prefs"
      ? "confirm"
      : view === "confirm"
        ? "find"
        : "home";

  const done = [Boolean(state.company), state.confirmed, state.prefsDone, complete];

  const chip = state.company && (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-raise/60 p-2">
      <Logo name={state.company.name} website={state.company.website} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm">{state.company.name}</p>
        <p className="truncate text-xs text-faint">{state.company.hq ?? "Your company"}</p>
      </div>
    </div>
  );

  const first = questions.findIndex((q) => state.prefs[q.id].length === 0);

  const chooseManual = (manualCompany: ManualCompany) => {
    const company = {
      id: crypto.randomUUID(),
      name: manualCompany.name,
      description: null,
      hq: manualCompany.hq,
      website: manualCompany.website,
    };
    setState((s) => ({
      ...fresh,
      company,
      manualCompany,
      draftCompanyName: manualCompany.name,
      prefs: s.prefs,
      confirmed: true,
    }));
    go("prefs");
  };

  return (
    <Shell active="start" company={chip}>
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-8 md:px-10 md:py-12">
        {view !== "welcome" && !(view === "home" && complete) && (
          <>
            <header className="flex min-h-11 items-start justify-between gap-4">
              {view === "find" ? (
                <div className="max-w-2xl">
                  <p className="label">Get started / Step 1</p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                    Find the network around your company.
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-dim">
                    Start with one public company record. We'll turn its funding history into a
                    warmer path to your next round.
                  </p>
                </div>
              ) : view === "home" ? (
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Get started</h1>
                  <p className="mt-1 text-sm text-dim">
                    Connect, review, tailor, and explore your investor path.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => go(previous)}
                  className="group flex items-center gap-1 text-sm text-dim transition hover:text-text"
                >
                  <ChevronLeft className="size-4 transition group-hover:-translate-x-0.5" />
                  {previous === "find"
                    ? "Company"
                    : previous === "confirm"
                      ? "Facts"
                      : "Get started"}
                  <span className="text-faint">/</span>
                  <span className="text-text">{titles[view]}</span>
                </button>
              )}
              {ready &&
                state.company &&
                view === "home" &&
                (sure ? (
                  <span className="inline-flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      className="text-faint transition hover:text-dim"
                      onClick={() => setSure(false)}
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      className="text-text transition hover:text-accent"
                      onClick={() => {
                        setState(fresh);
                        setSure(false);
                      }}
                    >
                      Clear everything
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs text-faint transition hover:text-dim"
                    onClick={() => setSure(true)}
                  >
                    <RotateCcw className="size-3.5" />
                    Start over
                  </button>
                ))}
            </header>

            <div className="mt-6 mb-10">
              <ProgressBar done={done.filter(Boolean).length} total={done.length} />
            </div>
          </>
        )}

        {!ready ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3" aria-busy="true">
            <div className="skeleton h-56 rounded-2xl md:col-span-2" />
            <div className="skeleton h-56 rounded-2xl" />
          </div>
        ) : (
          <div key={view} className="animate-rise">
            {view === "welcome" && (
              <Welcome
                draft={state.draftCompanyName}
                start={() => go("find")}
                clear={() => setState(fresh)}
              />
            )}

            {view === "home" && complete && state.company && (
              <Dashboard
                company={state.company}
                prefs={state.prefs}
                manualCompany={state.manualCompany}
                open={(step) =>
                  go(
                    state.manualCompany && step === "confirm"
                      ? "find"
                      : step === "done"
                        ? "home"
                        : step,
                  )
                }
                reset={() => setState(fresh)}
              />
            )}

            {view === "find" && (
              <FindStep
                initial={state.draftCompanyName ?? state.company?.name ?? ""}
                changeDraft={(draftCompanyName) => setState((s) => ({ ...s, draftCompanyName }))}
                manualPick={chooseManual}
                pick={(company) => {
                  setState((s) =>
                    s.company?.id === company.id
                      ? { ...s, draftCompanyName: company.name }
                      : { ...fresh, prefs: s.prefs, draftCompanyName: company.name, company },
                  );
                  go("confirm");
                }}
              />
            )}

            {view === "confirm" && state.company && (
              <ConfirmStep
                company={state.company}
                back={() => go("find")}
                confirm={(profile) => {
                  const hint = suggest(
                    profile.stage?.value ?? null,
                    profile.industries.map((i) => i.value),
                  );
                  setState((s) => ({
                    ...s,
                    confirmed: true,
                    prefs: {
                      ...s.prefs,
                      round: s.prefs.round.length ? s.prefs.round : (hint.round ?? []),
                      sector: s.prefs.sector.length ? s.prefs.sector : (hint.sector ?? []),
                    },
                  }));
                  go(state.prefsDone ? "home" : "prefs");
                }}
              />
            )}

            {view === "prefs" && (
              <PrefsStep
                prefs={state.prefs}
                start={state.prefsDone || first < 2 ? 0 : first}
                change={(prefs) => setState((s) => ({ ...s, prefs }))}
                exit={() => go(state.manualCompany ? "find" : "confirm")}
                finish={() => {
                  setState((s) => ({ ...s, prefsDone: true }));
                  home();
                }}
              />
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function Welcome({
  draft,
  start,
  clear,
}: {
  draft: string | null;
  start: () => void;
  clear: () => void;
}) {
  const hasDraft = Boolean(draft?.trim());

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-3xl flex-col justify-center py-10 md:min-h-[calc(100dvh-9rem)]">
      <div className="max-w-2xl">
        <p className="label">Bottega / Investor discovery</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Find the network around your company.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-dim">
          Start with your company, add context where needed, and explore warm paths to your next
          round.
        </p>
      </div>

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary h-12 px-5" onClick={start}>
          {hasDraft ? "Continue setup" : "Start with my company"}
          <ArrowRight className="size-4" />
        </button>
        {hasDraft && (
          <button type="button" className="btn-ghost h-12" onClick={clear}>
            Start fresh
          </button>
        )}
      </div>

      {hasDraft && (
        <p className="mt-3 text-sm text-faint">
          Your saved search: <span className="text-dim">{draft}</span>
        </p>
      )}

      <div className="mt-16 grid gap-3 border-t border-line pt-6 sm:grid-cols-3">
        <WelcomeStep
          icon={<Search className="size-4" />}
          title="Identify"
          text="Find your company or tell us about it."
        />
        <WelcomeStep
          icon={<Check className="size-4" />}
          title="Add context"
          text="Review facts or add comparable companies."
        />
        <WelcomeStep
          icon={<Network className="size-4" />}
          title="Explore"
          text="See investor paths built from relevant connections."
        />
      </div>
    </div>
  );
}

function WelcomeStep({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-raise text-accent">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-faint">{text}</p>
      </div>
    </div>
  );
}
