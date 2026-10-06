import { createContext, useContext } from "react";

/**
 * Whether option-description text is currently shown, set by the "?" toggle on the enclosing
 * CollapsiblePanel or OptionsCard. Consumed by SwitchRow, AdvancedSlider, and Hint — descriptions
 * are hidden by default and only appear once that panel's toggle is switched on.
 */
export const HintsContext = createContext(false);

export function useHintsVisible(): boolean {
  return useContext(HintsContext);
}
