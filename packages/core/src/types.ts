export type UiGeneration = 'classic' | 'modern' | 'unknown';
export type MetadataState = 'available' | 'unavailable' | 'not-applicable' | 'unsupported';

export interface CapturedValue<T = string> {
  state: MetadataState;
  value?: T;
  source?: string;
}

export interface PageContext {
  url: string;
  documentId: string;
  ui: UiGeneration;
  frame: 'top' | 'same-origin-frame';
  screenId: CapturedValue;
  screenName: CapturedValue;
  tenant: CapturedValue;
  company: CapturedValue;
  branch: CapturedValue;
}

export interface FieldContext {
  page: PageContext;
  label: CapturedValue;
  controlId: CapturedValue;
  controlType: CapturedValue;
  container: CapturedValue;
  field: CapturedValue;
  view: CapturedValue;
  dac: CapturedValue;
  graph: CapturedValue;
  dataType: CapturedValue;
  binding: CapturedValue;
  properties: CapturedValue;
  selector: CapturedValue;
  elementPath: CapturedValue;
  currentValue: CapturedValue;
}

export type FrameworkMetadataKey =
  | 'screenId'
  | 'screenName'
  | 'label'
  | 'controlId'
  | 'controlType'
  | 'container'
  | 'field'
  | 'view'
  | 'dac'
  | 'graph'
  | 'dataType'
  | 'binding'
  | 'properties'
  | 'selector'
  | 'currentValue';

export interface FrameworkMetadataValue {
  value?: string;
  source: string;
  state?: MetadataState;
}

export type FrameworkFieldMetadata = Partial<Record<FrameworkMetadataKey, FrameworkMetadataValue>>;

export type EnvironmentKind = 'PROD' | 'TEST' | 'DEV' | 'SANDBOX';

export interface EnvironmentProfile {
  id: string;
  name: string;
  baseUrl: string;
  tenant?: string;
  kind: EnvironmentKind;
  color: string;
  /** Position in the pinned group at the top of the list, 0 first; absent when not pinned. */
  pinned?: number;
}

