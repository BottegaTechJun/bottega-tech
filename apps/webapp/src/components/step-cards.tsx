import { ArrowRight, Check, Lock, Search } from "lucide-react";
import type { Progress } from "@/lib/store";
import { Logo } from "./logo";

export type StepId = "find" | "confirm" | "prefs" | "done";

interface Props {
  state: Progress;
  next: StepId;
  open: (step: StepId) => void;
}

/** Bento grid of onboarding steps, each with a small illustration. */
export function StepCards({ state, next, open }: Props) {
  const done: Record<StepId, boolean> = {
    find: Boolean(state.company),
    confirm: state.confirmed,
    prefs: state.prefsDone,
    done: false,
  };
  const locked = (step: StepId) =>
    (step === "confirm" && !done.find) ||
    (step === "prefs" && !done.confirm) ||
    (step === "done" && !done.prefs);

  const cards: { id: StepId; title: string; sub: string; span: string; art: React.ReactNode }[] = [
    {
      id: "find",
      title: state.company ? state.company.name : "Find your company",
      sub: state.company ? (state.company.hq ?? "Company picked") : "Search Cala's graph",
      span: "md:col-span-2",
      art: <FindArt state={state} />,
    },
    {
      id: "confirm",
      title: "Confirm the facts",
      sub: "Rounds, investors, team",
      span: "",
      art: <SourcesArt />,
    },
    {
      id: "prefs",
      title: "Investor preferences",
      sub: "Round, size, region, role",
      span: "",
      art: <ChipsArt />,
    },
    {
      id: "done",
      title: "Leads",
      sub: "Investors your network can reach",
      span: "md:col-span-2",
      art: <GraphArt />,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {cards.map((card, i) => {
        const isLocked = locked(card.id);
        const isNext = card.id === next;
        return (
          <button
            key={card.id}
            type="button"
            disabled={isLocked}
            onClick={() => open(card.id)}
            style={{ animationDelay: `${i * 60}ms` }}
            className={`group card relative flex min-h-56 animate-rise flex-col overflow-hidden p-5 text-left transition hover:border-edge hover:bg-raise disabled:cursor-not-allowed disabled:opacity-50 ${card.span} ${isNext ? "border-edge" : ""}`}
          >
            <span className="absolute top-4 right-4">
              {done[card.id] ? (
                <span className="grid size-6 place-items-center rounded-full bg-accent text-accent-ink">
                  <Check className="size-3.5" strokeWidth={2.5} />
                </span>
              ) : isLocked ? (
                <Lock className="size-4 text-faint" strokeWidth={1.75} />
              ) : (
                <ArrowRight className="size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-text" />
              )}
            </span>
            <div className="flex flex-1 items-center">{card.art}</div>
            <div className="mt-6">
              <p className="font-medium tracking-tight">{card.title}</p>
              <p className="mt-1 text-sm text-dim">{card.sub}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Shared frame: art sits quiet and wakes up on hover. */
function Art({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center opacity-75 transition duration-300 group-hover:opacity-100">
      {children}
    </div>
  );
}

function FindArt({ state }: { state: Progress }) {
  if (state.company) {
    return (
      <Art>
        <Logo name={state.company.name} website={state.company.website} size="lg" />
      </Art>
    );
  }
  return (
    <Art>
      <div className="flex -space-x-3">
        {["rotate-[-8deg]", "z-10", "rotate-[8deg]"].map((tilt) => (
          <span key={tilt} className={`size-12 rounded-xl border border-line bg-hover ${tilt}`} />
        ))}
      </div>
      <span className="ml-4 grid size-12 place-items-center rounded-full border border-edge">
        <Search className="size-4 text-dim" />
      </span>
    </Art>
  );
}

function SourcesArt() {
  return (
    <Art>
      <div className="flex w-36 flex-col gap-2">
        {["w-full", "w-4/5", "w-3/5"].map((width, i) => (
          <div key={width} className="flex items-center gap-2">
            <span className={`h-1.5 rounded-full bg-hover ${width}`} />
            <span
              className={`size-1.5 shrink-0 rounded-full ${i === 0 ? "bg-accent" : "bg-faint"}`}
            />
          </div>
        ))}
      </div>
    </Art>
  );
}

function ChipsArt() {
  return (
    <Art>
      <div className="flex flex-col gap-2">
        {[
          ["w-10", true],
          ["w-14", false],
          ["w-8", false],
        ].map(([width, on]) => (
          <span
            key={String(width)}
            className={`flex h-5 items-center rounded-full border px-1 ${on ? "w-16 border-accent/50 bg-accent/10" : "w-20 border-line"}`}
          >
            <span className={`h-1.5 rounded-full ${width} ${on ? "bg-accent" : "bg-hover"}`} />
          </span>
        ))}
      </div>
    </Art>
  );
}

function GraphArt() {
  return (
    <Art>
      <div className="flex w-72 items-center">
        <span className="size-3 rounded-full bg-text" />
        <span className="h-px flex-1 bg-edge" />
        <div className="flex flex-col gap-4">
          <span className="size-2.5 rounded-full border border-dim" />
          <span className="size-2.5 rounded-full border border-dim" />
        </div>
        <span className="h-px flex-1 border-t border-dashed border-edge" />
        <span className="size-3 rounded-full bg-accent shadow-[0_0_0_4px_rgb(198_236_106/0.12)]" />
      </div>
    </Art>
  );
}
