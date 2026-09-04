import type { ApplyOpsResult, OpContext, OpDefinition, OpLimits } from './types';

export class OpRegistry {
  private readonly definitions = new Map<string, OpDefinition<unknown>>();

  register<P>(definition: OpDefinition<P>): void {
    if (this.definitions.has(definition.op)) throw new Error(`Op already registered: ${definition.op}`);
    this.definitions.set(definition.op, definition as OpDefinition<unknown>);
  }

  list(): OpDefinition<unknown>[] {
    return [...this.definitions.values()];
  }

  promptDocs(): string {
    return this.list().map((definition) => `- ${definition.promptDoc}`).join('\n');
  }

  applyAll(inputs: readonly unknown[], context: OpContext, limit: number): ApplyOpsResult {
    const safeLimit = Math.max(0, Math.floor(limit));
    const accepted = inputs.slice(0, safeLimit);
    const result: ApplyOpsResult = {
      applied: 0,
      changes: [],
      warnings: [],
      rejected: [],
      truncated: Math.max(0, inputs.length - accepted.length),
    };
    if (result.truncated > 0) result.warnings.push(`Ops limit ${safeLimit} reached; discarded ${result.truncated} operation(s).`);

    accepted.forEach((input, index) => {
      const opName = readOpName(input);
      if (!opName) {
        result.rejected.push({ index, input, reason: 'Missing string op name.' });
        return;
      }
      const definition = this.definitions.get(opName);
      if (!definition) {
        const warning = `Unregistered op discarded: ${opName}`;
        result.warnings.push(warning);
        context.log(warning);
        return;
      }
      const parsed = definition.schema.safeParse(input);
      if (!parsed.success) {
        result.rejected.push({ index, input, reason: parsed.error.issues.map((issue) => issue.message).join('; ') });
        return;
      }
      const clamped = clampPayload(parsed.data, definition.clamp);
      for (const warning of clamped.warnings) {
        result.warnings.push(`${opName}: ${warning}`);
        context.log(`${opName}: ${warning}`);
      }
      const applied = definition.apply(clamped.payload, context);
      if (!applied.ok) {
        result.rejected.push({ index, input, reason: applied.warning ?? `${opName} was rejected.` });
        return;
      }
      result.applied += 1;
      result.changes.push(...applied.changes);
      if (applied.warning) {
        result.warnings.push(`${opName}: ${applied.warning}`);
        context.log(`${opName}: ${applied.warning}`);
      }
    });

    return result;
  }
}

function readOpName(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const value = (input as Record<string, unknown>).op;
  return typeof value === 'string' ? value : undefined;
}

function clampPayload(payload: unknown, limits: OpLimits): { payload: unknown; warnings: string[] } {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload) || !limits.numeric) return { payload, warnings: [] };
  const copy = { ...(payload as Record<string, unknown>) };
  const warnings: string[] = [];
  for (const [field, limit] of Object.entries(limits.numeric)) {
    const value = copy[field];
    if (typeof value !== 'number') continue;
    const clamped = Math.min(limit.max, Math.max(limit.min, value));
    if (clamped !== value) {
      copy[field] = clamped;
      warnings.push(`${field} clamped from ${value} to ${clamped}.`);
    }
  }
  return { payload: copy, warnings };
}
