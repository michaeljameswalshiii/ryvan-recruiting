"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FEE_GUARANTEE_OPTIONS,
  FEE_TYPE_OPTIONS,
  exampleFeeOnSalary,
  parseFeePercent,
} from "@/lib/fees/placement-fee";

export type PlacementFeeForm = {
  fee_percent: string;
  fee_type: string;
  fee_guarantee: string;
};

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function PlacementFeeFields({
  value,
  onChange,
}: {
  value: PlacementFeeForm;
  onChange: (next: PlacementFeeForm) => void;
}) {
  const pct = parseFeePercent(value.fee_percent);
  const example = pct != null ? exampleFeeOnSalary(pct) : null;

  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Placement fee terms
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="company-fee-percent">Fee %</Label>
          <Input
            id="company-fee-percent"
            type="number"
            min={0}
            max={100}
            step="0.5"
            inputMode="decimal"
            value={value.fee_percent}
            onChange={(e) => onChange({ ...value, fee_percent: e.target.value })}
            placeholder="20"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="company-fee-type">Fee type</Label>
          <select
            id="company-fee-type"
            value={value.fee_type}
            onChange={(e) => onChange({ ...value, fee_type: e.target.value })}
            className={selectClass}
          >
            <option value="">Select…</option>
            {FEE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="company-fee-guarantee">Guarantee period</Label>
        <select
          id="company-fee-guarantee"
          value={value.fee_guarantee}
          onChange={(e) => onChange({ ...value, fee_guarantee: e.target.value })}
          className={selectClass}
        >
          {FEE_GUARANTEE_OPTIONS.map((opt) => (
            <option key={opt.id || "none"} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {pct != null ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-blue-800">Default fee rate</span>
            <span className="font-semibold tabular-nums text-blue-950">{pct}%</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-blue-800/80">
            On a $100,000 salary, this equals a ${example?.toLocaleString()} fee.
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Optional. New jobs for this company will show this percent on the job
          header. You can still change a job later.
        </p>
      )}
    </div>
  );
}

export function emptyPlacementFeeForm(): PlacementFeeForm {
  return { fee_percent: "", fee_type: "", fee_guarantee: "" };
}

export function placementFeeFormFromRecord(record?: {
  fee_percent?: number | string;
  feePercent?: number | string;
  fee_type?: string;
  feeType?: string;
  fee_guarantee?: string;
  feeGuarantee?: string;
} | null): PlacementFeeForm {
  const pct = record?.fee_percent ?? record?.feePercent;
  return {
    fee_percent: pct == null || pct === "" ? "" : String(pct),
    fee_type: String(record?.fee_type || record?.feeType || ""),
    fee_guarantee: String(record?.fee_guarantee || record?.feeGuarantee || ""),
  };
}

export function appendPlacementFeeToFormData(
  formData: FormData,
  fee: PlacementFeeForm
) {
  if (fee.fee_percent.trim()) formData.set("fee_percent", fee.fee_percent.trim());
  else formData.set("fee_percent", "");
  formData.set("fee_type", fee.fee_type);
  formData.set("fee_guarantee", fee.fee_guarantee);
}
