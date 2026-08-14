"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Network,
  RefreshCw,
  Loader2,
  Award,
  Layers,
  Briefcase,
  MapPin,
  Search,
  Tags,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  TenantSkillsGraph,
  SkillNode,
  TalentTagNode,
} from "@/lib/ai/skills-graph";

type CandidateSearchResult = {
  id: string;
  name: string;
  title: string;
  location: string;
  email: string;
  tags: string[];
  skills: string[];
  status: string;
};

const FACET_LABELS: Record<string, string> = {
  industry: "Industry",
  functional: "Function",
  skill: "Skill",
  certification: "Certification",
  seniority: "Seniority",
  specialty: "Specialty",
  software: "Software",
  language: "Language",
  employment_type: "Employment type",
  work_preference: "Work style",
  company_size: "Company size",
  decision_role: "Decision role",
  other: "Other",
};

export default function TalentGraphPage() {
  const [graph, setGraph] = useState<TenantSkillsGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rebuilt, setRebuilt] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<CandidateSearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);

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

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed && selectedTags.length === 0) {
      setSearchResults([]);
      setSearchTotal(0);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams();
        if (trimmed) params.set("q", trimmed);
        selectedTags.forEach((tag) => params.append("tag", tag));
        params.set("limit", "50");
        const res = await fetch(`/api/talent-graph?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Search failed");
        setSearchResults(data.search?.candidates || []);
        setSearchTotal(Number(data.search?.total) || 0);
      } catch (searchError: any) {
        if (searchError?.name !== "AbortError") {
          setSearchError(searchError?.message || "Search failed");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedTags]);

  const topSkills = (graph?.skills || []).slice(0, 25);
  const topPlaced = (graph?.topPlacedSkills || []).slice(0, 15);
  const topTags = (graph?.tags || []).slice(0, 30);
  const titleEntries = Object.entries(graph?.byJobTitle || {}).slice(0, 12);
  const hasSearch = query.trim().length > 0 || selectedTags.length > 0;

  const toggleTag = (tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag]
    );
  };

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <Network className="h-7 w-7 text-blue-600" />
            Talent graph
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Search candidates by generated tags and skills, then review talent
            patterns and placement outcomes.
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

      {graph ? (
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Search className="h-4 w-4 text-blue-600" />
                Search talent
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Type a name or skill, then click tags to require both — e.g.
                Construction AND Project Management.
              </p>
            </div>
            {hasSearch ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-xs"
                onClick={() => {
                  setQuery("");
                  setSelectedTags([]);
                }}
              >
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            ) : null}
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search PMP, construction, Procore, project manager..."
              className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              aria-label="Search candidates by skills and tags"
            />
          </div>

          {selectedTags.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-gray-500">
                Must have
              </span>
              {selectedTags.map((tag, index) => (
                <span key={tag} className="inline-flex items-center gap-1.5">
                  {index > 0 ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      and
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800"
                  >
                    {tag} <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {selectedTags.length === 1 ? (
                <span className="text-xs text-slate-400">
                  Click another tag to require both
                </span>
              ) : null}
            </div>
          ) : null}

          {topTags.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-gray-500">
                Popular tags
              </span>
              {topTags.slice(0, 16).map((node) => {
                const active = selectedTags.includes(node.tag);
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => toggleTag(node.tag)}
                    title={`${FACET_LABELS[node.facet] || node.facet}: ${node.count} candidates`}
                    className={`rounded-md border px-2 py-1 text-xs font-medium ${
                      active
                        ? "border-blue-300 bg-blue-600 text-white"
                        : "border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-300 hover:bg-blue-50"
                    }`}
                  >
                    {node.tag}{" "}
                    <span className={active ? "text-blue-100" : "text-gray-400"}>
                      {node.count}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {hasSearch ? (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                  {searching
                    ? "Searching"
                    : `${searchTotal} candidate${searchTotal === 1 ? "" : "s"}`}
                </span>
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                ) : null}
              </div>
              {searchError ? (
                <p className="py-3 text-sm text-rose-600">{searchError}</p>
              ) : !searching && searchResults.length === 0 ? (
                <p className="py-4 text-sm text-gray-500">
                  {selectedTags.length > 1
                    ? `No candidates have ${selectedTags.join(" and ")}.`
                    : "No candidates match all selected filters."}
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {searchResults.map((candidate) => (
                    <Link
                      key={candidate.id}
                      href={`/dashboard/candidates/${encodeURIComponent(candidate.id)}`}
                      className="grid gap-2 py-3 hover:bg-gray-50 sm:grid-cols-[minmax(0,1fr)_minmax(240px,1.4fr)] sm:px-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <UserRound className="h-4 w-4 shrink-0 text-gray-400" />
                          <span className="truncate text-sm font-semibold text-gray-900">
                            {candidate.name}
                          </span>
                        </div>
                        <p className="mt-1 truncate pl-6 text-xs text-gray-600">
                          {candidate.title || "Title not provided"}
                        </p>
                        {candidate.location ? (
                          <p className="mt-1 flex items-center gap-1 pl-6 text-xs text-gray-500">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{candidate.location}</span>
                          </p>
                        ) : null}
                      </div>
                      <div className="flex min-w-0 flex-wrap content-start gap-1.5">
                        {candidate.tags.slice(0, 8).map((tag) => (
                          <span
                            key={tag}
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                              selectedTags.includes(tag)
                                ? "border-blue-200 bg-blue-50 text-blue-700"
                                : "border-gray-200 bg-white text-gray-600"
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                        {candidate.tags.length === 0
                          ? candidate.skills.slice(0, 6).map((skill) => (
                              <span
                                key={skill}
                                className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-600"
                              >
                                {skill}
                              </span>
                            ))
                          : null}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

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
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
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

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
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

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-800">
              <Tags className="h-4 w-4 text-blue-600" />
              Searchable candidate tags
            </h2>
            {topTags.length === 0 ? (
              <p className="text-sm text-gray-500">
                No candidate tags found yet. Rebuild after tags are generated or
                manually added.
              </p>
            ) : (
              <TagTable nodes={topTags} onSelect={toggleTag} />
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
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

function TagTable({
  nodes,
  onSelect,
}: {
  nodes: TalentTagNode[];
  onSelect: (tag: string) => void;
}) {
  const max = Math.max(1, ...nodes.map((node) => node.count));

  return (
    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          onClick={() => onSelect(node.tag)}
          className="group min-w-0 rounded-md px-2 py-1.5 text-left hover:bg-blue-50"
          title={`Search candidates tagged ${node.tag}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-gray-800">
              {node.tag}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-gray-500">
              {node.count}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400">
              {FACET_LABELS[node.facet] || node.facet}
            </span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
              <span
                className="block h-full rounded-full bg-blue-500"
                style={{ width: `${Math.round((node.count / max) * 100)}%` }}
              />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
