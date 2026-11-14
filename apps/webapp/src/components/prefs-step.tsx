"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Prefs, questions } from "@/lib/prefs";

interface Props {
  prefs: Prefs;
  change: (prefs: Prefs) => void;
  finish: () => void;
  exit: () => void;
}

const DELAY = 3000;

/** One short question at a time. Single choice advances on its own after a short pause. */
export function PrefsStep({ prefs, change, finish, exit }: Props) {
  const [index, setIndex] = useState(0);
  // Bumped on every single-choice tap; restarts the auto-advance timer.
  const [armed, setArmed] = useState<number | null>(null);
  const last = index === questions.length - 1;
  const done = useRef(finish);
  done.current = finish;

  function go(to: number) {
    setArmed(null);
    if (to >= questions.length) finish();
    else if (to < 0) exit();
    else setIndex(to);
  }

  useEffect(() => {
    if (armed === null) return;
    const timer = setTimeout(() => {
      setArmed(null);
      if (last) done.current();
      else setIndex((i) => i + 1);
    }, DELAY);
    return () => clearTimeout(timer);
  }, [armed, last]);

  const question = questions[index];
  if (!question) return null;

  const value = prefs[question.id];
  const next = () => go(index + 1);

  function toggle(id: string) {
    if (!question) return;
    if (!question.multi) {
      // A new round changes the size options, so clear the size answer.
      const reset = question.id === "round" && value[0] !== id ? { size: [] } : {};
      change({ ...prefs, ...reset, [question.id]: [id] });
      setArmed((n) => (n ?? 0) + 1);
      return;
    }
    const set = value.includes(id) ? value.filter((v) => v !== id) : [...value, id];
    change({ ...prefs, [question.id]: set });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-faint">
          <span className="text-text">{String(index + 1).padStart(2, "0")}</span>
          {" / "}
          {String(questions.length).padStart(2, "0")}
        </span>
        <div className="flex items-center gap-1">
          {questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              aria-label={q.title}
              aria-current={i === index ? "step" : undefined}
              disabled={i > index && prefs[questions[i - 1]?.id ?? q.id].length === 0}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all duration-300 disabled:cursor-not-allowed ${i === index ? "w-5 bg-text" : prefs[q.id].length > 0 ? "w-1.5 bg-dim hover:bg-text" : "w-1.5 bg-hover"}`}
            />
          ))}
        </div>
      </div>

      <div key={question.id} className="animate-rise pt-5">
        <h2 className="text-2xl font-semibold tracking-tight">{question.title}</h2>

        {question.cards ? (
          <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {question.options(prefs).map((option) => {
              const on = value.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(option.id)}
                  className="card relative flex min-h-32 flex-col justify-end p-4 text-left transition hover:border-edge active:scale-[0.99] aria-pressed:border-accent/60 aria-pressed:bg-accent/10"
                >
                  {on && (
                    <span className="absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-accent text-accent-ink">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                  <span className="text-lg font-medium tracking-tight">{option.label}</span>
                  {option.hint && <span className="mt-1 text-sm text-dim">{option.hint}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap gap-2">
            {question.options(prefs).map((option) => (
              <button
                key={option.id}
                type="button"
                className="chip"
                aria-pressed={value.includes(option.id)}
                onClick={() => toggle(option.id)}
              >
                {value.includes(option.id) && (
                  <Check className="size-3.5 text-accent" strokeWidth={2.5} />
                )}
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="mt-12 flex items-center justify-between">
        <button type="button" className="btn-ghost" onClick={() => go(index - 1)}>
          <ArrowLeft className="size-4" />
          Back
        </button>
        {(question.multi || value.length > 0) && (
          <button
            type="button"
            className="btn-primary relative overflow-hidden"
            disabled={value.length === 0}
            onClick={next}
          >
            {armed !== null && (
              <span
                key={armed}
                aria-hidden
                className="absolute inset-0 origin-left animate-fill bg-accent"
                style={{ animationDuration: `${DELAY}ms` }}
              />
            )}
            <span className="relative inline-flex items-center gap-2">
              {last ? "Finish" : "Continue"}
              <ArrowRight className="size-4" />
            </span>
          </button>
        )}
      </footer>
    </div>
  );
}
