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
import { YorkieSchemaLexer } from '../antlr/YorkieSchemaLexer';
import { YorkieSchemaListener } from '../antlr/YorkieSchemaListener';
import {
  LiteralContext,
  PrimitiveTypeContext,
  PropertySignatureContext,
  TypeAliasDeclarationContext,
  TypeReferenceContext,
  UnionTypeContext,
  YorkieSchemaParser,
  YorkieTypeContext,
} from '../antlr/YorkieSchemaParser';

/**
 * `Rule` represents a rule for a field in the schema.
 */
export type Rule =
  | PrimitiveRule
  | ObjectRule
  | ArrayRule
  | YorkieTypeRule
  | EnumRule;
export type PrimitiveType =
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
export type RuleType = 'object' | 'array' | 'enum' | PrimitiveType | YorkieType;

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
} & RuleBase;

export type YorkieTypeRule = {
  type: YorkieType;
} & RuleBase;

export type EnumRule = {
  type: 'enum';
  values: Array<string | number | boolean>;
} & RuleBase;

// Internal types for building
type TypeDefinition =
  | {
      kind: 'primitive';
      primitiveType: PrimitiveType;
    }
  | {
      kind: 'yorkie';
      yorkieType: YorkieType;
    }
  | {
      kind: 'object';
      properties: Array<PropertyDefinition>;
    }
  | {
      kind: 'reference';
      typeName: string;
    }
  | {
      kind: 'enum';
      values: Array<string | number | boolean>;
    };

type PropertyDefinition = {
  name: string;
  type: TypeDefinition;
  optional: boolean;
};

/**
 * `RulesetBuilder` is a visitor that builds a ruleset from the given schema.
 */
export class RulesetBuilder implements YorkieSchemaListener {
  private typeDefinitions: Map<string, TypeDefinition> = new Map();
  private currentTypeName: string | undefined = undefined;
  private currentProperty: PropertyDefinition | undefined = undefined;
  private typeStack: Array<TypeDefinition> = [];
  private propertyStack: Array<Array<PropertyDefinition>> = [];
  private currentProperties: Array<PropertyDefinition> = [];
  private unionContext:
    | { isEnum: boolean; values: Array<string | number | boolean> }
    | undefined = undefined;

  /**
   * `enterTypeAliasDeclaration` is called when entering a type alias declaration.
   */
  enterTypeAliasDeclaration(ctx: TypeAliasDeclarationContext) {
    console.log('Entering type alias declaration:', ctx.text);
    this.currentTypeName = ctx.Identifier().text;
    this.currentProperties = [];
    this.unionContext = undefined;
  }

  /**
   * `exitTypeAliasDeclaration` is called when exiting a type alias declaration.
   */
  exitTypeAliasDeclaration() {
    if (this.currentTypeName && this.typeStack.length > 0) {
      const typeDef = this.typeStack.pop()!;
      this.typeDefinitions.set(this.currentTypeName, typeDef);
      console.log(`Stored type definition: ${this.currentTypeName}`);
    }
    this.currentTypeName = undefined;
  }

  /**
   * `enterPrimitiveType` is called when entering a primitive type.
   */
  enterPrimitiveType(ctx: PrimitiveTypeContext) {
    console.log('Entering primitive type:', ctx.text);
    const primitiveType = ctx.text as PrimitiveType;
    this.typeStack.push({ kind: 'primitive', primitiveType });
  }

  /**
   * `enterYorkieType` is called when entering a Yorkie type.
   */
  enterYorkieType(ctx: YorkieTypeContext) {
    console.log('Entering Yorkie type:', ctx.text);
    const yorkieType = ctx.text as YorkieType;
    this.typeStack.push({ kind: 'yorkie', yorkieType });
  }

  /**
   * `enterTypeReference` is called when entering a type reference.
   */
  enterTypeReference(ctx: TypeReferenceContext) {
    console.log('Entering type reference:', ctx.text);
    const typeName = ctx.Identifier().text;
    this.typeStack.push({ kind: 'reference', typeName });
  }

  /**
   * `enterObjectType` is called when entering an object type.
   */
  enterObjectType() {
    console.log('Entering object type');
    this.propertyStack.push(this.currentProperties);
    this.currentProperties = [];
  }

  /**
   * `exitObjectType` is called when exiting an object type.
   */
  exitObjectType() {
    console.log('Exiting object type');
    const properties = this.currentProperties;
    this.currentProperties = this.propertyStack.pop() || [];
    this.typeStack.push({ kind: 'object', properties });
  }

