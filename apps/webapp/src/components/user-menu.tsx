"use client";

import { LogIn, LogOut } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div
        className={compact ? "skeleton h-8 w-20 rounded-full" : "skeleton h-10 w-full rounded-xl"}
      />
    );
  }

  if (!session?.user) {
    return (
      <button
        type="button"
        onClick={() => signIn("google")}
        className={
          compact
            ? "inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-raise/70 px-3 text-xs text-text transition hover:border-line-strong hover:bg-raise"
            : "flex h-9 w-full items-center gap-2.5 rounded-lg border border-line bg-raise/60 px-2.5 text-sm text-text transition hover:border-line-strong hover:bg-raise"
        }
      >
        <LogIn className="size-3.5 text-accent" strokeWidth={1.75} />
        <span>{compact ? "Sign in" : "Sign in with Google"}</span>
      </button>
    );
  }

  const { name, email, image } = session.user;
  const initial = (name ?? email ?? "U").trim().charAt(0).toUpperCase();

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => signOut()}
        title={`Signed in as ${email ?? name ?? "user"} · Click to sign out`}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-raise/70 px-2.5 text-xs text-dim transition hover:text-text"
      >
        {image ? (
          // biome-ignore lint/performance/noImgElement: external Google avatar URL
          <img src={image} alt="" className="size-4 rounded-full object-cover" />
        ) : (
          <span className="grid size-4 place-items-center rounded-full bg-accent/20 text-[10px] font-medium text-accent">
            {initial}
          </span>
        )}
        <LogOut className="size-3" />
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-raise/60 p-2">
      <div className="flex min-w-0 items-center gap-2">
        {image ? (
          // biome-ignore lint/performance/noImgElement: external Google avatar URL
          <img src={image} alt="" className="size-7 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-medium text-accent">
            {initial}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-text">{name ?? "Founder"}</p>
          {email && <p className="truncate text-[11px] text-faint">{email}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => signOut()}
        aria-label="Sign out"
        title="Sign out"
        className="grid size-7 shrink-0 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-text"
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
}
