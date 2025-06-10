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

import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { ParseTreeWalker } from 'antlr4ts/tree';
import {
  PrimitiveTypeContext,
  TypeAliasDeclarationContext,
  YorkieSchemaParser,
  PropertySignatureContext,
  ObjectTypeContext,
  YorkieTypeContext,
} from '../antlr/YorkieSchemaParser';
import { YorkieSchemaLexer } from '../antlr/YorkieSchemaLexer';
import { YorkieSchemaListener } from '../antlr/YorkieSchemaListener';

/**
 * `Rule` represents a rule for a field in the schema.
 */
export type Rule = PrimitiveRule | ObjectRule | ArrayRule | YorkieTypeRule;
type RuleWithoutPath =
  | Omit<PrimitiveRule, 'path'>
  | Omit<ObjectRule, 'path'>
  | Omit<ArrayRule, 'path'>
  | Omit<YorkieTypeRule, 'path'>;
export type PrimitiveType =
  | 'null'
  | 'boolean'
  | 'integer'
  | 'double'
  | 'long'
  | 'string'
  | 'date'
  | 'bytes';
export type YorkieType =
  | 'yorkie.Text'
  | 'yorkie.Tree'
  | 'yorkie.Counter'
  | 'yorkie.Object'
  | 'yorkie.Array';
export type RuleType = 'object' | 'array' | PrimitiveType | YorkieType;

export type RuleBase = {
  path: string;
  type: RuleType;
};

export type PrimitiveRule = {
  type: PrimitiveType;
} & RuleBase;

export type ObjectRule = {
  type: 'object';
  properties: Array<string>;
  optional?: Array<string>;
} & RuleBase;

export type ArrayRule = {
  type: 'array';
  items: RuleWithoutPath;
} & RuleBase;

export type YorkieTypeRule = {
  type: YorkieType;
} & RuleBase;

/**
 * `RulesetBuilder` is a visitor that builds a ruleset from the given schema.
 */
export class RulesetBuilder implements YorkieSchemaListener {
  private currentPath: Array<string> = ['$'];
  private ruleMap: Map<string, Rule> = new Map();

  /**
   * `enterTypeAliasDeclaration` is called when entering a type alias declaration.
   */
  enterTypeAliasDeclaration(ctx: TypeAliasDeclarationContext) {
    const typeName = ctx.Identifier().text;
    if (typeName === 'Document') {
      this.currentPath = ['$'];

      this.ruleMap.set('$', {
        path: '$',
        type: 'object',
        properties: [],
      });
    }
  }

  /**
   * `enterPrimitiveType` is called when entering a primitive type.
   */
  enterPrimitiveType(ctx: PrimitiveTypeContext) {
    const type = ctx.text as PrimitiveType;
    const path = this.buildPath();
    const rule: Rule = {
      path,
      type,
    };

    this.ruleMap.set(path, rule);
    this.currentPath.pop();
  }

  /**
   * `enterObjectType` is called when entering an object type.
   */
  enterObjectType(ctx: ObjectTypeContext) {
    const isObjectType = ctx.children?.some((child) => {
      if (child.text === '{' || child.text === '}') {
        return true;
      }
      if (child instanceof PropertySignatureContext) {
        return true;
      }
      return false;
    });

    if (!isObjectType) {
      return;
    }

    const path = this.buildPath();
    const rule: ObjectRule = {
      path,
      type: 'object',
      properties: [],
    };

    this.ruleMap.set(path, rule);
  }

  /**
   * `enterPropertySignature` is called when entering a property signature.
   */
  enterPropertySignature(ctx: PropertySignatureContext) {
    const propName = ctx.propertyName().text;
    const parentPath = this.buildPath();
    const parentRule = this.ruleMap.get(parentPath);

    if (parentRule) {
      if (parentRule.type === 'object') {
        const objectRule = parentRule as ObjectRule;
        objectRule.properties = objectRule.properties ?? [];
        objectRule.properties.push(propName);

        const isOptional = !!ctx.QUESTION();
        if (isOptional) {
          objectRule.optional = objectRule.optional ?? [];
          objectRule.optional.push(propName);
        }
      }
    }

    this.currentPath.push(propName);
  }

  /**
   * `enterYorkieType` is called when entering a Yorkie type.
   */
  enterYorkieType(ctx: YorkieTypeContext) {
    const type = ctx.text as YorkieType;
    const path = this.buildPath();
    const rule: YorkieTypeRule = {
      path,
      type,
    };

    this.ruleMap.set(path, rule);
    this.currentPath.pop();
  }

  private buildPath(): string {
    return this.currentPath.join('.');
  }

  /**
   * `build` returns the built ruleset.
   */
  build(): Array<Rule> {
    return Array.from(this.ruleMap.values());
  }
}

/**
 * `buildRuleset` builds a ruleset from the given schema string.
 */
export function buildRuleset(schema: string): Array<Rule> {
  const stream = CharStreams.fromString(schema);
  const lexer = new YorkieSchemaLexer(stream);
  const tokens = new CommonTokenStream(lexer);
  const parser = new YorkieSchemaParser(tokens);
  const tree = parser.document();
  const builder = new RulesetBuilder();
  ParseTreeWalker.DEFAULT.walk(builder as any, tree);
  return builder.build();
}
