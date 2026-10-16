import { makeRng, type PerformedBeat } from "./bassLine";
import { DEFAULT_DRUM_CONFIG, drumChorus, type DrumConfig, type DrumHit, type DrumVoice } from "./drums";

// Drum Generator's grooves, grouped by country: jazz from the United States, and Latin American
// styles from Brazil, Cuba, Puerto Rico, the Dominican Republic, Colombia, Trinidad and Tobago and
// Argentina, as they're played on a drum set. Each pattern style is a one- or two-bar cycle written on a grid of steps
// (16ths in 4/4; eighths in 12/8; triplet eighths for the shuffle), one lane per drum, with the
// usual variations a drummer moves between; the swing styles use Bass Genius's drummer
// (`drumChorus`), which already swings the ride the way a jazz drummer does.
//
// The patterns follow the standard drum-set adaptations. Where the parts come from: the claves
// (son, rumba, bossa — Wikipedia's "Clave (rhythm)" pulse grids: son 3-2 = 1, 4, 7, 11, 13 of 16;
// rumba 3-2 = 1, 4, 8, 11, 13; bossa = 1, 4, 7, 11, 14; the 6/8 bell = 1, 3, 5, 6, 8, 10, 12 of
// 12), the cáscara (paila) pattern, the mambo bell (2-3: 1 2 3 4 & | 1 2 & 3 4 &), the conga
// tumbao (slap on 2, open tones on 4 and the "and" of 4) moved to cross-stick and floor tom, the
// samba surdo on the bass drum (1, a, 2, a with 2 strongest) and the tamborim "telecoteco" on
// cross-stick, the baião zabumba (1 and its last 16th, then 2) with the triangle on the hi-hat,
// Mozambique (the New York bell — the songo stick pattern without main beat 3 — over straight
// quarters on the bass drum and the bombo on the toms), songo (right hand on the four main beats,
// left-hand offbeats on the rim, the bass drum on the "and" of 2 and on 4).

export type GrooveCountry = "us" | "brazil" | "cuba" | "puerto-rico" | "dominican-republic" | "colombia" | "trinidad" | "argentina";
export type ClaveKind = "son" | "rumba" | "bossa" | "six8";
export type ClaveSide = "3-2" | "2-3";

/** One cycle per lane, bars separated by "|". Steps: X accent, x normal, o soft, g ghost, . rest. */
type Lanes = Partial<Record<DrumVoice, string>>;

export type DrumStyle = {
  id: string;
  name: string;
  /** Where the style comes from (styles are grouped by country). */
  country: GrooveCountry;
  /** One line on the style and how it's played on the kit. */
  about: string;
  meter: { top: number; bottom: number };
  /** Main beats per bar (the tempo counts these: quarters, or dotted quarters in 12/8). */
  beats: number;
  /** Grid steps per main beat (4 = 16ths, 3 = eighths in 12/8 or triplets, 2 = eighths). */
  stepsPerBeat: number;
  /** Written as triplets (the shuffle): each beat's three steps are a triplet. */
  triplets?: boolean;
  tempo: { initial: number; min: number; max: number };
  clave?: { kind: ClaveKind; written: ClaveSide | null };
  /** Swing styles: Bass Genius's drummer, with these drum settings. */
  swing?: { comping: boolean; config?: Partial<DrumConfig> };
  lanes?: Lanes;
  /** Alternatives a drummer moves between, each tried once a cycle with this chance (scaled by
      the Variation setting). Lanes given replace the main ones for that cycle; "" silences one. */
  variations?: { chance: number; lanes: Lanes }[];
  /** How a fill goes: around the toms, or a snare/tom roll. */
  fill?: "toms" | "snare";
};

