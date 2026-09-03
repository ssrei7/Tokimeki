import { ProviderBindingSchema, ProviderConfigSchema, TaskIdSchema, type ProviderBinding, type ProviderConfig, type TaskId } from './types';
import { resolveProviderForTask } from './router';

export class ProviderManager {
  private readonly providers = new Map<string, ProviderConfig>();
  private readonly bindings = new Map<TaskId, string>();
  listProviders(): ProviderConfig[] { return [...this.providers.values()]; }
  upsertProvider(input: ProviderConfig): ProviderConfig { const provider = ProviderConfigSchema.parse(input); this.providers.set(provider.id, provider); return provider; }
  removeProvider(providerId: string): void { this.providers.delete(providerId); for (const [task, id] of this.bindings) if (id === providerId) this.bindings.delete(task); }
  getProvider(providerId: string): ProviderConfig | undefined { return this.providers.get(providerId); }
  bindTask(binding: ProviderBinding): void { const parsed = ProviderBindingSchema.parse(binding); if (parsed.providerId !== 'default' && !this.providers.has(parsed.providerId)) throw new Error(`Provider not found: ${parsed.providerId}`); this.bindings.set(parsed.taskId, parsed.providerId); }
  unbindTask(taskId: TaskId): void { this.bindings.delete(TaskIdSchema.parse(taskId)); }
  listBindings(): ProviderBinding[] { return [...this.bindings.entries()].map(([taskId, providerId]) => ({ taskId, providerId })); }
  resolve(taskId: TaskId, defaultProviderId = 'default'): ProviderConfig | undefined { return resolveProviderForTask(this.listProviders(), this.listBindings(), taskId, defaultProviderId); }
}
