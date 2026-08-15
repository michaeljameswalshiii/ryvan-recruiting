'use client';

import { useEffect, useState } from 'react';
import { Pause, Play, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type Config = {
  enabled: boolean;
  paused: boolean;
  minFitScore: number;
  reviewFitScore: number;
  maxCandidatesPerRun: number;
  maxRunsPerDay: number;
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
};

type Usage = { dayUsd: number; monthUsd: number; dayRuns: number; monthRuns: number };

export function RecruiterAgentControls({ light = false }: { light?: boolean }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch('/api/agent/recruiter-settings', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setConfig(data.config);
    setUsage(data.usage);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(patch: Partial<Config>) {
    if (!config) return;
    setSaving(true);
    try {
      const response = await fetch('/api/agent/recruiter-settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save agent controls');
      setConfig(data.config);
      setUsage(data.usage);
      toast.success('Recruiter agent controls saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save agent controls');
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!config) return null;
  const label = light ? 'text-slate-700' : 'text-slate-200';
  const muted = light ? 'text-slate-500' : 'text-slate-400';
  const input = light
    ? 'border-slate-200 bg-white text-slate-900'
    : 'border-white/10 bg-white/5 text-white';

  return (
    <section className={`rounded-xl border p-3 ${light ? 'border-slate-200 bg-slate-50/80' : 'border-white/10 bg-white/[0.04]'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`h-4 w-4 ${config.paused ? 'text-amber-500' : 'text-emerald-500'}`} />
          <div>
            <div className={`text-xs font-semibold ${label}`}>Recruiter agent controls</div>
            <div className={`text-[10px] ${muted}`}>
              {usage ? `$${usage.dayUsd.toFixed(2)} today · $${usage.monthUsd.toFixed(2)} this month · ${usage.dayRuns} runs today` : 'Loading usage…'}
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save({ paused: !config.paused, enabled: true })}
          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${config.paused ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}
        >
          {config.paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          {config.paused ? 'Resume' : 'Pause'}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ['minFitScore', 'Auto-add score'],
          ['reviewFitScore', 'Review score'],
          ['maxCandidatesPerRun', 'Target qualified'],
          ['maxRunsPerDay', 'Runs / day'],
        ] as const).map(([key, text]) => (
          <label key={key} className={`text-[10px] font-medium ${muted}`}>
            {text}
            <input
              type="number"
              min={key.includes('Score') ? 0 : 1}
              max={key.includes('Score') ? 100 : key === 'maxRunsPerDay' ? 1000 : 500}
              value={config[key]}
              disabled={saving}
              onChange={(event) => {
                const maximum = key.includes('Score')
                  ? 100
                  : key === 'maxRunsPerDay'
                    ? 1000
                    : 500;
                const nextValue = Math.min(
                  maximum,
                  Math.max(1, Number(event.target.value) || 1)
                );
                setConfig({ ...config, [key]: nextValue });
              }}
              onBlur={() => void save({ [key]: config[key] })}
              className={`mt-1 w-full rounded-md border px-2 py-1.5 text-xs ${input}`}
            />
          </label>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {([
          ['dailyBudgetUsd', 'Daily budget ($)'],
          ['monthlyBudgetUsd', 'Monthly budget ($)'],
        ] as const).map(([key, text]) => (
          <label key={key} className={`text-[10px] font-medium ${muted}`}>
            {text}
            <input
              type="number"
              min={0}
              step="0.01"
              value={config[key]}
              disabled={saving}
              onChange={(event) => setConfig({ ...config, [key]: Number(event.target.value) })}
              onBlur={() => void save({ [key]: config[key] })}
              className={`mt-1 w-full rounded-md border px-2 py-1.5 text-xs ${input}`}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
