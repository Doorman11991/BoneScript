/**
 * bonec test [output-dir]
 * Run the generated regression test suite against a live server.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export async function runTest(args: string[]): Promise<void> {
  const outputDir = args[0] ? path.resolve(args[0]) : path.resolve("output");
  const testFile = path.join(outputDir, "src", "tests.ts");

  try {
    await fs.promises.access(testFile);
  } catch {
    console.error(`No test file found at ${testFile}`);
    console.error("Run 'bonec compile <file>' first to generate tests.");
    process.exit(1);
  }

  console.log(`Running BoneScript regression tests...`);
  console.log(`Test file: ${testFile}`);
  console.log(`Target: ${process.env.TEST_BASE_URL || "http://localhost:3000"}`);
  console.log(``);

  try {
    execSync(`npx ts-node ${testFile}`, {
      cwd: outputDir,
      stdio: "inherit",
      env: { ...process.env },
    });
  } catch {
    process.exit(1);
  }
}
