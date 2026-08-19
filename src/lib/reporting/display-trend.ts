/**
 * Chart-friendly rollup of daily reporting series.
 *
 * YTD daily series is ~200+ points. Taking every 3rd day dropped the last
 * 1–2 days, which hid same-day demo seeds and any late-period spike.
 */

export type TrendPoint = { date: string; count: number };

function parseLocalDay(isoDay: string): Date {
  const [y, m, d] = isoDay.split('-').map(Number);
  if (!y || !m || !d) {
    const fallback = new Date(isoDay);
    return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
  }
  return new Date(y, m - 1, d);
}

function formatDayLabel(isoDay: string): string {
  return parseLocalDay(isoDay).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function labeled(series: TrendPoint[]): TrendPoint[] {
  return series.map((d) => ({ date: formatDayLabel(d.date), count: d.count }));
}

function strideKeepEnds(series: TrendPoint[], step: number): TrendPoint[] {
  if (series.length <= step) return labeled(series);
  const picked: TrendPoint[] = [];
  for (let i = 0; i < series.length; i += step) {
    picked.push(series[i]);
  }
  const last = series[series.length - 1];
  if (picked[picked.length - 1]?.date !== last.date) {
    picked.push(last);
  }
  return labeled(picked);
}

function rollupWeeks(series: TrendPoint[]): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let i = 0; i < series.length; i += 7) {
    const chunk = series.slice(i, i + 7);
    out.push({
      date: formatDayLabel(chunk[chunk.length - 1].date),
      count: chunk.reduce((sum, d) => sum + d.count, 0),
    });
  }
  return out;
}

export function toDisplayTrend(series: TrendPoint[]): TrendPoint[] {
  if (!series.length) return [];
  if (series.length > 90) return rollupWeeks(series);
  if (series.length > 45) return strideKeepEnds(series, 3);
  if (series.length > 20) return strideKeepEnds(series, 2);
  return labeled(series);
}
