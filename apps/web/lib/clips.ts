import { Peaks, peaksOf } from "@/lib/audioFile";
import { bakeClipAudio } from "@/lib/splice";
import { trackEndTime } from "@/lib/multitrack";
import { encodeWav } from "@/lib/wav";

/** A piece of audio on a track. */
export type Clip = {
  id: string;
  name: string;
  blob: Blob;
  buffer: AudioBuffer;
  peaks: Peaks;
  /** Timeline position of the start of the played part, in seconds. */
  offset: number;
  /** The part of the recording that plays, in seconds into the audio. */
  trimStart: number;
  trimEnd: number;
  /** When set, the clip repeats until this timeline position. */
  repeatEnd: number | null;
};

const EDGE = 1e-6;

/** Turns a clip's trim and repeats into plain audio, so it can be cut anywhere. */
export function bakeClip(ctx: BaseAudioContext, clip: Clip): Clip {
  const { buffer, start } = bakeClipAudio(ctx, clip);
  return {
    ...clip,
    blob: encodeWav(buffer),
    buffer,
    peaks: peaksOf(buffer),
    offset: start,
    trimStart: 0,
    trimEnd: buffer.duration,
    repeatEnd: null,
  };
}

export type CarveResult = {
  /** The clips left on the track, with any overlap cut away. */
  clips: Clip[];
  /** Clips whose audio needs writing to storage (new pieces, or baked clips). */
  save: Clip[];
  /** Clip ids whose stored audio is no longer needed. */
  remove: string[];
};

/**
 * Clears the timeline range [from, to] on a track: clips inside it are removed, clips that
 * straddle an edge are trimmed, and a clip that spans the whole range is split in two.
 */
export function carveClips(
  ctx: BaseAudioContext,
  clips: Clip[],
  from: number,
  to: number,
  newId: () => string,
): CarveResult {
  const kept: Clip[] = [];
  const save: Clip[] = [];
  const remove: string[] = [];

  for (const original of clips) {
    if (trackEndTime(original) <= from + EDGE || original.offset >= to - EDGE) {
      kept.push(original);
      continue;
    }

    // Repeats are baked into plain audio first so the cut can land anywhere.
    let clip = original;
    if (clip.repeatEnd !== null) {
      const fullyCovered = clip.offset >= from - EDGE && trackEndTime(clip) <= to + EDGE;
      if (fullyCovered) {
        remove.push(original.id);
        continue;
      }
      clip = bakeClip(ctx, clip);
    }
    const end = trackEndTime(clip);

    if (clip.offset >= from - EDGE && end <= to + EDGE) {
      remove.push(original.id);
      continue;
    }

    let keptOriginalId = false;
    if (clip.offset < from - EDGE) {
      kept.push({ ...clip, trimEnd: clip.trimStart + (from - clip.offset) });
      keptOriginalId = true;
      if (clip !== original) save.push(kept[kept.length - 1]);
    }
    if (end > to + EDGE) {
      const right: Clip = {
        ...clip,
        id: newId(),
        name: `${clip.name} (2)`,
        offset: to,
        trimStart: clip.trimStart + (to - clip.offset),
      };
      kept.push(right);
      save.push(right);
    }
    if (!keptOriginalId) remove.push(original.id);
  }
  return { clips: kept, save, remove };
}
