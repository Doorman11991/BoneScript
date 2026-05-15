/**
 * Marketplace integration test runner.
 * Generates a JWT, then runs the full test suite against the live server.
 */

import * as jwt from "jsonwebtoken";
import * as http from "http";

const BASE_URL = "http://localhost:3000";
const JWT_SECRET = "bonescript-dev-secret-change-in-production";

// Generate a test JWT
const token = jwt.sign({ sub: "test-user-id", role: "admin" }, JWT_SECRET, { expiresIn: "1h" });

process.env.TEST_BASE_URL = BASE_URL;
process.env.TEST_AUTH_TOKEN = token;

console.log("SimpleShop Integration Tests");
console.log("============================");
console.log(`Server: ${BASE_URL}`);
console.log(`Token: ${token.slice(0, 30)}...`);
console.log("");

// Run the generated test suite
require("./output/src/tests");
