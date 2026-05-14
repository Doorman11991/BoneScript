/**
 * BoneScript Expression Parser â€” Pratt-style precedence climbing.
 */
import { TokenStream } from "./parser_base";
import * as AST from "./ast";
export declare function parseExpr(s: TokenStream): AST.ExprNode;
export declare function parseExprList(s: TokenStream): AST.ExprNode[];
