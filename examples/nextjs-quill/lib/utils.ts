/* eslint-disable jsdoc/require-jsdoc */
import { OperationInfo } from '@yorkie-js/sdk';
import { clsx, type ClassValue } from 'clsx';
import { DeltaOperation } from 'quill';
import { twMerge } from 'tailwind-merge';
import { TextValueType } from '../types';

export const cn = (...inputs: Array<ClassValue>) => {
  return twMerge(clsx(inputs));
};

// Converts a TextValueType to a DeltaOperation
export function toDeltaOperation<T extends TextValueType>(
  textValue: T,
): DeltaOperation {
  const { embed, ...restAttributes } = textValue.attributes ?? {};
  if (embed) {
    return { insert: embed, attributes: restAttributes };
  }

  return {
    insert: textValue.content || '',
    attributes: textValue.attributes,
  };
}

export const getDeltaOperations = (ops: Array<OperationInfo>) => {
  const deltaOperations = [];
  let prevTo = 0;

  for (const op of ops) {
    if (op.type === 'edit') {
      const from = op.from;
      const to = op.to;
      const retainFrom = from - prevTo;
      const retainTo = to - from;

      const { insert, attributes } = toDeltaOperation(op.value!);
      console.log(`%c remote: ${from}-${to}: ${insert}`, 'color: skyblue');

      if (retainFrom) {
        deltaOperations.push({ retain: retainFrom });
      }
      if (retainTo) {
        deltaOperations.push({ delete: retainTo });
      }
      if (insert) {
        const op: DeltaOperation = { insert };
        if (attributes) {
          op.attributes = attributes;
        }
        deltaOperations.push(op);
      }
      prevTo = to;
    } else if (op.type === 'style') {
      const from = op.from;
      const to = op.to;
      const retainFrom = from - prevTo;
      const retainTo = to - from;
      const { attributes } = toDeltaOperation(op.value!);
      console.log(
        `%c remote: ${from}-${to}: ${JSON.stringify(attributes)}`,
        'color: skyblue',
      );

      if (retainFrom) {
        deltaOperations.push({ retain: retainFrom });
      }
      if (attributes) {
        const op: DeltaOperation = { attributes };
        if (retainTo) {
          op.retain = retainTo;
        }
        deltaOperations.push(op);
      }
      prevTo = to;
    }
  }

  return deltaOperations;
};
