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
  PropertyNameContext,
  TypeAliasDeclarationContext,
  YorkieSchemaParser,
} from '../antlr/YorkieSchemaParser';
import { YorkieSchemaLexer } from '../antlr/YorkieSchemaLexer';
import { YorkieSchemaListener } from '../antlr/YorkieSchemaListener';

/**
 * `Rule` represents a rule for a field in the schema.
 */
export type Rule = StringRule | ObjectRule | ArrayRule | YorkieTypeRule;
export type RuleType =
  | 'string'
  | 'object'
  | 'array'
  | 'yorkie.Text'
  | 'yorkie.Tree'
  | 'yorkie.Counter';

export type RuleBase = {
  path: string;
  type: RuleType;
};

export type StringRule = {
  type: 'string';
} & RuleBase;

export type ObjectRule = {
  type: 'object';
  properties?: { [key: string]: RuleBase };
} & RuleBase;

export type ArrayRule = {
  type: 'array';
} & RuleBase;

export type YorkieTypeRule = {
  type: 'yorkie.Text' | 'yorkie.Tree' | 'yorkie.Counter';
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
    }
  }

  /**
   * `enterPropertyName` is called when entering a property name.
   */
  enterPropertyName(ctx: PropertyNameContext) {
    const propName = ctx.Identifier()!.text;
    this.currentPath.push(propName);
  }

  /**
   * `enterPrimitiveType` is called when entering a primitive type.
   */
  enterPrimitiveType(ctx: PrimitiveTypeContext) {
    const type = ctx.text;
    const path = this.buildPath();
    const rule = {
      path,
      type,
    } as Rule;

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
