import { describe, expect, it } from 'vitest';
import { createProviderSettingsPackage, exportProviderSettingsPackage, importProviderSettingsPackage, mergeProviderSettingsPackage, selectProviderSettingsPackage } from '../src/providers/settings-package';
import type { ProviderConfig, TtsConfig } from '../src/providers/types';

const provider: ProviderConfig = { id: 'chat', name: 'Chat', kind: 'openai-compatible', endpoint: 'https://example.com/v1', apiKey: 'secret', model: 'model', contextWindow: 8192, maxOutputTokens: 1024, temperature: 0.7, headers: { Authorization: 'Bearer secret', 'X-Trace': 'yes' } };
const tts: TtsConfig = { id: 'voice', name: 'Voice', enabled: true, endpoint: 'https://example.com/v1/audio/speech', apiKey: 'voice-secret', model: 'tts', voice: 'alloy', format: 'mp3', headers: { 'X-API-Key': 'secret', 'X-Region': 'local' }, requestCount: 4, failureCount: 1, lastStatus: 'error', lastError: 'failed', updatedAt: '2026-09-15T00:00:00.000Z' };

describe('provider settings migration package', () => {
  it('removes API keys, secret headers and transient speech state', async () => {
    const pack = createProviderSettingsPackage({ providers: [provider], ttsConfigs: [tts], bindings: [{ taskId: 'narrate_main', providerId: 'chat' }], characterBindings: [{ id: 'world:a', saveId: 'world', characterId: 'a', providerId: 'chat', ttsProviderId: 'voice' }], saveId: 'world', defaultProviderId: 'chat', defaultTtsProviderId: 'voice' }, { providerIds: ['chat'], ttsIds: ['voice'], includeBindings: true });
    const imported = await importProviderSettingsPackage(exportProviderSettingsPackage(pack));
    expect(imported.providers[0]).not.toHaveProperty('apiKey');
    expect(imported.providers[0].headers).toEqual({ 'X-Trace': 'yes' });
    expect(imported.ttsConfigs[0]).toMatchObject({ requestCount: 0, failureCount: 0, lastStatus: 'idle', headers: { 'X-Region': 'local' } });
    expect(imported.ttsConfigs[0]).not.toHaveProperty('lastError');
    expect(imported.characterBindings).toEqual([{ characterId: 'a', providerId: 'chat', ttsProviderId: 'voice' }]);
  });

  it('supports selecting individual configs and drops dangling routes', () => {
    const pack = createProviderSettingsPackage({ providers: [provider], ttsConfigs: [tts], bindings: [{ taskId: 'narrate_main', providerId: 'chat' }], characterBindings: [], saveId: 'world', defaultProviderId: 'chat', defaultTtsProviderId: 'voice' }, { providerIds: ['chat'], ttsIds: ['voice'], includeBindings: true });
    const selected = selectProviderSettingsPackage(pack, { providerIds: [], ttsIds: ['voice'], includeBindings: true });
    expect(selected.providers).toEqual([]);
    expect(selected.bindings).toEqual([]);
    expect(selected.defaultProviderId).toBeUndefined();
    expect(selected.defaultTtsProviderId).toBe('voice');
  });

  it('preserves local secrets when an imported config replaces the same id', () => {
    const pack = createProviderSettingsPackage({ providers: [{ ...provider, endpoint: 'https://new.example/v1' }], ttsConfigs: [], bindings: [], characterBindings: [], saveId: 'world' }, { providerIds: ['chat'], ttsIds: [], includeBindings: false });
    const merged = mergeProviderSettingsPackage({ providers: [provider], ttsConfigs: [], bindings: [], characterBindings: [], saveId: 'world' }, pack);
    expect(merged.providers[0]).toMatchObject({ endpoint: 'https://new.example/v1', apiKey: 'secret', headers: { 'X-Trace': 'yes', Authorization: 'Bearer secret' } });
  });

  it('can explicitly include secrets for a private migration', async () => {
    const pack = createProviderSettingsPackage({ providers: [provider], ttsConfigs: [], bindings: [], characterBindings: [], saveId: 'world' }, { providerIds: ['chat'], ttsIds: [], includeBindings: false, includeSecrets: true });
    const imported = await importProviderSettingsPackage(exportProviderSettingsPackage(pack));
    expect(imported.providers[0].apiKey).toBe('secret');
    expect(imported.providers[0].headers?.Authorization).toBe('Bearer secret');
  });

  it('migrates non-sensitive image options without transient request state', async () => {
    const updatedAt = '2026-09-18T00:00:00.000Z';
    const pack = createProviderSettingsPackage({ providers: [provider], ttsConfigs: [], bindings: [], characterBindings: [], imageConfig: { id: 'image', providerId: 'chat', size: '1024x1024', stylePrompt: '柔和水彩', responseFormat: 'b64_json', referenceMode: 'none', requestCount: 8, failureCount: 2, lastStatus: 'error', lastError: 'private error', updatedAt }, saveId: 'world' }, { providerIds: ['chat'], ttsIds: [], includeBindings: false });
    const imported = await importProviderSettingsPackage(exportProviderSettingsPackage(pack));
    expect(imported.imageConfig).toMatchObject({ providerId: 'chat', stylePrompt: '柔和水彩', requestCount: 0, failureCount: 0, lastStatus: 'idle' });
    expect(imported.imageConfig).not.toHaveProperty('lastError');
  });

  it('accepts legacy version 1 packages without image options', async () => {
    const legacy = { type: 'tokimeki-provider-settings', schemaVersion: 1, exportedAt: new Date().toISOString(), providers: [], ttsConfigs: [], bindings: [], characterBindings: [] };
    const imported = await importProviderSettingsPackage(JSON.stringify(legacy));
    expect(imported).toMatchObject({ schemaVersion: 2, providers: [] });
    expect(imported.imageConfig).toBeUndefined();
  });
});
