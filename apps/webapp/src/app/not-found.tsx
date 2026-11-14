import { ArrowLeft, Compass } from "lucide-react";
import Link from "next/link";
import { Shell } from "@/components/shell";

export default function NotFound() {
  return (
    <Shell active="start">
      <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="grid size-14 place-items-center rounded-2xl border border-line bg-raise">
          <Compass className="size-6 text-faint" strokeWidth={1.5} />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Nothing here</h1>
          <p className="mt-1 text-sm text-dim">This page does not exist.</p>
        </div>
        <Link href="/" className="btn-ghost">
          <ArrowLeft className="size-4" />
          Home
        </Link>
      </div>
    </Shell>
  );
}
