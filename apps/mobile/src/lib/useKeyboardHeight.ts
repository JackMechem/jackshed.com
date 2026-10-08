import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** How much of the bottom of the screen the on-screen keyboard currently covers (0 when hidden).
    Android now draws apps edge-to-edge, so `adjustResize` no longer shrinks the screen when the
    keyboard opens — a screen that needs its content above the keyboard pads itself by this. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
