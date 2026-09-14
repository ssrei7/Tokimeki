import { z } from 'zod';
import { ProviderBindingSchema, ProviderConfigSchema, TtsConfigSchema, type CharacterProviderBinding, type ProviderBinding, type ProviderConfig, type TtsConfig } from './types';

export const PROVIDER_SETTINGS_PACKAGE_VERSION = 1;
const SECRET_HEADER = /^(authorization|proxy-authorization|api-key|x-api-key|cookie|set-cookie)$/i;

const PackageCharacterBindingSchema = z.object({ characterId: z.string().min(1), providerId: z.string().min(1).optional(), ttsProviderId: z.string().min(1).optional() }).refine((item) => Boolean(item.providerId || item.ttsProviderId));
const ProviderSettingsPackageSchema = z.object({
  type: z.literal('tokimeki-provider-settings'),
  schemaVersion: z.literal(PROVIDER_SETTINGS_PACKAGE_VERSION),
  exportedAt: z.string().datetime(),
  providers: z.array(ProviderConfigSchema.extend({ apiKey: z.never().optional() })).max(100),
  ttsConfigs: z.array(TtsConfigSchema.safeExtend({ apiKey: z.never().optional() })).max(100),
  bindings: z.array(ProviderBindingSchema).max(100),
  characterBindings: z.array(PackageCharacterBindingSchema).max(500),
  defaultProviderId: z.string().min(1).optional(),
  defaultTtsProviderId: z.string().min(1).optional(),
});

export interface ProviderSettingsPackage {
  type: 'tokimeki-provider-settings';
  schemaVersion: 1;
  exportedAt: string;
  providers: ProviderConfig[];
  ttsConfigs: TtsConfig[];
  bindings: ProviderBinding[];
  characterBindings: Array<Pick<CharacterProviderBinding, 'characterId' | 'providerId' | 'ttsProviderId'>>;
  defaultProviderId?: string;
  defaultTtsProviderId?: string;
}
export interface ProviderSettingsSelection { providerIds: readonly string[]; ttsIds: readonly string[]; includeBindings: boolean }

export function createProviderSettingsPackage(input: { providers: readonly ProviderConfig[]; ttsConfigs: readonly TtsConfig[]; bindings: readonly ProviderBinding[]; characterBindings: readonly CharacterProviderBinding[]; saveId: string; defaultProviderId?: string; defaultTtsProviderId?: string }, selection: ProviderSettingsSelection): ProviderSettingsPackage {
  const providerIds = new Set(selection.providerIds);
  const ttsIds = new Set(selection.ttsIds);
  const providers = input.providers.filter((item) => providerIds.has(item.id)).map(sanitizeProvider);
  const ttsConfigs = input.ttsConfigs.filter((item) => ttsIds.has(item.id)).map(sanitizeTts);
  const bindings = selection.includeBindings ? input.bindings.filter((item) => providerIds.has(item.providerId)).map((item) => ({ ...item })) : [];
  const characterBindings = selection.includeBindings ? input.characterBindings.filter((item) => item.saveId === input.saveId).map(({ characterId, providerId, ttsProviderId }) => ({ characterId, providerId: providerId && providerIds.has(providerId) ? providerId : undefined, ttsProviderId: ttsProviderId && ttsIds.has(ttsProviderId) ? ttsProviderId : undefined })).filter((item) => item.providerId || item.ttsProviderId) : [];
  return ProviderSettingsPackageSchema.parse({ type: 'tokimeki-provider-settings', schemaVersion: PROVIDER_SETTINGS_PACKAGE_VERSION, exportedAt: new Date().toISOString(), providers, ttsConfigs, bindings, characterBindings, defaultProviderId: providerIds.has(input.defaultProviderId ?? '') ? input.defaultProviderId : undefined, defaultTtsProviderId: ttsIds.has(input.defaultTtsProviderId ?? '') ? input.defaultTtsProviderId : undefined }) as ProviderSettingsPackage;
}

export function exportProviderSettingsPackage(pack: ProviderSettingsPackage): Blob {
  return new Blob([JSON.stringify(ProviderSettingsPackageSchema.parse(pack), null, 2)], { type: 'application/json' });
}

