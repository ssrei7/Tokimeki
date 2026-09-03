export function readJsonPath(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  const parts = path.replace(/^\$\.?/, '').split('.').filter(Boolean);
  let current: unknown = value;
  for (const part of parts) {
    const match = /^(.*?)(?:\[(\d+)\])?$/.exec(part);
    if (!match || typeof current !== 'object' || current === null || !(match[1] in current)) return undefined;
    current = (current as Record<string, unknown>)[match[1]];
    if (match[2]) current = Array.isArray(current) ? current[Number(match[2])] : undefined;
  }
  return current;
}

export function interpolateTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => JSON.stringify(values[key] ?? ''));
}
