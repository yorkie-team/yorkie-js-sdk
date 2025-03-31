// Generated from antlr/YorkieSchema.g4 by ANTLR 4.9.0-SNAPSHOT

import { ParseTreeVisitor } from 'antlr4ts/tree/ParseTreeVisitor';

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
 * This interface defines a complete generic visitor for a parse tree produced
 * by `YorkieSchemaParser`.
 *
 * @param <Result> The return type of the visit operation. Use `void` for
 * operations with no return type.
 */
export interface YorkieSchemaVisitor<Result> extends ParseTreeVisitor<Result> {
  /**
   * Visit a parse tree produced by `YorkieSchemaParser.document`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitDocument?: (ctx: DocumentContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.declaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitDeclaration?: (ctx: DeclarationContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.typeAliasDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTypeAliasDeclaration?: (ctx: TypeAliasDeclarationContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.variableDeclaration`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitVariableDeclaration?: (ctx: VariableDeclarationContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.typeAnnotation`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTypeAnnotation?: (ctx: TypeAnnotationContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.type`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitType?: (ctx: TypeContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.unionType`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitUnionType?: (ctx: UnionTypeContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.intersectionType`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitIntersectionType?: (ctx: IntersectionTypeContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.arrayType`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitArrayType?: (ctx: ArrayTypeContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.primaryType`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitPrimaryType?: (ctx: PrimaryTypeContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.primitiveType`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitPrimitiveType?: (ctx: PrimitiveTypeContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.objectType`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitObjectType?: (ctx: ObjectTypeContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.propertySignature`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitPropertySignature?: (ctx: PropertySignatureContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.propertyName`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitPropertyName?: (ctx: PropertyNameContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.yorkieType`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitYorkieType?: (ctx: YorkieTypeContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.typeReference`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTypeReference?: (ctx: TypeReferenceContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.parenthesizedType`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitParenthesizedType?: (ctx: ParenthesizedTypeContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.typeParameters`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTypeParameters?: (ctx: TypeParametersContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.typeParameter`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTypeParameter?: (ctx: TypeParameterContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.typeArguments`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitTypeArguments?: (ctx: TypeArgumentsContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.expression`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitExpression?: (ctx: ExpressionContext) => Result;

  /**
   * Visit a parse tree produced by `YorkieSchemaParser.literal`.
   * @param ctx the parse tree
   * @return the visitor result
   */
  visitLiteral?: (ctx: LiteralContext) => Result;
}
