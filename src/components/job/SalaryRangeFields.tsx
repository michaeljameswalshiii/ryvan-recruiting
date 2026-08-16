'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PayBasis = 'year' | 'hour';

function numberParts(value: string): string[] {
  return (value.match(/\d[\d,]*(?:\.\d+)?\s*[kK]?/g) || []).map((part) => {
    const compact = part.replace(/\s+/g, '');
    const thousands = /k$/i.test(compact);
    const amount = Number(compact.replace(/[k,]/gi, ''));
    return Number.isFinite(amount) ? String(thousands ? amount * 1000 : amount) : '';
  });
}

function parseValue(value: string): { min: string; max: string; basis: PayBasis } {
  const numbers = numberParts(value || '');
  return {
    min: numbers[0] || '',
    max: numbers[1] || '',
    basis: /(?:per\s*)?(?:hour|hr\b|hourly)/i.test(value || '') ? 'hour' : 'year',
  };
}

function money(value: string, basis: PayBasis): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: basis === 'hour' && amount % 1 ? 2 : 0,
    maximumFractionDigits: basis === 'hour' ? 2 : 0,
  });
}

function formatValue(min: string, max: string, basis: PayBasis): string {
  const low = money(min, basis);
  const high = money(max, basis);
  if (!low && !high) return '';
  const range = low && high ? `${low} - ${high}` : low || high;
  return `${range} per ${basis}`;
}

export function SalaryRangeFields({
  value,
  onChange,
  compact = false,
}: {
  value?: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const parsed = parseValue(value || '');
  const [min, setMin] = useState(parsed.min);
  const [max, setMax] = useState(parsed.max);
  const [basis, setBasis] = useState<PayBasis>(parsed.basis);

  useEffect(() => {
    const next = parseValue(value || '');
    setMin(next.min);
    setMax(next.max);
    setBasis(next.basis);
  }, [value]);

  const update = (nextMin: string, nextMax: string, nextBasis: PayBasis) => {
    setMin(nextMin);
    setMax(nextMax);
    setBasis(nextBasis);
    onChange(formatValue(nextMin, nextMax, nextBasis));
  };

  return (
    <div className="space-y-1.5">
      <Label>Compensation range</Label>
      <div className={`grid gap-2 ${compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-[1fr_1fr_10rem]'}`}>
        <Input
          type="number"
          min="0"
          step={basis === 'hour' ? '0.25' : '1000'}
          value={min}
          onChange={(event) => update(event.target.value, max, basis)}
          placeholder={basis === 'hour' ? 'Min, e.g. 25' : 'Min, e.g. 60000'}
          aria-label="Minimum compensation"
        />
        <Input
          type="number"
          min="0"
          step={basis === 'hour' ? '0.25' : '1000'}
          value={max}
          onChange={(event) => update(min, event.target.value, basis)}
          placeholder={basis === 'hour' ? 'Max, e.g. 35' : 'Max, e.g. 80000'}
          aria-label="Maximum compensation"
        />
        <select
          value={basis}
          onChange={(event) => update(min, max, event.target.value as PayBasis)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Compensation type"
        >
          <option value="year">Annual salary</option>
          <option value="hour">Per hour</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        {value || 'Enter a minimum, maximum, and pay basis.'}
      </p>
    </div>
  );
}
