"use client";

import { EyeOffIcon } from "@/components/tools";
import { useToolLayout } from "@/components/ToolLayout";
import { useOptionsHidden, usePanelsToggle } from "@/lib/panels";

/** Header row of the options column: collapse/expand every panel, or hide the whole column. */
export default function PanelsToggle({ ids }: { ids: string[] }) {
  const { anyOpen, setAll } = usePanelsToggle(ids);
  const [, setHidden] = useOptionsHidden();
  const stacked = useToolLayout() === "stacked";

  return (
    <div className={`flex items-center gap-1 ${stacked ? "justify-start" : "justify-end"}`}>
      <button
        type="button"
        onClick={() => setAll(!anyOpen)}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
      >
        {anyOpen ? "Collapse all" : "Expand all"}
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={`h-4 w-4 transition-transform ${anyOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label="Hide options"
        title="Hide options"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted outline-none transition-colors hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
      >
        <EyeOffIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
