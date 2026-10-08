import type { ViewStyle } from 'react-native';

/** The edge every slide-up bottom sheet gets in place of a dimmed backdrop: the dark backdrop slid
    up with the sheet (a `Modal`'s slide animation moves its whole content, backdrop included),
    which looked like a dark box rising behind it — so sheets have no backdrop at all now (the
    empty area above still closes them on tap) and stand out from the page with a hairline top edge
    and a shadow instead. */
export function sheetEdge(colors: Record<string, string>): ViewStyle {
  return {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors['surface-hover'],
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
  };
}