const S: DrumStyle[] = [
  // ——— Swing ———
  {
    id: "medium-swing",
    name: "Medium swing",
    country: "us",
    about: "Spang-a-lang on the ride, hi-hat foot on 2 and 4, a feathered bass drum on every beat.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 2,
    tempo: { initial: 160, min: 90, max: 260 },
    swing: { comping: false },
  },
  {
    id: "swing-comping",
    name: "Swing with comping",
    country: "us",
    about: "The same time feel with the left hand comping: snare chatter on the “ands”, setups and a crash marking each 8 bars.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 2,
    tempo: { initial: 180, min: 100, max: 280 },
    swing: { comping: true },
  },
  {
    id: "up-tempo-swing",
    name: "Up-tempo swing",
    country: "us",
    about: "Fast swing: the ride broken up with more straight quarters, the skip note evening out, a lighter bass drum.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 2,
    tempo: { initial: 280, min: 220, max: 360 },
    swing: { comping: false, config: { figSpangALang: 0.6, figQuarters: 0.35, figALangALang: 0.05, kickLevel: 0.1 } },
  },
  {
    id: "jazz-waltz",
    name: "Jazz waltz",
    country: "us",
    about: "Swing in 3: the ride skipping into 1, hi-hat foot on 2 and 3, a feathered bass drum.",
    meter: { top: 3, bottom: 4 },
    beats: 3,
    stepsPerBeat: 2,
    tempo: { initial: 150, min: 90, max: 240 },
    swing: { comping: false },
  },
  {
    id: "shuffle",
    name: "Shuffle",
    country: "us",
    about: "A blues shuffle, written in 12/8: the ride on each beat and its last triplet, backbeat on 2 and 4, bass drum on 1 and 3.",
    meter: { top: 12, bottom: 8 },
    beats: 4,
    stepsPerBeat: 3,
    tempo: { initial: 110, min: 70, max: 170 },
    lanes: {
      ride: "x.ox.ox.ox.o",
      snare: "...X.....X..",
      kick: "x.....x.....",
      pedal: "...x.....x..",
    },
    variations: [
      { chance: 0.45, lanes: { snare: "..gX..g..X.g" } },
      { chance: 0.3, lanes: { kick: "x....ox....o" } },
      { chance: 0.25, lanes: { ride: "", hhClosed: "x.ox.ox.ox.o" } },
    ],
    fill: "snare",
  },

  // ——— Latin ———
  {
    id: "bossa-nova",
    name: "Bossa nova",
    country: "brazil",
    about: "Even eighths on the hi-hat, the bossa clave on cross-stick, the surdo on the bass drum (1, the “and” of 2, 3, the “and” of 4).",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 130, min: 90, max: 180 },
    clave: { kind: "bossa", written: "3-2" },
    lanes: {
      hhClosed: "x.o.x.o.x.o.x.o.|x.o.x.o.x.o.x.o.",
      crossStick: "x.....x.....x...|....x.....x.....",
      kick: "x.....o.x.....o.|x.....o.x.....o.",
    },
    variations: [
      { chance: 0.3, lanes: { hhClosed: "", ride: "x.o.x.o.x.o.x.o.|x.o.x.o.x.o.x.o.", pedal: "....o.......o...|....o.......o..." } },
      { chance: 0.2, lanes: { kick: "x..o..o.x..o..o.|x..o..o.x..o..o." } },
    ],
    fill: "toms",
  },
  {
    id: "samba",
    name: "Samba",
    country: "brazil",
    about: "In 2: the surdo on the bass drum (the second beat strongest), 16ths on the ride, the tamborim’s telecoteco on cross-stick.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 110, min: 80, max: 150 },
    lanes: {
      ride: "XooxXooxXooxXoox",
      kick: "o..xX..xo..xX..x",
      pedal: "....x.......x...",
      crossStick: "o.o..o.o..o.o.o.",
    },
    variations: [
      { chance: 0.3, lanes: { crossStick: "..o...o...o...o." } },
      { chance: 0.3, lanes: { ride: "", hhClosed: "XooxXooxXooxXoox" } },
    ],
    fill: "snare",
  },
  {
    id: "baiao",
    name: "Baião",
    country: "brazil",
    about: "From the Northeast of Brazil: the zabumba on the bass drum (1 and its last 16th, then 2), its high bacalhau on cross-stick, the triangle’s 16ths on the hi-hat.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 105, min: 80, max: 140 },
    lanes: {
      hhClosed: "oxXooxXooxXooxXo",
      kick: "X..xo...X..xo...",
      crossStick: "......x.......x.",
    },
    variations: [{ chance: 0.3, lanes: { hhOpen: "......o.......o.", hhClosed: "oxXoox.ooxXoox.o" } }],
    fill: "toms",
  },
  {
    id: "cumbia",
    name: "Cumbia",
    country: "colombia",
    about: "Colombian cumbia on the kit: the guacharaca’s eighths on the hi-hat, bass drum on 1 and 3, cross-stick on 2 and 4.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 95, min: 75, max: 125 },
    lanes: {
      hhClosed: "o.x.o.x.o.x.o.x.",
      kick: "x.......x.......",
      crossStick: "....x.......x...",
    },
    variations: [
      { chance: 0.3, lanes: { kick: "x.....o.x.......", crossStick: "....x.......x.g." } },
      { chance: 0.25, lanes: { hhOpen: "......o.......o.", hhClosed: "o.x.o...o.x.o..." } },
    ],
    fill: "toms",
  },

  // ——— Afro-Cuban ———
  {
    id: "mambo",
    name: "Mambo",
    country: "cuba",
    about: "The mambo bell on the cowbell, the conga tumbao split between cross-stick (slap on 2) and floor tom (open tones on 4 and its “and”), the bass’s anticipated “and” of 2 and 4 on the bass drum.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 190, min: 150, max: 240 },
    clave: { kind: "son", written: "2-3" },
    lanes: {
      cowbell: "X...x...X...x.x.|X...x.x.X...x.x.",
      crossStick: "....x...........|....x...........",
      tomLow: "............x.x.|............x.x.",
      kick: "......x.....x...|......x.....x...",
    },
    variations: [
      { chance: 0.25, lanes: { kick: "......x.........|......x.....x..." } },
      { chance: 0.2, lanes: { cowbell: "", bell: "X...x...X...x.x.|X...x.x.X...x.x." } },
    ],
    fill: "toms",
  },
  {
    id: "cha-cha",
    name: "Cha-cha-chá",
    country: "cuba",
    about: "Quarters on the cowbell (the bell’s mouth on 1 and 3), the tumbao on cross-stick and floor tom, the bass drum on the “ands” of 2 and 4.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 116, min: 96, max: 136 },
    clave: { kind: "son", written: "2-3" },
    lanes: {
      cowbell: "X...o...X...o...|X...o...X...o...",
      crossStick: "....x...........|....x...........",
      tomLow: "............x.x.|............x.x.",
      kick: "......o.......x.|......o.......x.",
    },
    variations: [
      { chance: 0.3, lanes: { cowbell: "X...o.o.X...o...|X...o.o.X...o..." } },
      { chance: 0.25, lanes: { cowbell: "", hhClosed: "x.o.x.o.x.o.x.o.|x.o.x.o.x.o.x.o." } },
    ],
    fill: "toms",
  },
  {
    id: "songo",
    name: "Songo",
    country: "cuba",
    about: "Changuito’s Los Van Van groove: the right hand on the four main beats, the left on the offbeats (rim clicks and a tom), the bass drum on the “and” of 2 and on 4.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 180, min: 140, max: 230 },
    clave: { kind: "rumba", written: "2-3" },
    lanes: {
      hhClosed: "x...x...x...x...|x...x...x...x...",
      crossStick: "..........x...x.|......x...x.....",
      tomHigh: "................|..............x.",
      snare: "..g..g.....g..g.|.g.....g.g......",
      kick: "......x.....x...|......x.....x...",
    },
    variations: [
      { chance: 0.25, lanes: { hhClosed: "", cowbell: "x...x...x...x...|x...x...x...x..." } },
      { chance: 0.3, lanes: { kick: "...x..x.....x...|......x..x..x..." } },
    ],
    fill: "snare",
  },
  {
    id: "mozambique",
    name: "Mozambique",
    country: "cuba",
    about: "The New York version (Steve Gadd, “Late in the Evening”): the bell on the cowbell, the bombo on the toms, straight quarters on the bass drum, hi-hat foot on the “ands”.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 200, min: 160, max: 250 },
    clave: { kind: "rumba", written: "2-3" },
    lanes: {
      cowbell: "X...x...x.x...x.|....x.x...x...x.",
      tomLow: "............o...|......X.........",
      tomHigh: "................|............x...",
      kick: "x...x...x...x...|x...x...x...x...",
      pedal: "..o...o...o...o.|..o...o...o...o.",
    },
    variations: [{ chance: 0.3, lanes: { tomHigh: "..........o.....|..o.........x..." } }],
    fill: "toms",
  },
  {
    id: "guaguanco",
    name: "Guaguancó",
    country: "cuba",
    about: "Rumba on the kit: the cáscara on the hi-hat, the palitos’ offbeats on cross-stick, the congas’ open tones on the toms, the bass drum on the bombo and ponche.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 110, min: 90, max: 140 },
    clave: { kind: "rumba", written: "3-2" },
    lanes: {
      hhClosed: "x...x.x...x...x.|x...x...x.x...x.",
      crossStick: "..o...o...o...o.|..o.......o.....",
      tomHigh: "................|..........x.x...",
      tomLow: "..............x.|..............x.",
      kick: "......x.........|............x...",
    },
    variations: [{ chance: 0.3, lanes: { tomHigh: "..........x.....|..........x.x..." } }],
    fill: "toms",
  },
  {
    id: "bolero",
    name: "Bolero",
    country: "cuba",
    about: "The Cuban bolero, slow and in 4: the maracas’ eighths on the hi-hat, cross-stick on 4, the conga’s open tones on the floor tom.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 76, min: 56, max: 100 },
    lanes: {
      hhClosed: "x.o.x.o.x.o.x.o.",
      crossStick: "............x...",
      tomLow: "..............o.",
      kick: "x.......x.....o.",
    },
    variations: [
      { chance: 0.3, lanes: { crossStick: "....o.......x..." } },
      { chance: 0.25, lanes: { tomLow: "............o.o." } },
    ],
    fill: "toms",
  },
  {
    id: "bembe",
    name: "Bembé (6/8)",
    country: "cuba",
    about: "The 6/8 bell on the cowbell, the bass drum on the dotted quarters, hi-hat foot on 2 and 4, the drums’ calls on cross-stick and floor tom.",
    meter: { top: 12, bottom: 8 },
    beats: 4,
    stepsPerBeat: 3,
    tempo: { initial: 100, min: 70, max: 140 },
    clave: { kind: "six8", written: null },
    lanes: {
      cowbell: "x.x.xx.x.x.x",
      kick: "x..o..x..o..",
      pedal: "...x.....x..",
      crossStick: "...x.....x..",
      tomLow: "......x..x..",
    },
    variations: [
      { chance: 0.3, lanes: { tomLow: "......x.xx.." } },
      { chance: 0.25, lanes: { snare: ".g...g.g...g" } },
    ],
    fill: "toms",
  },
  {
    id: "afro-68",
    name: "Afro-Cuban 6/8",
    country: "cuba",
    about: "Ñáñigo-style 6/8 on the ride: the bell pattern on the cymbal’s bell, ghosted snare in the gaps, the bass drum on 1 and 3, hi-hat foot on 2 and 4.",
    meter: { top: 12, bottom: 8 },
    beats: 4,
    stepsPerBeat: 3,
    tempo: { initial: 110, min: 70, max: 150 },
    clave: { kind: "six8", written: null },
    lanes: {
      bell: "x.x.xx.x.x.x",
      snare: ".g.g..g.g.x.",
      kick: "x.....x.....",
      pedal: "...x.....x..",
    },
    variations: [
      { chance: 0.3, lanes: { snare: ".g.g..g.g.X.", tomHigh: "..........x.", tomLow: "...........x" } },
      { chance: 0.2, lanes: { bell: "", ride: "x.x.xx.x.x.x" } },
    ],
    fill: "snare",
  },

  // ——— Brazil (more) ———
  {
    id: "partido-alto",
    name: "Partido alto",
    country: "brazil",
    about: "The partido alto figure on the snare (its high voice) over the samba surdo on the bass drum, 16ths on the hi-hat.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 100, min: 80, max: 130 },
    lanes: {
      hhClosed: "xooxxooxxooxxoox",
      snare: ".x.X..x.X..x..X.",
      kick: "o..xX..xo..xX..x",
      pedal: "....x.......x...",
    },
    variations: [
      { chance: 0.35, lanes: { snare: "gx.Xg.xgX.gx.gX." } },
      { chance: 0.25, lanes: { hhClosed: "", ride: "xooxxooxxooxxoox" } },
    ],
    fill: "snare",
  },
  {
    id: "samba-reggae",
    name: "Samba-reggae",
    country: "brazil",
    about: "From Salvador, Bahia (Olodum): the caixa’s clave-like accents on the snare over ghost notes, the low surdo on the floor tom on 2 and 4, the bass drum on 1 and 3.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 100, min: 80, max: 125 },
    lanes: {
      snare: "X.gXg.X.g.X.X.g.",
      tomLow: "....X.....o.X...",
      kick: "x.......x.......",
      pedal: "..o...o...o...o.",
    },
    variations: [
      { chance: 0.3, lanes: { tomHigh: "..............x." } },
      { chance: 0.3, lanes: { snare: "XggXggXggggXgXgg" } },
    ],
    fill: "toms",
  },
  {
    id: "ijexa",
    name: "Ijexá",
    country: "brazil",
    about: "The afoxé groove of Bahia, slow and in 4: the agogô’s pattern on the cowbell, the atabaques’ slaps and open tones on cross-stick and floor tom, a shaker’s eighths on the hi-hat.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 90, min: 70, max: 115 },
    lanes: {
      cowbell: "X...x.x...x...x.|X.x...x.x...x...",
      crossStick: "....x.......x...|....x.......x...",
      tomLow: "......o.....x.x.|......o.....x.x.",
      kick: "x.......o.......|x.......o.......",
      hhClosed: "o.g.o.g.o.g.o.g.|o.g.o.g.o.g.o.g.",
    },
    variations: [{ chance: 0.3, lanes: { tomHigh: "..........o.....|..o.......o....." } }],
    fill: "toms",
  },
  {
    id: "frevo",
    name: "Frevo",
    country: "brazil",
    about: "The fast carnival march of Recife, in 2: driving 16ths on the snare with the accents on the second beat, the bass drum marching on every beat.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 140, min: 110, max: 170 },
    lanes: {
      snare: "x.gxX.gxx.gxX.gx",
      kick: "x...x...x...x...",
      pedal: "..o...o...o...o.",
    },
    variations: [
      { chance: 0.3, lanes: { snare: "x.gxX.xxx.gxX.xx" } },
      { chance: 0.2, lanes: { crash: "x..............." } },
    ],
    fill: "snare",
  },
  {
    id: "xote",
    name: "Xote (forró)",
    country: "brazil",
    about: "The forró trio’s gentle xote: the zabumba on the bass drum (1 and its last 16th), its bacalhau on cross-stick, the triangle on the hi-hat, open on the “ands”.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 90, min: 70, max: 115 },
    lanes: {
      hhClosed: "x.X.x.X.x.X.x.X.",
      kick: "X..x....X..x....",
      crossStick: "....x.x.....x.x.",
    },
    variations: [{ chance: 0.3, lanes: { tomLow: "............o..." } }],
    fill: "toms",
  },

  // ——— Cuba (more) ———
  {
    id: "son-montuno",
    name: "Son montuno",
    country: "cuba",
    about: "The son: the bongó’s martillo on the hi-hat (the open tone on 4), the conga tumbao on cross-stick and floor tom, the bass’s anticipated “and” of 2 and 4 on the bass drum.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 120, min: 90, max: 160 },
    clave: { kind: "son", written: "2-3" },
    lanes: {
      hhClosed: "x.o.x.o.x.o.X.o.|x.o.x.o.x.o.X.o.",
      crossStick: "....x...........|....x...........",
      tomLow: "............x.x.|............x.x.",
      kick: "......x.....x...|......x.....x...",
    },
    variations: [
      // The montuno: the bongocero picks up the bell (campana).
      { chance: 0.35, lanes: { hhClosed: "", cowbell: "X...x.x.X...x.x.|X...x.x.X...x.x." } },
    ],
    fill: "toms",
  },
  {
    id: "danzon",
    name: "Danzón",
    country: "cuba",
    about: "The timbales’ baqueteo on the snare: quarters on the 2-side, the cinquillo (1, 2, 2&, 3&, 4) on the 3-side, the bass drum on 1 and 3.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 100, min: 80, max: 125 },
    clave: { kind: "son", written: "2-3" },
    lanes: {
      snare: "o...o...x...o...|X...x.x...x.x...",
      crossStick: "..g...g...g...g.|................",
      kick: "x.......x.......|x.......x.......",
    },
    variations: [{ chance: 0.3, lanes: { tomHigh: "................|............x..." } }],
    fill: "snare",
  },
  {
    id: "conga-comparsa",
    name: "Conga (comparsa)",
    country: "cuba",
    about: "The street conga of Santiago and Havana carnival: the bell driving on the cowbell, snare chatter, the bombo’s big hit on the floor tom on the 3-side.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 125, min: 105, max: 150 },
    clave: { kind: "son", written: "2-3" },
    lanes: {
      cowbell: "X...X...X...X.x.|X...X.x.X...X...",
      snare: "g.gXg.g.g.gXg.g.|g.gXg.g.g.gXg.g.",
      tomLow: "................|......X.....x...",
      kick: "x.......x.......|x.......x.......",
    },
    variations: [{ chance: 0.3, lanes: { tomHigh: "............x.x.|................" } }],
    fill: "toms",
  },

  // ——— Puerto Rico ———
  {
    id: "plena",
    name: "Plena",
    country: "puerto-rico",
    about: "The panderetas on the kit: the seguidor’s low pattern on the floor tom, the punteador on the snare on 2 and 4, eighths on the hi-hat, the bass drum on 1 and 3.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 120, min: 100, max: 150 },
    lanes: {
      hhClosed: "x.o.x.o.x.o.x.o.",
      tomLow: "x.....x.x.....x.",
      snare: "....x.......x...",
      kick: "x.......x.......",
    },
    variations: [{ chance: 0.3, lanes: { tomHigh: "...x.......x...." } }],
    fill: "toms",
  },

  // ——— Dominican Republic ———
  {
    id: "merengue",
    name: "Merengue",
    country: "dominican-republic",
    about: "Merengue derecho, felt in 2: the güira’s gallop (1, &, a) on the hi-hat, the bass drum on every beat, the tambora split between cross-stick (its stick side) and floor tom.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 140, min: 120, max: 180 },
    lanes: {
      hhClosed: "X.xxX.xxX.xxX.xx",
      kick: "x...x...x...x...",
      crossStick: "..x.......x.....",
      tomLow: "......x.......x.",
    },
    variations: [
      // The jaleo: the tambora opens up.
      { chance: 0.3, lanes: { tomLow: "......x.....x.xx", crossStick: "..x...x...x....." } },
    ],
    fill: "toms",
  },
  {
    id: "bachata",
    name: "Bachata",
    country: "dominican-republic",
    about: "Bachata derecho on the kit: the güira’s eighths on the hi-hat, the bongó’s martillo slap on cross-stick on 2 and 4, a tom answering on the “and” of 4, the bass drum on 1 and 3.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 126, min: 110, max: 150 },
    lanes: {
      hhClosed: "x.o.x.o.x.o.x.o.",
      crossStick: "....x.......x...",
      tomHigh: "..............o.",
      kick: "x.......x.......",
    },
    variations: [{ chance: 0.3, lanes: { hhClosed: "x.oox.oox.oox.oo" } }],
    fill: "toms",
  },

  // ——— Trinidad and Tobago ———
  {
    id: "calypso",
    name: "Calypso",
    country: "trinidad",
    about: "Calypso: the open hi-hat on the upbeats, the bass drum in a 3-3-2 figure, a light backbeat on the snare.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 110, min: 90, max: 135 },
    lanes: {
      hhClosed: "x...x...x...x...",
      hhOpen: "..o...o...o...o.",
      kick: "x..x..x.x..x..x.",
      snare: "....x.......x...",
    },
    variations: [{ chance: 0.35, lanes: { cowbell: "x.xx.xx.x.xx.xx." } }],
    fill: "snare",
  },
  {
    id: "soca",
    name: "Soca",
    country: "trinidad",
    about: "Soca, the “soul of calypso”: four on the floor, a strong backbeat, the open hi-hat on the “ands” driving it.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 150, min: 120, max: 170 },
    lanes: {
      kick: "X...X...X...X...",
      snare: "....X.......X...",
      hhClosed: "x...x...x...x...",
      hhOpen: "..x...x...x...x.",
    },
    variations: [{ chance: 0.3, lanes: { snare: "....X.....g.X..g", cowbell: "..x...x...x...x." } }],
    fill: "snare",
  },

  // ——— Argentina ———
  {
    id: "tango",
    name: "Tango",
    country: "argentina",
    about: "Tango marcato: every beat marked on the bass drum, cross-stick on 2 and 4, the drag (arrastre) on the snare into the next bar.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 116, min: 96, max: 136 },
    lanes: {
      kick: "X...x...X...x...",
      crossStick: "....x.......x...",
      snare: "..............gx",
    },
    variations: [{ chance: 0.3, lanes: { snare: "......gx......gx" } }],
    fill: "snare",
  },
  {
    id: "milonga",
    name: "Milonga",
    country: "argentina",
    about: "The milonga’s 3-3-2 (the habanera’s cousin) on the bass drum, cross-stick on 2 and 4, eighths on the hi-hat.",
    meter: { top: 4, bottom: 4 },
    beats: 4,
    stepsPerBeat: 4,
    tempo: { initial: 105, min: 85, max: 130 },
    lanes: {
      kick: "X..x..x.X..x..x.",
      crossStick: "....x.......x...",
      hhClosed: "x.o.x.o.x.o.x.o.",
    },
    variations: [{ chance: 0.3, lanes: { tomLow: "...x..x....x..x." } }],
    fill: "toms",
  },
];

