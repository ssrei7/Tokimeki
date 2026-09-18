import { z } from 'zod';
import { ImageConfigSchema, ProviderBindingSchema, ProviderConfigSchema, TtsConfigSchema, type CharacterProviderBinding, type ImageConfig, type ProviderBinding, type ProviderConfig, type TtsConfig } from './types';

export const PROVIDER_SETTINGS_PACKAGE_VERSION = 2;
const SECRET_HEADER = /^(authorization|proxy-authorization|api-key|x-api-key|cookie|set-cookie)$/i;

const PackageCharacterBindingSchema = z.object({ characterId: z.string().min(1), providerId: z.string().min(1).optional(), ttsProviderId: z.string().min(1).optional() }).refine((item) => Boolean(item.providerId || item.ttsProviderId));
const ProviderSettingsPackageSchema = z.object({
  type: z.literal('tokimeki-provider-settings'),
  schemaVersion: z.literal(PROVIDER_SETTINGS_PACKAGE_VERSION),
  exportedAt: z.string().datetime(),
  providers: z.array(ProviderConfigSchema).max(100),
  ttsConfigs: z.array(TtsConfigSchema).max(100),
  bindings: z.array(ProviderBindingSchema).max(100),
  characterBindings: z.array(PackageCharacterBindingSchema).max(500),
  imageConfig: ImageConfigSchema.optional(),
  defaultProviderId: z.string().min(1).optional(),
  defaultTtsProviderId: z.string().min(1).optional(),
});

export interface ProviderSettingsPackage {
  type: 'tokimeki-provider-settings';
  schemaVersion: 2;
  exportedAt: string;
  providers: ProviderConfig[];
  ttsConfigs: TtsConfig[];
  bindings: ProviderBinding[];
  characterBindings: Array<Pick<CharacterProviderBinding, 'characterId' | 'providerId' | 'ttsProviderId'>>;
  imageConfig?: ImageConfig;
  defaultProviderId?: string;
  defaultTtsProviderId?: string;
}
export interface ProviderSettingsSelection { providerIds: readonly string[]; ttsIds: readonly string[]; includeBindings: boolean; includeSecrets?: boolean }

export function createProviderSettingsPackage(input: { providers: readonly ProviderConfig[]; ttsConfigs: readonly TtsConfig[]; bindings: readonly ProviderBinding[]; characterBindings: readonly CharacterProviderBinding[]; imageConfig?: ImageConfig; saveId: string; defaultProviderId?: string; defaultTtsProviderId?: string }, selection: ProviderSettingsSelection): ProviderSettingsPackage {
  const providerIds = new Set(selection.providerIds);
  const ttsIds = new Set(selection.ttsIds);
  const providers = input.providers.filter((item) => providerIds.has(item.id)).map((item) => selection.includeSecrets ? structuredClone(item) : sanitizeProvider(item));
  const ttsConfigs = input.ttsConfigs.filter((item) => ttsIds.has(item.id)).map((item) => selection.includeSecrets ? structuredClone(item) : sanitizeTts(item));
  const bindings = selection.includeBindings ? input.bindings.filter((item) => providerIds.has(item.providerId)).map((item) => ({ ...item })) : [];
  const characterBindings = selection.includeBindings ? input.characterBindings.filter((item) => item.saveId === input.saveId).map(({ characterId, providerId, ttsProviderId }) => ({ characterId, providerId: providerId && providerIds.has(providerId) ? providerId : undefined, ttsProviderId: ttsProviderId && ttsIds.has(ttsProviderId) ? ttsProviderId : undefined })).filter((item) => item.providerId || item.ttsProviderId) : [];
  const imageConfig = input.imageConfig ? sanitizeImageConfig(input.imageConfig, providerIds.has(input.imageConfig.providerId ?? '')) : undefined;
  return ProviderSettingsPackageSchema.parse({ type: 'tokimeki-provider-settings', schemaVersion: PROVIDER_SETTINGS_PACKAGE_VERSION, exportedAt: new Date().toISOString(), providers, ttsConfigs, bindings, characterBindings, imageConfig, defaultProviderId: providerIds.has(input.defaultProviderId ?? '') ? input.defaultProviderId : undefined, defaultTtsProviderId: ttsIds.has(input.defaultTtsProviderId ?? '') ? input.defaultTtsProviderId : undefined }) as ProviderSettingsPackage;
}

