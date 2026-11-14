"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ApiError, api } from "@/lib/api";

type Status = "checking" | "ok" | "down";

/** Pings `GET /health` on load: a quick check that the web app can reach our API. */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState<string>();

  useEffect(() => {
    api
      .health()
      .then(() => setStatus("ok"))
      .catch((err: unknown) => {
        setStatus("down");
        setDetail(err instanceof ApiError ? err.message : "Unknown error");
      });
  }, []);

  if (status === "checking") return <Badge variant="outline">Checking API…</Badge>;
  if (status === "ok") return <Badge variant="secondary">API connected</Badge>;
  return (
    <Badge variant="destructive" title={detail}>
      API unreachable
    </Badge>
  );
}
