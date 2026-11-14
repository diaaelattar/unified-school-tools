"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const dirs = ["extension", "desktop/src", "mobile/src", "shared", "scripts", "tools"];
let checked = 0;
let errors = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "lib" || ent.name === "dist") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith(".js")) {
      checked++;
      try {
        execFileSync(process.execPath, ["--check", p], { stdio: "pipe" });
      } catch (err) {
        errors++;
        console.error("Syntax error:", p, err.stderr?.toString() || err.message);
      }
    }
  }
}

dirs.forEach(d => walk(path.join(root, d)));
console.log(`[lint] Checked ${checked} JS files, ${errors} syntax errors.`);
if (errors > 0) process.exit(1);
