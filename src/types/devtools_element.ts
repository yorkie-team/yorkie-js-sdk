import type { PrimitiveValue } from '@yorkie-js-sdk/src/document/crdt/primitive';
import { CounterValue } from '@yorkie-js-sdk/src/document/crdt/counter';

// NOTE(chacha912): Json type is used to represent CRDTText and CRDTTree value.
// In the dev tool, display value as the result of toJSON for CRDTText and CRDTTree.
export type Json =
  | string
  | number
  | boolean
  // eslint-disable-next-line @typescript-eslint/ban-types
  | null
  | { [key: string]: Json }
  | Array<Json>;

export type ContainerValue = {
  [key: string]: JSONElement;
};

type ElementValue =
  | PrimitiveValue
  | CounterValue
  | ContainerValue // Array | Object
  | Json; // Text | Tree

export type ElementType =
  | 'YORKIE_PRIMITIVE'
  | 'YORKIE_COUNTER'
  | 'YORKIE_OBJECT'
  | 'YORKIE_ARRAY'
  | 'YORKIE_TEXT'
  | 'YORKIE_TREE';

export type JSONElement = {
  id: string;
  key?: string;
  value: ElementValue;
  type: ElementType;
};
