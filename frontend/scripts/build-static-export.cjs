/**
 * Build static Next.js export for embedding in the Windows Server .exe.
 * Temporarily copies aside middleware + App Router API (unsupported by output: "export"),
 * then restores them after the build.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const stashDir = path.join(root, ".export-stash");

const items = [
  {
    from: path.join(root, "src", "middleware.ts"),
    stashName: "middleware.ts",
    kind: "file",
  },
  {
    from: path.join(root, "src", "app", "api"),
    stashName: "api",
    kind: "dir",
  },
];

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function copyRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function stashAway() {
  fs.mkdirSync(stashDir, { recursive: true });
  for (const item of items) {
    if (!exists(item.from)) continue;
    const dest = path.join(stashDir, item.stashName);
    if (exists(dest)) fs.rmSync(dest, { recursive: true, force: true });
    copyRecursive(item.from, dest);
    fs.rmSync(item.from, { recursive: true, force: true });
    console.log(`[build-static-export] stashed ${item.from}`);
  }
}

function restore() {
  for (const item of items) {
    const src = path.join(stashDir, item.stashName);
    if (!exists(src)) continue;
    if (exists(item.from)) fs.rmSync(item.from, { recursive: true, force: true });
    copyRecursive(src, item.from);
    console.log(`[build-static-export] restored ${item.from}`);
  }
  try {
    fs.rmSync(stashDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

stashAway();
// Desktop UI is served by FastAPI on the same origin as /api.
// NEVER bake NEXT_PUBLIC_API_URL (frontend/.env often has localhost:8001 for Next
// dev). That breaks Edge/WebView when the page is opened as http://127.0.0.1:8001
// (localhost ≠ 127.0.0.1 → CORS / Failed to fetch on setup/login).
const env = {
  ...process.env,
  NEXT_OUTPUT: "export",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_API_URL: "",
  BACKEND_URL: "",
};
console.log(
  "[build-static-export] NEXT_PUBLIC_API_URL forced empty (same-origin /api)"
);
let status = 1;
try {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "build"],
    { cwd: root, env, stdio: "inherit", shell: true }
  );
  status = result.status == null ? 1 : result.status;
} finally {
  restore();
}

if (status !== 0) {
  process.exit(status);
}

const outDir = path.join(root, "out");
if (!exists(path.join(outDir, "index.html"))) {
  console.error("[build-static-export] missing out/index.html");
  process.exit(1);
}

// Guard: refuse shipping a desktop UI that still points absolute API calls at localhost.
// (UI copy like "http://127.0.0.1:8001/" in help text is OK; fetch(.../api) is not.)
const chunksDir = path.join(outDir, "_next", "static", "chunks");
if (exists(chunksDir)) {
  const bad = [];
  const markers = [
    "http://localhost:8001/api",
    "http://127.0.0.1:8001/api",
    "https://localhost:8001/api",
    "https://127.0.0.1:8001/api",
  ];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".js")) {
        const txt = fs.readFileSync(p, "utf8");
        if (markers.some((m) => txt.includes(m))) {
          bad.push(path.relative(outDir, p));
        }
      }
    }
  };
  walk(chunksDir);
  if (bad.length) {
    console.error(
      "[build-static-export] REFUSING desktop build: absolute /api URL still baked into:"
    );
    for (const f of bad.slice(0, 12)) console.error("  -", f);
    console.error(
      "Fix: ensure NEXT_PUBLIC_API_URL is empty during build:desktop (do not use frontend/.env)."
    );
    process.exit(1);
  }
}

console.log(`[build-static-export] OK → ${outDir}`);
