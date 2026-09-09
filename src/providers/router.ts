import type { ProviderBinding, ProviderConfig, TaskId } from './types';

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
