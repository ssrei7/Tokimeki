import { z } from 'zod';
import type { WorkshopPackage, WorkshopValidationReport } from './workshop';

export const WORKSHOP_PROJECT_INSPECTION_VERSION = 1;
export const WORKSHOP_INSPECTION_DIAGNOSTIC_LIMIT = 100;
export const WORKSHOP_INSPECTION_PERMISSION_LIMIT = 200;

const CountRecordSchema = z.record(z.string(), z.number().int().nonnegative());

export const WorkshopProjectInspectionSchema = z.object({
  inspectionVersion: z.literal(WORKSHOP_PROJECT_INSPECTION_VERSION),
  status: z.object({
    syntaxValid: z.boolean(),
    schemaValid: z.boolean(),
    validationPassed: z.boolean(),
    previewAvailable: z.boolean(),
    canExport: z.boolean(),
  }).strict(),
  diagnostics: z.array(z.object({
    severity: z.enum(['error', 'warning', 'info']),
    code: z.string(),
    message: z.string(),
    path: z.string().optional(),
  }).strict()).max(WORKSHOP_INSPECTION_DIAGNOSTIC_LIMIT),
  diagnosticCounts: z.object({ total: z.number().int().nonnegative(), error: z.number().int().nonnegative(), warning: z.number().int().nonnegative(), info: z.number().int().nonnegative() }).strict(),
  diagnosticsTruncated: z.boolean(),
  requiredPermissions: z.array(z.string()).max(WORKSHOP_INSPECTION_PERMISSION_LIMIT),
  requiredPermissionCount: z.number().int().nonnegative(),
  requiredPermissionsTruncated: z.boolean(),
  preview: z.object({
    package: z.object({ id: z.string(), name: z.string(), version: z.string() }).strict(),
    entryPageId: z.string(),
    pages: z.array(z.object({
      id: z.string(),
      title: z.string(),
      componentCounts: CountRecordSchema,
      actionCounts: CountRecordSchema,
    }).strict()).max(50),
    totals: z.object({ pages: z.number().int().nonnegative(), components: z.number().int().nonnegative(), actions: z.number().int().nonnegative(), rules: z.number().int().nonnegative(), events: z.number().int().nonnegative(), promptBlocks: z.number().int().nonnegative(), assets: z.number().int().nonnegative() }).strict(),
    actionCounts: CountRecordSchema,
    ruleHookCounts: CountRecordSchema,
  }).strict().optional(),
}).strict();

export type WorkshopProjectInspection = z.infer<typeof WorkshopProjectInspectionSchema>;

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function queryWorkshopProjectInspection(input: {
  package?: WorkshopPackage;
  report: WorkshopValidationReport;
  syntaxValid: boolean;
  schemaValid: boolean;
  canExport: boolean;
}): WorkshopProjectInspection {
  const relevantIssues = input.report.issues.filter((issue) => !['package-id-conflict', 'package-update', 'package-version-not-newer'].includes(issue.code));
  const diagnostics = relevantIssues
    .slice(0, WORKSHOP_INSPECTION_DIAGNOSTIC_LIMIT)
    .map((issue) => ({ severity: issue.severity, code: issue.code, message: issue.message, ...(issue.path ? { path: issue.path } : {}) }));
  const requiredPermissions = input.report.requiredPermissions.slice(0, WORKSHOP_INSPECTION_PERMISSION_LIMIT);
  const diagnosticCounts = {
    total: relevantIssues.length,
    error: relevantIssues.filter((issue) => issue.severity === 'error').length,
    warning: relevantIssues.filter((issue) => issue.severity === 'warning').length,
    info: relevantIssues.filter((issue) => issue.severity === 'info').length,
  };
  const limits = {
    diagnosticsTruncated: relevantIssues.length > diagnostics.length,
    requiredPermissionCount: input.report.requiredPermissions.length,
    requiredPermissionsTruncated: input.report.requiredPermissions.length > requiredPermissions.length,
  };
  const status = {
    syntaxValid: input.syntaxValid,
    schemaValid: input.schemaValid,
    validationPassed: input.schemaValid && !relevantIssues.some((issue) => issue.severity === 'error'),
    previewAvailable: Boolean(input.package),
    canExport: input.canExport,
  };
  if (!input.package) return WorkshopProjectInspectionSchema.parse({ inspectionVersion: WORKSHOP_PROJECT_INSPECTION_VERSION, status, diagnostics, diagnosticCounts, requiredPermissions, ...limits });

  const actionCounts: Record<string, number> = {};
  let componentTotal = 0;
  const pages = input.package.app.pages.map((page) => {
    const componentCounts: Record<string, number> = {};
    const pageActionCounts: Record<string, number> = {};
    for (const component of page.components) {
      componentTotal += 1;
      increment(componentCounts, component.kind);
      if (component.kind === 'button' || component.kind === 'confirm') {
        increment(pageActionCounts, component.action.type);
        increment(actionCounts, component.action.type);
      }
    }
    return { id: page.id, title: page.title, componentCounts, actionCounts: pageActionCounts };
  });
  const ruleHookCounts: Record<string, number> = {};
  for (const rule of input.package.rules.rules) {
    increment(ruleHookCounts, rule.hook);
    for (const action of rule.actions) increment(actionCounts, action.type);
  }
  const actionTotal = Object.values(actionCounts).reduce((sum, count) => sum + count, 0);
  const preview = {
    package: { id: input.package.manifest.id, name: input.package.manifest.name, version: input.package.manifest.version },
    entryPageId: input.package.app.entryPageId,
    pages,
    totals: {
      pages: pages.length,
      components: componentTotal,
      actions: actionTotal,
      rules: input.package.rules.rules.length,
      events: input.package.events?.events.length ?? 0,
      promptBlocks: input.package.prompts?.blocks.length ?? 0,
      assets: input.package.assetMeta?.assets.length ?? 0,
    },
    actionCounts,
    ruleHookCounts,
  };
  return WorkshopProjectInspectionSchema.parse({ inspectionVersion: WORKSHOP_PROJECT_INSPECTION_VERSION, status, diagnostics, diagnosticCounts, requiredPermissions, ...limits, preview });
}
