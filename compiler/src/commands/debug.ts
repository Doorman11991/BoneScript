/**
 * bonec debug <file>
 * Generate source maps (.bone.map) for runtime error annotation.
 */

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { Lexer } from "../lexer";
import { Parser } from "../parser";
import { Lowering } from "../lowering";
import { emitSourceMapFile } from "../emit_sourcemap";

export async function runDebug(source: string, resolved: string): Promise<void> {
  try {
    const tokens = new Lexer(source).tokenize();
    const ast = new Parser(tokens).parse();
    const sourceHash = createHash("sha256").update(source).digest("hex").slice(0, 16);
    const irSystems = new Lowering().lower(ast, sourceHash);

    await Promise.all(irSystems.map(async sys => {
      const mapContent = emitSourceMapFile(sys, path.basename(resolved));
      const mapPath = path.join(path.dirname(resolved), `${sys.name}.bone.map`);
      await fs.promises.writeFile(mapPath, mapContent, "utf-8");
      console.log(`v Source map written: ${mapPath}`);
      console.log(`  ${sys.modules.length} modules mapped`);
      console.log(`  Use output/src/debug.ts to get annotated runtime errors`);
    }));
  } catch (e: any) {
    console.error(`x ${e.message}`);
    process.exit(1);
  }
}
