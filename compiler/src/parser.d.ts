import { Token } from "./lexer";
import * as AST from "./ast";
export { ParseError } from "./parser_base";
export declare class Parser {
    private s;
    constructor(tokens: Token[]);
    parse(): AST.ProgramNode;
    private parseSystemDecl;
    private parseDeclaration;
}
