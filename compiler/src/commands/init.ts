/**
 * bonec init <name> [--domain <domain>] [--out <dir>] [--force]
 * Scaffold a new project from a domain template.
 */

import * as path from "path";
import * as fs from "fs";
import { scaffold, ScaffoldDomain } from "../scaffold";

const VALID_DOMAINS: ScaffoldDomain[] = [
  "multiplayer_game", "saas_platform", "iot_system",
  "social_network", "marketplace", "realtime_collaboration",
];

export async function runInit(args: string[]): Promise<void> {
  // --list: show available domains
  if (args.includes("--list") || args.includes("-l")) {
    console.log("Available domains:");
    for (const d of VALID_DOMAINS) console.log(`  ${d}`);
    return;
  }

  if (args.length === 0) {
    console.error("Error: bonec init requires a project name.");
    console.error("Example: bonec init my-project --domain saas_platform");
    console.error("         bonec init --list   (show available domains)");
    process.exit(1);
  }

  const name = args[0];
  let domain: ScaffoldDomain = "saas_platform";
  let outDir = path.resolve(name);
  let force = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--domain" && args[i + 1]) {
      domain = args[i + 1] as ScaffoldDomain;
      i++;
    } else if (args[i] === "--out" && args[i + 1]) {
      outDir = path.resolve(args[i + 1]);
      i++;
    } else if (args[i] === "--force" || args[i] === "-f") {
      force = true;
    }
  }

  if (!VALID_DOMAINS.includes(domain)) {
    console.error(`Error: Invalid domain '${domain}'. Valid: ${VALID_DOMAINS.join(", ")}`);
    process.exit(1);
  }

  // Check if output directory already has files (unless --force)
  if (!force) {
    try {
      const existing = await fs.promises.readdir(outDir);
      if (existing.length > 0) {
        console.error(`Error: Directory '${outDir}' already exists and is not empty.`);
        console.error(`Use --force to overwrite.`);
        process.exit(1);
      }
    } catch {
      // Directory doesn't exist — fine
    }
  }

  const result = await scaffold({ name, domain, outDir });
  console.log(`✓ Created ${result.created.length} file(s):`);
  for (const f of result.created) console.log(`  ${f}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${outDir}`);
  console.log(`  bonec compile ${name}.bone`);
}
