"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Network,
  RefreshCw,
  Loader2,
  Award,
  Layers,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TenantSkillsGraph, SkillNode } from "@/lib/ai/skills-graph";

export default function TalentGraphPage() {
  const [graph, setGraph] = useState<TenantSkillsGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rebuilt, setRebuilt] = useState(false);

  const load = useCallback(async (force = false) => {
    if (force) setRebuilding(true);
    else setLoading(true);
    setError(null);
    try {
      const url = force
        ? "/api/talent-graph?rebuild=1"
        : "/api/talent-graph";
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to load talent graph");
      }
      setGraph(data.graph || null);
      setRebuilt(!!data.rebuilt);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
      setGraph(null);
    } finally {
      setLoading(false);
      setRebuilding(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const topSkills = (graph?.skills || []).slice(0, 25);
  const topPlaced = (graph?.topPlacedSkills || []).slice(0, 15);
  const titleEntries = Object.entries(graph?.byJobTitle || {}).slice(0, 12);

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <Network className="h-7 w-7 text-blue-600" />
            Talent skills graph
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Skills frequency across candidates and outcomes from placements /
            offers.
          </p>
          {graph?.builtAt && (
            <p className="text-[11px] text-gray-400 mt-1">
              Built {new Date(graph.builtAt).toLocaleString()}
              {rebuilt ? " · just rebuilt" : ""}
              {graph.meta
                ? ` · ${graph.meta.leadCount} candidates · ${graph.meta.jobCount} jobs · ${graph.meta.placedOutcomes} placement outcomes`
                : ""}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(true)}
          disabled={loading || rebuilding}
          className="gap-1.5"
        >
          {rebuilding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Rebuild
        </Button>
      </div>

      {loading && !graph ? (
        <div className="flex items-center justify-center py-24 text-gray-600 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading skills graph…
        </div>
      ) : error ? (
        <div className="bg-white border border-rose-200 rounded-2xl p-6 shadow-sm">
          <p className="text-rose-600 font-medium">{error}</p>
          <Button className="mt-3" size="sm" onClick={() => void load(false)}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <h2 className="text-sm font-semibold tracking-wide text-gray-800 uppercase flex items-center gap-2 mb-4">
              <Layers className="h-4 w-4 text-gray-500" />
              Top skills
            </h2>
            {topSkills.length === 0 ? (
              <p className="text-sm text-gray-500">
                No skills found yet. Add candidate skills or job descriptions,
                then rebuild.
              </p>
            ) : (
              <SkillTable nodes={topSkills} showPlaced />
            )}
          </section>

          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
            <h2 className="text-sm font-semibold tracking-wide text-gray-800 uppercase flex items-center gap-2 mb-4">
              <Award className="h-4 w-4 text-emerald-600" />
              Top placed skills
            </h2>
            {topPlaced.length === 0 ? (
              <p className="text-sm text-gray-500">
                No placement outcomes yet. Skills appear here when candidates
                reach <span className="font-medium">placed</span> or{" "}
                <span className="font-medium">offer accepted</span>.
              </p>
            ) : (
              <SkillTable nodes={topPlaced} showPlaced emphasizePlaced />
            )}
          </section>

          <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 lg:col-span-2">
            <h2 className="text-sm font-semibold tracking-wide text-gray-800 uppercase flex items-center gap-2 mb-4">
              <Briefcase className="h-4 w-4 text-gray-500" />
              Skills by job title
            </h2>
            {titleEntries.length === 0 ? (
              <p className="text-sm text-gray-500">
                No job-title skill edges yet.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {titleEntries.map(([title, nodes]) => (
                  <div
                    key={title}
                    className="rounded-xl border border-gray-100 bg-slate-50/80 p-3"
                  >
                    <h3 className="text-sm font-medium text-gray-900 truncate mb-2">
                      {title}
                    </h3>
                    <ul className="space-y-1">
                      {(nodes || []).slice(0, 6).map((n) => (
                        <li
                          key={n.skill}
                          className="flex items-center justify-between text-xs text-gray-600"
                        >
                          <span className="truncate pr-2 capitalize">
                            {n.skill}
                          </span>
                          <span className="tabular-nums text-gray-400 shrink-0">
                            {n.placedCount > 0
                              ? `${n.placedCount} placed`
                              : n.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SkillTable({
  nodes,
  showPlaced,
  emphasizePlaced,
}: {
  nodes: SkillNode[];
  showPlaced?: boolean;
  emphasizePlaced?: boolean;
}) {
  const max = Math.max(
    1,
    ...nodes.map((n) => (emphasizePlaced ? n.placedCount : n.count))
  );

  return (
    <ul className="space-y-2">
      {nodes.map((n) => {
        const val = emphasizePlaced ? n.placedCount : n.count;
        const pct = Math.round((val / max) * 100);
        return (
          <li key={n.skill} className="group">
            <div className="flex items-center justify-between text-sm mb-0.5">
              <span className="font-medium text-gray-800 capitalize truncate pr-2">
                {n.skill}
              </span>
              <span className="text-xs text-gray-500 tabular-nums shrink-0">
                {emphasizePlaced ? (
                  <>
                    <span className="text-emerald-700 font-medium">
                      {n.placedCount}
                    </span>
                    <span className="text-gray-400"> placed</span>
                    {showPlaced && n.count > 0 ? (
                      <span className="text-gray-400"> · {n.count} total</span>
                    ) : null}
                  </>
                ) : (
                  <>
                    {n.count}
                    {showPlaced && n.placedCount > 0 ? (
                      <span className="text-emerald-600">
                        {" "}
                        · {n.placedCount} placed
                      </span>
                    ) : null}
                  </>
                )}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  emphasizePlaced
                    ? "bg-emerald-500"
                    : "bg-gradient-to-r from-blue-500 to-violet-500"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
