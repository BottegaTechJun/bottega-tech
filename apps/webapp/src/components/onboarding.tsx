"use client";

import { ChevronLeft, RotateCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { questions, suggest } from "@/lib/prefs";
import { fresh, type Progress, useProgress } from "@/lib/store";
import { ConfirmStep } from "./confirm-step";
import { Dashboard } from "./dashboard";
import { FindStep } from "./find-step";
import { Logo } from "./logo";
import { PrefsStep } from "./prefs-step";
import { ProgressBar } from "./progress-bar";
import { Shell } from "./shell";
import { StepCards, type StepId } from "./step-cards";

type View = "home" | "find" | "confirm" | "prefs";

const titles: Record<Exclude<View, "home">, string> = {
  find: "Company",
  confirm: "Facts",
  prefs: "Preferences",
};

/** A step can open only once the steps before it are done. */
function allowed(view: string | null, state: Progress): View {
  if (view === "find") return "find";
  if (view === "confirm") return state.company ? "confirm" : "find";
  if (view === "prefs") return state.confirmed ? "prefs" : state.company ? "confirm" : "find";
  return "home";
}

/** Home: step cards while onboarding, a dashboard once complete. Steps live in `?step=`. */
export function Onboarding() {
  const { state, setState, ready } = useProgress();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const asked = params.get("step");
  const view = ready ? allowed(asked, state) : "home";
  const complete = state.confirmed && state.prefsDone;
  const [sure, setSure] = useState(false);
  const latest = useRef(state);
  latest.current = state;

  // Deep links into steps not reached yet land on the first open step.
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

  const done = [Boolean(state.company), state.confirmed, state.prefsDone, complete];
  const next: StepId = !state.company
    ? "find"
    : !state.confirmed
      ? "confirm"
      : !state.prefsDone
        ? "prefs"
        : "done";

  const chip = state.company && (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-raise/60 p-2">
      <Logo name={state.company.name} website={state.company.website} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm">{state.company.name}</p>
        <p className="truncate text-xs text-faint">{state.company.hq ?? "Your company"}</p>
      </div>
    </div>
  );

  /** Keep onboarding as a local draft; an owned search is created when matching starts. */
  const save = async () => {
    const { company } = latest.current;
    setState((s) => ({ ...s, prefsDone: true }));
    if (!company) return home();
    router.push("/warm-paths?run=1");
  };

  const first = questions.findIndex((q) => state.prefs[q.id].length === 0);

  return (
    <Shell active="start" company={chip}>
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-8 md:px-10 md:py-12">
        {!(view === "home" && complete) && (
          <>
            <header className="flex min-h-11 items-start justify-between gap-4">
              {view === "home" ? (
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Get started</h1>
                  <p className="mt-1 text-sm text-dim">Four steps to your investor shortlist.</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={home}
                  className="group flex items-center gap-1 text-sm text-dim transition hover:text-text"
                >
                  <ChevronLeft className="size-4 transition group-hover:-translate-x-0.5" />
                  {complete ? "Home" : "Get started"}
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
            {view === "home" && complete && state.company && (
              <Dashboard
                company={state.company}
                prefs={state.prefs}
                open={(step) => go(step === "done" ? "home" : step)}
                reset={() => setState(fresh)}
              />
            )}

            {view === "home" && !complete && (
              <StepCards
                state={state}
                next={next}
                open={(step) => go(step === "done" ? "home" : step)}
              />
            )}

            {view === "find" && (
              <FindStep
                initial={state.company?.name ?? ""}
                pick={(company) => {
                  setState((s) =>
                    s.company?.id === company.id ? s : { ...fresh, prefs: s.prefs, company },
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
                exit={home}
                finish={save}
              />
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
