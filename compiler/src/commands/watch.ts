/**
 * bonec watch <file>
 * Recompile on every save.
 */

import * as fs from "fs";
import { runCompile } from "./compile";

export function runWatch(_source: string, resolved: string): void {
  console.log(`Watching ${resolved}...`);

  const compile = () => {
    fs.promises.readFile(resolved, "utf-8")
      .then(fresh => {
        console.log(`\n[${new Date().toLocaleTimeString()}] Compiling...`);
        return runCompile(fresh, resolved);
      })
      .catch((e: any) => console.error(`x ${e.message}`));
  };

  compile();
  fs.watchFile(resolved, { interval: 500 }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) compile();
  });
}
