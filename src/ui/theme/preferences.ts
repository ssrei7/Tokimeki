export const THEME_STORAGE_KEY = 'tokimeki.theme-mode';
export const CUSTOM_CSS_STORAGE_KEY = 'tokimeki.custom-css';
export const THEME_TEMPLATE_STORAGE_KEY = 'tokimeki.theme-template';
export const THEME_MODES = ['system', 'light', 'dark'] as const;
export const THEME_TEMPLATES = ['default', 'soft', 'compact'] as const;
export type ThemeMode = typeof THEME_MODES[number];
export type ThemeTemplate = typeof THEME_TEMPLATES[number];
export type ResolvedTheme = Exclude<ThemeMode, 'system'>;

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
