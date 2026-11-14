"use client";

import { ChevronLeft, RotateCcw } from "lucide-react";
import { useState } from "react";
import { suggest } from "@/lib/prefs";
import { fresh, useProgress } from "@/lib/store";
import { ConfirmStep } from "./confirm-step";
import { DoneStep } from "./done-step";
import { FindStep } from "./find-step";
import { Logo } from "./logo";
import { PrefsStep } from "./prefs-step";
import { ProgressBar } from "./progress-bar";
import { Shell } from "./shell";
import { StepCards, type StepId } from "./step-cards";

const titles: Record<StepId, string> = {
  find: "Company",
  confirm: "Facts",
  prefs: "Preferences",
  done: "Summary",
};

/** The Get started page: progress on top, step cards below, one step open at a time. */
export function Onboarding() {
  const { state, setState, ready } = useProgress();
  const [view, setView] = useState<"home" | StepId>("home");

  const done = [Boolean(state.company), state.confirmed, state.prefsDone, state.prefsDone];
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

  return (
    <Shell active="start" company={chip}>
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-8 md:px-10 md:py-12">
        <header className="flex items-start justify-between gap-4">
          {view === "home" ? (
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Get started</h1>
              <p className="mt-1 text-sm text-dim">Four steps to your Series A shortlist.</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setView("home")}
              className="group flex items-center gap-1 text-sm text-dim transition hover:text-text"
            >
              <ChevronLeft className="size-4 transition group-hover:-translate-x-0.5" />
              Get started
              <span className="text-faint">/</span>
              <span className="text-text">{titles[view]}</span>
            </button>
          )}
          {ready && state.company && view === "home" && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs text-faint transition hover:text-dim"
              onClick={() => setState(fresh)}
            >
              <RotateCcw className="size-3.5" />
              Start over
            </button>
          )}
        </header>

        <div className="mt-6 mb-10">
          <ProgressBar done={done.filter(Boolean).length} total={done.length} />
        </div>

        {!ready ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="skeleton h-56 rounded-2xl md:col-span-2" />
            <div className="skeleton h-56 rounded-2xl" />
          </div>
        ) : (
          <div key={view} className="animate-rise">
            {view === "home" && <StepCards state={state} next={next} open={setView} />}

            {view === "find" && (
              <FindStep
                initial={state.company?.name ?? ""}
                pick={(company) => {
                  setState((s) =>
                    s.company?.id === company.id ? s : { ...fresh, prefs: s.prefs, company },
                  );
                  setView("confirm");
                }}
              />
            )}

            {view === "confirm" && state.company && (
              <ConfirmStep
                company={state.company}
                back={() => setView("find")}
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
                  setView(state.prefsDone ? "done" : "prefs");
                }}
              />
            )}

            {view === "prefs" && (
              <PrefsStep
                prefs={state.prefs}
                change={(prefs) => setState((s) => ({ ...s, prefs }))}
                exit={() => setView("home")}
                finish={() => {
                  setState((s) => ({ ...s, prefsDone: true }));
                  setView("done");
                }}
              />
            )}

            {view === "done" && state.company && (
              <DoneStep company={state.company} prefs={state.prefs} edit={() => setView("prefs")} />
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
