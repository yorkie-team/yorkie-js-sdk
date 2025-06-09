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

import { Rule } from '@yorkie-js/schema/src/rulesets';
import yorkie from '@yorkie-js/sdk/src/yorkie';

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
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * `validateValue` validates a value against a rule.
 * @param value - The value to validate
 * @param rule - The rule to validate against
 */
function validateValue(value: any, rule: Rule): ValidationResult {
  switch (rule.type) {
    case 'string':
      if (typeof value !== 'string') {
        return {
          valid: false,
          errors: [
            {
              path: rule.path,
              message: `Expected string at path ${
                rule.path
              }, got ${typeof value}`,
            },
          ],
        };
      }
      break;
    case 'object':
      if (typeof value !== 'object' || value === null) {
        return {
          valid: false,
          errors: [
            {
              path: rule.path,
              message: `Expected object at path ${
                rule.path
              }, got ${typeof value}`,
            },
          ],
        };
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        return {
          valid: false,
          errors: [
            {
              path: rule.path,
              message: `Expected array at path ${
                rule.path
              }, got ${typeof value}`,
            },
          ],
        };
      }
      break;
    case 'yorkie.Text':
      if (!(value instanceof yorkie.Text)) {
        return {
          valid: false,
          errors: [
            {
              path: rule.path,
              message: `Expected yorkie.Text at path ${
                rule.path
              }, got ${typeof value}`,
            },
          ],
        };
      }
      break;
    case 'yorkie.Tree':
      if (!(value instanceof yorkie.Tree)) {
        return {
          valid: false,
          errors: [
            {
              path: rule.path,
              message: `Expected yorkie.Tree at path ${
                rule.path
              }, got ${typeof value}`,
            },
          ],
        };
      }
      break;
    case 'yorkie.Counter':
      if (!(value instanceof yorkie.Counter)) {
        return {
          valid: false,
          errors: [
            {
              path: rule.path,
              message: `Expected yorkie.Counter at path ${
                rule.path
              }, got ${typeof value}`,
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