export const DRUM_STYLES: DrumStyle[] = S;
export const COUNTRIES: { id: GrooveCountry; label: string }[] = [
  { id: "us", label: "United States (jazz)" },
  { id: "brazil", label: "Brazil" },
  { id: "cuba", label: "Cuba" },
  { id: "puerto-rico", label: "Puerto Rico" },
  { id: "dominican-republic", label: "Dominican Republic" },
  { id: "colombia", label: "Colombia" },
  { id: "trinidad", label: "Trinidad and Tobago" },
  { id: "argentina", label: "Argentina" },
];
export const styleById = (id: string): DrumStyle => S.find((s) => s.id === id) ?? S[0];

/** The clave's strokes, as steps in a two-bar 16th grid (3-2), or one 12/8 bar. */
const CLAVES: Record<ClaveKind, string> = {
  son: "x.....x.....x...|....x...x.......",
  rumba: "x.....x.......x.|....x...x.......",
  bossa: "x.....x.....x...|....x.....x.....",
  six8: "x.x.x..x.x..",
};

/** What a clave voice plays: the style's own part, nothing, or a clave. */
export type ClaveChoice = "style" | "off" | ClaveKind;
/** The right hand's timekeeping instruments. */
export type TimeVoice = "hhClosed" | "ride" | "bell" | "cowbell";
export const TIME_VOICES: { id: TimeVoice; label: string }[] = [
  { id: "hhClosed", label: "Hi-hat" },
  { id: "ride", label: "Ride" },
  { id: "bell", label: "Ride bell" },
  { id: "cowbell", label: "Cowbell" },
];
const TIME_SET = new Set<DrumVoice>(TIME_VOICES.map((t) => t.id));
/** "style": the style's own instrument, kept all the way through; "auto": the drummer moves
    between instruments the way the style's variations do; or one instrument throughout. */
