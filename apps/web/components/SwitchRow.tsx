"use client";

import { useId } from "react";
import Hint from "@/components/Hint";

export default function SwitchRow({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span id={id} className="font-medium text-muted">
          {label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={id}
          onClick={() => onChange(!checked)}
          disabled={disabled}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            checked ? "bg-accent" : "bg-background"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-foreground transition-transform ${
              checked ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}