  /**
   * `enterPropertySignature` is called when entering a property signature.
   */
  enterPropertySignature(ctx: PropertySignatureContext) {
    console.log('Entering property signature:', ctx.text);
    const propName = ctx.propertyName().text;
    const isOptional = !!ctx.QUESTION();

    this.currentProperty = {
      name: propName,
      type: { kind: 'primitive', primitiveType: 'string' }, // temporary
      optional: isOptional,
    };
  }

  /**
   * `exitPropertySignature` is called when exiting a property signature.
   */
  exitPropertySignature() {
    console.log('Exiting property signature');
    if (this.currentProperty && this.typeStack.length > 0) {
      this.currentProperty.type = this.typeStack.pop()!;
      this.currentProperties.push(this.currentProperty);
    }
    this.currentProperty = undefined;
  }

  /**
   * `enterUnionType` is called when entering a union type.
   */
  enterUnionType(ctx: UnionTypeContext) {
    console.log('Entering union type:', ctx.text);
    // Check if this is an enum (union of literals)
    const text = ctx.text;
    if (text.includes('"') || /\b\d+\b/.test(text)) {
      this.unionContext = { isEnum: true, values: [] };
    }
  }

  /**
   * `exitUnionType` is called when exiting a union type.
   */
  exitUnionType() {
    console.log('Exiting union type');
    if (
      this.unionContext &&
      this.unionContext.isEnum &&
      this.unionContext.values.length > 0
    ) {
      this.typeStack.push({ kind: 'enum', values: this.unionContext.values });
    }
    this.unionContext = undefined;
  }

  /**
   * `enterLiteral` is called when entering a literal.
   */
  enterLiteral(ctx: LiteralContext) {
    console.log('Entering literal:', ctx.text);
    const text = ctx.text;
    let value: string | number | boolean | undefined = undefined;

    if (text.startsWith('"') && text.endsWith('"')) {
      // String literal
      value = text.slice(1, -1);
    } else if (!isNaN(Number(text))) {
      // Number literal
      value = Number(text);
    } else if (text === 'true' || text === 'false') {
      // Boolean literal
      value = text === 'true';
    } else {
      return; // Invalid literal
    }

    if (this.unionContext && this.unionContext.isEnum) {
      this.unionContext.values.push(value);
    } else {
      // Single literal (not part of enum)
      this.typeStack.push({ kind: 'enum', values: [value] });
    }
  }

  /**
   * `build` returns the built ruleset.
   */
  build(): Array<Rule> {
    console.log(
      'Building ruleset from type definitions:',
      Array.from(this.typeDefinitions.keys()),
    );

    const documentType = this.typeDefinitions.get('Document');
    if (!documentType) {
      console.warn('Document type not found');
      return [];
    }

    const rules: Array<Rule> = [];
    this.expandType(documentType, '$', rules);

    return rules;
  }

  private expandType(
    typeDef: TypeDefinition,
    path: string,
    rules: Array<Rule>,
  ): void {
    console.log(`Expanding type at path: ${path}`);

    switch (typeDef.kind) {
      case 'primitive':
        rules.push({
          path,
          type: typeDef.primitiveType,
        });
        break;

      case 'yorkie':
        rules.push({
          path,
          type: typeDef.yorkieType,
        });
        break;

      case 'enum':
        rules.push({
          path,
          type: 'enum',
          values: typeDef.values,
        });
        break;

      case 'object': {
        const objectRule: ObjectRule = {
          path,
          type: 'object',
          properties: typeDef.properties.map((p) => p.name),
        };

        const optionalProps = typeDef.properties
          .filter((p) => p.optional)
          .map((p) => p.name);
        if (optionalProps.length > 0) {
          objectRule.optional = optionalProps;
        }

        rules.push(objectRule);

        // Recursively expand properties
        for (const property of typeDef.properties) {
          const propertyPath = `${path}.${property.name}`;
          this.expandType(property.type, propertyPath, rules);
        }
        break;
      }

      case 'reference': {
        const referencedType = this.typeDefinitions.get(typeDef.typeName);
        if (referencedType) {
          this.expandType(referencedType, path, rules);
        } else {
          console.warn(`Type reference not found: ${typeDef.typeName}`);
        }
        break;
      }
    }
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
  ParseTreeWalker.DEFAULT.walk<YorkieSchemaListener>(builder, tree);
  return builder.build();
}
