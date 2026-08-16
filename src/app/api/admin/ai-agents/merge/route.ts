import { NextRequest, NextResponse } from "next/server";
import { requireSiteAdminSession, isAdminAuthError } from "@/lib/admin-auth";
import {
  getGitHubRepo,
  getOpsPull,
  isOpsPull,
  mergeOpsPull,
} from "@/lib/agents/github-ops";
import { markFixMerged } from "@/lib/agents/error-fix-store";
import { recordCronHeartbeat } from "@/lib/observability/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const auth = await requireSiteAdminSession();
  if (isAdminAuthError(auth)) return auth;

  const body = await request.json().catch(() => ({}));
  const pullNumber = Number(body.prNumber || body.pullNumber || 0);
  if (!Number.isInteger(pullNumber) || pullNumber < 1) {
    return NextResponse.json({ error: "prNumber is required" }, { status: 400 });
  }

  const started = Date.now();
  try {
    const repo = await getGitHubRepo();
    const pull = await getOpsPull(repo, pullNumber);
    if (!isOpsPull(pull)) {
      return NextResponse.json(
        { error: "Only System Ops fix PRs can be merged from this screen" },
        { status: 403 }
      );
    }
    if (pull.mergeable === false) {
      return NextResponse.json(
        {
          error: `PR #${pullNumber} is not mergeable (${pull.mergeableState || "blocked"}). Resolve it on GitHub first.`,
          pull,
        },
        { status: 409 }
      );
    }

    const merged = await mergeOpsPull({
      repo,
      pullNumber,
      title: pull.title,
    });
    await markFixMerged({
      prNumber: pullNumber,
      clusterKey: pull.clusterKey,
    });
    await recordCronHeartbeat({
      cronId: "system-ops",
      label: "System ops",
      schedule: "On demand",
      path: "/api/admin/ai-agents/merge",
      status: "ok",
      durationMs: Date.now() - started,
      detail: `Merged PR #${pullNumber} to ${repo.defaultBranch}. Vercel will deploy production.`,
    });

    return NextResponse.json({
      ok: true,
      merged: merged.merged,
      sha: merged.sha,
      pull,
      defaultBranch: repo.defaultBranch,
      detail: `Merged #${pullNumber} to ${repo.defaultBranch}. Vercel will deploy production from that branch.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Merge failed";
    await recordCronHeartbeat({
      cronId: "system-ops",
      label: "System ops",
      schedule: "On demand",
      path: "/api/admin/ai-agents/merge",
      status: "error",
      durationMs: Date.now() - started,
      detail: message.slice(0, 240),
    }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
