"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PublicJob } from "@/lib/careers/public";
import { descriptionPreview } from "@/lib/careers/format-description";

type Props = {
  jobs: PublicJob[];
  /** When true, never show client company name (agency mode) */
  hideCompany?: boolean;
};

export function CareersJobList({ jobs, hideCompany = true }: Props) {
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      if (j.location?.trim()) set.add(j.location.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      if (j.employmentType?.trim()) set.add(j.employmentType.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (locationFilter && j.location !== locationFilter) return false;
      if (typeFilter && j.employmentType !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        j.title,
        j.description,
        j.location,
        j.employmentType,
        j.salaryRange,
        hideCompany ? "" : j.companyName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [jobs, query, locationFilter, typeFilter, hideCompany]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Search open roles
        </label>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Title, skills, location…"
          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/5"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
            aria-label="Filter by location"
          >
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
            aria-label="Filter by employment type"
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {(query || locationFilter || typeFilter) && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setLocationFilter("");
                setTypeFilter("");
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              Clear filters
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Showing {filtered.length} of {jobs.length} role
          {jobs.length === 1 ? "" : "s"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="font-medium text-slate-800">No roles match your search</p>
          <p className="mt-1 text-sm text-slate-500">
            Try different keywords or clear filters.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((job) => (
            <li key={job.id}>
              <Link
                href={`/careers/${job.id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {job.title}
                  </h2>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                    {job.employmentType}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                  {!hideCompany && job.companyName && (
                    <span>{job.companyName}</span>
                  )}
                  {job.location && <span>{job.location}</span>}
                  {job.salaryRange && <span>{job.salaryRange}</span>}
                </div>
                {job.description && (
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    {descriptionPreview(job.description, 200)}
                  </p>
                )}
                <p className="mt-3 text-sm font-medium text-slate-900">
                  View role &amp; apply →
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
