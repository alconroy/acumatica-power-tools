import type { CapturedValue, FieldContext, FrameworkFieldMetadata, FrameworkMetadataValue } from './types';

function captured(value: FrameworkMetadataValue | undefined, fallback: CapturedValue): CapturedValue {
  if (value?.state && value.state !== 'available') return { state: value.state, source: value.source };
  const clean = value?.value?.trim().slice(0, 500);
  return clean ? { state: 'available', value: clean, source: value!.source } : fallback;
}

function notApplicable(reason: string): CapturedValue {
  return { state: 'not-applicable', source: `applicability:${reason}` };
}

export function classifyApplicability(field: FieldContext): FieldContext {
  const controlType = field.controlType.value?.toLocaleLowerCase() || '';
  const isAction = /button|toolbar|menu item|action/.test(controlType);
  const isSelector = /selector|combo|drop[ -]?down|lookup/.test(controlType);
  const unbound = field.binding.state === 'available' && field.binding.value?.toLocaleLowerCase() === 'unbound';
  const result = { ...field };

  if (field.selector.state === 'unavailable' && !isSelector) result.selector = notApplicable('control-is-not-a-selector');
  if (field.dac.state === 'unavailable' && unbound) result.dac = notApplicable('field-is-unbound');

  if (isAction) {
    for (const key of ['field', 'view', 'dac', 'dataType', 'binding', 'properties', 'selector'] as const) {
      if (result[key].state === 'unavailable') result[key] = notApplicable('action-control');
    }
  }
  return result;
}

export function mergeFrameworkMetadata(base: FieldContext, metadata: FrameworkFieldMetadata | null | undefined): FieldContext {
  if (!metadata) return classifyApplicability(base);
  return classifyApplicability({
    ...base,
    page: {
      ...base.page,
      screenId: captured(metadata.screenId, base.page.screenId),
      screenName: captured(metadata.screenName, base.page.screenName)
    },
    label: captured(metadata.label, base.label),
    controlId: captured(metadata.controlId, base.controlId),
    controlType: captured(metadata.controlType, base.controlType),
    container: captured(metadata.container, base.container),
    field: captured(metadata.field, base.field),
    view: captured(metadata.view, base.view),
    dac: captured(metadata.dac, base.dac),
    graph: captured(metadata.graph, base.graph),
    dataType: captured(metadata.dataType, base.dataType),
    binding: captured(metadata.binding, base.binding),
    properties: captured(metadata.properties, base.properties),
    selector: captured(metadata.selector, base.selector),
    currentValue: captured(metadata.currentValue, base.currentValue)
  });
}
