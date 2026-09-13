import type { CharacterProviderBinding, ProviderBinding, ProviderConfig, TaskId, TtsConfig } from './types';

export function resolveProviderForTask(
  providers: ProviderConfig[],
  bindings: ProviderBinding[],
  taskId: TaskId,
  defaultProviderId: string,
): ProviderConfig | undefined {
  return resolveProviderForTaskGroup(providers, bindings, [taskId], defaultProviderId);
}

/** Resolves one provider for a merged request, honoring task priority order. */
export function resolveProviderForTaskGroup(
  providers: ProviderConfig[],
  bindings: ProviderBinding[],
  taskIds: readonly TaskId[],
  defaultProviderId: string,
): ProviderConfig | undefined {
  for (const taskId of taskIds) {
    const boundProviderId = bindings.find((binding) => binding.taskId === taskId)?.providerId;
    const boundProvider = providers.find((provider) => provider.id === boundProviderId);
    if (boundProvider) return boundProvider;
  }
  return providers.find((provider) => provider.id === defaultProviderId);
}

const CHARACTER_SCOPED_TASKS: readonly TaskId[] = ['narrate_main'];

export function resolveProviderForCharacter(
  providers: ProviderConfig[],
  bindings: ProviderBinding[],
  characterBindings: CharacterProviderBinding[],
  saveId: string,
  characterId: string,
  taskId: TaskId,
  defaultProviderId: string,
): ProviderConfig | undefined {
  if (CHARACTER_SCOPED_TASKS.includes(taskId)) {
    const binding = characterBindings.find((item) => item.saveId === saveId && item.characterId === characterId);
    const bound = providers.find((provider) => provider.id === binding?.providerId);
    if (bound) return bound;
  }
  return resolveProviderForTask(providers, bindings, taskId, defaultProviderId);
}

export function resolveTtsProviderForCharacter(
  configs: TtsConfig[],
  characterBindings: CharacterProviderBinding[],
  saveId: string,
  characterId: string,
  defaultConfigId: string,
): TtsConfig | undefined {
  const binding = characterBindings.find((item) => item.saveId === saveId && item.characterId === characterId);
  return configs.find((config) => config.id === binding?.ttsProviderId) ?? configs.find((config) => config.id === defaultConfigId);
}