export type HandChoice = "style" | "auto" | TimeVoice;
export const CLAVE_LABEL: Record<ClaveKind, string> = { son: "Son clave", rumba: "Rumba clave", bossa: "Bossa nova clave", six8: "6/8 clave" };

/** The claves a style can take (on cross-stick or woodblock): the 16th-note claves in 4/4, the
    6/8 clave in 12/8; none for the swing styles. */
export function claveKindsFor(style: DrumStyle): ClaveKind[] {
  if (style.swing || style.country === "us") return [];
  if (style.meter.top === 12) return ["six8"];
  if (style.beats === 4 && style.stepsPerBeat === 4) return ["son", "rumba", "bossa"];
  return [];
}

/** The style's own timekeeping instrument (its first hand lane on a bell, cymbal or hi-hat). */
export function mainTimeVoice(style: DrumStyle): TimeVoice | null {
  for (const [v, l] of Object.entries(style.lanes ?? {})) if (l && TIME_SET.has(v as DrumVoice)) return v as TimeVoice;
  return null;
}

/** What a clave choice comes to for this style (null = nothing played). */
export function resolveClave(style: DrumStyle, choice: ClaveChoice, role: "crossStick" | "block"): ClaveKind | null {
  if (choice === "off") return null;
  if (choice === "style") return role === "block" ? (style.clave?.kind ?? null) : null;
  return claveKindsFor(style).includes(choice) ? choice : null;
}

