"use strict";
/**
 * BoneScript compiler CLI
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const lexer_1 = require("./lexer");
const parser_1 = require("./parser");
const parser_recovery_1 = require("./parser_recovery");
const typechecker_1 = require("./typechecker");
const lowering_1 = require("./lowering");
const solver_1 = require("./solver");
const emit_full_1 = require("./emit_full");
const emit_nakama_1 = require("./emit_nakama");
const verifier_1 = require("./verifier");
const module_loader_1 = require("./module_loader");
const formatter_1 = require("./formatter");
const scaffold_1 = require("./scaffold");
const extension_manager_1 = require("./extension_manager");
const optimizer_1 = require("./optimizer");
function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
        showHelp();
        return;
    }
    const command = args[0];
    switch (command) {
        case "compile":
            requireFile(args[1], (src, res) => runCompile(src, res, args.slice(2)));
            break;
        case "lex":
            requireFile(args[1], runLex);
            break;
        case "parse":
            requireFile(args[1], runParse);
            break;
        case "ir":
            requireFile(args[1], runIR);
            break;
        case "check":
            requireFile(args[1], runCheck);
            break;
        case "fmt":
            requireFile(args[1], runFormat);
            break;
        case "watch":
            requireFile(args[1], runWatch);
            break;
        case "init":
            runInit(args.slice(1));
            break;
        case "diff":
            runDiff(args.slice(1));
            break;
        case "debug":
            requireFile(args[1], runDebug);
            break;
        case "test":
            runTest(args.slice(1));
            break;
        case "verify-determinism":
            requireFile(args[1], runVerifyDeterminism);
            break;
        default:
            console.error(`Unknown command: ${command}`);
            showHelp();
            process.exit(1);
    }
}
function showHelp() {
    console.log("BoneScript compiler v0.5.4");
    console.log("");
    console.log("Usage:");
    console.log("  bonec compile <file> [--target <target>]  Compile to runnable project");
    console.log("  bonec check <file>     Lex + parse + type check (no codegen)");
    console.log("  bonec lex <file>       Show token stream");
    console.log("  bonec parse <file>     Show AST");
    console.log("  bonec ir <file>        Show IR (JSON)");
    console.log("  bonec fmt <file>       Format file in place");
    console.log("  bonec watch <file>     Recompile on change");
    console.log("  bonec diff <old.bone> <new.bone>  Show schema migration diff");
    console.log("");
    console.log("compile options:");
    console.log("  --target <name>        Output target (default: express)");
    console.log("                         Options: express, nakama");
    console.log("");
    console.log("init options:");
    console.log("  bonec init <name> --domain <name>  Scaffold from a domain template");
    console.log("  --domain <name>        Domain template (default: saas_platform)");
    console.log("                         Options: multiplayer_game, saas_platform, iot_system,");
    console.log("                                  social_network, marketplace, realtime_collaboration");
    console.log("  --out <dir>            Output directory (default: current dir)");
}
function requireFile(filePath, action) {
    if (!filePath) {
        console.error("Error: No input file specified.");
        process.exit(1);
    }
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
        console.error(`Error: File not found: ${resolved}`);
        process.exit(1);
    }
    const source = fs.readFileSync(resolved, "utf-8");
    action(source, resolved);
}
// â”€â”€â”€ Lex â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function runLex(source) {
    try {
        const tokens = new lexer_1.Lexer(source).tokenize();
        console.log(JSON.stringify(tokens, null, 2));
        console.log(`\nv ${tokens.length} tokens produced.`);
    }
    catch (e) {
        console.error(`x ${e.message}`);
        process.exit(1);
    }
}
// â”€â”€â”€ Parse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function runParse(source) {
    try {
        const tokens = new lexer_1.Lexer(source).tokenize();
        const result = new parser_recovery_1.RecoveringParser(tokens).parse();
        if (result.errors.length > 0) {
            console.error(`x ${result.errors.length} parse error(s):`);
            for (const e of result.errors)
                console.error(`  ${e.message}`);
            if (!result.ast)
                process.exit(1);
        }
        console.log(JSON.stringify(result.ast, null, 2));
        console.log(`\nv Parsed ${result.ast?.systems.length || 0} system(s).`);
    }
    catch (e) {
        console.error(`x ${e.message}`);
        process.exit(1);
    }
}
// â”€â”€â”€ IR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function runIR(source) {
    try {
        const tokens = new lexer_1.Lexer(source).tokenize();
        const ast = new parser_1.Parser(tokens).parse();
        const sourceHash = (0, crypto_1.createHash)("sha256").update(source).digest("hex").slice(0, 16);
        const irSystems = new lowering_1.Lowering().lower(ast, sourceHash);
        console.log(JSON.stringify(irSystems, null, 2));
        console.log(`\nv Lowered to ${irSystems.length} IR system(s).`);
    }
    catch (e) {
        console.error(`x ${e.message}`);
        process.exit(1);
    }
}
// â”€â”€â”€ Check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function runCheck(source) {
    const tokens = new lexer_1.Lexer(source).tokenize();
    const result = new parser_recovery_1.RecoveringParser(tokens).parse();
    let totalErrors = 0;
    if (result.errors.length > 0) {
        for (const e of result.errors) {
            console.error(`  parse: ${e.message}`);
            totalErrors++;
        }
    }
    if (result.ast) {
        const typeErrors = new typechecker_1.TypeChecker().check(result.ast);
        for (const err of typeErrors) {
            console.error(`  type:  ${err.code} at ${err.loc.line}:${err.loc.column}: ${err.message}`);
            totalErrors++;
        }
    }
    if (totalErrors === 0) {
        console.log("v Check passed (0 errors)");
    }
    else {
        console.log(`x ${totalErrors} error(s) found.`);
        process.exit(1);
    }
}
// â”€â”€â”€ Format â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function runFormat(source, resolved) {
    try {
        const tokens = new lexer_1.Lexer(source).tokenize();
        const ast = new parser_1.Parser(tokens).parse();
        const formatted = new formatter_1.Formatter().format(ast);
        fs.writeFileSync(resolved, formatted, "utf-8");
        console.log(`v Formatted ${resolved}`);
    }
    catch (e) {
        console.error(`x ${e.message}`);
        process.exit(1);
    }
}
// â”€â”€â”€ Watch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function runWatch(_source, resolved) {
    console.log(`Watching ${resolved}...`);
    const compile = () => {
        try {
            const fresh = fs.readFileSync(resolved, "utf-8");
            console.log(`\n[${new Date().toLocaleTimeString()}] Compiling...`);
            runCompile(fresh, resolved);
        }
        catch (e) {
            console.error(`x ${e.message}`);
        }
    };
    compile();
    fs.watchFile(resolved, { interval: 500 }, (curr, prev) => {
        if (curr.mtimeMs !== prev.mtimeMs)
            compile();
    });
}
// â”€â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function runInit(args) {
    if (args.length === 0) {
        console.error("Error: bone init requires a project name.");
        console.error("Example: bone init my-project --domain saas_platform");
        process.exit(1);
    }
    const name = args[0];
    let domain = "saas_platform";
    let outDir = path.resolve(name);
    for (let i = 1; i < args.length; i++) {
        if (args[i] === "--domain" && args[i + 1]) {
            domain = args[i + 1];
            i++;
        }
        else if (args[i] === "--out" && args[i + 1]) {
            outDir = path.resolve(args[i + 1]);
            i++;
        }
    }
    const validDomains = [
        "multiplayer_game", "saas_platform", "iot_system",
        "social_network", "marketplace", "realtime_collaboration",
    ];
    if (!validDomains.includes(domain)) {
        console.error(`Error: Invalid domain '${domain}'. Valid: ${validDomains.join(", ")}`);
        process.exit(1);
    }
    const result = (0, scaffold_1.scaffold)({ name, domain, outDir });
    console.log(`v Created ${result.created.length} file(s):`);
    for (const f of result.created)
        console.log(`  ${f}`);
    console.log(`\nNext steps:`);
    console.log(`  cd ${outDir}`);
    console.log(`  bone compile ${name}.bone`);
}
// â”€â”€â”€ Compile (full pipeline) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function runCompile(source, resolved, extraArgs = []) {
    // Parse --target flag (default: express)
    let target = "express";
    for (let i = 0; i < extraArgs.length; i++) {
        if (extraArgs[i] === "--target" && extraArgs[i + 1]) {
            const t = extraArgs[i + 1];
            if (t !== "express" && t !== "nakama") {
                console.error(`Unknown target '${t}'. Valid targets: express, nakama`);
                process.exit(1);
            }
            target = t;
            i++;
        }
    }
    if (target === "nakama") {
        runCompileNakama(source, resolved);
        return;
    }
    try {
        const tokens = new lexer_1.Lexer(source).tokenize();
        console.log(`  [1/7] Lexed: ${tokens.length} tokens`);
        // Use module loader to handle imports
        const loader = new module_loader_1.ModuleLoader();
        const loadResult = loader.load(resolved);
        if (loadResult.errors.length > 0) {
            console.log(`  [2/7] Parse: ${loadResult.errors.length} error(s)`);
            for (const e of loadResult.errors.slice(0, 10)) {
                console.log(`         ${path.basename(e.file)}: ${e.error.message}`);
            }
            if (!loadResult.ast)
                process.exit(1);
        }
        else {
            const sysCount = loadResult.ast?.systems.length || 0;
            console.log(`  [2/7] Parsed: ${sysCount} system(s) from ${loadResult.loadedFiles.length} file(s)`);
        }
        const ast = loadResult.ast;
        for (const sys of ast.systems) {
            console.log(`         System '${sys.name}':`);
            const counts = {};
            for (const d of sys.declarations)
                counts[d.kind] = (counts[d.kind] || 0) + 1;
            for (const [kind, count] of Object.entries(counts)) {
                console.log(`           ${kind}: ${count}`);
            }
        }
        // Stage 3: Type Check
        const checker = new typechecker_1.TypeChecker();
        const typeErrors = checker.check(ast);
        if (typeErrors.length > 0) {
            console.log(`  [3/7] Type check: ${typeErrors.length} error(s)`);
            for (const err of typeErrors) {
                console.log(`         ${err.code} at ${err.loc.line}:${err.loc.column}: ${err.message}`);
            }
        }
        else {
            console.log(`  [3/7] Type check: v (0 errors)`);
        }
        // Stage 4: Lower to IR
        const sourceHash = (0, crypto_1.createHash)("sha256").update(source).digest("hex").slice(0, 16);
        const lowering = new lowering_1.Lowering();
        const irSystems = lowering.lower(ast, sourceHash);
        const totalModules = irSystems.reduce((sum, s) => sum + s.modules.length, 0);
        const totalEvents = irSystems.reduce((sum, s) => sum + s.events.length, 0);
        const totalFlows = irSystems.reduce((sum, s) => sum + s.flows.length, 0);
        console.log(`  [4/7] Lower to IR: ${totalModules} modules, ${totalEvents} events, ${totalFlows} flows`);
        for (const sys of irSystems) {
            for (const mod of sys.modules) {
                const methodCount = mod.interfaces.reduce((s, i) => s + i.methods.length, 0);
                console.log(`         ${mod.kind.padEnd(16)} ${mod.name.padEnd(24)} (${methodCount} methods, ${mod.models.length} models)`);
            }
        }
        // Stage 4.5: IR Optimization
        for (let i = 0; i < irSystems.length; i++) {
            const result = (0, optimizer_1.optimize)(irSystems[i]);
            irSystems[i] = result.system;
            if (result.log.length > 0) {
                console.log(`  [4.5] IR optimize: ${result.modulesRemoved} modules removed, ${result.eventsDeduped} events deduped, ${result.depsRemoved} deps minimized`);
            }
        }
        // Stage 5: Constraint Solve
        const solver = new solver_1.ConstraintSolver();
        let totalResolved = 0;
        for (const sys of irSystems) {
            const result = solver.solve(sys);
            sys.resolution = result.resolution;
            totalResolved += Object.keys(result.resolution).length;
            if (result.errors.length > 0) {
                console.log(`  [5/7] Constraint solve: ${result.errors.length} error(s)`);
                for (const err of result.errors)
                    console.log(`         x ${err}`);
            }
            else {
                console.log(`  [5/7] Constraint solve: v (${totalResolved} resolved, ${result.assumptions.length} assumptions)`);
                for (const a of result.assumptions.slice(0, 5))
                    console.log(`         ${a}`);
                if (result.assumptions.length > 5)
                    console.log(`         ... and ${result.assumptions.length - 5} more`);
            }
        }
        // Stage 6: Code Emit
        const emitter = new emit_full_1.FullEmitter();
        const allFiles = [];
        for (const sys of irSystems) {
            const files = emitter.emit(sys);
            allFiles.push(...files);
        }
        console.log(`  [6/7] Code emit: ${allFiles.length} files generated`);
        const byLang = {};
        for (const f of allFiles)
            byLang[f.language] = (byLang[f.language] || 0) + 1;
        for (const [lang, count] of Object.entries(byLang)) {
            console.log(`         ${lang}: ${count} file(s)`);
        }
        // Stage 7: Verify
        const verifier = new verifier_1.Verifier();
        const verifyResult = verifier.verify(irSystems[0], allFiles);
        const errCount = verifyResult.issues.filter(i => i.severity === "error").length;
        const warnCount = verifyResult.issues.filter(i => i.severity === "warning").length;
        if (verifyResult.passed) {
            console.log(`  [7/7] Verify: v (${allFiles.length} files, ${warnCount} warnings)`);
        }
        else {
            console.log(`  [7/7] Verify: FAILED (${errCount} errors, ${warnCount} warnings)`);
        }
        for (const issue of verifyResult.issues.slice(0, 10)) {
            const icon = issue.severity === "error" ? "x" : "!";
            console.log(`         ${icon} ${issue.code}: ${issue.message}`);
        }
        // Write output — merge extension point implementations from existing files
        const outputDir = path.resolve(path.dirname(resolved), "output");
        const allExtensions = irSystems.flatMap(s => s.extension_points || []);
        let extensionErrors = [];
        for (const f of allFiles) {
            const outPath = path.join(outputDir, f.path);
            const dir = path.dirname(outPath);
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir, { recursive: true });
            // For extensions.ts: merge preserved implementations
            if (f.path === "src/extensions.ts" && allExtensions.length > 0) {
                const astExtensions = ast.systems.flatMap(s => s.declarations.filter((d) => d.kind === "ExtensionPointDecl"));
                const { content, validationErrors } = (0, extension_manager_1.mergeWithExisting)(f.content, outPath, astExtensions);
                for (const e of validationErrors)
                    extensionErrors.push(e.message);
                fs.writeFileSync(outPath, content, "utf-8");
            }
            else {
                fs.writeFileSync(outPath, f.content, "utf-8");
            }
        }
        if (extensionErrors.length > 0) {
            console.log(`\n  Extension point errors:`);
            for (const e of extensionErrors)
                console.log(`    x ${e}`);
            process.exit(1);
        }
        console.log(`\nv Compilation complete. ${allFiles.length} files written to output/`);
    }
    catch (e) {
        console.error(`x ${e.message}`);
        process.exit(1);
    }
}
main();
// ─── Compile (Nakama target) ──────────────────────────────────────────────────
function runCompileNakama(source, resolved) {
    try {
        const tokens = new lexer_1.Lexer(source).tokenize();
        console.log(`  [1/5] Lexed: ${tokens.length} tokens`);
        const loader = new module_loader_1.ModuleLoader();
        const loadResult = loader.load(resolved);
        if (loadResult.errors.length > 0) {
            for (const e of loadResult.errors.slice(0, 10)) {
                console.log(`         ${path.basename(e.file)}: ${e.error.message}`);
            }
            if (!loadResult.ast)
                process.exit(1);
        }
        const ast = loadResult.ast;
        console.log(`  [2/5] Parsed: ${ast.systems.length} system(s)`);
        const typeErrors = new typechecker_1.TypeChecker().check(ast);
        if (typeErrors.length > 0) {
            for (const err of typeErrors) {
                console.log(`         ${err.code} at ${err.loc.line}:${err.loc.column}: ${err.message}`);
            }
        }
        else {
            console.log(`  [3/5] Type check: v (0 errors)`);
        }
        const sourceHash = (0, crypto_1.createHash)("sha256").update(source).digest("hex").slice(0, 16);
        const irSystems = new lowering_1.Lowering().lower(ast, sourceHash);
        console.log(`  [4/5] Lowered to IR: ${irSystems.reduce((s, sys) => s + sys.modules.length, 0)} modules`);
        const emitter = new emit_nakama_1.NakamaEmitter();
        const allFiles = [];
        for (const sys of irSystems) {
            allFiles.push(...emitter.emit(sys));
        }
        console.log(`  [5/5] Nakama emit: ${allFiles.length} files`);
        const outputDir = path.resolve(path.dirname(resolved), "output-nakama");
        for (const f of allFiles) {
            const outPath = path.join(outputDir, f.path);
            const dir = path.dirname(outPath);
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(outPath, f.content, "utf-8");
        }
        console.log(`\nv Nakama compilation complete. ${allFiles.length} files written to output-nakama/`);
        console.log(`\nNext steps:`);
        console.log(`  cd output-nakama && npm install && npm run build`);
        console.log(`  # Copy build/ to your Nakama runtime path`);
    }
    catch (e) {
        console.error(`x ${e.message}`);
        process.exit(1);
    }
}
// ─── Diff ─────────────────────────────────────────────────────────────────────
function runDiff(args) {
    if (args.length < 2) {
        console.error("Usage: bone diff <old.bone> <new.bone>");
        process.exit(1);
    }
    const [oldFile, newFile] = args;
    const compileToIR = (filePath) => {
        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) {
            console.error(`File not found: ${resolved}`);
            process.exit(1);
        }
        const source = fs.readFileSync(resolved, "utf-8");
        const tokens = new lexer_1.Lexer(source).tokenize();
        const ast = new parser_1.Parser(tokens).parse();
        const hash = (0, crypto_1.createHash)("sha256").update(source).digest("hex").slice(0, 16);
        return new lowering_1.Lowering().lower(ast, hash);
    };
    const oldIR = compileToIR(oldFile);
    const newIR = compileToIR(newFile);
    const oldModels = [];
    const newModels = [];
    for (const sys of oldIR)
        for (const mod of sys.modules)
            for (const m of mod.models)
                oldModels.push(m);
    for (const sys of newIR)
        for (const mod of sys.modules)
            for (const m of mod.models)
                newModels.push(m);
    const oldByName = new Map(oldModels.map(m => [m.name, m]));
    const newByName = new Map(newModels.map(m => [m.name, m]));
    const statements = [];
    // New tables
    for (const [name, model] of newByName) {
        if (!oldByName.has(name)) {
            statements.push(`-- NEW TABLE: ${name}`);
            statements.push(`-- Run: bone compile ${newFile} (generates full migration)`);
        }
    }
    // Removed tables
    for (const [name] of oldByName) {
        if (!newByName.has(name)) {
            const table = name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase() + "s";
            statements.push(`-- WARNING: Table '${table}' removed from schema`);
            statements.push(`-- Manual: ALTER TABLE ${table} ... (or DROP TABLE ${table})`);
        }
    }
    // Modified tables
    for (const [name, newModel] of newByName) {
        const oldModel = oldByName.get(name);
        if (!oldModel)
            continue;
        const table = name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase() + "s";
        const oldFields = new Map(oldModel.fields.map((f) => [f.name, f]));
        const newFields = new Map(newModel.fields.map((f) => [f.name, f]));
        const sqlTypeMap = {
            string: "VARCHAR", uint: "BIGINT", int: "BIGINT", float: "DOUBLE PRECISION",
            bool: "BOOLEAN", timestamp: "TIMESTAMPTZ", uuid: "UUID", bytes: "BYTEA", json: "JSONB",
        };
        for (const [fname, field] of newFields) {
            if (!oldFields.has(fname)) {
                const sqlType = sqlTypeMap[field.type] || "JSONB";
                statements.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${fname} ${sqlType};`);
            }
        }
        for (const [fname] of oldFields) {
            if (!newFields.has(fname)) {
                statements.push(`-- WARNING: Column '${table}.${fname}' removed`);
                statements.push(`-- Manual: ALTER TABLE ${table} DROP COLUMN ${fname};`);
            }
        }
    }
    if (statements.length === 0) {
        console.log("No schema changes detected.");
    }
    else {
        console.log(`-- BoneScript schema diff: ${path.basename(oldFile)} → ${path.basename(newFile)}`);
        console.log(`-- Generated: ${new Date().toISOString()}`);
        console.log(``);
        console.log(statements.join("\n"));
    }
}
// ─── Debug ────────────────────────────────────────────────────────────────────
function runDebug(source, resolved) {
    try {
        const tokens = new lexer_1.Lexer(source).tokenize();
        const ast = new parser_1.Parser(tokens).parse();
        const sourceHash = (0, crypto_1.createHash)("sha256").update(source).digest("hex").slice(0, 16);
        const irSystems = new lowering_1.Lowering().lower(ast, sourceHash);
        const { emitSourceMapFile } = require("./emit_sourcemap");
        for (const sys of irSystems) {
            const mapContent = emitSourceMapFile(sys, path.basename(resolved));
            const mapPath = path.join(path.dirname(resolved), `${sys.name}.bone.map`);
            fs.writeFileSync(mapPath, mapContent, "utf-8");
            console.log(`v Source map written: ${mapPath}`);
            console.log(`  ${sys.modules.length} modules mapped`);
            console.log(`  Use output/src/debug.ts to get annotated runtime errors`);
        }
    }
    catch (e) {
        console.error(`x ${e.message}`);
        process.exit(1);
    }
}
// ─── Test ─────────────────────────────────────────────────────────────────────
function runTest(args) {
    const outputDir = args[0] ? path.resolve(args[0]) : path.resolve("output");
    const testFile = path.join(outputDir, "src", "tests.ts");
    if (!fs.existsSync(testFile)) {
        console.error(`No test file found at ${testFile}`);
        console.error("Run 'bone compile <file>' first to generate tests.");
        process.exit(1);
    }
    console.log(`Running BoneScript regression tests...`);
    console.log(`Test file: ${testFile}`);
    console.log(`Target: ${process.env.TEST_BASE_URL || "http://localhost:3000"}`);
    console.log(``);
    // Run the generated test file using ts-node
    const { execSync } = require("child_process");
    try {
        execSync(`npx ts-node ${testFile}`, {
            cwd: outputDir,
            stdio: "inherit",
            env: { ...process.env },
        });
    }
    catch {
        process.exit(1);
    }
}
// ─── Verify Determinism ───────────────────────────────────────────────────────
function runVerifyDeterminism(source, resolved) {
    console.log("Verifying compilation determinism...");
    const compile = () => {
        const tokens = new lexer_1.Lexer(source).tokenize();
        const ast = new parser_1.Parser(tokens).parse();
        const hash = (0, crypto_1.createHash)("sha256").update(source).digest("hex").slice(0, 16);
        const ir = new lowering_1.Lowering().lower(ast, hash);
        const emitter = new emit_full_1.FullEmitter();
        const files = [];
        for (const sys of ir) {
            for (const f of emitter.emit(sys)) {
                files.push({ path: f.path, content: f.content });
            }
        }
        // Sort for canonical comparison
        files.sort((a, b) => a.path.localeCompare(b.path));
        return JSON.stringify(files);
    };
    const run1 = compile();
    const run2 = compile();
    if (run1 === run2) {
        const hash = (0, crypto_1.createHash)("sha256").update(run1).digest("hex").slice(0, 16);
        console.log(`v Deterministic. Both runs produced identical output.`);
        console.log(`  Output hash: ${hash}`);
    }
    else {
        // Find first divergence
        const files1 = JSON.parse(run1);
        const files2 = JSON.parse(run2);
        for (let i = 0; i < Math.max(files1.length, files2.length); i++) {
            const f1 = files1[i];
            const f2 = files2[i];
            if (!f1 || !f2 || f1.path !== f2.path || f1.content !== f2.content) {
                console.error(`x NON-DETERMINISTIC: First divergence at file ${i}`);
                console.error(`  Run 1: ${f1?.path || "(missing)"}`);
                console.error(`  Run 2: ${f2?.path || "(missing)"}`);
                if (f1 && f2 && f1.path === f2.path) {
                    // Find first differing line
                    const lines1 = f1.content.split("\n");
                    const lines2 = f2.content.split("\n");
                    for (let j = 0; j < Math.max(lines1.length, lines2.length); j++) {
                        if (lines1[j] !== lines2[j]) {
                            console.error(`  First differing line ${j + 1}:`);
                            console.error(`    Run 1: ${lines1[j]}`);
                            console.error(`    Run 2: ${lines2[j]}`);
                            break;
                        }
                    }
                }
                process.exit(1);
            }
        }
    }
}
//# sourceMappingURL=cli.js.map