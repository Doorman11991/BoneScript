/**
 * bonec init <name> [--domain <domain>] [--out <dir>]
 * Scaffold a new project from a domain template.
 */

import * as path from "path";
import { scaffold, ScaffoldDomain } from "../scaffold";

const VALID_DOMAINS: ScaffoldDomain[] = [
  "multiplayer_game", "saas_platform", "iot_system",
  "social_network", "marketplace", "realtime_collaboration",
];

export async function runInit(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.error("Error: bonec init requires a project name.");
    console.error("Example: bonec init my-project --domain saas_platform");
    process.exit(1);
  }

  const name = args[0];
  let domain: ScaffoldDomain = "saas_platform";
  let outDir = path.resolve(name);

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--domain" && args[i + 1]) {
      domain = args[i + 1] as ScaffoldDomain;
      i++;
    } else if (args[i] === "--out" && args[i + 1]) {
      outDir = path.resolve(args[i + 1]);
      i++;
    }
  }

  if (!VALID_DOMAINS.includes(domain)) {
    console.error(`Error: Invalid domain '${domain}'. Valid: ${VALID_DOMAINS.join(", ")}`);
    process.exit(1);
  }

  const result = await scaffold({ name, domain, outDir });
  console.log(`v Created ${result.created.length} file(s):`);
  for (const f of result.created) console.log(`  ${f}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${outDir}`);
  console.log(`  bonec compile ${name}.bone`);
}
