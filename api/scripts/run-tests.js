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

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
});

process.exit(result.status ?? 1);
