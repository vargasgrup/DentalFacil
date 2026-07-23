#!/usr/bin/env node
/**
 * Fails if localStorage.getItem("access_token") appears outside allowlisted files.
 * Odontogram exceptions are documented in EXCEPCIONES_ODONTOGRAMA.md.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src");
const ALLOW = new Set([
  path.normalize("lib/api.ts"),
  path.normalize("lib/auth.tsx"),
]);

const PATTERN = /localStorage\.getItem\(\s*['"]access_token['"]\s*\)/g;

/** @type {{file: string, line: number}[]} */
const hits = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
    const rel = path.normalize(path.relative(ROOT, full));
    const text = fs.readFileSync(full, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (PATTERN.test(line)) {
        hits.push({ file: rel, line: i + 1 });
      }
      PATTERN.lastIndex = 0;
    });
  }
}

walk(ROOT);

const violations = hits.filter((h) => !ALLOW.has(h.file));

if (violations.length) {
  console.error("Forbidden direct access_token reads via localStorage:\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
  }
  console.error("\nUse getToken() from lib/api.ts.");
  process.exit(1);
}

console.log("OK: no unauthorized localStorage access_token reads.");
