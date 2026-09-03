export type PromptRole = 'system' | 'user' | 'assistant';
export interface PromptFacts { [key: string]: unknown }
export interface PromptBlock { id: string; role: PromptRole; priority: number; order: number; build: (facts: PromptFacts) => string | null; truncate?: (text: string, maxTokens: number) => string; tasks?: string[] }
export interface PromptBlockResult { id: string; role: PromptRole; text: string; estimatedTokens: number; truncated: boolean; dropped: boolean }
export interface AssembledPrompt { messages: Array<{ role: PromptRole; content: string }>; blocks: PromptBlockResult[]; estimatedTokens: number; budget: number }

export class PromptAssembler {
  private readonly blocks = new Map<string, PromptBlock>();
  register(block: PromptBlock): void { this.blocks.set(block.id, block); }
  unregister(id: string): void { this.blocks.delete(id); }
  assemble(facts: PromptFacts, options: { budget: number; task?: string }): AssembledPrompt {
    const candidates = [...this.blocks.values()].filter((block) => !options.task || !block.tasks || block.tasks.includes(options.task)).sort((a, b) => b.priority - a.priority || a.order - b.order);
    let remaining = options.budget; const results: PromptBlockResult[] = [];
    for (const block of candidates) {
      const built = block.build(facts); if (!built) continue;
      const fullTokens = estimateTokens(built);
      if (fullTokens <= remaining) { results.push({ id: block.id, role: block.role, text: built, estimatedTokens: fullTokens, truncated: false, dropped: false }); remaining -= fullTokens; continue; }
      if (remaining <= 0) { results.push({ id: block.id, role: block.role, text: '', estimatedTokens: 0, truncated: false, dropped: true }); continue; }
      const text = block.truncate ? block.truncate(built, remaining) : truncateApprox(built, remaining); const tokens = estimateTokens(text);
      results.push({ id: block.id, role: block.role, text, estimatedTokens: tokens, truncated: true, dropped: tokens === 0 }); remaining -= tokens;
    }
    results.sort((a, b) => (this.blocks.get(a.id)?.order ?? 0) - (this.blocks.get(b.id)?.order ?? 0));
    return { messages: results.filter((result) => !result.dropped).map((result) => ({ role: result.role, content: result.text })), blocks: results, estimatedTokens: results.reduce((sum, result) => sum + result.estimatedTokens, 0), budget: options.budget };
  }
}

export function estimateTokens(text: string): number { const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length; const other = text.length - cjk; return Math.ceil(cjk * 0.7 + other / 4); }
function truncateApprox(text: string, maxTokens: number): string { const maxChars = Math.max(1, Math.floor(maxTokens / 0.7)); return text.slice(0, maxChars); }
