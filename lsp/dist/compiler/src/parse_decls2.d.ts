/**
 * BoneScript Declaration Parsers â€” Channel, Store, Event, Constraint, Policy, Flow, Import
 */
import { TokenStream } from "./parser_base";
import * as AST from "./ast";
export declare function parseChannelDecl(s: TokenStream): AST.ChannelDeclNode;
export declare function parseStoreDecl(s: TokenStream): AST.StoreDeclNode;
export declare function parseEventDecl(s: TokenStream): AST.EventDeclNode;
export declare function parseConstraintDecl(s: TokenStream): AST.ConstraintDeclNode;
export declare function parsePolicyDecl(s: TokenStream): AST.PolicyDeclNode;
export declare function parseFlowDecl(s: TokenStream): AST.FlowDeclNode;
export declare function parseImportDecl(s: TokenStream): AST.ImportDeclNode;
export declare function parseExtensionPointDecl(s: TokenStream): AST.ExtensionPointDeclNode;
