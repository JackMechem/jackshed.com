/* eslint-disable react-hooks/refs -- the gesture callbacks read `callbacks.current` only from
   gesture events, never during render; the compiler can't tell and flags the memoized gesture. */
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

type Positions = Record<string, number>;

function toPositions(keys: string[]): Positions {
  const out: Positions = {};
  keys.forEach((k, i) => (out[k] = i));
  return out;
}

/**
 * A fixed-row-height list you reorder by dragging each row's handle (the `handle` node passed to
 * `renderRow` — wrap whatever grip icon you like). Positions live in a shared value on the UI
 * thread, so the dragged row follows the finger and the others slide out of the way without a
 * React render per frame; `onReorder` gets the final key order once on release.
 * `onDragChange` tells the parent a drag started/ended (to switch off its ScrollView meanwhile).
 */
export function DraggableList({
  keys,
  rowHeight,
  renderRow,
  onReorder,
  onDragChange,
}: {
  keys: string[];
  rowHeight: number;
  renderRow: (key: string, index: number, handle: (child: ReactNode) => ReactNode) => ReactNode;
  onReorder: (keys: string[]) => void;
  onDragChange?: (dragging: boolean) => void;
}) {
  const positions = useSharedValue<Positions>(toPositions(keys));
  const active = useSharedValue('');
  const dragTop = useSharedValue(0);
  const keyString = keys.join('|');

  useEffect(() => {
    positions.set(toPositions(keyString ? keyString.split('|') : []));
  }, [keyString, positions]);

  return (
    <View style={{ height: keys.length * rowHeight - 1 }}>
      {keys.map((key, i) => (
        <Row
          key={key}
          id={key}
          count={keys.length}
          rowHeight={rowHeight}
          positions={positions}
          active={active}
          dragTop={dragTop}
          onReorder={onReorder}
          onDragChange={onDragChange}
        >
          {(handle) => renderRow(key, i, handle)}
        </Row>
      ))}
    </View>
  );
}

function Row({
  id,
  count,
  rowHeight,
  positions,
  active,
  dragTop,
  onReorder,
  onDragChange,
  children,
}: {
  id: string;
  count: number;
  rowHeight: number;
  positions: SharedValue<Positions>;
  active: SharedValue<string>;
  dragTop: SharedValue<number>;
  onReorder: (keys: string[]) => void;
  onDragChange?: (dragging: boolean) => void;
  children: (handle: (child: ReactNode) => ReactNode) => ReactNode;
}) {
  const startTop = useSharedValue(0);
  // The gesture is memoized (rebuilding it mid-drag would cancel the drag), so it calls back into
  // the latest props through a ref rather than closing over them.
  const callbacks = useRef({ onReorder, onDragChange });
  useEffect(() => {
    callbacks.current = { onReorder, onDragChange };
  });
  const notify = useCallback((dragging: boolean) => callbacks.current.onDragChange?.(dragging), []);
  const finish = useCallback((order: string[]) => callbacks.current.onReorder(order), []);

  const pan = useMemo(() => Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      active.set(id);
      startTop.set((positions.get()[id] ?? 0) * rowHeight);
      dragTop.set(startTop.get());
      runOnJS(notify)(true);
    })
    .onUpdate((e) => {
      const top = Math.max(0, Math.min((count - 1) * rowHeight, startTop.get() + e.translationY));
      dragTop.set(top);
      const from = positions.get()[id];
      const to = Math.round(top / rowHeight);
      if (to === from) return;
      const next: Positions = {};
      for (const k in positions.get()) {
        const p = positions.get()[k];
        if (k === id) next[k] = to;
        else if (from < to && p > from && p <= to) next[k] = p - 1;
        else if (from > to && p >= to && p < from) next[k] = p + 1;
        else next[k] = p;
      }
      positions.set(next);
    })
    .onFinalize(() => {
      if (active.get() !== id) return;
      active.set('');
      const order: string[] = [];
      for (const k in positions.get()) order[positions.get()[k]] = k;
      runOnJS(finish)(order);
      runOnJS(notify)(false);
    }), [id, count, rowHeight, positions, active, dragTop, startTop, notify, finish]);

  const style = useAnimatedStyle(() => {
    const dragging = active.get() === id;
    const top = (positions.get()[id] ?? 0) * rowHeight - 1;
    return {
      top: dragging ? dragTop.get() - 1 : withTiming(top, { duration: 160 }),
      zIndex: dragging ? 10 : 0,
      elevation: dragging ? 8 : 0,
      opacity: dragging ? 0.95 : 1,
    };
  });

  return (
    <Animated.View style={[{ position: 'absolute', left: 0, right: 0, height: rowHeight }, style]}>
      {children((child) => <GestureDetector gesture={pan}>{child}</GestureDetector>)}
    </Animated.View>
  );
}
