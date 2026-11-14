import { Suspense } from "react";
import { WarmPaths } from "@/components/canvas/warm-paths";

export default function Page() {
  return (
    <Suspense>
      <WarmPaths />
    </Suspense>
  );
}