export async function importProviderSettingsPackage(input: Blob | string): Promise<ProviderSettingsPackage> {
  const raw = typeof input === 'string' ? input : await input.text();
  const value = JSON.parse(raw) as { schemaVersion?: unknown };
  if (typeof value.schemaVersion === 'number' && value.schemaVersion > PROVIDER_SETTINGS_PACKAGE_VERSION) throw new Error(`设置迁移包版本 v${value.schemaVersion} 高于当前支持版本 v${PROVIDER_SETTINGS_PACKAGE_VERSION}。`);
  const parsed = ProviderSettingsPackageSchema.parse(value) as ProviderSettingsPackage;
  return { ...parsed, providers: parsed.providers.map(sanitizeProvider), ttsConfigs: parsed.ttsConfigs.map(sanitizeTts) };
}

export function selectProviderSettingsPackage(pack: ProviderSettingsPackage, selection: ProviderSettingsSelection): ProviderSettingsPackage {
  return createProviderSettingsPackage({ ...pack, saveId: 'package', characterBindings: pack.characterBindings.map((item) => ({ ...item, id: `package:${item.characterId}`, saveId: 'package' })) }, selection);
}

export function mergeProviderSettingsPackage(existing: { providers: readonly ProviderConfig[]; ttsConfigs: readonly TtsConfig[]; bindings: readonly ProviderBinding[]; characterBindings: readonly CharacterProviderBinding[]; saveId: string }, pack: ProviderSettingsPackage): { providers: ProviderConfig[]; ttsConfigs: TtsConfig[]; bindings: ProviderBinding[]; characterBindings: CharacterProviderBinding[] } {
  const providers = [...existing.providers];
  for (const incoming of pack.providers) {
    const index = providers.findIndex((item) => item.id === incoming.id);
    const old = index >= 0 ? providers[index] : undefined;
    const merged = { ...incoming, apiKey: old?.apiKey, headers: mergeHeaders(incoming.headers, old?.headers) };
    if (index >= 0) providers[index] = merged; else providers.push(merged);
  }
  const ttsConfigs = [...existing.ttsConfigs];
  for (const incoming of pack.ttsConfigs) {
    const index = ttsConfigs.findIndex((item) => item.id === incoming.id);
    const old = index >= 0 ? ttsConfigs[index] : undefined;
    const merged = { ...incoming, apiKey: old?.apiKey, headers: mergeHeaders(incoming.headers, old?.headers) };
    if (index >= 0) ttsConfigs[index] = merged; else ttsConfigs.push(merged);
  }
  const bindings = [...existing.bindings];
  for (const incoming of pack.bindings) { const index = bindings.findIndex((item) => item.taskId === incoming.taskId); if (index >= 0) bindings[index] = incoming; else bindings.push(incoming); }
  const characterBindings = [...existing.characterBindings];
  for (const incoming of pack.characterBindings) {
    const id = `${existing.saveId}:${incoming.characterId}`;
    const record = { ...incoming, id, saveId: existing.saveId };
    const index = characterBindings.findIndex((item) => item.id === id);
    if (index >= 0) characterBindings[index] = record; else characterBindings.push(record);
  }
  return { providers, ttsConfigs, bindings, characterBindings };
}

function sanitizeHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return undefined;
  const entries = Object.entries(headers).filter(([key]) => !SECRET_HEADER.test(key));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function mergeHeaders(incoming?: Record<string, string>, existing?: Record<string, string>): Record<string, string> | undefined {
  const secretEntries = Object.entries(existing ?? {}).filter(([key]) => SECRET_HEADER.test(key));
  const entries = [...Object.entries(incoming ?? {}), ...secretEntries];
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function sanitizeProvider(config: ProviderConfig): ProviderConfig {
  const { apiKey: _apiKey, ...rest } = config;
  return { ...rest, headers: sanitizeHeaders(rest.headers) };
}

function sanitizeTts(config: TtsConfig): TtsConfig {
  const { apiKey: _apiKey, pendingRequest: _pending, lastError: _error, lastCalledAt: _called, ...rest } = config;
  return { ...rest, headers: sanitizeHeaders(rest.headers), requestCount: 0, failureCount: 0, lastStatus: 'idle', updatedAt: new Date().toISOString() };
}