/** Whether the clave's direction (3-2 / 2-3) matters with these options. */
export function claveDirectionMatters(style: DrumStyle, opts: Pick<GrooveOptions, "crossStick" | "block">): boolean {
  const two = (k: ClaveKind | null) => !!k && k !== "six8";
  return (!!style.clave?.written && style.clave.kind !== "six8") || two(resolveClave(style, opts.crossStick, "crossStick")) || two(resolveClave(style, opts.block, "block"));
}

export type GrooveOptions = {
  /** Which way round the clave goes (styles in clave, and any clave chosen below). */
  clave: ClaveSide;
  /** What the cross-stick plays: the style's own part, nothing, or a clave. */
  crossStick: ClaveChoice;
  /** What the woodblock (a jam block under the left foot) plays: nothing, the style's clave, or one chosen. */
  block: ClaveChoice;
  /** The right hand's timekeeping instrument. */
  hand: HandChoice;
  /** A fill every this many bars (0 = none). */
  fillEvery: number;
  /** 0–1: how often the drummer moves off the basic pattern. */
  variation: number;
  /** Swing styles: the drum settings to start from. */
  drumConfig?: DrumConfig;
};

export const DEFAULT_GROOVE_OPTIONS: GrooveOptions = { clave: "2-3", crossStick: "style", block: "off", hand: "style", fillEvery: 8, variation: 0.5 };

