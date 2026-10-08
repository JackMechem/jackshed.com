import { Redirect } from 'expo-router';

/** Chord Charts lives on its own tab now (`app/charts/index.tsx`) — this old tool route just
    forwards there, so any link still pointing at it keeps working. */
export default function ChordChartsRedirect() {
  return <Redirect href="/charts" />;
}
