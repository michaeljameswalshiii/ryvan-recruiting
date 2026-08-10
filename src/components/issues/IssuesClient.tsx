"use client";

import { Suspense } from "react";
import IssuesWorkspace from "./IssuesWorkspace";

/** Entry point — workspace uses useSearchParams for board/backlog. */
export default function IssuesClient() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 p-8 text-slate-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          Loading work items…
        </div>
      }
    >
      <IssuesWorkspace />
    </Suspense>
  );
}