export function exportProviderSettingsPackage(pack: ProviderSettingsPackage): Blob {
  return new Blob([JSON.stringify(ProviderSettingsPackageSchema.parse(pack), null, 2)], { type: 'application/json' });
}

export async function importProviderSettingsPackage(input: Blob | string): Promise<ProviderSettingsPackage> {
  const raw = typeof input === 'string' ? input : await input.text();
  const value = JSON.parse(raw) as { schemaVersion?: unknown; [key: string]: unknown };
  if (typeof value.schemaVersion === 'number' && value.schemaVersion > PROVIDER_SETTINGS_PACKAGE_VERSION) throw new Error(`设置迁移包版本 v${value.schemaVersion} 高于当前支持版本 v${PROVIDER_SETTINGS_PACKAGE_VERSION}。`);
  const migrated = value.schemaVersion === 1 ? { ...value, schemaVersion: PROVIDER_SETTINGS_PACKAGE_VERSION } : value;
  const parsed = ProviderSettingsPackageSchema.parse(migrated) as ProviderSettingsPackage;
  return parsed;
}

export function selectProviderSettingsPackage(pack: ProviderSettingsPackage, selection: ProviderSettingsSelection): ProviderSettingsPackage {
  return createProviderSettingsPackage({ ...pack, saveId: 'package', characterBindings: pack.characterBindings.map((item) => ({ ...item, id: `package:${item.characterId}`, saveId: 'package' })) }, selection);
}

export function mergeProviderSettingsPackage(existing: { providers: readonly ProviderConfig[]; ttsConfigs: readonly TtsConfig[]; bindings: readonly ProviderBinding[]; characterBindings: readonly CharacterProviderBinding[]; imageConfig?: ImageConfig; saveId: string }, pack: ProviderSettingsPackage): { providers: ProviderConfig[]; ttsConfigs: TtsConfig[]; bindings: ProviderBinding[]; characterBindings: CharacterProviderBinding[]; imageConfig?: ImageConfig } {
  const providers = [...existing.providers];
  for (const incoming of pack.providers) {
    const index = providers.findIndex((item) => item.id === incoming.id);
    const old = index >= 0 ? providers[index] : undefined;
    const merged = { ...incoming, apiKey: incoming.apiKey ?? old?.apiKey, headers: mergeHeaders(incoming.headers, old?.headers, Boolean(incoming.apiKey)) };
    if (index >= 0) providers[index] = merged; else providers.push(merged);
  }
  const ttsConfigs = [...existing.ttsConfigs];
  for (const incoming of pack.ttsConfigs) {
    const index = ttsConfigs.findIndex((item) => item.id === incoming.id);
    const old = index >= 0 ? ttsConfigs[index] : undefined;
    const merged = { ...incoming, apiKey: incoming.apiKey ?? old?.apiKey, headers: mergeHeaders(incoming.headers, old?.headers, Boolean(incoming.apiKey)) };
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
  const imageConfig = pack.imageConfig ? ImageConfigSchema.parse({ ...pack.imageConfig, providerId: pack.imageConfig.providerId ?? existing.imageConfig?.providerId, updatedAt: new Date().toISOString() }) : existing.imageConfig;
  return { providers, ttsConfigs, bindings, characterBindings, imageConfig };
}

function sanitizeHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return undefined;
  const entries = Object.entries(headers).filter(([key]) => !SECRET_HEADER.test(key));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function mergeHeaders(incoming?: Record<string, string>, existing?: Record<string, string>, incomingHasSecret = false): Record<string, string> | undefined {
  const secretEntries = incomingHasSecret ? [] : Object.entries(existing ?? {}).filter(([key]) => SECRET_HEADER.test(key));
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

function sanitizeImageConfig(config: ImageConfig, includeProviderId: boolean): ImageConfig {
  const { lastError: _error, lastCalledAt: _called, providerId, ...rest } = config;
  return ImageConfigSchema.parse({ ...rest, ...(includeProviderId && providerId ? { providerId } : {}), requestCount: 0, failureCount: 0, lastStatus: 'idle', updatedAt: new Date().toISOString() });
}
