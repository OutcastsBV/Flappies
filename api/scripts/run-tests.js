const { spawnSync } = require("child_process");
const { globSync } = require("fs");
const path = require("path");

const files = globSync("tests/**/*.test.js", {
  cwd: path.join(__dirname, ".."),
  absolute: true,
});

if (files.length === 0) {
  console.error("No test files found");
  process.exit(1);
}

// Force serial execution: e2e/http tests each reset the shared test database
// schema in their own `before` hook, so running them concurrently races and
// corrupts each other's schema state.
const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", ...files],
  {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  }
);

process.exit(result.status ?? 1);
