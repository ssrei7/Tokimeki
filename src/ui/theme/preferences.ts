export const THEME_STORAGE_KEY = 'tokimeki.theme-mode';
export const CUSTOM_CSS_STORAGE_KEY = 'tokimeki.custom-css';
export const THEME_TEMPLATE_STORAGE_KEY = 'tokimeki.theme-template';
export const THEME_APPEARANCE_STORAGE_KEY = 'tokimeki.theme-appearance';
export const DESKTOP_TITLE_STORAGE_KEY = 'tokimeki.desktop-titles';
export const DESKTOP_ICON_STORAGE_KEY = 'tokimeki.desktop-icons';
export const THEME_MODES = ['system', 'light', 'dark'] as const;
export const THEME_TEMPLATES = ['default', 'soft', 'compact'] as const;
export type ThemeMode = typeof THEME_MODES[number];
export type ThemeTemplate = typeof THEME_TEMPLATES[number];
export type ResolvedTheme = Exclude<ThemeMode, 'system'>;

export interface ThemeAppearanceConfig {
  playerBubbleBg: string;
  playerBubbleFg: string;
  characterBubbleBg: string;
  characterBubbleFg: string;
  messageRadius: number;
  messagePadding: number;
  terminalBg: string;
  cardBg: string;
  cardBorder: string;
  cardRadius: number;
  cardShadow: string;
  listDivider: string;
  terminalInputBg: string;
  buttonBg: string;
  selectedBg: string;
  listGap: number;
  mapCardBg: string;
  mapCardBorder: string;
  mapCardRadius: number;
  mapCardShadow: string;
  mapGap: number;
}
export type DesktopTitleOverrides = Record<string, Record<string, string>>;
export type DesktopIconOverrides = Record<string, Record<string, import('../../data/schema/save').AssetRef>>;

export const DEFAULT_THEME_APPEARANCE: ThemeAppearanceConfig = {
  playerBubbleBg: 'var(--gray-600)', playerBubbleFg: 'var(--gray-0)', characterBubbleBg: 'var(--gray-0)', characterBubbleFg: 'var(--gray-800)',
  messageRadius: 8, messagePadding: 12, terminalBg: 'var(--gray-50)', cardBg: 'var(--gray-0)', cardBorder: 'var(--gray-100)', cardRadius: 8, cardShadow: '0 4px 16px rgb(63 63 63 / 0.05)', listDivider: 'var(--gray-100)', terminalInputBg: 'var(--gray-0)', buttonBg: 'var(--gray-600)', selectedBg: 'var(--gray-50)', listGap: 8,
  mapCardBg: 'var(--gray-0)', mapCardBorder: 'var(--gray-100)', mapCardRadius: 8, mapCardShadow: '0 4px 16px rgb(63 63 63 / 0.05)', mapGap: 8,
};

export function themeAppearanceForTemplate(template: ThemeTemplate): ThemeAppearanceConfig {
  const base = { ...DEFAULT_THEME_APPEARANCE };
  if (template === 'soft') return { ...base, messageRadius: 16, messagePadding: 14, cardRadius: 14, listGap: 10, mapCardRadius: 14, mapGap: 10 };
  if (template === 'compact') return { ...base, messageRadius: 3, messagePadding: 8, cardRadius: 4, listGap: 5, mapCardRadius: 4, mapGap: 5 };
  return base;
}

export function themeAppearanceCssVariables(config: ThemeAppearanceConfig): Record<string, string> {
  const parsed = parseThemeAppearance(config);
  return {
    '--theme-player-bubble-bg': parsed.playerBubbleBg, '--theme-player-bubble-fg': parsed.playerBubbleFg, '--theme-character-bubble-bg': parsed.characterBubbleBg, '--theme-character-bubble-fg': parsed.characterBubbleFg, '--theme-message-radius': `${parsed.messageRadius}px`, '--theme-message-padding': `${parsed.messagePadding}px`, '--theme-terminal-bg': parsed.terminalBg, '--theme-card-bg': parsed.cardBg, '--theme-card-border': parsed.cardBorder, '--theme-card-radius': `${parsed.cardRadius}px`, '--theme-card-shadow': parsed.cardShadow, '--theme-list-divider': parsed.listDivider, '--theme-terminal-input-bg': parsed.terminalInputBg, '--theme-button-bg': parsed.buttonBg, '--theme-selected-bg': parsed.selectedBg, '--theme-list-gap': `${parsed.listGap}px`, '--theme-map-card-bg': parsed.mapCardBg, '--theme-map-card-border': parsed.mapCardBorder, '--theme-map-card-radius': `${parsed.mapCardRadius}px`, '--theme-map-card-shadow': parsed.mapCardShadow, '--theme-map-gap': `${parsed.mapGap}px`,
  };
}

