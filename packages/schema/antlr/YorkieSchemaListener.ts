// Generated from antlr/YorkieSchema.g4 by ANTLR 4.9.0-SNAPSHOT

import { ParseTreeListener } from 'antlr4ts/tree/ParseTreeListener';

import { DocumentContext } from './YorkieSchemaParser';
import { DeclarationContext } from './YorkieSchemaParser';
import { TypeAliasDeclarationContext } from './YorkieSchemaParser';
import { VariableDeclarationContext } from './YorkieSchemaParser';
import { TypeAnnotationContext } from './YorkieSchemaParser';
import { TypeContext } from './YorkieSchemaParser';
import { UnionTypeContext } from './YorkieSchemaParser';
import { IntersectionTypeContext } from './YorkieSchemaParser';
import { ArrayTypeContext } from './YorkieSchemaParser';
import { PrimaryTypeContext } from './YorkieSchemaParser';
import { PrimitiveTypeContext } from './YorkieSchemaParser';
import { ObjectTypeContext } from './YorkieSchemaParser';
import { PropertySignatureContext } from './YorkieSchemaParser';
import { PropertyNameContext } from './YorkieSchemaParser';
import { YorkieTypeContext } from './YorkieSchemaParser';
import { TypeReferenceContext } from './YorkieSchemaParser';
import { ParenthesizedTypeContext } from './YorkieSchemaParser';
import { TypeParametersContext } from './YorkieSchemaParser';
import { TypeParameterContext } from './YorkieSchemaParser';
import { TypeArgumentsContext } from './YorkieSchemaParser';
import { ExpressionContext } from './YorkieSchemaParser';
import { LiteralContext } from './YorkieSchemaParser';

/**
 * This interface defines a complete listener for a parse tree produced by
 * `YorkieSchemaParser`.
 */
export interface YorkieSchemaListener extends ParseTreeListener {
  /**
   * Enter a parse tree produced by `YorkieSchemaParser.document`.
   * @param ctx the parse tree
   */
  enterDocument?: (ctx: DocumentContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.document`.
   * @param ctx the parse tree
   */
  exitDocument?: (ctx: DocumentContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.declaration`.
   * @param ctx the parse tree
   */
  enterDeclaration?: (ctx: DeclarationContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.declaration`.
   * @param ctx the parse tree
   */
  exitDeclaration?: (ctx: DeclarationContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.typeAliasDeclaration`.
   * @param ctx the parse tree
   */
  enterTypeAliasDeclaration?: (ctx: TypeAliasDeclarationContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.typeAliasDeclaration`.
   * @param ctx the parse tree
   */
  exitTypeAliasDeclaration?: (ctx: TypeAliasDeclarationContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.variableDeclaration`.
   * @param ctx the parse tree
   */
  enterVariableDeclaration?: (ctx: VariableDeclarationContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.variableDeclaration`.
   * @param ctx the parse tree
   */
  exitVariableDeclaration?: (ctx: VariableDeclarationContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.typeAnnotation`.
   * @param ctx the parse tree
   */
  enterTypeAnnotation?: (ctx: TypeAnnotationContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.typeAnnotation`.
   * @param ctx the parse tree
   */
  exitTypeAnnotation?: (ctx: TypeAnnotationContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.type`.
   * @param ctx the parse tree
   */
  enterType?: (ctx: TypeContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.type`.
   * @param ctx the parse tree
   */
  exitType?: (ctx: TypeContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.unionType`.
   * @param ctx the parse tree
   */
  enterUnionType?: (ctx: UnionTypeContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.unionType`.
   * @param ctx the parse tree
   */
  exitUnionType?: (ctx: UnionTypeContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.intersectionType`.
   * @param ctx the parse tree
   */
  enterIntersectionType?: (ctx: IntersectionTypeContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.intersectionType`.
   * @param ctx the parse tree
   */
  exitIntersectionType?: (ctx: IntersectionTypeContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.arrayType`.
   * @param ctx the parse tree
   */
  enterArrayType?: (ctx: ArrayTypeContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.arrayType`.
   * @param ctx the parse tree
   */
  exitArrayType?: (ctx: ArrayTypeContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.primaryType`.
   * @param ctx the parse tree
   */
  enterPrimaryType?: (ctx: PrimaryTypeContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.primaryType`.
   * @param ctx the parse tree
   */
  exitPrimaryType?: (ctx: PrimaryTypeContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.primitiveType`.
   * @param ctx the parse tree
   */
  enterPrimitiveType?: (ctx: PrimitiveTypeContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.primitiveType`.
   * @param ctx the parse tree
   */
  exitPrimitiveType?: (ctx: PrimitiveTypeContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.objectType`.
   * @param ctx the parse tree
   */
  enterObjectType?: (ctx: ObjectTypeContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.objectType`.
   * @param ctx the parse tree
   */
  exitObjectType?: (ctx: ObjectTypeContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.propertySignature`.
   * @param ctx the parse tree
   */
  enterPropertySignature?: (ctx: PropertySignatureContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.propertySignature`.
   * @param ctx the parse tree
   */
  exitPropertySignature?: (ctx: PropertySignatureContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.propertyName`.
   * @param ctx the parse tree
   */
  enterPropertyName?: (ctx: PropertyNameContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.propertyName`.
   * @param ctx the parse tree
   */
  exitPropertyName?: (ctx: PropertyNameContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.yorkieType`.
   * @param ctx the parse tree
   */
  enterYorkieType?: (ctx: YorkieTypeContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.yorkieType`.
   * @param ctx the parse tree
   */
  exitYorkieType?: (ctx: YorkieTypeContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.typeReference`.
   * @param ctx the parse tree
   */
  enterTypeReference?: (ctx: TypeReferenceContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.typeReference`.
   * @param ctx the parse tree
   */
  exitTypeReference?: (ctx: TypeReferenceContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.parenthesizedType`.
   * @param ctx the parse tree
   */
  enterParenthesizedType?: (ctx: ParenthesizedTypeContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.parenthesizedType`.
   * @param ctx the parse tree
   */
  exitParenthesizedType?: (ctx: ParenthesizedTypeContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.typeParameters`.
   * @param ctx the parse tree
   */
  enterTypeParameters?: (ctx: TypeParametersContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.typeParameters`.
   * @param ctx the parse tree
   */
  exitTypeParameters?: (ctx: TypeParametersContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.typeParameter`.
   * @param ctx the parse tree
   */
  enterTypeParameter?: (ctx: TypeParameterContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.typeParameter`.
   * @param ctx the parse tree
   */
  exitTypeParameter?: (ctx: TypeParameterContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.typeArguments`.
   * @param ctx the parse tree
   */
  enterTypeArguments?: (ctx: TypeArgumentsContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.typeArguments`.
   * @param ctx the parse tree
   */
  exitTypeArguments?: (ctx: TypeArgumentsContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.expression`.
   * @param ctx the parse tree
   */
  enterExpression?: (ctx: ExpressionContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.expression`.
   * @param ctx the parse tree
   */
  exitExpression?: (ctx: ExpressionContext) => void;

  /**
   * Enter a parse tree produced by `YorkieSchemaParser.literal`.
   * @param ctx the parse tree
   */
  enterLiteral?: (ctx: LiteralContext) => void;
  /**
   * Exit a parse tree produced by `YorkieSchemaParser.literal`.
   * @param ctx the parse tree
   */
  exitLiteral?: (ctx: LiteralContext) => void;
}
