import type { ProviderBinding, ProviderConfig, TaskId } from './types';

export function resolveProviderForTask(
  providers: ProviderConfig[],
  bindings: ProviderBinding[],
  taskId: TaskId,
  defaultProviderId: string,
): ProviderConfig | undefined {
  const boundProviderId = bindings.find((binding) => binding.taskId === taskId)?.providerId;
  const boundProvider = providers.find((provider) => provider.id === boundProviderId);
  return boundProvider ?? providers.find((provider) => provider.id === defaultProviderId);
}
