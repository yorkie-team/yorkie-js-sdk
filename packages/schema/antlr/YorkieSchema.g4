grammar YorkieSchema;

// Top-level structure
document: declaration* EOF;

declaration
    : typeAliasDeclaration
    | variableDeclaration
    ;

typeAliasDeclaration
    : 'type' Identifier typeParameters? '=' type ';'
    ;

variableDeclaration
    : 'let' Identifier typeAnnotation? ('=' expression)? ';'
    ;

// Type definitions
typeAnnotation
    : ':' type
    ;

type
    : unionType
    ;

unionType
    : intersectionType ('|' intersectionType)*
    ;

intersectionType
    : arrayType ('&' arrayType)*
    ;

arrayType
    : primaryType ('[' ']')*
    | 'Array' typeArguments
    ;

primaryType
    : parenthesizedType
    | primitiveType
    | objectType
    | yorkieType
    | typeReference
    | literal
    ;

primitiveType
    : 'string'
    | 'boolean'
    | 'null'
    | 'integer'
    | 'double'
    | 'long'
    | 'bytes'
    | 'date'
    | 'any'
    ;

objectType
    : '{' (propertySignature)* '}'
    ;

QUESTION: '?';
propertySignature
    : propertyName QUESTION? typeAnnotation ';'
    ;

propertyName
    : Identifier
    | StringLiteral
    ;

// Yorkie specific types
yorkieType
    : 'yorkie.Object' typeArguments
    | 'yorkie.Array' typeArguments
    | 'yorkie.Counter' typeArguments?
    | 'yorkie.Text' typeArguments?
    | 'yorkie.Tree' typeArguments?
    ;

typeReference
    : Identifier typeArguments?
    ;

parenthesizedType
    : '(' type ')'
    ;

// Generics
typeParameters
    : '<' typeParameter (',' typeParameter)* '>'
    ;

typeParameter
    : Identifier ('extends' type)?
    ;

typeArguments
    : '<' type (',' type)* '>'
    ;

// Expressions
expression
    : Identifier
    | literal
    ;

literal
    : StringLiteral
    | NumberLiteral
    | BooleanLiteral
    ;

// Lexer rules
Identifier: [a-zA-Z_][a-zA-Z0-9_]*;
StringLiteral: '"' (~["\r\n])* '"';
NumberLiteral: [0-9]+('.'[0-9]+)?;
BooleanLiteral: 'true' | 'false';
SingleLineComment: '//' ~[\r\n]* -> channel(HIDDEN);
MultiLineComment: '/*' .*? '*/' -> channel(HIDDEN);
WS: [ \t\r\n]+ -> skip;
