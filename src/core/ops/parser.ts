export type OpsParseStage = 'strict' | 'repaired' | 'extracted' | 'failed';

export interface ParsedReply {
  text: string;
  ops: unknown[];
  opsFailed: boolean;
  stage: OpsParseStage;
  warnings: string[];
  raw: string;
}

export type ExtractOps = (rawReply: string) => Promise<string>;

const OPEN_MARKER = '<ops>';
const CLOSE_MARKER = '</ops>';

export async function parseReply(raw: string, extractOps?: ExtractOps): Promise<ParsedReply> {
  const section = splitReply(raw);
  const warnings: string[] = [];

  if (section.payload !== undefined) {
    const strict = parseArray(section.payload);
    if (strict.ok) return success(section.text, strict.ops, 'strict', raw, warnings);
    warnings.push(`Strict ops parse failed: ${strict.reason}`);

    const repaired = parseArray(repairJsonArray(section.payload));
    if (repaired.ok) return success(section.text, repaired.ops, 'repaired', raw, warnings);
    warnings.push(`Repaired ops parse failed: ${repaired.reason}`);
  } else {
    warnings.push('Ops block was not found.');
  }

  if (extractOps) {
    try {
      const extractedRaw = await extractOps(raw);
      const extractedSection = splitReply(extractedRaw);
      const payload = extractedSection.payload ?? extractedRaw;
      const strict = parseArray(stripFences(payload));
      if (strict.ok) return success(section.text, strict.ops, 'extracted', raw, warnings);
      const repaired = parseArray(repairJsonArray(payload));
      if (repaired.ok) return success(section.text, repaired.ops, 'extracted', raw, warnings);
      warnings.push(`extract_ops returned invalid ops: ${repaired.reason}`);
    } catch (error) {
      warnings.push(`extract_ops failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { text: section.text, ops: [], opsFailed: true, stage: 'failed', warnings, raw };
}

export class OpsStreamSplitter {
  private pending = '';
  private raw = '';
  private foundOps = false;

  push(chunk: string): string {
    this.raw += chunk;
    if (this.foundOps) return '';
    this.pending += chunk;
    const markerIndex = this.pending.indexOf(OPEN_MARKER);
    if (markerIndex >= 0) {
      const visible = this.pending.slice(0, markerIndex);
      this.pending = '';
      this.foundOps = true;
      return visible;
    }
    const safeLength = Math.max(0, this.pending.length - (OPEN_MARKER.length - 1));
    const visible = this.pending.slice(0, safeLength);
    this.pending = this.pending.slice(safeLength);
    return visible;
  }

  finish(): { text: string; raw: string; foundOps: boolean } {
    const text = this.foundOps ? '' : this.pending;
    this.pending = '';
    return { text, raw: this.raw, foundOps: this.foundOps };
  }
}

function splitReply(raw: string): { text: string; payload?: string } {
  const openIndex = raw.indexOf(OPEN_MARKER);
  if (openIndex < 0) return { text: raw };
  const payloadStart = openIndex + OPEN_MARKER.length;
  const closeIndex = raw.indexOf(CLOSE_MARKER, payloadStart);
  const payload = raw.slice(payloadStart, closeIndex < 0 ? raw.length : closeIndex);
  return { text: stripTrailingFence(raw.slice(0, openIndex)).trimEnd(), payload: stripFences(payload) };
}

function parseArray(value: string): { ok: true; ops: unknown[] } | { ok: false; reason: string } {
  try {
    const parsed: unknown = JSON.parse(value.trim());
    return Array.isArray(parsed) ? { ok: true, ops: parsed } : { ok: false, reason: 'Parsed value is not an array.' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function repairJsonArray(value: string): string {
  const unfenced = stripFences(value);
  const start = unfenced.indexOf('[');
  const end = unfenced.lastIndexOf(']');
  if (start < 0 || end < start) return unfenced;
  return escapeNewlinesInStrings(
    removeTrailingCommas(normalizeSingleQuotedStrings(unfenced.slice(start, end + 1))),
  );
}

function normalizeSingleQuotedStrings(value: string): string {
  let result = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (const character of value) {
    if (!quote) {
      if (character === '"' || character === "'") { quote = character; result += '"'; }
      else result += character;
      continue;
    }
    if (escaped) {
      if (quote === "'" && character === "'") result += "'";
      else result += `\\${character}`;
      escaped = false;
      continue;
    }
    if (character === '\\') { escaped = true; continue; }
    if (character === quote) { quote = undefined; result += '"'; continue; }
    if (quote === "'" && character === '"') result += '\\"';
    else result += character;
  }
  if (escaped) result += '\\';
  return result;
}

function removeTrailingCommas(value: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) { result += character; escaped = false; continue; }
    if (character === '\\' && inString) { result += character; escaped = true; continue; }
    if (character === '"') { result += character; inString = !inString; continue; }
    if (!inString && character === ',') {
      let next = index + 1;
      while (/\s/.test(value[next] ?? '')) next += 1;
      if (value[next] === '}' || value[next] === ']') continue;
    }
    result += character;
  }
  return result;
}

function escapeNewlinesInStrings(value: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  for (const character of value) {
    if (escaped) { result += character; escaped = false; continue; }
    if (character === '\\' && inString) { result += character; escaped = true; continue; }
    if (character === '"') { result += character; inString = !inString; continue; }
    if (inString && character === '\n') { result += '\\n'; continue; }
    if (inString && character === '\r') continue;
    result += character;
  }
  return result;
}

function stripFences(value: string): string {
  return value.trim().replace(/^```(?:json|xml)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function stripTrailingFence(value: string): string {
  return value.replace(/(?:\r?\n)?```(?:json|xml)?\s*$/i, '');
}

function success(text: string, ops: unknown[], stage: Exclude<OpsParseStage, 'failed'>, raw: string, warnings: string[]): ParsedReply {
  return { text, ops, opsFailed: false, stage, warnings, raw };
}
