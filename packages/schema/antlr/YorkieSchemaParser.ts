// Generated from antlr/YorkieSchema.g4 by ANTLR 4.9.0-SNAPSHOT


import { ATN } from "antlr4ts/atn/ATN";
import { ATNDeserializer } from "antlr4ts/atn/ATNDeserializer";
import { FailedPredicateException } from "antlr4ts/FailedPredicateException";
import { NotNull } from "antlr4ts/Decorators";
import { NoViableAltException } from "antlr4ts/NoViableAltException";
import { Override } from "antlr4ts/Decorators";
import { Parser } from "antlr4ts/Parser";
import { ParserRuleContext } from "antlr4ts/ParserRuleContext";
import { ParserATNSimulator } from "antlr4ts/atn/ParserATNSimulator";
import { ParseTreeListener } from "antlr4ts/tree/ParseTreeListener";
import { ParseTreeVisitor } from "antlr4ts/tree/ParseTreeVisitor";
import { RecognitionException } from "antlr4ts/RecognitionException";
import { RuleContext } from "antlr4ts/RuleContext";
//import { RuleVersion } from "antlr4ts/RuleVersion";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { Token } from "antlr4ts/Token";
import { TokenStream } from "antlr4ts/TokenStream";
import { Vocabulary } from "antlr4ts/Vocabulary";
import { VocabularyImpl } from "antlr4ts/VocabularyImpl";

import * as Utils from "antlr4ts/misc/Utils";

import { YorkieSchemaListener } from "./YorkieSchemaListener";
import { YorkieSchemaVisitor } from "./YorkieSchemaVisitor";


