import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events/bus';

describe('event bus', () => {
  it('runs allowed hooks by descending priority and supports unsubscribe', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    const removeLow = bus.subscribe('beforePromptAssemble', () => calls.push('low'), 1);
    bus.subscribe('beforePromptAssemble', () => calls.push('high'), 10);
    bus.emit('beforePromptAssemble', { facts: {}, task: 'narrate_main' });
    expect(calls).toEqual(['high', 'low']);
    removeLow();
    bus.emit('beforePromptAssemble', { facts: {}, task: 'narrate_main' });
    expect(calls).toEqual(['high', 'low', 'high']);
  });

  it('rejects hooks outside the AGENTS whitelist at runtime', () => {
    const bus = new EventBus();
    expect(() => bus.subscribe('onItemGain' as never, (() => undefined) as never)).toThrow('Unsupported hook');
    expect(() => bus.emit('onStatChange' as never, {} as never)).toThrow('Unsupported hook');
  });
});
