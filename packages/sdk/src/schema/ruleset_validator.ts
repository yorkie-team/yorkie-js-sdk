/*
 * Copyright 2025 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { PrimitiveRule, Rule } from '@yorkie-js/schema/src/rulesets';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import { CRDTArray } from '@yorkie-js/sdk/src/document/crdt/array';
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';
import { CRDTTree } from '@yorkie-js/sdk/src/document/crdt/tree';
import { CRDTCounter } from '@yorkie-js/sdk/src/document/crdt/counter';
import {
  Primitive,
  PrimitiveType,
} from '@yorkie-js/sdk/src/document/crdt/primitive';

export type ValidationResult = {
  valid: boolean;
  errors?: Array<ValidationError>;
};

export type ValidationError = {
  path: string;
  message: string;
};

/**
 * `validateYorkieRuleset` validates the given data against the ruleset.
 */
export function validateYorkieRuleset(
  data: any,
  ruleset: Array<Rule>,
): ValidationResult {
  const errors: Array<ValidationError> = [];
  for (const rule of ruleset) {
    const value = getValueByPath(data, rule.path);
    const result = validateValue(value, rule);
    if (!result.valid) {
      for (const error of result.errors || []) {
        errors.push(error);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * `getValueByPath` gets a value from the given object using the given path.
 */
function getValueByPath(obj: any, path: string): any {
  if (!path.startsWith('$')) {
    throw new Error(`Path must start with $, got ${path}`);
  }

  const keys = path.split('.');
  let current = obj;

  for (let i = 1; i < keys.length; i++) {
    const key = keys[i];
    if (!(current instanceof CRDTObject)) {
      return undefined;
    }
    current = current.get(key);
  }

  return current;
}

/**
 * `validateValue` validates a value against a rule.
 */
function validateValue(value: any, rule: Rule): ValidationResult {
  switch (rule.type) {
    case 'string':
    case 'boolean':
    case 'integer':
    case 'double':
    case 'long':
    case 'date':
    case 'bytes':
    case 'null':
      return validatePrimitiveValue(value, rule as PrimitiveRule);
    case 'object':
      if (!(value instanceof CRDTObject)) {
        return {
          valid: false,
          errors: [
            {
              path: rule.path,
              message: `Expected object at path ${rule.path}`,
            },
          ],
        };
      }
      break;
    case 'array':
      if (!(value instanceof CRDTArray)) {
        return {
          valid: false,
          errors: [
            {
              path: rule.path,
              message: `Expected array at path ${rule.path}`,
            },
          ],
        };
      }
      break;
    case 'yorkie.Text':
      if (!(value instanceof CRDTText)) {
        return {
          valid: false,
          errors: [
            {
              path: rule.path,
              message: `Expected yorkie.Text at path ${rule.path}`,
            },
          ],
        };
      }
      break;
    case 'yorkie.Tree':
      if (!(value instanceof CRDTTree)) {
        return {
          valid: false,
          errors: [
            {
              path: rule.path,
              message: `Expected yorkie.Tree at path ${rule.path}`,
            },
          ],
        };
      }
      break;
    case 'yorkie.Counter':
      if (!(value instanceof CRDTCounter)) {
        return {
          valid: false,
          errors: [
            {
              path: rule.path,
              message: `Expected yorkie.Counter at path ${rule.path}`,
            },
          ],
        };
      }
      break;
    default:
      throw new Error(`Unknown rule type: ${(rule as any).type}`);
  }

  return {
    valid: true,
  };
}

/**
 * `getPrimitiveType` converts a string type to PrimitiveType.
 */
function getPrimitiveType(type: string): PrimitiveType {
  switch (type) {
    case 'null':
      return PrimitiveType.Null;
    case 'boolean':
      return PrimitiveType.Boolean;
    case 'integer':
      return PrimitiveType.Integer;
    case 'long':
      return PrimitiveType.Long;
    case 'double':
      return PrimitiveType.Double;
    case 'string':
      return PrimitiveType.String;
    case 'bytes':
      return PrimitiveType.Bytes;
    case 'date':
      return PrimitiveType.Date;
    default:
      throw new Error(`Unknown primitive type: ${type}`);
  }
}

/**
 * `validatePrimitiveValue` validates a primitive value against a rule.
 */
function validatePrimitiveValue(
  value: any,
  rule: PrimitiveRule,
): ValidationResult {
  if (
    value instanceof Primitive &&
    value.getType() === getPrimitiveType(rule.type)
  ) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: [
      {
        path: rule.path,
        message: `Expected ${rule.type} at path ${rule.path}`,
      },
    ],
  };
}
