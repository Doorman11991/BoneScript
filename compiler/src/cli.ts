/**
 * BoneScript compiler CLI — dispatcher
 * Each command lives in its own file under commands/.
 */

import * as fs from "fs";
import * as path from "path";
import { runCompile }           from "./commands/compile";
import { runCheck }             from "./commands/check";
import { runLex }               from "./commands/lex";
import { runParse }             from "./commands/parse";
import { runIR }                from "./commands/ir";
import { runFormat }            from "./commands/fmt";
import { runWatch }             from "./commands/watch";
import { runInit }              from "./commands/init";
import { runDiff }              from "./commands/diff";
import { runDebug }             from "./commands/debug";
import { runTest }              from "./commands/test";
import { runVerifyDeterminism } from "./commands/verify_determinism";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read a file and pass its contents to an async action. */
async function requireFile(
  filePath: string | undefined,
  action: (source: string, resolved: string) => Promise<void> | void,
): Promise<void> {
  if (!filePath) {
    console.error("Error: No input file specified.");
    process.exit(1);
  }
  const resolved = path.resolve(filePath);
  try {
    await fs.promises.access(resolved);
  } catch {
    console.error(`Error: File not found: ${resolved}`);
    process.exit(1);
  }
  const source = await fs.promises.readFile(resolved, "utf-8");
  await action(source, resolved);
}

function showHelp(): void {
  console.log("BoneScript compiler v0.2.1");
  console.log("");
  console.log("Usage:");
  console.log("  bonec compile <file>                  Compile to runnable project");
  console.log("  bonec check <file>                    Lex + parse + type check (no codegen)");
  console.log("  bonec lex <file>                      Show token stream");
  console.log("  bonec parse <file>                    Show AST");
  console.log("  bonec ir <file>                       Show IR (JSON)");
  console.log("  bonec fmt <file>                      Format file in place");
  console.log("  bonec watch <file>                    Recompile on change");
  console.log("  bonec diff <old.bone> <new.bone>      Show schema migration diff");
  console.log("  bonec init <name> --domain <domain>   Scaffold from a domain template");
  console.log("  bonec test [output-dir]               Run generated regression tests");
  console.log("  bonec debug <file>                    Generate source maps");
  console.log("  bonec verify-determinism <file>       Confirm two compilations are identical");
  console.log("");
  console.log("Domain options: multiplayer_game, saas_platform, iot_system,");
  console.log("                social_network, marketplace, realtime_collaboration");
  console.log("  --out <dir>   Output directory for init (default: ./<name>)");
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    showHelp();
    return;
  }

  switch (args[0]) {
    case "compile":            await requireFile(args[1], runCompile); break;
    case "check":              await requireFile(args[1], (src) => runCheck(src)); break;
    case "lex":                await requireFile(args[1], (src) => runLex(src)); break;
    case "parse":              await requireFile(args[1], (src) => runParse(src)); break;
    case "ir":                 await requireFile(args[1], (src) => runIR(src)); break;
    case "fmt":                await requireFile(args[1], runFormat); break;
    case "watch":              await requireFile(args[1], runWatch); break;
    case "init":               await runInit(args.slice(1)); break;
    case "diff":               await runDiff(args.slice(1)); break;
    case "debug":              await requireFile(args[1], runDebug); break;
    case "test":               await runTest(args.slice(1)); break;
    case "verify-determinism": await requireFile(args[1], (src) => runVerifyDeterminism(src)); break;
    default:
      console.error(`Unknown command: ${args[0]}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(e => {
  console.error(`x Fatal: ${e.message}`);
  process.exit(1);
});
