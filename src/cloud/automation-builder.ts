import type { AutomationGraph } from './contracts';

export const AUTOMATION_TRIGGERS = [
  'form.submitted',
  'site.published',
  'site.unpublished',
  'collection.record_created',
  'collection.record_updated',
  'revision.created',
] as const;
export const AUTOMATION_ACTIONS = [
  'store-submission',
  'create-record',
  'update-record',
  'add-notification',
  'call-webhook',
  'change-banner',
  'log-event',
] as const;

export function validateAutomationGraph(graph: AutomationGraph): string | null {
  if (!Array.isArray(graph.conditions) || !Array.isArray(graph.actions))
    return 'Automation conditions and actions are required.';
  if (graph.conditions.length > 10 || graph.actions.length > 10)
    return 'Automations are limited to 10 conditions and 10 actions.';
  if (graph.conditions.some((item) => !item.field.trim() || !item.operator.trim()))
    return 'Each condition needs a field and operator.';
  if (graph.actions.some((item) => !item.type.trim())) return 'Each action needs a type.';
  return null;
}
