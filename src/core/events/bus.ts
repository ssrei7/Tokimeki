export const HOOKS = [
  'onDayStart', 'onEnterNode', 'onEncounter', 'onTimeAdvance', 'onDialogueEnd', 'onOpsApply', 'onDaySettle', 'beforePromptAssemble',
] as const;
export type Hook = typeof HOOKS[number];

export interface HookPayloadMap {
  onDayStart: { day: number };
  onEnterNode: { fromNodeId?: string; toNodeId: string };
  onEncounter: { characterIds: string[]; nodeId: string };
  onTimeAdvance: { day: number; fromSlotId: string; toSlotId: string };
  onDialogueEnd: { characterIds: string[]; nodeId: string };
  onOpsApply: { changes: unknown[] };
  onDaySettle: { day: number };
  beforePromptAssemble: { facts: Record<string, unknown>; task?: string };
}

export type HookHandler<H extends Hook> = (payload: Readonly<HookPayloadMap[H]>) => void;

interface Subscription {
  priority: number;
  order: number;
  handler: HookHandler<Hook>;
}

export class EventBus {
  private readonly subscriptions = new Map<Hook, Subscription[]>();
  private nextOrder = 0;

  subscribe<H extends Hook>(hook: H, handler: HookHandler<H>, priority = 0): () => void {
    if (!HOOKS.includes(hook)) throw new Error(`Unsupported hook: ${hook}`);
    const subscription: Subscription = { priority, order: this.nextOrder++, handler: handler as HookHandler<Hook> };
    const list = this.subscriptions.get(hook) ?? [];
    list.push(subscription); list.sort((a, b) => b.priority - a.priority || a.order - b.order); this.subscriptions.set(hook, list);
    return () => { this.subscriptions.set(hook, (this.subscriptions.get(hook) ?? []).filter((item) => item !== subscription)); };
  }

  emit<H extends Hook>(hook: H, payload: HookPayloadMap[H]): void {
    if (!HOOKS.includes(hook)) throw new Error(`Unsupported hook: ${hook}`);
    for (const subscription of this.subscriptions.get(hook) ?? []) subscription.handler(payload as never);
  }
}
