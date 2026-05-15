/**
 * BoneScript Package Emitter
 * Generates package.json and tsconfig.json for the output project.
 */

import * as IR from "./ir";
import { toSnakeCase } from "./lowering_helpers";

export function emitPackageJson(system: IR.IRSystem): string {
  const pkg = {
    name: toSnakeCase(system.name),
    version: system.version,
    private: true,
    scripts: {
      build: "tsc",
      start: "node dist/index.js",
      dev: "ts-node src/index.ts",
      migrate: "ts-node src/migrate.ts",
    },
    dependencies: {
      express: "4.18.2",
      pg: "8.11.3",
      ioredis: "5.3.2",
      ws: "8.16.0",
      uuid: "9.0.0",
      cors: "2.8.5",
      helmet: "7.1.0",
      "express-rate-limit": "7.1.5",
      jsonwebtoken: "9.0.2",
      dotenv: "16.3.1",
    },
    devDependencies: {
      "@types/express": "4.17.21",
      "@types/node": "18.19.0",
      "@types/pg": "8.10.9",
      "@types/ws": "8.5.10",
      "@types/cors": "2.8.17",
      "@types/jsonwebtoken": "9.0.5",
      "@types/uuid": "9.0.7",
      typescript: "5.3.3",
      "ts-node": "10.9.2",
    },
  };
  return JSON.stringify(pkg, null, 2);
}

export function emitTsConfig(): string {
  const cfg = {
    compilerOptions: {
      target: "ES2020",
      module: "commonjs",
      lib: ["ES2020"],
      outDir: "./dist",
      rootDir: "./src",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      sourceMap: true,
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"],
  };
  return JSON.stringify(cfg, null, 2);
}
