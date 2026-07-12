"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

type HealthResponse = {
  status: string;
  db?: boolean;
  worker?: boolean;
};

export function WorkerStatusBanner() {
  const t = useTranslations("dashboard.workerStatus");
  const [workerOk, setWorkerOk] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const body = (await res.json()) as HealthResponse;
        if (!cancelled) setWorkerOk(body.worker === true);
      } catch {
        if (!cancelled) setWorkerOk(false);
      }
    }

    void check();
    const id = window.setInterval(check, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (workerOk !== false) return null;

  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-small"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <p>{t("degraded")}</p>
    </div>
  );
}
