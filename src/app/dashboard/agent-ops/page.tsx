import { Suspense } from "react";
import { AgentOpsClient } from "@/components/agent-ops/AgentOpsClient";

export const dynamic = "force-dynamic";

function ShellFallback() {
  return (
    <div className="agent-ops">
      <div
        className="flex min-h-[590px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 dark:border-border dark:bg-card"
        role="status"
      >
        Loading agent operations…
      </div>
    </div>
  );
}

export default function AgentOpsPage() {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AgentOpsClient />
    </Suspense>
  );
}
