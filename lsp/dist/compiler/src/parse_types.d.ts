/**
 * BoneScript Type Expression Parser
 */
import { TokenStream } from "./parser_base";
import * as AST from "./ast";
export declare function parseTypeExpr(s: TokenStream): AST.TypeExprNode;