export class YorkieSchemaParser extends Parser {
	public static readonly T__0 = 1;
	public static readonly T__1 = 2;
	public static readonly T__2 = 3;
	public static readonly T__3 = 4;
	public static readonly T__4 = 5;
	public static readonly T__5 = 6;
	public static readonly T__6 = 7;
	public static readonly T__7 = 8;
	public static readonly T__8 = 9;
	public static readonly T__9 = 10;
	public static readonly T__10 = 11;
	public static readonly T__11 = 12;
	public static readonly T__12 = 13;
	public static readonly T__13 = 14;
	public static readonly T__14 = 15;
	public static readonly T__15 = 16;
	public static readonly T__16 = 17;
	public static readonly T__17 = 18;
	public static readonly T__18 = 19;
	public static readonly T__19 = 20;
	public static readonly T__20 = 21;
	public static readonly T__21 = 22;
	public static readonly T__22 = 23;
	public static readonly T__23 = 24;
	public static readonly T__24 = 25;
	public static readonly T__25 = 26;
	public static readonly T__26 = 27;
	public static readonly T__27 = 28;
	public static readonly T__28 = 29;
	public static readonly T__29 = 30;
	public static readonly T__30 = 31;
	public static readonly T__31 = 32;
	public static readonly QUESTION = 33;
	public static readonly Identifier = 34;
	public static readonly StringLiteral = 35;
	public static readonly NumberLiteral = 36;
	public static readonly BooleanLiteral = 37;
	public static readonly SingleLineComment = 38;
	public static readonly MultiLineComment = 39;
	public static readonly WS = 40;
	public static readonly RULE_document = 0;
	public static readonly RULE_declaration = 1;
	public static readonly RULE_typeAliasDeclaration = 2;
	public static readonly RULE_variableDeclaration = 3;
	public static readonly RULE_typeAnnotation = 4;
	public static readonly RULE_type = 5;
	public static readonly RULE_unionType = 6;
	public static readonly RULE_intersectionType = 7;
	public static readonly RULE_arrayType = 8;
	public static readonly RULE_primaryType = 9;
	public static readonly RULE_primitiveType = 10;
	public static readonly RULE_objectType = 11;
	public static readonly RULE_propertySignature = 12;
	public static readonly RULE_propertyName = 13;
	public static readonly RULE_yorkieType = 14;
	public static readonly RULE_typeReference = 15;
	public static readonly RULE_parenthesizedType = 16;
	public static readonly RULE_typeParameters = 17;
	public static readonly RULE_typeParameter = 18;
	public static readonly RULE_typeArguments = 19;
	public static readonly RULE_expression = 20;
	public static readonly RULE_literal = 21;
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"document", "declaration", "typeAliasDeclaration", "variableDeclaration", 
		"typeAnnotation", "type", "unionType", "intersectionType", "arrayType", 
		"primaryType", "primitiveType", "objectType", "propertySignature", "propertyName", 
		"yorkieType", "typeReference", "parenthesizedType", "typeParameters", 
		"typeParameter", "typeArguments", "expression", "literal",
	];

	private static readonly _LITERAL_NAMES: Array<string | undefined> = [
		undefined, "'type'", "'='", "';'", "'let'", "':'", "'|'", "'&'", "'['", 
		"']'", "'Array'", "'string'", "'boolean'", "'null'", "'integer'", "'double'", 
		"'long'", "'bytes'", "'date'", "'any'", "'{'", "'}'", "'yorkie.Object'", 
		"'yorkie.Array'", "'yorkie.Counter'", "'yorkie.Text'", "'yorkie.Tree'", 
		"'('", "')'", "'<'", "','", "'>'", "'extends'", "'?'",
	];
	private static readonly _SYMBOLIC_NAMES: Array<string | undefined> = [
		undefined, undefined, undefined, undefined, undefined, undefined, undefined, 
		undefined, undefined, undefined, undefined, undefined, undefined, undefined, 
		undefined, undefined, undefined, undefined, undefined, undefined, undefined, 
		undefined, undefined, undefined, undefined, undefined, undefined, undefined, 
		undefined, undefined, undefined, undefined, undefined, "QUESTION", "Identifier", 
		"StringLiteral", "NumberLiteral", "BooleanLiteral", "SingleLineComment", 
		"MultiLineComment", "WS",
	];
	public static readonly VOCABULARY: Vocabulary = new VocabularyImpl(YorkieSchemaParser._LITERAL_NAMES, YorkieSchemaParser._SYMBOLIC_NAMES, []);

	// @Override
	// @NotNull
	public get vocabulary(): Vocabulary {
		return YorkieSchemaParser.VOCABULARY;
	}
	// tslint:enable:no-trailing-whitespace

	// @Override
	public get grammarFileName(): string { return "YorkieSchema.g4"; }

	// @Override
	public get ruleNames(): string[] { return YorkieSchemaParser.ruleNames; }

	// @Override
	public get serializedATN(): string { return YorkieSchemaParser._serializedATN; }

	protected createFailedPredicateException(predicate?: string, message?: string): FailedPredicateException {
		return new FailedPredicateException(this, predicate, message);
	}

	constructor(input: TokenStream) {
		super(input);
		this._interp = new ParserATNSimulator(YorkieSchemaParser._ATN, this);
	}
	// @RuleVersion(0)
	public document(): DocumentContext {
		let _localctx: DocumentContext = new DocumentContext(this._ctx, this.state);
		this.enterRule(_localctx, 0, YorkieSchemaParser.RULE_document);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 47;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === YorkieSchemaParser.T__0 || _la === YorkieSchemaParser.T__3) {
				{
				{
				this.state = 44;
				this.declaration();
				}
				}
				this.state = 49;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 50;
			this.match(YorkieSchemaParser.EOF);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public declaration(): DeclarationContext {
		let _localctx: DeclarationContext = new DeclarationContext(this._ctx, this.state);
		this.enterRule(_localctx, 2, YorkieSchemaParser.RULE_declaration);
		try {
			this.state = 54;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case YorkieSchemaParser.T__0:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 52;
				this.typeAliasDeclaration();
				}
				break;
			case YorkieSchemaParser.T__3:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 53;
				this.variableDeclaration();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public typeAliasDeclaration(): TypeAliasDeclarationContext {
		let _localctx: TypeAliasDeclarationContext = new TypeAliasDeclarationContext(this._ctx, this.state);
		this.enterRule(_localctx, 4, YorkieSchemaParser.RULE_typeAliasDeclaration);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 56;
			this.match(YorkieSchemaParser.T__0);
			this.state = 57;
			this.match(YorkieSchemaParser.Identifier);
			this.state = 59;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === YorkieSchemaParser.T__28) {
				{
				this.state = 58;
				this.typeParameters();
				}
			}

			this.state = 61;
			this.match(YorkieSchemaParser.T__1);
			this.state = 62;
			this.type();
			this.state = 63;
			this.match(YorkieSchemaParser.T__2);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public variableDeclaration(): VariableDeclarationContext {
		let _localctx: VariableDeclarationContext = new VariableDeclarationContext(this._ctx, this.state);
		this.enterRule(_localctx, 6, YorkieSchemaParser.RULE_variableDeclaration);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 65;
			this.match(YorkieSchemaParser.T__3);
			this.state = 66;
			this.match(YorkieSchemaParser.Identifier);
			this.state = 68;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === YorkieSchemaParser.T__4) {
				{
				this.state = 67;
				this.typeAnnotation();
				}
			}

			this.state = 72;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === YorkieSchemaParser.T__1) {
				{
				this.state = 70;
				this.match(YorkieSchemaParser.T__1);
				this.state = 71;
				this.expression();
				}
			}

			this.state = 74;
			this.match(YorkieSchemaParser.T__2);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public typeAnnotation(): TypeAnnotationContext {
		let _localctx: TypeAnnotationContext = new TypeAnnotationContext(this._ctx, this.state);
		this.enterRule(_localctx, 8, YorkieSchemaParser.RULE_typeAnnotation);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 76;
			this.match(YorkieSchemaParser.T__4);
			this.state = 77;
			this.type();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public type(): TypeContext {
		let _localctx: TypeContext = new TypeContext(this._ctx, this.state);
		this.enterRule(_localctx, 10, YorkieSchemaParser.RULE_type);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 79;
			this.unionType();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public unionType(): UnionTypeContext {
		let _localctx: UnionTypeContext = new UnionTypeContext(this._ctx, this.state);
		this.enterRule(_localctx, 12, YorkieSchemaParser.RULE_unionType);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 81;
			this.intersectionType();
			this.state = 86;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === YorkieSchemaParser.T__5) {
				{
				{
				this.state = 82;
				this.match(YorkieSchemaParser.T__5);
				this.state = 83;
				this.intersectionType();
				}
				}
				this.state = 88;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public intersectionType(): IntersectionTypeContext {
		let _localctx: IntersectionTypeContext = new IntersectionTypeContext(this._ctx, this.state);
		this.enterRule(_localctx, 14, YorkieSchemaParser.RULE_intersectionType);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 89;
			this.arrayType();
			this.state = 94;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === YorkieSchemaParser.T__6) {
				{
				{
				this.state = 90;
				this.match(YorkieSchemaParser.T__6);
				this.state = 91;
				this.arrayType();
				}
				}
				this.state = 96;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public arrayType(): ArrayTypeContext {
		let _localctx: ArrayTypeContext = new ArrayTypeContext(this._ctx, this.state);
		this.enterRule(_localctx, 16, YorkieSchemaParser.RULE_arrayType);
		let _la: number;
		try {
			this.state = 107;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case YorkieSchemaParser.T__10:
			case YorkieSchemaParser.T__11:
			case YorkieSchemaParser.T__12:
			case YorkieSchemaParser.T__13:
			case YorkieSchemaParser.T__14:
			case YorkieSchemaParser.T__15:
			case YorkieSchemaParser.T__16:
			case YorkieSchemaParser.T__17:
			case YorkieSchemaParser.T__18:
			case YorkieSchemaParser.T__19:
			case YorkieSchemaParser.T__21:
			case YorkieSchemaParser.T__22:
			case YorkieSchemaParser.T__23:
			case YorkieSchemaParser.T__24:
			case YorkieSchemaParser.T__25:
			case YorkieSchemaParser.T__26:
			case YorkieSchemaParser.Identifier:
			case YorkieSchemaParser.StringLiteral:
			case YorkieSchemaParser.NumberLiteral:
			case YorkieSchemaParser.BooleanLiteral:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 97;
				this.primaryType();
				this.state = 102;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				while (_la === YorkieSchemaParser.T__7) {
					{
					{
					this.state = 98;
					this.match(YorkieSchemaParser.T__7);
					this.state = 99;
					this.match(YorkieSchemaParser.T__8);
					}
					}
					this.state = 104;
					this._errHandler.sync(this);
					_la = this._input.LA(1);
				}
				}
				break;
			case YorkieSchemaParser.T__9:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 105;
				this.match(YorkieSchemaParser.T__9);
				this.state = 106;
				this.typeArguments();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public primaryType(): PrimaryTypeContext {
		let _localctx: PrimaryTypeContext = new PrimaryTypeContext(this._ctx, this.state);
		this.enterRule(_localctx, 18, YorkieSchemaParser.RULE_primaryType);
		try {
			this.state = 115;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case YorkieSchemaParser.T__26:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 109;
				this.parenthesizedType();
				}
				break;
			case YorkieSchemaParser.T__10:
			case YorkieSchemaParser.T__11:
			case YorkieSchemaParser.T__12:
			case YorkieSchemaParser.T__13:
			case YorkieSchemaParser.T__14:
			case YorkieSchemaParser.T__15:
			case YorkieSchemaParser.T__16:
			case YorkieSchemaParser.T__17:
			case YorkieSchemaParser.T__18:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 110;
				this.primitiveType();
				}
				break;
			case YorkieSchemaParser.T__19:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 111;
				this.objectType();
				}
				break;
			case YorkieSchemaParser.T__21:
			case YorkieSchemaParser.T__22:
			case YorkieSchemaParser.T__23:
			case YorkieSchemaParser.T__24:
			case YorkieSchemaParser.T__25:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 112;
				this.yorkieType();
				}
				break;
			case YorkieSchemaParser.Identifier:
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 113;
				this.typeReference();
				}
				break;
			case YorkieSchemaParser.StringLiteral:
			case YorkieSchemaParser.NumberLiteral:
			case YorkieSchemaParser.BooleanLiteral:
				this.enterOuterAlt(_localctx, 6);
				{
				this.state = 114;
				this.literal();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public primitiveType(): PrimitiveTypeContext {
		let _localctx: PrimitiveTypeContext = new PrimitiveTypeContext(this._ctx, this.state);
		this.enterRule(_localctx, 20, YorkieSchemaParser.RULE_primitiveType);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 117;
			_la = this._input.LA(1);
			if (!((((_la) & ~0x1F) === 0 && ((1 << _la) & ((1 << YorkieSchemaParser.T__10) | (1 << YorkieSchemaParser.T__11) | (1 << YorkieSchemaParser.T__12) | (1 << YorkieSchemaParser.T__13) | (1 << YorkieSchemaParser.T__14) | (1 << YorkieSchemaParser.T__15) | (1 << YorkieSchemaParser.T__16) | (1 << YorkieSchemaParser.T__17) | (1 << YorkieSchemaParser.T__18))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public objectType(): ObjectTypeContext {
		let _localctx: ObjectTypeContext = new ObjectTypeContext(this._ctx, this.state);
		this.enterRule(_localctx, 22, YorkieSchemaParser.RULE_objectType);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 119;
			this.match(YorkieSchemaParser.T__19);
			this.state = 123;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === YorkieSchemaParser.Identifier || _la === YorkieSchemaParser.StringLiteral) {
				{
				{
				this.state = 120;
				this.propertySignature();
				}
				}
				this.state = 125;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 126;
			this.match(YorkieSchemaParser.T__20);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public propertySignature(): PropertySignatureContext {
		let _localctx: PropertySignatureContext = new PropertySignatureContext(this._ctx, this.state);
		this.enterRule(_localctx, 24, YorkieSchemaParser.RULE_propertySignature);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 128;
			this.propertyName();
			this.state = 130;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === YorkieSchemaParser.QUESTION) {
				{
				this.state = 129;
				this.match(YorkieSchemaParser.QUESTION);
				}
			}

			this.state = 132;
			this.typeAnnotation();
			this.state = 133;
			this.match(YorkieSchemaParser.T__2);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public propertyName(): PropertyNameContext {
		let _localctx: PropertyNameContext = new PropertyNameContext(this._ctx, this.state);
		this.enterRule(_localctx, 26, YorkieSchemaParser.RULE_propertyName);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 135;
			_la = this._input.LA(1);
			if (!(_la === YorkieSchemaParser.Identifier || _la === YorkieSchemaParser.StringLiteral)) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public yorkieType(): YorkieTypeContext {
		let _localctx: YorkieTypeContext = new YorkieTypeContext(this._ctx, this.state);
		this.enterRule(_localctx, 28, YorkieSchemaParser.RULE_yorkieType);
		let _la: number;
		try {
			this.state = 153;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case YorkieSchemaParser.T__21:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 137;
				this.match(YorkieSchemaParser.T__21);
				this.state = 138;
				this.typeArguments();
				}
				break;
			case YorkieSchemaParser.T__22:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 139;
				this.match(YorkieSchemaParser.T__22);
				this.state = 140;
				this.typeArguments();
				}
				break;
			case YorkieSchemaParser.T__23:
				this.enterOuterAlt(_localctx, 3);
				{
				this.state = 141;
				this.match(YorkieSchemaParser.T__23);
				this.state = 143;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === YorkieSchemaParser.T__28) {
					{
					this.state = 142;
					this.typeArguments();
					}
				}

				}
				break;
			case YorkieSchemaParser.T__24:
				this.enterOuterAlt(_localctx, 4);
				{
				this.state = 145;
				this.match(YorkieSchemaParser.T__24);
				this.state = 147;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === YorkieSchemaParser.T__28) {
					{
					this.state = 146;
					this.typeArguments();
					}
				}

				}
				break;
			case YorkieSchemaParser.T__25:
				this.enterOuterAlt(_localctx, 5);
				{
				this.state = 149;
				this.match(YorkieSchemaParser.T__25);
				this.state = 151;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if (_la === YorkieSchemaParser.T__28) {
					{
					this.state = 150;
					this.typeArguments();
					}
				}

				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public typeReference(): TypeReferenceContext {
		let _localctx: TypeReferenceContext = new TypeReferenceContext(this._ctx, this.state);
		this.enterRule(_localctx, 30, YorkieSchemaParser.RULE_typeReference);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 155;
			this.match(YorkieSchemaParser.Identifier);
			this.state = 157;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === YorkieSchemaParser.T__28) {
				{
				this.state = 156;
				this.typeArguments();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public parenthesizedType(): ParenthesizedTypeContext {
		let _localctx: ParenthesizedTypeContext = new ParenthesizedTypeContext(this._ctx, this.state);
		this.enterRule(_localctx, 32, YorkieSchemaParser.RULE_parenthesizedType);
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 159;
			this.match(YorkieSchemaParser.T__26);
			this.state = 160;
			this.type();
			this.state = 161;
			this.match(YorkieSchemaParser.T__27);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public typeParameters(): TypeParametersContext {
		let _localctx: TypeParametersContext = new TypeParametersContext(this._ctx, this.state);
		this.enterRule(_localctx, 34, YorkieSchemaParser.RULE_typeParameters);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 163;
			this.match(YorkieSchemaParser.T__28);
			this.state = 164;
			this.typeParameter();
			this.state = 169;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === YorkieSchemaParser.T__29) {
				{
				{
				this.state = 165;
				this.match(YorkieSchemaParser.T__29);
				this.state = 166;
				this.typeParameter();
				}
				}
				this.state = 171;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 172;
			this.match(YorkieSchemaParser.T__30);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public typeParameter(): TypeParameterContext {
		let _localctx: TypeParameterContext = new TypeParameterContext(this._ctx, this.state);
		this.enterRule(_localctx, 36, YorkieSchemaParser.RULE_typeParameter);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 174;
			this.match(YorkieSchemaParser.Identifier);
			this.state = 177;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la === YorkieSchemaParser.T__31) {
				{
				this.state = 175;
				this.match(YorkieSchemaParser.T__31);
				this.state = 176;
				this.type();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public typeArguments(): TypeArgumentsContext {
		let _localctx: TypeArgumentsContext = new TypeArgumentsContext(this._ctx, this.state);
		this.enterRule(_localctx, 38, YorkieSchemaParser.RULE_typeArguments);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 179;
			this.match(YorkieSchemaParser.T__28);
			this.state = 180;
			this.type();
			this.state = 185;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la === YorkieSchemaParser.T__29) {
				{
				{
				this.state = 181;
				this.match(YorkieSchemaParser.T__29);
				this.state = 182;
				this.type();
				}
				}
				this.state = 187;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 188;
			this.match(YorkieSchemaParser.T__30);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public expression(): ExpressionContext {
		let _localctx: ExpressionContext = new ExpressionContext(this._ctx, this.state);
		this.enterRule(_localctx, 40, YorkieSchemaParser.RULE_expression);
		try {
			this.state = 192;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case YorkieSchemaParser.Identifier:
				this.enterOuterAlt(_localctx, 1);
				{
				this.state = 190;
				this.match(YorkieSchemaParser.Identifier);
				}
				break;
			case YorkieSchemaParser.StringLiteral:
			case YorkieSchemaParser.NumberLiteral:
			case YorkieSchemaParser.BooleanLiteral:
				this.enterOuterAlt(_localctx, 2);
				{
				this.state = 191;
				this.literal();
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}
	// @RuleVersion(0)
	public literal(): LiteralContext {
		let _localctx: LiteralContext = new LiteralContext(this._ctx, this.state);
		this.enterRule(_localctx, 42, YorkieSchemaParser.RULE_literal);
		let _la: number;
		try {
			this.enterOuterAlt(_localctx, 1);
			{
			this.state = 194;
			_la = this._input.LA(1);
			if (!(((((_la - 35)) & ~0x1F) === 0 && ((1 << (_la - 35)) & ((1 << (YorkieSchemaParser.StringLiteral - 35)) | (1 << (YorkieSchemaParser.NumberLiteral - 35)) | (1 << (YorkieSchemaParser.BooleanLiteral - 35)))) !== 0))) {
			this._errHandler.recoverInline(this);
			} else {
				if (this._input.LA(1) === Token.EOF) {
					this.matchedEOF = true;
				}

				this._errHandler.reportMatch(this);
				this.consume();
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				_localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return _localctx;
	}

	public static readonly _serializedATN: string =
		"\x03\uC91D\uCABA\u058D\uAFBA\u4F53\u0607\uEA8B\uC241\x03*\xC7\x04\x02" +
		"\t\x02\x04\x03\t\x03\x04\x04\t\x04\x04\x05\t\x05\x04\x06\t\x06\x04\x07" +
		"\t\x07\x04\b\t\b\x04\t\t\t\x04\n\t\n\x04\v\t\v\x04\f\t\f\x04\r\t\r\x04" +
		"\x0E\t\x0E\x04\x0F\t\x0F\x04\x10\t\x10\x04\x11\t\x11\x04\x12\t\x12\x04" +
		"\x13\t\x13\x04\x14\t\x14\x04\x15\t\x15\x04\x16\t\x16\x04\x17\t\x17\x03" +
		"\x02\x07\x020\n\x02\f\x02\x0E\x023\v\x02\x03\x02\x03\x02\x03\x03\x03\x03" +
		"\x05\x039\n\x03\x03\x04\x03\x04\x03\x04\x05\x04>\n\x04\x03\x04\x03\x04" +
		"\x03\x04\x03\x04\x03\x05\x03\x05\x03\x05\x05\x05G\n\x05\x03\x05\x03\x05" +
		"\x05\x05K\n\x05\x03\x05\x03\x05\x03\x06\x03\x06\x03\x06\x03\x07\x03\x07" +
		"\x03\b\x03\b\x03\b\x07\bW\n\b\f\b\x0E\bZ\v\b\x03\t\x03\t\x03\t\x07\t_" +
		"\n\t\f\t\x0E\tb\v\t\x03\n\x03\n\x03\n\x07\ng\n\n\f\n\x0E\nj\v\n\x03\n" +
		"\x03\n\x05\nn\n\n\x03\v\x03\v\x03\v\x03\v\x03\v\x03\v\x05\vv\n\v\x03\f" +
		"\x03\f\x03\r\x03\r\x07\r|\n\r\f\r\x0E\r\x7F\v\r\x03\r\x03\r\x03\x0E\x03" +
		"\x0E\x05\x0E\x85\n\x0E\x03\x0E\x03\x0E\x03\x0E\x03\x0F\x03\x0F\x03\x10" +
		"\x03\x10\x03\x10\x03\x10\x03\x10\x03\x10\x05\x10\x92\n\x10\x03\x10\x03" +
		"\x10\x05\x10\x96\n\x10\x03\x10\x03\x10\x05\x10\x9A\n\x10\x05\x10\x9C\n" +
		"\x10\x03\x11\x03\x11\x05\x11\xA0\n\x11\x03\x12\x03\x12\x03\x12\x03\x12" +
		"\x03\x13\x03\x13\x03\x13\x03\x13\x07\x13\xAA\n\x13\f\x13\x0E\x13\xAD\v" +
		"\x13\x03\x13\x03\x13\x03\x14\x03\x14\x03\x14\x05\x14\xB4\n\x14\x03\x15" +
		"\x03\x15\x03\x15\x03\x15\x07\x15\xBA\n\x15\f\x15\x0E\x15\xBD\v\x15\x03" +
		"\x15\x03\x15\x03\x16\x03\x16\x05\x16\xC3\n\x16\x03\x17\x03\x17\x03\x17" +
		"\x02\x02\x02\x18\x02\x02\x04\x02\x06\x02\b\x02\n\x02\f\x02\x0E\x02\x10" +
		"\x02\x12\x02\x14\x02\x16\x02\x18\x02\x1A\x02\x1C\x02\x1E\x02 \x02\"\x02" +
		"$\x02&\x02(\x02*\x02,\x02\x02\x05\x03\x02\r\x15\x03\x02$%\x03\x02%\'\x02" +
		"\xCC\x021\x03\x02\x02\x02\x048\x03\x02\x02\x02\x06:\x03\x02\x02\x02\b" +
		"C\x03\x02\x02\x02\nN\x03\x02\x02\x02\fQ\x03\x02\x02\x02\x0ES\x03\x02\x02" +
		"\x02\x10[\x03\x02\x02\x02\x12m\x03\x02\x02\x02\x14u\x03\x02\x02\x02\x16" +
		"w\x03\x02\x02\x02\x18y\x03\x02\x02\x02\x1A\x82\x03\x02\x02\x02\x1C\x89" +
		"\x03\x02\x02\x02\x1E\x9B\x03\x02\x02\x02 \x9D\x03\x02\x02\x02\"\xA1\x03" +
		"\x02\x02\x02$\xA5\x03\x02\x02\x02&\xB0\x03\x02\x02\x02(\xB5\x03\x02\x02" +
		"\x02*\xC2\x03\x02\x02\x02,\xC4\x03\x02\x02\x02.0\x05\x04\x03\x02/.\x03" +
		"\x02\x02\x0203\x03\x02\x02\x021/\x03\x02\x02\x0212\x03\x02\x02\x0224\x03" +
		"\x02\x02\x0231\x03\x02\x02\x0245\x07\x02\x02\x035\x03\x03\x02\x02\x02" +
		"69\x05\x06\x04\x0279\x05\b\x05\x0286\x03\x02\x02\x0287\x03\x02\x02\x02" +
		"9\x05\x03\x02\x02\x02:;\x07\x03\x02\x02;=\x07$\x02\x02<>\x05$\x13\x02" +
		"=<\x03\x02\x02\x02=>\x03\x02\x02\x02>?\x03\x02\x02\x02?@\x07\x04\x02\x02" +
		"@A\x05\f\x07\x02AB\x07\x05\x02\x02B\x07\x03\x02\x02\x02CD\x07\x06\x02" +
		"\x02DF\x07$\x02\x02EG\x05\n\x06\x02FE\x03\x02\x02\x02FG\x03\x02\x02\x02" +
		"GJ\x03\x02\x02\x02HI\x07\x04\x02\x02IK\x05*\x16\x02JH\x03\x02\x02\x02" +
		"JK\x03\x02\x02\x02KL\x03\x02\x02\x02LM\x07\x05\x02\x02M\t\x03\x02\x02" +
		"\x02NO\x07\x07\x02\x02OP\x05\f\x07\x02P\v\x03\x02\x02\x02QR\x05\x0E\b" +
		"\x02R\r\x03\x02\x02\x02SX\x05\x10\t\x02TU\x07\b\x02\x02UW\x05\x10\t\x02" +
		"VT\x03\x02\x02\x02WZ\x03\x02\x02\x02XV\x03\x02\x02\x02XY\x03\x02\x02\x02" +
		"Y\x0F\x03\x02\x02\x02ZX\x03\x02\x02\x02[`\x05\x12\n\x02\\]\x07\t\x02\x02" +
		"]_\x05\x12\n\x02^\\\x03\x02\x02\x02_b\x03\x02\x02\x02`^\x03\x02\x02\x02" +
		"`a\x03\x02\x02\x02a\x11\x03\x02\x02\x02b`\x03\x02\x02\x02ch\x05\x14\v" +
		"\x02de\x07\n\x02\x02eg\x07\v\x02\x02fd\x03\x02\x02\x02gj\x03\x02\x02\x02" +
		"hf\x03\x02\x02\x02hi\x03\x02\x02\x02in\x03\x02\x02\x02jh\x03\x02\x02\x02" +
		"kl\x07\f\x02\x02ln\x05(\x15\x02mc\x03\x02\x02\x02mk\x03\x02\x02\x02n\x13" +
		"\x03\x02\x02\x02ov\x05\"\x12\x02pv\x05\x16\f\x02qv\x05\x18\r\x02rv\x05" +
		"\x1E\x10\x02sv\x05 \x11\x02tv\x05,\x17\x02uo\x03\x02\x02\x02up\x03\x02" +
		"\x02\x02uq\x03\x02\x02\x02ur\x03\x02\x02\x02us\x03\x02\x02\x02ut\x03\x02" +
		"\x02\x02v\x15\x03\x02\x02\x02wx\t\x02\x02\x02x\x17\x03\x02\x02\x02y}\x07" +
		"\x16\x02\x02z|\x05\x1A\x0E\x02{z\x03\x02\x02\x02|\x7F\x03\x02\x02\x02" +
		"}{\x03\x02\x02\x02}~\x03\x02\x02\x02~\x80\x03\x02\x02\x02\x7F}\x03\x02" +
		"\x02\x02\x80\x81\x07\x17\x02\x02\x81\x19\x03\x02\x02\x02\x82\x84\x05\x1C" +
		"\x0F\x02\x83\x85\x07#\x02\x02\x84\x83\x03\x02\x02\x02\x84\x85\x03\x02" +
		"\x02\x02\x85\x86\x03\x02\x02\x02\x86\x87\x05\n\x06\x02\x87\x88\x07\x05" +
		"\x02\x02\x88\x1B\x03\x02\x02\x02\x89\x8A\t\x03\x02\x02\x8A\x1D\x03\x02" +
		"\x02\x02\x8B\x8C\x07\x18\x02\x02\x8C\x9C\x05(\x15\x02\x8D\x8E\x07\x19" +
		"\x02\x02\x8E\x9C\x05(\x15\x02\x8F\x91\x07\x1A\x02\x02\x90\x92\x05(\x15" +
		"\x02\x91\x90\x03\x02\x02\x02\x91\x92\x03\x02\x02\x02\x92\x9C\x03\x02\x02" +
		"\x02\x93\x95\x07\x1B\x02\x02\x94\x96\x05(\x15\x02\x95\x94\x03\x02\x02" +
		"\x02\x95\x96\x03\x02\x02\x02\x96\x9C\x03\x02\x02\x02\x97\x99\x07\x1C\x02" +
		"\x02\x98\x9A\x05(\x15\x02\x99\x98\x03\x02\x02\x02\x99\x9A\x03\x02\x02" +
		"\x02\x9A\x9C\x03\x02\x02\x02\x9B\x8B\x03\x02\x02\x02\x9B\x8D\x03\x02\x02" +
		"\x02\x9B\x8F\x03\x02\x02\x02\x9B\x93\x03\x02\x02\x02\x9B\x97\x03\x02\x02" +
		"\x02\x9C\x1F\x03\x02\x02\x02\x9D\x9F\x07$\x02\x02\x9E\xA0\x05(\x15\x02" +
		"\x9F\x9E\x03\x02\x02\x02\x9F\xA0\x03\x02\x02\x02\xA0!\x03\x02\x02\x02" +
		"\xA1\xA2\x07\x1D\x02\x02\xA2\xA3\x05\f\x07\x02\xA3\xA4\x07\x1E\x02\x02" +
		"\xA4#\x03\x02\x02\x02\xA5\xA6\x07\x1F\x02\x02\xA6\xAB\x05&\x14\x02\xA7" +
		"\xA8\x07 \x02\x02\xA8\xAA\x05&\x14\x02\xA9\xA7\x03\x02\x02\x02\xAA\xAD" +
		"\x03\x02\x02\x02\xAB\xA9\x03\x02\x02\x02\xAB\xAC\x03\x02\x02\x02\xAC\xAE" +
		"\x03\x02\x02\x02\xAD\xAB\x03\x02\x02\x02\xAE\xAF\x07!\x02\x02\xAF%\x03" +
		"\x02\x02\x02\xB0\xB3\x07$\x02\x02\xB1\xB2\x07\"\x02\x02\xB2\xB4\x05\f" +
		"\x07\x02\xB3\xB1\x03\x02\x02\x02\xB3\xB4\x03\x02\x02\x02\xB4\'\x03\x02" +
		"\x02\x02\xB5\xB6\x07\x1F\x02\x02\xB6\xBB\x05\f\x07\x02\xB7\xB8\x07 \x02" +
		"\x02\xB8\xBA\x05\f\x07\x02\xB9\xB7\x03\x02\x02\x02\xBA\xBD\x03\x02\x02" +
		"\x02\xBB\xB9\x03\x02\x02\x02\xBB\xBC\x03\x02\x02\x02\xBC\xBE\x03\x02\x02" +
		"\x02\xBD\xBB\x03\x02\x02\x02\xBE\xBF\x07!\x02\x02\xBF)\x03\x02\x02\x02" +
		"\xC0\xC3\x07$\x02\x02\xC1\xC3\x05,\x17\x02\xC2\xC0\x03\x02\x02\x02\xC2" +
		"\xC1\x03\x02\x02\x02\xC3+\x03\x02\x02\x02\xC4\xC5\t\x04\x02\x02\xC5-\x03" +
		"\x02\x02\x02\x1718=FJX`hmu}\x84\x91\x95\x99\x9B\x9F\xAB\xB3\xBB\xC2";
	public static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!YorkieSchemaParser.__ATN) {
			YorkieSchemaParser.__ATN = new ATNDeserializer().deserialize(Utils.toCharArray(YorkieSchemaParser._serializedATN));
		}

		return YorkieSchemaParser.__ATN;
	}

}

export class DocumentContext extends ParserRuleContext {
	public EOF(): TerminalNode { return this.getToken(YorkieSchemaParser.EOF, 0); }
	public declaration(): DeclarationContext[];
	public declaration(i: number): DeclarationContext;
	public declaration(i?: number): DeclarationContext | DeclarationContext[] {
		if (i === undefined) {
			return this.getRuleContexts(DeclarationContext);
		} else {
			return this.getRuleContext(i, DeclarationContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_document; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterDocument) {
			listener.enterDocument(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitDocument) {
			listener.exitDocument(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitDocument) {
			return visitor.visitDocument(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class DeclarationContext extends ParserRuleContext {
	public typeAliasDeclaration(): TypeAliasDeclarationContext | undefined {
		return this.tryGetRuleContext(0, TypeAliasDeclarationContext);
	}
	public variableDeclaration(): VariableDeclarationContext | undefined {
		return this.tryGetRuleContext(0, VariableDeclarationContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_declaration; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterDeclaration) {
			listener.enterDeclaration(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitDeclaration) {
			listener.exitDeclaration(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitDeclaration) {
			return visitor.visitDeclaration(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TypeAliasDeclarationContext extends ParserRuleContext {
	public Identifier(): TerminalNode { return this.getToken(YorkieSchemaParser.Identifier, 0); }
	public type(): TypeContext {
		return this.getRuleContext(0, TypeContext);
	}
	public typeParameters(): TypeParametersContext | undefined {
		return this.tryGetRuleContext(0, TypeParametersContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_typeAliasDeclaration; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterTypeAliasDeclaration) {
			listener.enterTypeAliasDeclaration(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitTypeAliasDeclaration) {
			listener.exitTypeAliasDeclaration(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitTypeAliasDeclaration) {
			return visitor.visitTypeAliasDeclaration(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class VariableDeclarationContext extends ParserRuleContext {
	public Identifier(): TerminalNode { return this.getToken(YorkieSchemaParser.Identifier, 0); }
	public typeAnnotation(): TypeAnnotationContext | undefined {
		return this.tryGetRuleContext(0, TypeAnnotationContext);
	}
	public expression(): ExpressionContext | undefined {
		return this.tryGetRuleContext(0, ExpressionContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_variableDeclaration; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterVariableDeclaration) {
			listener.enterVariableDeclaration(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitVariableDeclaration) {
			listener.exitVariableDeclaration(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitVariableDeclaration) {
			return visitor.visitVariableDeclaration(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TypeAnnotationContext extends ParserRuleContext {
	public type(): TypeContext {
		return this.getRuleContext(0, TypeContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_typeAnnotation; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterTypeAnnotation) {
			listener.enterTypeAnnotation(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitTypeAnnotation) {
			listener.exitTypeAnnotation(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitTypeAnnotation) {
			return visitor.visitTypeAnnotation(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TypeContext extends ParserRuleContext {
	public unionType(): UnionTypeContext {
		return this.getRuleContext(0, UnionTypeContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_type; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterType) {
			listener.enterType(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitType) {
			listener.exitType(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitType) {
			return visitor.visitType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class UnionTypeContext extends ParserRuleContext {
	public intersectionType(): IntersectionTypeContext[];
	public intersectionType(i: number): IntersectionTypeContext;
	public intersectionType(i?: number): IntersectionTypeContext | IntersectionTypeContext[] {
		if (i === undefined) {
			return this.getRuleContexts(IntersectionTypeContext);
		} else {
			return this.getRuleContext(i, IntersectionTypeContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_unionType; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterUnionType) {
			listener.enterUnionType(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitUnionType) {
			listener.exitUnionType(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitUnionType) {
			return visitor.visitUnionType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class IntersectionTypeContext extends ParserRuleContext {
	public arrayType(): ArrayTypeContext[];
	public arrayType(i: number): ArrayTypeContext;
	public arrayType(i?: number): ArrayTypeContext | ArrayTypeContext[] {
		if (i === undefined) {
			return this.getRuleContexts(ArrayTypeContext);
		} else {
			return this.getRuleContext(i, ArrayTypeContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_intersectionType; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterIntersectionType) {
			listener.enterIntersectionType(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitIntersectionType) {
			listener.exitIntersectionType(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitIntersectionType) {
			return visitor.visitIntersectionType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ArrayTypeContext extends ParserRuleContext {
	public primaryType(): PrimaryTypeContext | undefined {
		return this.tryGetRuleContext(0, PrimaryTypeContext);
	}
	public typeArguments(): TypeArgumentsContext | undefined {
		return this.tryGetRuleContext(0, TypeArgumentsContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_arrayType; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterArrayType) {
			listener.enterArrayType(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitArrayType) {
			listener.exitArrayType(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitArrayType) {
			return visitor.visitArrayType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class PrimaryTypeContext extends ParserRuleContext {
	public parenthesizedType(): ParenthesizedTypeContext | undefined {
		return this.tryGetRuleContext(0, ParenthesizedTypeContext);
	}
	public primitiveType(): PrimitiveTypeContext | undefined {
		return this.tryGetRuleContext(0, PrimitiveTypeContext);
	}
	public objectType(): ObjectTypeContext | undefined {
		return this.tryGetRuleContext(0, ObjectTypeContext);
	}
	public yorkieType(): YorkieTypeContext | undefined {
		return this.tryGetRuleContext(0, YorkieTypeContext);
	}
	public typeReference(): TypeReferenceContext | undefined {
		return this.tryGetRuleContext(0, TypeReferenceContext);
	}
	public literal(): LiteralContext | undefined {
		return this.tryGetRuleContext(0, LiteralContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_primaryType; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterPrimaryType) {
			listener.enterPrimaryType(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitPrimaryType) {
			listener.exitPrimaryType(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitPrimaryType) {
			return visitor.visitPrimaryType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class PrimitiveTypeContext extends ParserRuleContext {
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_primitiveType; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterPrimitiveType) {
			listener.enterPrimitiveType(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitPrimitiveType) {
			listener.exitPrimitiveType(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitPrimitiveType) {
			return visitor.visitPrimitiveType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ObjectTypeContext extends ParserRuleContext {
	public propertySignature(): PropertySignatureContext[];
	public propertySignature(i: number): PropertySignatureContext;
	public propertySignature(i?: number): PropertySignatureContext | PropertySignatureContext[] {
		if (i === undefined) {
			return this.getRuleContexts(PropertySignatureContext);
		} else {
			return this.getRuleContext(i, PropertySignatureContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_objectType; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterObjectType) {
			listener.enterObjectType(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitObjectType) {
			listener.exitObjectType(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitObjectType) {
			return visitor.visitObjectType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class PropertySignatureContext extends ParserRuleContext {
	public propertyName(): PropertyNameContext {
		return this.getRuleContext(0, PropertyNameContext);
	}
	public typeAnnotation(): TypeAnnotationContext {
		return this.getRuleContext(0, TypeAnnotationContext);
	}
	public QUESTION(): TerminalNode | undefined { return this.tryGetToken(YorkieSchemaParser.QUESTION, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_propertySignature; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterPropertySignature) {
			listener.enterPropertySignature(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitPropertySignature) {
			listener.exitPropertySignature(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitPropertySignature) {
			return visitor.visitPropertySignature(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class PropertyNameContext extends ParserRuleContext {
	public Identifier(): TerminalNode | undefined { return this.tryGetToken(YorkieSchemaParser.Identifier, 0); }
	public StringLiteral(): TerminalNode | undefined { return this.tryGetToken(YorkieSchemaParser.StringLiteral, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_propertyName; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterPropertyName) {
			listener.enterPropertyName(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitPropertyName) {
			listener.exitPropertyName(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitPropertyName) {
			return visitor.visitPropertyName(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class YorkieTypeContext extends ParserRuleContext {
	public typeArguments(): TypeArgumentsContext | undefined {
		return this.tryGetRuleContext(0, TypeArgumentsContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_yorkieType; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterYorkieType) {
			listener.enterYorkieType(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitYorkieType) {
			listener.exitYorkieType(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitYorkieType) {
			return visitor.visitYorkieType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TypeReferenceContext extends ParserRuleContext {
	public Identifier(): TerminalNode { return this.getToken(YorkieSchemaParser.Identifier, 0); }
	public typeArguments(): TypeArgumentsContext | undefined {
		return this.tryGetRuleContext(0, TypeArgumentsContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_typeReference; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterTypeReference) {
			listener.enterTypeReference(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitTypeReference) {
			listener.exitTypeReference(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitTypeReference) {
			return visitor.visitTypeReference(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ParenthesizedTypeContext extends ParserRuleContext {
	public type(): TypeContext {
		return this.getRuleContext(0, TypeContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_parenthesizedType; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterParenthesizedType) {
			listener.enterParenthesizedType(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitParenthesizedType) {
			listener.exitParenthesizedType(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitParenthesizedType) {
			return visitor.visitParenthesizedType(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TypeParametersContext extends ParserRuleContext {
	public typeParameter(): TypeParameterContext[];
	public typeParameter(i: number): TypeParameterContext;
	public typeParameter(i?: number): TypeParameterContext | TypeParameterContext[] {
		if (i === undefined) {
			return this.getRuleContexts(TypeParameterContext);
		} else {
			return this.getRuleContext(i, TypeParameterContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_typeParameters; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterTypeParameters) {
			listener.enterTypeParameters(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitTypeParameters) {
			listener.exitTypeParameters(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitTypeParameters) {
			return visitor.visitTypeParameters(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TypeParameterContext extends ParserRuleContext {
	public Identifier(): TerminalNode { return this.getToken(YorkieSchemaParser.Identifier, 0); }
	public type(): TypeContext | undefined {
		return this.tryGetRuleContext(0, TypeContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_typeParameter; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterTypeParameter) {
			listener.enterTypeParameter(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitTypeParameter) {
			listener.exitTypeParameter(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitTypeParameter) {
			return visitor.visitTypeParameter(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TypeArgumentsContext extends ParserRuleContext {
	public type(): TypeContext[];
	public type(i: number): TypeContext;
	public type(i?: number): TypeContext | TypeContext[] {
		if (i === undefined) {
			return this.getRuleContexts(TypeContext);
		} else {
			return this.getRuleContext(i, TypeContext);
		}
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_typeArguments; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterTypeArguments) {
			listener.enterTypeArguments(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitTypeArguments) {
			listener.exitTypeArguments(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitTypeArguments) {
			return visitor.visitTypeArguments(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ExpressionContext extends ParserRuleContext {
	public Identifier(): TerminalNode | undefined { return this.tryGetToken(YorkieSchemaParser.Identifier, 0); }
	public literal(): LiteralContext | undefined {
		return this.tryGetRuleContext(0, LiteralContext);
	}
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_expression; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterExpression) {
			listener.enterExpression(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitExpression) {
			listener.exitExpression(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitExpression) {
			return visitor.visitExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class LiteralContext extends ParserRuleContext {
	public StringLiteral(): TerminalNode | undefined { return this.tryGetToken(YorkieSchemaParser.StringLiteral, 0); }
	public NumberLiteral(): TerminalNode | undefined { return this.tryGetToken(YorkieSchemaParser.NumberLiteral, 0); }
	public BooleanLiteral(): TerminalNode | undefined { return this.tryGetToken(YorkieSchemaParser.BooleanLiteral, 0); }
	constructor(parent: ParserRuleContext | undefined, invokingState: number) {
		super(parent, invokingState);
	}
	// @Override
	public get ruleIndex(): number { return YorkieSchemaParser.RULE_literal; }
	// @Override
	public enterRule(listener: YorkieSchemaListener): void {
		if (listener.enterLiteral) {
			listener.enterLiteral(this);
		}
	}
	// @Override
	public exitRule(listener: YorkieSchemaListener): void {
		if (listener.exitLiteral) {
			listener.exitLiteral(this);
		}
	}
	// @Override
	public accept<Result>(visitor: YorkieSchemaVisitor<Result>): Result {
		if (visitor.visitLiteral) {
			return visitor.visitLiteral(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


