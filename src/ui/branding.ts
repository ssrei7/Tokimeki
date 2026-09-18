export const PRODUCT_NAME = '小小地图';
export const LEGACY_DEFAULT_APP_NAME = 'Tokimeki';
export const DEFAULT_APP_NAME = PRODUCT_NAME;

export function resolveAppDisplayName(value?: string | null): string {
  const stored = value?.trim();
  if (!stored || stored === LEGACY_DEFAULT_APP_NAME) return DEFAULT_APP_NAME;
  return stored.slice(0, 32);
}