export function parseThemeMode(value: unknown): ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value) ? value as ThemeMode : 'system';
}
export function parseThemeTemplate(value: unknown): ThemeTemplate {
  return typeof value === 'string' && (THEME_TEMPLATES as readonly string[]).includes(value) ? value as ThemeTemplate : 'default';
}
export function readThemeTemplate(storage: Pick<Storage, 'getItem'>): ThemeTemplate {
  try { return parseThemeTemplate(storage.getItem(THEME_TEMPLATE_STORAGE_KEY)); } catch { return 'default'; }
}
export function writeThemeTemplate(storage: Pick<Storage, 'setItem'>, template: ThemeTemplate): void {
  try { storage.setItem(THEME_TEMPLATE_STORAGE_KEY, template); } catch { /* local preference unavailable */ }
}
export function applyThemeTemplate(template: ThemeTemplate, root: Pick<HTMLElement, 'setAttribute'> = document.documentElement): void { root.setAttribute('data-theme-template', template); }
export function readThemeMode(storage: Pick<Storage, 'getItem'>): ThemeMode {
  try { return parseThemeMode(storage.getItem(THEME_STORAGE_KEY)); } catch { return 'system'; }
}
export function writeThemeMode(storage: Pick<Storage, 'setItem'>, mode: ThemeMode): void {
  try { storage.setItem(THEME_STORAGE_KEY, mode); } catch { /* local preference unavailable */ }
}
export function parseThemeAppearance(value: unknown): ThemeAppearanceConfig {
  if (!value || typeof value !== 'object') return { ...DEFAULT_THEME_APPEARANCE };
  const source = value as Partial<Record<keyof ThemeAppearanceConfig, unknown>>;
  const numberValue = (key: keyof ThemeAppearanceConfig, fallback: number, min: number, max: number) => typeof source[key] === 'number' && Number.isFinite(source[key]) ? Math.max(min, Math.min(max, source[key] as number)) : fallback;
  const colorValue = (key: keyof ThemeAppearanceConfig, fallback: string) => typeof source[key] === 'string' && source[key]!.length <= 160 ? source[key] as string : fallback;
  return {
    playerBubbleBg: colorValue('playerBubbleBg', DEFAULT_THEME_APPEARANCE.playerBubbleBg), playerBubbleFg: colorValue('playerBubbleFg', DEFAULT_THEME_APPEARANCE.playerBubbleFg), characterBubbleBg: colorValue('characterBubbleBg', DEFAULT_THEME_APPEARANCE.characterBubbleBg), characterBubbleFg: colorValue('characterBubbleFg', DEFAULT_THEME_APPEARANCE.characterBubbleFg),
    messageRadius: numberValue('messageRadius', 8, 0, 32), messagePadding: numberValue('messagePadding', 12, 4, 28), terminalBg: colorValue('terminalBg', DEFAULT_THEME_APPEARANCE.terminalBg), cardBg: colorValue('cardBg', DEFAULT_THEME_APPEARANCE.cardBg), cardBorder: colorValue('cardBorder', DEFAULT_THEME_APPEARANCE.cardBorder), cardRadius: numberValue('cardRadius', 8, 0, 32), cardShadow: colorValue('cardShadow', DEFAULT_THEME_APPEARANCE.cardShadow), listDivider: colorValue('listDivider', DEFAULT_THEME_APPEARANCE.listDivider), terminalInputBg: colorValue('terminalInputBg', DEFAULT_THEME_APPEARANCE.terminalInputBg), buttonBg: colorValue('buttonBg', DEFAULT_THEME_APPEARANCE.buttonBg), selectedBg: colorValue('selectedBg', DEFAULT_THEME_APPEARANCE.selectedBg), listGap: numberValue('listGap', 8, 0, 32),
    mapCardBg: colorValue('mapCardBg', DEFAULT_THEME_APPEARANCE.mapCardBg), mapCardBorder: colorValue('mapCardBorder', DEFAULT_THEME_APPEARANCE.mapCardBorder), mapCardRadius: numberValue('mapCardRadius', 8, 0, 32), mapCardShadow: colorValue('mapCardShadow', DEFAULT_THEME_APPEARANCE.mapCardShadow), mapGap: numberValue('mapGap', 8, 0, 32),
  };
}
export function readThemeAppearance(storage: Pick<Storage, 'getItem'>): ThemeAppearanceConfig {
  try { const raw = storage.getItem(THEME_APPEARANCE_STORAGE_KEY); return raw ? parseThemeAppearance(JSON.parse(raw)) : { ...DEFAULT_THEME_APPEARANCE }; } catch { return { ...DEFAULT_THEME_APPEARANCE }; }
}
export function writeThemeAppearance(storage: Pick<Storage, 'setItem' | 'removeItem'>, config: ThemeAppearanceConfig): void {
  const parsed = parseThemeAppearance(config);
  try { storage.setItem(THEME_APPEARANCE_STORAGE_KEY, JSON.stringify(parsed)); } catch { /* local preference unavailable */ }
}
export function applyThemeAppearance(config: ThemeAppearanceConfig, root: Pick<HTMLElement, 'style'> = document.documentElement): void {
  Object.entries(themeAppearanceCssVariables(config)).forEach(([key, value]) => root.style.setProperty(key, value));
}
export function parseDesktopTitleOverrides(value: unknown): DesktopTitleOverrides {
  if (!value || typeof value !== 'object') return {};
  const result: DesktopTitleOverrides = {};
  for (const [launcherId, entries] of Object.entries(value as Record<string, unknown>)) {
    if (!entries || typeof entries !== 'object') continue;
    const valid = Object.fromEntries(Object.entries(entries as Record<string, unknown>).filter(([, title]) => typeof title === 'string' && title.length <= 40).map(([id, title]) => [id, title as string]));
    if (Object.keys(valid).length) result[launcherId] = valid;
  }
  return result;
}
export function readDesktopTitleOverrides(storage: Pick<Storage, 'getItem'>): DesktopTitleOverrides {
  try { const raw = storage.getItem(DESKTOP_TITLE_STORAGE_KEY); return raw ? parseDesktopTitleOverrides(JSON.parse(raw)) : {}; } catch { return {}; }
}
export function writeDesktopTitleOverrides(storage: Pick<Storage, 'setItem' | 'removeItem'>, value: DesktopTitleOverrides): void {
  const parsed = parseDesktopTitleOverrides(value);
  try { if (Object.keys(parsed).length) storage.setItem(DESKTOP_TITLE_STORAGE_KEY, JSON.stringify(parsed)); else storage.removeItem(DESKTOP_TITLE_STORAGE_KEY); } catch { /* local preference unavailable */ }
}
export function parseDesktopIconOverrides(value: unknown): DesktopIconOverrides {
  if (!value || typeof value !== 'object') return {};
  const result: DesktopIconOverrides = {};
  for (const [launcherId, entries] of Object.entries(value as Record<string, unknown>)) {
    if (!entries || typeof entries !== 'object') continue;
    const valid = Object.fromEntries(Object.entries(entries as Record<string, unknown>).filter(([, item]) => item && typeof item === 'object' && ((item as { kind?: unknown }).kind === 'stored' && typeof (item as { assetId?: unknown }).assetId === 'string' || (item as { kind?: unknown }).kind === 'url' && typeof (item as { url?: unknown }).url === 'string' && /^https?:\/\//i.test((item as { url: string }).url))));
    if (Object.keys(valid).length) result[launcherId] = valid as DesktopIconOverrides[string];
  }
  return result;
}
export function readDesktopIconOverrides(storage: Pick<Storage, 'getItem'>): DesktopIconOverrides {
  try { const raw = storage.getItem(DESKTOP_ICON_STORAGE_KEY); return raw ? parseDesktopIconOverrides(JSON.parse(raw)) : {}; } catch { return {}; }
}
export function writeDesktopIconOverrides(storage: Pick<Storage, 'setItem' | 'removeItem'>, value: DesktopIconOverrides): void {
  const parsed = parseDesktopIconOverrides(value);
  try { if (Object.keys(parsed).length) storage.setItem(DESKTOP_ICON_STORAGE_KEY, JSON.stringify(parsed)); else storage.removeItem(DESKTOP_ICON_STORAGE_KEY); } catch { /* local preference unavailable */ }
}
export function readCustomCss(storage: Pick<Storage, 'getItem'>): string {
  try { return storage.getItem(CUSTOM_CSS_STORAGE_KEY) ?? ''; } catch { return ''; }
}
export function validateCustomCss(css: string): string[] {
  const issues: string[] = [];
  if (css.length > 20000) issues.push('自定义 CSS 最多 20000 个字符。');
  if (/@import\b/i.test(css)) issues.push('不允许 @import，避免主题偷偷加载外部资源。');
  if (/url\s*\(|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding\s*:/i.test(css)) issues.push('不允许 url、脚本表达式或行为属性。');
  return issues;
}
export function writeCustomCss(storage: Pick<Storage, 'setItem' | 'removeItem'>, css: string): string[] {
  const issues = validateCustomCss(css);
  if (issues.length) return issues;
  try { if (css.trim()) storage.setItem(CUSTOM_CSS_STORAGE_KEY, css); else storage.removeItem(CUSTOM_CSS_STORAGE_KEY); } catch { return ['无法写入本地主题偏好。']; }
  return [];
}
export function applyCustomCss(css: string, target: Document = document): void {
  const existing = target.getElementById('tokimeki-custom-css');
  existing?.remove();
  if (!css.trim() || validateCustomCss(css).length) return;
  const style = target.createElement('style'); style.id = 'tokimeki-custom-css'; style.textContent = css; target.head.appendChild(style);
}
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme { return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode; }
export function applyTheme(mode: ThemeMode, prefersDark = false, root: Pick<HTMLElement, 'setAttribute' | 'style'> = document.documentElement): ResolvedTheme {
  const resolved = resolveTheme(mode, prefersDark); root.setAttribute('data-theme', resolved); root.style.colorScheme = resolved; return resolved;
}
