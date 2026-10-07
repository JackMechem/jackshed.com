import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps, ComponentType } from 'react';

/**
 * Per a direct request — "can you use an actual icon pack? alot of the icons are just kinda
 * sketch" — every icon in this app switched from hand-drawn `react-native-svg` paths (ported 1:1
 * from `apps/web/components/tools.tsx`'s own hand-drawn SVGs) to `@expo/vector-icons`
 * (`MaterialCommunityIcons`, plus `FontAwesome5` for the one icon — a real drum kit — that family
 * doesn't have a good glyph for). Every exported component keeps its *original* name and exact
 * `{color, size}` signature (`StarIcon` also keeps its own `filled` prop), so every call site
 * across the app needed zero changes — this is purely an internal swap of how each icon renders,
 * not a new API to adopt. Every glyph name below was checked directly against the installed
 * package's own real glyph-map JSON (`MaterialCommunityIcons.json`/`FontAwesome5Free.json`), not
 * guessed from memory — a wrong name would otherwise render nothing (or a fallback "?" box)
 * silently, with no type error to catch it (`name` is a wide string-literal union, but a typo
 * that happens to collide with a *different* real glyph would type-check fine while rendering the
 * wrong icon).
 */
export type IconProps = { color: string; size?: number };

function mci(name: ComponentProps<typeof MaterialCommunityIcons>['name']) {
  return function Icon({ color, size = 18 }: IconProps) {
    return <MaterialCommunityIcons name={name} size={size} color={color} />;
  };
}

function fa5(name: ComponentProps<typeof FontAwesome5>['name']) {
  return function Icon({ color, size = 18 }: IconProps) {
    return <FontAwesome5 name={name} size={size * 0.85} color={color} />;
  };
}

export const MetronomeIcon = mci('metronome');
export const NoteIcon = mci('music-note');
export const StopwatchIcon = mci('timer-outline');
export const TunerIcon = mci('tune');
export const WaveIcon = mci('waveform');
export const MetricModulationIcon = mci('metronome-tick');
export const TempoTrainerIcon = mci('speedometer');
export const ChordChartIcon = mci('file-music-outline');
export const RecordIcon = mci('record-circle');
export const DrumIcon = fa5('drum');
export const UsersIcon = mci('account-group');
export const EarIcon = mci('ear-hearing');
export const ScaleIcon = mci('stairs');
export const IntervalIcon = mci('ruler');
export const ChordIcon = mci('piano');
export const ShuffleIcon = mci('shuffle');
export const BookIcon = mci('book-music');
export const SearchIcon = mci('magnify');
export const MenuIcon = mci('menu');
export const CloseIcon = mci('close');
export const HomeIcon = mci('home');
export const SlidersIcon = mci('tune-vertical');
export const ProfileIcon = mci('account-circle');
export const ThemeIcon = mci('palette-outline');
export const ArrowLeftIcon = mci('arrow-left');
export const PlusIcon = mci('plus');
export const TrashIcon = mci('trash-can-outline');
export const CheckIcon = mci('check');
export const PlayIcon = mci('play');
export const PauseIcon = mci('pause');
export const StopIcon = mci('stop');
export const SkipForwardIcon = mci('skip-next');
export const PencilIcon = mci('pencil-outline');
export const BackspaceIcon = mci('backspace-outline');
export const EyeOffIcon = mci('eye-off-outline');
export const DownloadIcon = mci('download');
export const ChevronDownIcon = mci('chevron-down');
export const ChevronRightIcon = mci('chevron-right');
export const LinkIcon = mci('link-variant');
export const FeedIcon = mci('view-dashboard-outline');
export const FollowersIcon = mci('account-multiple-outline');
export const ShareIcon = mci('share-variant-outline');

export function StarIcon({ color, size = 18, filled }: IconProps & { filled?: boolean }) {
  return <MaterialCommunityIcons name={filled ? 'star' : 'star-outline'} size={size} color={color} />;
}

export function HeartIcon({ color, size = 18, filled }: IconProps & { filled?: boolean }) {
  return <MaterialCommunityIcons name={filled ? 'heart' : 'heart-outline'} size={size} color={color} />;
}

/** href -> icon component, mirroring apps/web/components/tools.tsx's NAV_LINK_ICONS. */
export const NAV_LINK_ICONS: Record<string, ComponentType<IconProps>> = {
  '/jam-practice': ShuffleIcon,
  '/note-trainer': NoteIcon,
  '/scale-trainer': ScaleIcon,
  '/interval-trainer': IntervalIcon,
  '/guess-the-interval': EarIcon,
  '/guess-the-chord': ChordIcon,
  '/practice-timer': StopwatchIcon,
  '/metronome': MetronomeIcon,
  '/random-metric-modulation': MetricModulationIcon,
  '/tempo-trainer': TempoTrainerIcon,
  '/tuner': TunerIcon,
  '/slow-downer': WaveIcon,
  '/chord-charts': ChordChartIcon,
  '/recorder': RecordIcon,
  '/random-sticking-warmup': DrumIcon,
  '/community': UsersIcon,
};
