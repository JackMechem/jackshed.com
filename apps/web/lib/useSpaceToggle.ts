import { useEffect, useRef } from "react";

/** Calls `toggle` when Space is pressed anywhere except in text fields or open menus. */
export function useSpaceToggle(toggle: () => void, enabled = true) {
  const toggleRef = useRef(toggle);
  useEffect(() => {
    toggleRef.current = toggle;
  });

  useEffect(() => {
    if (!enabled) return;
    function isSpaceForControl(target: HTMLElement) {
      if (target.closest("[role='dialog'], [role='alertdialog']")) return true;
      if (target.closest("textarea, [role='listbox']")) return true;
      if (target.closest("[role='combobox'][aria-expanded='true']")) return true;
      return target instanceof HTMLInputElement && target.type !== "range";
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat || isSpaceForControl(e.target as HTMLElement)) return;
      e.preventDefault();
      toggleRef.current();
    }
    // Buttons click on space keyup; suppress that so focus doesn't trigger them.
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space" || isSpaceForControl(e.target as HTMLElement)) return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [enabled]);
}
