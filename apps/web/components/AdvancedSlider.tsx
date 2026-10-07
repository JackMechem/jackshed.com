"use client";

import Hint from "@/components/Hint";

/** A labeled range slider with a live numeric readout. Shared by the drill-style trainers. */
export default function AdvancedSlider({
  label,
  value,
  unit,
  min,
  max,
  step,
  hint,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="flex items-center justify-between font-medium text-muted">
        {label}
        <span className="tabular-nums text-foreground">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        style={
          {
            "--progress": `${((value - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
        className="slider h-6 w-full cursor-pointer disabled:cursor-default disabled:opacity-60"
      />
      {hint && <Hint>{hint}</Hint>}
    </label>
  );
}
