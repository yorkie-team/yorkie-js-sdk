/* eslint-disable jsdoc/require-jsdoc */
import { OperationInfo } from '@yorkie-js/sdk';
import { clsx, type ClassValue } from 'clsx';
import { Op } from 'quill';
import { twMerge } from 'tailwind-merge';
import { TextValueType } from '../types';

export const cn = (...inputs: Array<ClassValue>) => {
  return twMerge(clsx(inputs));
};

// Convert Yorkie TextValueType to Quill Operation
export const toDeltaOperation = <T extends TextValueType>(textValue: T): Op => {
  const { embed, ...restAttributes } = textValue.attributes ?? {};
  if (embed) {
    return { insert: JSON.parse(embed.toString()), attributes: restAttributes };
  }

  return {
    insert: textValue.content || '',
    attributes: textValue.attributes,
  };
};

// Convert array of Yorkie OperationInfo to array of Quill Delta Operations
export const getDeltaOperations = (ops: OperationInfo[]): Op[] => {
  const operations: Op[] = [];
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
        operations.push({ retain: retainFrom });
      }
      if (retainTo) {
        operations.push({ delete: retainTo });
      }
      if (insert) {
        const deltaOp: Op = { insert };
        if (attributes) {
          deltaOp.attributes = attributes;
        }
        operations.push(deltaOp);
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
        operations.push({ retain: retainFrom });
      }
      if (attributes) {
        const deltaOp: Op = { attributes };
        if (retainTo) {
          deltaOp.retain = retainTo;
        }
        operations.push(deltaOp);
      }
      prevTo = to;
    }
  }

  return operations;
};
