// Shared helpers for -Image mode (ask-gpt / ask-gemini).
"use strict";
const fs = require("fs");
const path = require("path");

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
// File name only (no folders), default <tool>-<yyyyMMdd-HHmmss>.png
function outName(tool, opt) {
  const n = path.basename(String(opt || "").trim());
  return n && n !== "." && n !== ".." ? n : `${tool}-${stamp()}.png`;
}
// Real image = PNG / JPEG / WebP magic bytes and > 10 KB. Returns "" if ok, else the reason.
function checkImage(file) {
  let b;
  try { b = fs.readFileSync(file); } catch { return "file was not created"; }
  if (b.length <= 10 * 1024) return `file too small: ${b.length} bytes`;
  const png = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const webp = b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
  return png || jpg || webp ? "" : "not a PNG/JPEG/WebP file";
}
// Image mode runs the CLI in a fresh EMPTY temp folder, so it can't touch the project and an old file can't pass as new.
function workDir() { return fs.mkdtempSync(path.join(require("os").tmpdir(), "ai-team-img-")); }
// Copy the checked image into the user's folder without overwriting anything; returns the final path.
function deliver(src, dir, name) {
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  // COPYFILE_EXCL: fails instead of overwriting if another call took the name first; then try the next name.
  for (let i = 1; i < 1000; i++) {
    const dest = path.join(dir, i === 1 ? name : `${base}-${i}${ext}`);
    try { fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL); return dest; }
    catch (e) { if (e.code !== "EEXIST") throw e; }
  }
  throw new Error("no free file name for " + name);
}
function cleanup(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
module.exports = { outName, checkImage, workDir, deliver, cleanup };
