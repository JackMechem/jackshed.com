export type Tempo = {
  id: string;
  value: number;
  enabled: boolean;
};

export type Key = {
  id: string;
  value: string;
  enabled: boolean;
};

export type Tune = {
  id: string;
  name: string;
  tempos: Tempo[];
  keys: Key[];
  timeSignature: string;
  notes: string;
};

export const DEFAULT_TIME_SIGNATURE = "4/4";

export function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