/** One hit: `beat` in performance beats (the style's main beats); `bar`/`step` place it on the
    bar's grid for the notation. Swing styles' hits keep their skip/swing/late placement. */
export type GrooveHit = DrumHit & { bar: number; step: number };
export type GrooveBar = { bar: number; hits: GrooveHit[]; fill: boolean };

const LEVEL: Record<string, number> = { X: 0.92, x: 0.7, o: 0.48, g: 0.2 };

/** Splits a lane into its bars (a one-bar lane repeats). */
function laneBars(lane: string, cycleBars: number): string[] {
  const bars = lane.split("|");
  return Array.from({ length: cycleBars }, (_, i) => bars[i % bars.length]);
}

/** How many bars a style's cycle lasts (its longest lane). */
export function cycleBars(style: DrumStyle): number {
  const lanes = Object.values(style.lanes ?? {});
  const fromLanes = Math.max(1, ...lanes.map((l) => l.split("|").length));
  return style.clave && style.clave.kind !== "six8" ? Math.max(2, fromLanes) : fromLanes;
}

/** Writes `count` bars of a groove from bar `startBar` (performance bar index), seeded so the same
    seed and options always write the same bars. */
export function generateGroove(style: DrumStyle, startBar: number, count: number, seed: number, opts: GrooveOptions): GrooveBar[] {
  const out: GrooveBar[] = Array.from({ length: count }, (_, i) => ({ bar: startBar + i, hits: [], fill: false }));
  const beatsPerBar = style.beats;

  if (style.swing) {
    const beats: PerformedBeat[] = [];
    for (let b = 0; b < count; b++)
      for (let k = 0; k < beatsPerBar; k++) beats.push({ bar: startBar + b, beatInBar: k, beatsInBar: beatsPerBar, harmony: null, chorus: 0 });
    const config = { ...DEFAULT_DRUM_CONFIG, ...(opts.drumConfig ?? {}), ...(style.swing.config ?? {}) };
    const hits = drumChorus(beats, startBar * beatsPerBar, "sticks", seed, {
      chorus: Math.floor(startBar / count),
      isLast: false,
      comping: style.swing.comping,
      config,
    });
    for (const h of hits) {
      const bar = Math.floor(h.beat / beatsPerBar + 1e-6);
      const target = out[bar - startBar];
      if (!target) continue;
      const step = Math.round((h.beat - bar * beatsPerBar) * style.stepsPerBeat) + (h.skip ? 1 : 0);
      target.hits.push({ ...h, bar, step });
    }
    return out;
  }

  const rng = makeRng(seed);
  const cycle = cycleBars(style);
  const steps = beatsPerBar * style.stepsPerBeat;
  const flip = !!style.clave?.written && style.clave.written !== opts.clave;
  // The right hand: the style's own timekeeping instrument, or the one chosen, kept throughout
  // (only "auto" lets the variations move it to another instrument).
  const main = mainTimeVoice(style);
  const auto = opts.hand === "auto";
  const hand: DrumVoice | null = main && opts.hand !== "style" && opts.hand !== "auto" ? opts.hand : main;
  const crossClave = resolveClave(style, opts.crossStick, "crossStick");
  const blockClave = resolveClave(style, opts.block, "block");
  const ownCross = opts.crossStick === "style";
  const place = (target: Lanes, key: string, value: string) => {
    if (TIME_SET.has(key as DrumVoice) && !auto) {
      if (key !== main || !value) return; // a switch to another instrument (or dropping the hand)
      target[hand!] = value;
      return;
    }
    if (key === "crossStick" && !ownCross) return;
    target[key as DrumVoice] = value;
  };
  let lanes: Lanes = {};
  for (let i = 0; i < count; i++) {
    const bar = startBar + i;
    const inCycle = bar % cycle;
    // A new cycle: choose this time round's variations.
    if (inCycle === 0 || i === 0) {
      lanes = {};
      for (const [k, l] of Object.entries(style.lanes ?? {})) {
        if (TIME_SET.has(k as DrumVoice) && k === main && !auto) lanes[hand!] = l;
        // Another layer on the instrument the hand moved to (the ijexá's shaker on the hi-hat)
        // gives way to the hand.
        else if (k === hand && hand !== main && !auto) continue;
        else if (!(k === "crossStick" && !ownCross)) lanes[k as DrumVoice] = l;
      }
      for (const v of style.variations ?? [])
        if (rng.next() < v.chance * opts.variation * 1.6) for (const [k, l] of Object.entries(v.lanes)) place(lanes, k, l ?? "");
    }
    // The other way round the clave: the cycle's bars swap.
    const written = flip ? (inCycle + 1) % cycle : inCycle;
    const isFill = opts.fillEvery > 0 && (bar + 1) % opts.fillEvery === 0;
    const afterFill = opts.fillEvery > 0 && bar > 0 && bar % opts.fillEvery === 0;
    // A fill takes the hands for the bar's last beat (two at slow tempos in 4/4 is too long; one).
    const fillFrom = isFill ? steps - style.stepsPerBeat * (beatsPerBar >= 4 && rng.next() < 0.4 ? 2 : 1) : steps;
    const hits: GrooveHit[] = [];
    const add = (voice: DrumVoice, step: number, velocity: number) =>
      hits.push({ beat: bar * beatsPerBar + step / style.stepsPerBeat, voice, velocity, bar, step });

    for (const [voice, lane] of Object.entries(lanes) as [DrumVoice, string][]) {
      if (!lane) continue;
      const cells = laneBars(lane, cycle)[written];
      const feet = voice === "kick" || voice === "pedal";
      for (let s = 0; s < steps; s++) {
        const c = cells[s] ?? ".";
        const level = LEVEL[c];
        if (level === undefined) continue;
        if (!feet && s >= fillFrom) continue;
        // Ghost notes come and go.
        if (c === "g" && rng.next() < 0.25 * opts.variation) continue;
        add(voice, s, level);
      }
    }
    // A clave on the cross-stick and/or the woodblock, the chosen way round.
    const claveCells = (kind: ClaveKind) => laneBars(CLAVES[kind], kind === "six8" ? 1 : 2)[kind === "six8" ? 0 : (opts.clave === "3-2" ? bar : bar + 1) % 2];
    if (crossClave) {
      const cells = claveCells(crossClave);
      for (let s = 0; s < fillFrom; s++) if (cells[s] === "x") add("crossStick", s, 0.7);
    }
    if (blockClave) {
      const cells = claveCells(blockClave);
      for (let s = 0; s < steps; s++) if (cells[s] === "x") add("block", s, 0.62);
    }
    if (isFill) fillHits(style, fillFrom, steps, rng, add);
    if (afterFill) {
      // Land the fill: a crash and the bass drum on the downbeat.
      add("crash", 0, 0.62);
      if (!hits.some((h) => h.voice === "kick" && h.step === 0)) add("kick", 0, 0.6);
    }
    out[i].hits = hits.sort((a, b) => a.step - b.step);
    out[i].fill = isFill;
  }
  return out;
}

