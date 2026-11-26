"use strict";
// Install / uninstall round-trip in a throwaway fake home. No real CLIs, no network, never touches the real home.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const IS_WIN = process.platform === "win32";
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ai-team-inst-"));
const TEAM = path.join(HOME, ".ai-team");
const BACKUP = path.join(TEAM, "backup");
test.after(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {} });

const ORIG = {
  claudeMd: "# mine\n",
  settings: '{"model":"opus"}',
  toml: 'model = "x"\n',
};
const P = {
  claudeMd: path.join(HOME, ".claude", "CLAUDE.md"),
  settings: path.join(HOME, ".claude", "settings.json"),
  toml: path.join(HOME, ".codex", "config.toml"),
};

const env = { ...process.env, AI_TEAM_HOME: HOME };
function node(script, extra = []) {
  // --no-detect is passed only when install.js knows it (older installers would just ignore it, but stay strict)
  return spawnSync(process.execPath, [path.join(ROOT, script), "--home", HOME, ...extra], { env, encoding: "utf8", windowsHide: true });
}
const install = () => {
  const known = /no-?detect/i.test(fs.readFileSync(path.join(ROOT, "install.js"), "utf8"));
  return node("install.js", ["--no-path", ...(known ? ["--no-detect"] : [])]);
};
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const backups = () => (fs.existsSync(BACKUP) ? fs.readdirSync(BACKUP).sort() : []);

test("setup fake home", () => {
  fs.mkdirSync(path.dirname(P.claudeMd), { recursive: true });
  fs.mkdirSync(path.dirname(P.toml), { recursive: true });
  fs.mkdirSync(path.join(HOME, ".gemini", "config"), { recursive: true });
  fs.writeFileSync(P.claudeMd, ORIG.claudeMd);
  fs.writeFileSync(P.settings, ORIG.settings);
  fs.writeFileSync(P.toml, ORIG.toml);
});

test("install: first run works, shims exist and are runnable", () => {
  const r = install();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const n of ["ask-gpt", "ask-gemini", "ask-claude", "ask-team", "set-team", "set-mode", "list-models"]) {
    const f = path.join(TEAM, "bin", n + (IS_WIN ? ".cmd" : ""));
    assert.ok(fs.existsSync(f), "missing shim " + f);
    if (!IS_WIN) assert.ok(fs.statSync(f).mode & 0o100, "shim not executable: " + f);
  }
});

test("install: second run is a no-op (no new backup dir)", () => {
  const before = backups();
  assert.ok(before.length >= 1, "first run should have backed up the pre-existing files");
  const r = install();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(backups(), before);
});

test("install: no unfilled placeholders, our block is there exactly once, user text kept", () => {
  for (const f of walk(HOME)) {
    if (f.startsWith(BACKUP + path.sep)) continue;
    const t = fs.readFileSync(f, "utf8");
    for (const bad of ["{{", "{LEAD}", "{SELF}"]) {
      // lib/*.js is our own code and may contain "{{" in object literals; only check installed docs/config
      if (/\.js$/.test(f) && bad === "{{") continue;
      assert.ok(!t.includes(bad), `${bad} left in ${f}`);
    }
  }
  const md = fs.readFileSync(P.claudeMd, "utf8");
  assert.ok(md.includes("# mine"));
  assert.equal((md.match(/AI-TEAM START/g) || []).length, 1);
  assert.equal((md.match(/AI-TEAM END/g) || []).length, 1);
  assert.ok(fs.existsSync(path.join(HOME, ".gemini", "config", "plugins", "ai-team")));
  assert.ok(fs.readdirSync(path.join(HOME, ".agents", "skills")).some((n) => n.startsWith("ai-team-")));
});

test("installed set-mode shim runs against the fake home", () => {
  const shim = path.join(TEAM, "bin", "set-mode" + (IS_WIN ? ".cmd" : ""));
  const r = IS_WIN
    ? spawnSync(`"${shim}" eco`, { env, encoding: "utf8", shell: true, windowsHide: true })
    : spawnSync(shim, ["eco"], { env, encoding: "utf8" });
  assert.match(r.stdout, /SAVED/, r.stdout + r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(TEAM, "config.json"), "utf8")).mode, "eco");
});

test("uninstall: pre-existing files byte-identical, ai-team pieces gone", () => {
  const r = node("uninstall.js");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const k of Object.keys(P)) assert.equal(fs.readFileSync(P[k], "utf8"), ORIG[k], k + " not restored");
  const skillRoots = [path.join(HOME, ".agents", "skills"), path.join(HOME, ".gemini", "config", "skills"), path.join(HOME, ".claude", "commands")];
  for (const d of skillRoots) if (fs.existsSync(d)) assert.deepEqual(fs.readdirSync(d).filter((n) => n.startsWith("ai-team-")), [], d);
  assert.ok(!fs.existsSync(path.join(HOME, ".gemini", "config", "plugins", "ai-team")));
  assert.ok(!fs.existsSync(path.join(TEAM, "bin")));
  assert.ok(!fs.existsSync(path.join(TEAM, "lib")));
});
