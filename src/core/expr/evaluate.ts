import { Parser, type Value, type Values } from 'expr-eval';

const FORBIDDEN_MEMBER_NAMES = new Set(['__proto__', 'prototype', 'constructor']);
const FUNCTION_CALL = /[A-Za-z_$][\w$]*\s*\(/;

export type ConditionScope = Record<string, Value>;

export function evaluateCondition(condition: string, scope: ConditionScope): boolean {
  const source = condition.trim();
  if (!source) throw new Error('Condition cannot be empty.');
  if (FUNCTION_CALL.test(source)) throw new Error('Function calls are not allowed in conditions.');
  const sourceMembers = source.split(/[^A-Za-z0-9_$]+/).filter(Boolean);
  const forbiddenSourceMember = sourceMembers.find((member) => FORBIDDEN_MEMBER_NAMES.has(member));
  if (forbiddenSourceMember) throw new Error(`Unsafe member access is not allowed: ${forbiddenSourceMember}.`);
  assertSafeValue(scope, 'scope');

  const parser = new Parser({
    allowMemberAccess: true,
    operators: {
      assignment: false,
      fndef: false,
      random: false,
      in: false,
      factorial: false,
      concatenate: false,
      conditional: false,
      sin: false,
      cos: false,
      tan: false,
      asin: false,
      acos: false,
      atan: false,
      sinh: false,
      cosh: false,
      tanh: false,
      asinh: false,
      acosh: false,
      atanh: false,
      sqrt: false,
      log: false,
      ln: false,
      lg: false,
      log10: false,
      abs: false,
      ceil: false,
      floor: false,
      round: false,
      trunc: false,
      exp: false,
      length: false,
      min: false,
      max: false,
      cbrt: false,
      expm1: false,
      log1p: false,
      sign: false,
      log2: false,
    },
  });
  parser.functions = {};

  const expression = parser.parse(source);
  for (const variable of expression.variables({ withMembers: true })) {
    assertSafePath(variable);
    if (!hasPath(scope, variable)) throw new Error(`Unknown condition variable: ${variable}.`);
  }
  const result: unknown = expression.evaluate(scope as Values);
  if (typeof result !== 'boolean') throw new Error('Condition must evaluate to a boolean.');
  return result;
}

function assertSafePath(path: string): void {
  for (const segment of path.split('.')) {
    if (FORBIDDEN_MEMBER_NAMES.has(segment)) throw new Error(`Unsafe member access is not allowed: ${segment}.`);
  }
}

function assertSafeValue(value: unknown, path: string): void {
  if (typeof value === 'function') throw new Error(`Functions are not allowed in condition scope: ${path}.`);
  if (typeof value !== 'object' || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_MEMBER_NAMES.has(key)) throw new Error(`Unsafe scope member is not allowed: ${key}.`);
    assertSafeValue(child, `${path}.${key}`);
  }
}

function hasPath(scope: ConditionScope, path: string): boolean {
  let current: unknown = scope;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null || !Object.prototype.hasOwnProperty.call(current, segment)) return false;
    current = (current as Record<string, unknown>)[segment];
  }
  return true;
}
