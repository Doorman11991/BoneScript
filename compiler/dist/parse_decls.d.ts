/**
 * BoneScript Declaration Parsers
 */
import { TokenStream } from "./parser_base";
import * as AST from "./ast";
export declare function parseFieldList(s: TokenStream): AST.FieldNode[];
export declare function parseField(s: TokenStream): AST.FieldNode;
export declare function parseIdentList(s: TokenStream): string[];
export declare function parseDuration(s: TokenStream): string;
export declare function parseEntityDecl(s: TokenStream): AST.EntityDeclNode;
export declare function parseCapabilityDecl(s: TokenStream): AST.CapabilityDeclNode;
export declare function parsePipeline(s: TokenStream, parallel?: boolean): AST.PipelineNode;
export declare function parseAlgorithm(s: TokenStream): AST.AlgorithmNode;
