// Builds installer-win/CoreAC-Setup.exe with the C# compiler that ships with
// Windows (.NET Framework 4.x, C# 5) — no SDK to install, and the exe runs on
// every Windows 10/11 / Server 2016+ machine without a runtime download.
//
//   npm run build:installer            build (Windows only)
//   npm run build:installer -- --render  also save screen snapshots to installer-win/obj/screens
//
// The exe is committed so panels on Linux can serve it too; rebuild it whenever
// installer-win/src changes (tools/sim/panel-checks.ts compares the version).
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const here = __dirname;
const obj = path.join(here, "obj");
const out = path.join(here, "CoreAC-Setup.exe");

if (process.platform !== "win32") {
  console.log("build:installer: skipped (needs Windows — the committed CoreAC-Setup.exe is used).");
  process.exit(0);
}

const windir = process.env.WINDIR || "C:\\Windows";
const fw = path.join(windir, "Microsoft.NET", "Framework64", "v4.0.30319");
const csc = path.join(fw, "csc.exe");
if (!fs.existsSync(csc)) {
  console.error("build:installer: csc.exe not found at " + csc + " (.NET Framework 4.x is part of Windows 10/11).");
  process.exit(1);
}

fs.mkdirSync(obj, { recursive: true });
const run = (args) => execFileSync(csc, ["/nologo", "/utf8output", "/codepage:65001", ...args], { stdio: "inherit", cwd: here });

// 1. icon
const iconGen = path.join(obj, "IconGen.exe");
run(["/target:exe", "/optimize+", "/out:" + iconGen, "/r:System.Drawing.dll", path.join(here, "tools", "IconGen.cs")]);
const ico = path.join(obj, "CoreAC.ico");
execFileSync(iconGen, [ico], { stdio: "inherit" });

// 2. app
const sources = fs.readdirSync(path.join(here, "src")).filter((f) => f.endsWith(".cs")).map((f) => path.join(here, "src", f));
run([
  "/target:winexe",
  "/optimize+",
  "/platform:anycpu",
  "/out:" + out,
  "/win32icon:" + ico,
  "/win32manifest:" + path.join(here, "app.manifest"),
  "/r:System.dll",
  "/r:System.Core.dll",
  "/r:System.Drawing.dll",
  "/r:System.Windows.Forms.dll",
  "/r:System.Net.Http.dll",
  "/r:System.IO.Compression.dll",
  "/r:System.IO.Compression.FileSystem.dll",
  "/r:System.Web.Extensions.dll",
  "/r:System.Management.dll",
  ...sources,
]);
console.log("built " + path.relative(process.cwd(), out) + " (" + Math.round(fs.statSync(out).size / 1024) + " KB)");

if (process.argv.includes("--render")) {
  const dir = path.join(obj, "screens");
  execFileSync(out, ["--render", dir], { stdio: "inherit" });
  console.log("screens: " + dir);
}
