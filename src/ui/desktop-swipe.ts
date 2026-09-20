export const DESKTOP_SWIPE_MIN_DISTANCE = 48;
export const DESKTOP_SWIPE_AXIS_RATIO = 1.25;

export function desktopSwipeTargetPage(currentPage: number, pageCount: number, deltaX: number, deltaY: number): number | null {
  if (pageCount <= 1 || !Number.isInteger(currentPage) || currentPage < 0 || currentPage >= pageCount) return null;
  const horizontalDistance = Math.abs(deltaX);
  if (horizontalDistance < DESKTOP_SWIPE_MIN_DISTANCE || horizontalDistance <= Math.abs(deltaY) * DESKTOP_SWIPE_AXIS_RATIO) return null;
  const targetPage = Math.max(0, Math.min(pageCount - 1, currentPage + (deltaX < 0 ? 1 : -1)));
  return targetPage === currentPage ? null : targetPage;
}
