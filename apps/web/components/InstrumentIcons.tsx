import { svgProps } from "@/components/tools";

type IconProps = { className?: string };

const size = "h-5 w-5 shrink-0";

function ChromaticIcon({ className = size }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 17a8 8 0 0116 0" />
      <path d="M12 17l4-7" />
      <circle cx="12" cy="17" r="1.2" />
    </svg>
  );
}

function GuitarIcon({ className = size }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="8" cy="16" r="4.5" />
      <circle cx="11.5" cy="12.5" r="3" />
      <circle cx="8.5" cy="15.5" r="1" />
      <path d="M13.5 10.5l6.5-6.5M18 3l3 3" />
    </svg>
  );
}

function BassIcon({ className = size }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M5 13c-1.500 1.500-1.500 4.500 0 6s4.500 1.500 6 0c1-1 1-2.500 2-3.500L20 9" />
      <path d="M5 13c1-1 2.500-1 3.500-2L11 8.500" />
      <path d="M18 4l3 3M11 8.500L14 6M8 16l1.500-1.500" />
    </svg>
  );
}

function UkuleleIcon({ className = size }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="8.500" cy="15.500" r="4" />
      <circle cx="11" cy="12.500" r="2.500" />
      <circle cx="8.500" cy="15.500" r=".8" />
      <path d="M12.500 11l6-6M17 3.500l3.500 3.500" />
    </svg>
  );
}

function ViolinIcon({ className = size }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 9c-2.500 0-4 1.500-4 3.300 0 1 .5 1.700 1.200 2.100C8.500 14.800 8 15.500 8 16.600 8 18.700 9.700 21 12 21s4-2.300 4-4.400c0-1.100-.5-1.800-1.200-2.200.7-.4 1.200-1.100 1.200-2.100C16 10.500 14.500 9 12 9z" />
      <path d="M12 9V3M10.500 17h3" />
    </svg>
  );
}

function CelloIcon({ className = size }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 8c-2.500 0-4.200 1.500-4.200 3.500 0 1 .5 1.800 1.200 2.200-.8.500-1.300 1.300-1.300 2.500 0 2.600 2 4.300 4.300 4.300s4.300-1.700 4.300-4.300c0-1.200-.5-2-1.300-2.500.7-.4 1.200-1.200 1.200-2.200C16.200 9.500 14.500 8 12 8z" />
      <path d="M12 8V2.500M12 20v2M10.500 16h3" />
    </svg>
  );
}

function BanjoIcon({ className = size }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="9" cy="15" r="6" />
      <circle cx="9" cy="15" r="3.500" />
      <path d="M13.500 10.500l6.500-6.500M18 3l3 3" />
    </svg>
  );
}

function TrumpetIcon({ className = size }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M2 11h15" />
      <path d="M17 11l4.500-3v10L17 15" />
      <path d="M17 15H7.500a2.500 2.500 0 010-5" />
      <path d="M9 11V7.500M12 11V7.500M15 11V7.500" />
    </svg>
  );
}

function SaxophoneIcon({ className = size }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M8 3l2 2v11a4 4 0 004 4h1a4 4 0 004-4v-3" />
      <path d="M17 12h4M8 3H6" />
      <path d="M10 8h2M10 11h2M10 14h2" />
    </svg>
  );
}

function HornIcon({ className = size }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <circle cx="11" cy="13" r="7" />
      <circle cx="11" cy="13" r="3.500" />
      <path d="M11 6V3h3M18 13h3.500" />
    </svg>
  );
}

export const INSTRUMENT_ICONS: Record<string, (props: IconProps) => React.ReactElement> = {
  chromatic: ChromaticIcon,
  guitar: GuitarIcon,
  bass: BassIcon,
  ukulele: UkuleleIcon,
  violin: ViolinIcon,
  viola: ViolinIcon,
  cello: CelloIcon,
  banjo: BanjoIcon,
  bb: TrumpetIcon,
  eb: SaxophoneIcon,
  f: HornIcon,
};

export function InstrumentIcon({ id, className }: { id: string; className?: string }) {
  const Icon = INSTRUMENT_ICONS[id] ?? ChromaticIcon;
  return <Icon className={className} />;
}
