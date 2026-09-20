import { describe, expect, it } from 'vitest';

import { DESKTOP_SWIPE_MIN_DISTANCE, desktopSwipeTargetPage } from '../src/ui/desktop-swipe';

describe('desktop swipe pagination', () => {
  it('moves left swipes forward and right swipes backward by one page', () => {
    expect(desktopSwipeTargetPage(0, 3, -DESKTOP_SWIPE_MIN_DISTANCE, 0)).toBe(1);
    expect(desktopSwipeTargetPage(2, 3, DESKTOP_SWIPE_MIN_DISTANCE + 20, 4)).toBe(1);
  });

  it('ignores short, vertical, single-page, and boundary gestures', () => {
    expect(desktopSwipeTargetPage(0, 3, -(DESKTOP_SWIPE_MIN_DISTANCE - 1), 0)).toBeNull();
    expect(desktopSwipeTargetPage(0, 3, -80, 70)).toBeNull();
    expect(desktopSwipeTargetPage(0, 1, -100, 0)).toBeNull();
    expect(desktopSwipeTargetPage(0, 3, 100, 0)).toBeNull();
    expect(desktopSwipeTargetPage(2, 3, -100, 0)).toBeNull();
  });
});
