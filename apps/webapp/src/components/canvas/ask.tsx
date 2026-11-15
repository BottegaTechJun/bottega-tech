"use client";

import { ArrowLeft, ArrowUp, CornerDownRight } from "lucide-react";
import { useState } from "react";
import type { Status } from "@/lib/matchup";

const MAX = 300;
const MIN = 3;

/**
 * The question a follow-up run answers, above the results in both views, with the way back to
 * the answer it revised. `back` is null while that answer isn't known.
 */
export function Asked({ question, back }: { question: string; back: (() => void) | null }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 text-[13px] md:px-6">
      <CornerDownRight className="size-3.5 shrink-0 text-accent" />
      <span className="shrink-0 text-faint">Follow-up</span>
      <span className="min-w-0 flex-1 truncate" title={question}>
        {question}
      </span>
      {back && (
        <button
          type="button"
          onClick={back}
          className="group inline-flex shrink-0 items-center gap-1 text-faint transition hover:text-text"
        >
          <ArrowLeft className="size-3.5 transition group-hover:-translate-x-0.5" />
          Back to previous answer
        </button>
      )}
    </div>
  );
}

interface Props {
  /** Follow-ups worth offering for this answer (see `suggestions` in lib/suggest.ts) */
  chips: string[];
  status: Status;
  /** The answer on screen is kept only in this browser, so the API can't follow it up */
  local?: boolean;
  ask: (question: string) => void;
}

/** Follow-up composer under the results: the agent revises the answer on screen. */
export function Ask({ chips, status, local = false, ask }: Props) {
  const [text, setText] = useState("");
  const question = text.trim();
  const ready = status === "done" && !local;
  const send = (q: string) => {
    if (!ready || q.length < MIN) return;
    ask(q);
    setText("");
  };
  const placeholder =
    status === "running"
      ? "The agent is working…"
      : local
        ? "This answer is saved only in this browser, so follow-ups are off. Run again to save it."
        : ready
          ? "Ask a follow-up about this answer"
          : "Follow-ups need a finished run. Run again or pick one from the history.";

  return (
    <div className="shrink-0 border-t border-line px-4 py-3 md:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(question);
          }}
          className="flex h-11 items-center gap-2.5 rounded-full border border-edge bg-raise pr-1.5 pl-4 transition focus-within:border-accent/60"
        >
          <CornerDownRight className="size-4 shrink-0 text-faint" />
          <label htmlFor="follow-up" className="sr-only">
            Ask a follow-up
          </label>
          <input
            id="follow-up"
            value={text}
            maxLength={MAX}
            disabled={!ready}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            enterKeyHint="send"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!ready || question.length < MIN}
            aria-label="Ask"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-text text-ink transition hover:bg-white disabled:opacity-30"
          >
            <ArrowUp className="size-4" />
          </button>
        </form>
        {ready && chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((q) => (
              <button
                key={q}
                type="button"
                className="chip h-7 px-3 text-[12px]"
                onClick={() => send(q)}
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