/** A fill from `from` to the bar's end: down the toms, or a snare figure with a tom at the end. */
function fillHits(style: DrumStyle, from: number, steps: number, rng: ReturnType<typeof makeRng>, add: (v: DrumVoice, s: number, vel: number) => void) {
  const per = style.stepsPerBeat;
  // Every grid step in 12/8 and triplets; 16ths otherwise, now and then with a gap.
  const n = steps - from;
  const voices: DrumVoice[] =
    style.fill === "snare"
      ? Array.from({ length: n }, (_, i) => (i >= n - 2 ? (i === n - 1 ? "tomLow" : "tomHigh") : "snare"))
      : Array.from({ length: n }, (_, i) => (i < n / 3 ? "snare" : i < (2 * n) / 3 ? "tomHigh" : "tomLow"));
  for (let i = 0; i < n; i++) {
    const s = from + i;
    const onBeat = (s % per) === 0;
    // Leave the odd gap so it breathes (never the first or last note).
    if (i > 0 && i < n - 1 && per === 4 && !onBeat && rng.next() < 0.18) continue;
    const crescendo = 0.45 + (0.45 * i) / Math.max(1, n - 1);
    add(voices[i], s, Math.min(0.95, crescendo + (onBeat ? 0.05 : 0)));
  }
}
