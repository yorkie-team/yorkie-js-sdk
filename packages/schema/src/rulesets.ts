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
  ArrayTypeContext,
  LiteralContext,
  PrimitiveTypeContext,
  PropertySignatureContext,
  TypeAliasDeclarationContext,
  TypeReferenceContext,
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
  | 'bytes'
  | 'null';
export type YorkieType =
  | 'yorkie.Text'
  | 'yorkie.Tree'
  | 'yorkie.Counter'
  | 'yorkie.Object'
  | 'yorkie.Array';
export type RuleType =
  | 'object'
  | 'array'
  | 'union'
  | 'enum'
  | 'null'
  | PrimitiveType
  | YorkieType;

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
  items?: {
    type: string;
    properties?: Array<string>;
  };
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
      kind: 'array';
      itemType: TypeDefinition;
    }
  | {
      kind: 'reference';
      typeName: string;
    }
  | {
      kind: 'union';
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
    | { values: Array<string | number | boolean> }
    | undefined = undefined;
  private arrayDepth: number = 0;

  /**
   * `enterTypeAliasDeclaration` is called when entering a type alias declaration.
   */
  enterTypeAliasDeclaration(ctx: TypeAliasDeclarationContext) {
    this.currentTypeName = ctx.Identifier().text;
    this.currentProperties = [];
    this.unionContext = undefined;
  }

  /**
   * `enterArrayType` is called when entering an array type.
   */
  enterArrayType() {
    console.log('enter array');
    this.arrayDepth++;
  }

  /**
   * `exitArrayType` is called when exiting an array type.
   */
  exitArrayType(ctx: ArrayTypeContext) {
  console.log('Exiting array type:', ctx.text);
  this.arrayDepth--;
  
  const hasArrayBrackets = ctx.children?.some(child => child.text === '[' || child.text === ']');
  const hasArrayKeyword = ctx.children?.some(child => child.text === 'Array');
  
  console.log(`Array context check - brackets: ${hasArrayBrackets}, keyword: ${hasArrayKeyword}`);
  
  if ((hasArrayBrackets || hasArrayKeyword) && this.typeStack.length > 0) {
    console.log('Creating array type for:', ctx.text);
    const elementType = this.typeStack.pop()!;
    this.typeStack.push({
      kind: 'array',
      itemType: elementType,
    });
    console.log('Created array type with element:', elementType);
  }
  }

  /**
   * `exitTypeAliasDeclaration` is called when exiting a type alias declaration.
   */
  exitTypeAliasDeclaration() {
    if (this.currentTypeName && this.typeStack.length > 0) {
      const typeDef = this.typeStack.pop()!;
      this.typeDefinitions.set(this.currentTypeName, typeDef);
    }
    this.currentTypeName = undefined;
  }

  /**
   * `enterPrimitiveType` is called when entering a primitive type.
   */
  enterPrimitiveType(ctx: PrimitiveTypeContext) {
    const primitiveType = ctx.text as PrimitiveType;
    this.typeStack.push({ kind: 'primitive', primitiveType });
  }

  /**
   * `enterYorkieType` is called when entering a Yorkie type.
   */
  enterYorkieType(ctx: YorkieTypeContext) {
    const yorkieType = ctx.text as YorkieType;
    this.typeStack.push({ kind: 'yorkie', yorkieType });
  }

  /**
   * `enterTypeReference` is called when entering a type reference.
   */
  enterTypeReference(ctx: TypeReferenceContext) {
    const typeName = ctx.Identifier().text;
    this.typeStack.push({ kind: 'reference', typeName });
  }

  /**
   * `enterObjectType` is called when entering an object type.
   */
  enterObjectType() {
    this.propertyStack.push(this.currentProperties);
    this.currentProperties = [];
  }

  /**
   * `exitObjectType` is called when exiting an object type.
   */
  exitObjectType() {
    const properties = this.currentProperties;
    this.currentProperties = this.propertyStack.pop() || [];
    this.typeStack.push({ kind: 'object', properties });
  }

  /**
   * `enterPropertySignature` is called when entering a property signature.
   */
  enterPropertySignature(ctx: PropertySignatureContext) {
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
    if (this.currentProperty && this.typeStack.length > 0) {
      this.currentProperty.type = this.typeStack.pop()!;
      this.currentProperties.push(this.currentProperty);
    }
    this.currentProperty = undefined;
  }

  /**
   * `enterUnionType` is called when entering a union type.
   */
  enterUnionType() {
    this.unionContext = { values: [] };
  }

  /**
   * `exitUnionType` is called when exiting a union type.
   */
  exitUnionType() {
    if (this.unionContext && this.unionContext.values.length > 0) {
      this.typeStack.push({ kind: 'union', values: this.unionContext.values });
    }
    this.unionContext = undefined;
  }

  /**
   * `enterLiteral` is called when entering a literal.
   */
  enterLiteral(ctx: LiteralContext) {
    const text = ctx.text;
    let value: string | number | boolean | undefined = undefined;

    if (text.startsWith('"') && text.endsWith('"')) {
      value = text.slice(1, -1);
    } else if (!isNaN(Number(text))) {
      value = Number(text);
    } else if (text === 'true' || text === 'false') {
      value = text === 'true';
    } else {
      return; // Invalid literal
    }

    if (this.unionContext) {
      this.unionContext.values.push(value);
    } else {
      this.typeStack.push({ kind: 'union', values: [value] });
    }
  }

  /**
   * `build` returns the built ruleset.
   */
  build(): Array<Rule> {
    const documentType = this.typeDefinitions.get('Document');
    if (!documentType) {
      console.warn('Document type not found');
      return [];
    }

    const rules: Array<Rule> = [];
    this.expandType(documentType, '$', rules, 'Document');

    return rules;
  }

  private expandType(
    typeDef: TypeDefinition,
    path: string,
    rules: Array<Rule>,
    currentTypeName?: string,
  ): void {
    console.log(`currentTypeName: ${currentTypeName}, `);
    
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

      case 'array': {
        const arrayRule: ArrayRule = {
          path,
          type: 'array',
        };

        // add items attribute
        if (typeDef.itemType.kind === 'reference') {
          const referencedType = this.typeDefinitions.get(
            typeDef.itemType.typeName,
          );
          if (referencedType && referencedType.kind === 'object') {
            arrayRule.items = {
              type: 'object',
              properties: referencedType.properties.map((p) => p.name),
            };
          }
        } else if (typeDef.itemType.kind === 'object') {
          arrayRule.items = {
            type: 'object',
            properties: typeDef.itemType.properties.map((p) => p.name),
          };
        }

        rules.push(arrayRule);

        const elementPath = `${path}[*]`;

        if (typeDef.itemType.kind === 'reference') {
          if (currentTypeName === typeDef.itemType.typeName) {
             console.log(`Preventing array recursion: ${typeDef.itemType.typeName} at ${elementPath}`);
            return;
          }
          const referencedType = this.typeDefinitions.get(
            typeDef.itemType.typeName,
          );
          if (referencedType && referencedType.kind === 'object') {
            for (const property of referencedType.properties) {
              const propertyPath = `${elementPath}.${property.name}`;
              this.expandType(property.type, propertyPath, rules, typeDef.itemType.typeName); // or currentTypeName?
            }
          }
        } else if (typeDef.itemType.kind === 'object') {
          for (const property of typeDef.itemType.properties) {
            const propertyPath = `${elementPath}.${property.name}`;
            this.expandType(property.type, propertyPath, rules, currentTypeName); 
          }
        } else {
          this.expandType(typeDef.itemType, elementPath, rules, currentTypeName);
        }
        break;
      }

      case 'union':
        rules.push({
          path,
          type: 'enum',
          values: typeDef.values,
        });
        break;

      case 'object': {
        // console.log(`currentTypeName: ${currentTypeName}`);
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
          this.expandType(property.type, propertyPath, rules, currentTypeName); 
        }
        break;
      }

      case 'reference': {
        console.log(`currentTypeName: ${currentTypeName}, typeDef.typeName: ${typeDef.typeName}`);
        
        if (currentTypeName === typeDef.typeName) {
          console.log(`Preventing recursion: ${typeDef.typeName} at ${path}`);
          return;
        }
        
        const referencedType = this.typeDefinitions.get(typeDef.typeName);
        if (referencedType) {
          this.expandType(referencedType, path, rules, typeDef.typeName);
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
