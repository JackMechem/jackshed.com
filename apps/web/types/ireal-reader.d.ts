/** `ireal-reader` ships no types; this is just enough to call it safely. See lib/iRealPro.ts
    for how it's used — it only handles the scrambling/field-splitting, not the chart layout. */
declare module "ireal-reader" {
  export type IrealReaderSong = {
    title: string;
    composer: string;
    style: string;
    key: string;
    transpose: number | null;
    music: { timeSignature: string | null; raw: string };
    bpm: number | null;
    repeats: number | null;
  };
  export type IrealReaderPlaylist = {
    name: string | undefined;
    songs: IrealReaderSong[];
  };
  function IrealReader(data: string): IrealReaderPlaylist;
  export default IrealReader;
}
