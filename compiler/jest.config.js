/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: "./tsconfig.test.json",
    }],
  },
  // Run in-band (no worker processes) so NODE_OPTIONS heap size applies.
  // Pass --runInBand on the CLI (see package.json test:jest script).
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/test.ts",
    "!src/test_typechecker.ts",
    "!src/cli.ts",
    "!src/commands/**",
  ],
  coverageReporters: ["text", "lcov"],
  verbose: true,
};
