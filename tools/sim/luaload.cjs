// Compiles every .lua file with the REAL Lua 5.4 compiler (wasmoon) — stricter
// than luacheck.cjs, whose luaparse grammar accepts things Lua 5.4 rejects (for
// example an invalid string escape such as '\]', which stops a whole file from
// loading in FiveM). Nothing is executed; this is compile-only.
//
//   node tools/sim/luaload.cjs fivem-resource/coreac [more dirs…]
//
// Each file gets its own VM: one shared VM runs out of memory after ~90 files.
const fs = require("fs");
const path = require("path");
const { LuaFactory } = require("wasmoon");

const roots = process.argv.slice(2);
if (!roots.length) {
  console.error("usage: node luaload.cjs <dir> [dir…]");
  process.exit(2);
}
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".lua")) files.push(p);
  }
}
roots.forEach((r) => walk(path.resolve(r)));

(async () => {
  const factory = new LuaFactory();
  let bad = 0;
  for (const f of files) {
    const rel = path.relative(process.cwd(), f);
    let lua;
    try {
      lua = await factory.createEngine({ injectObjects: false, enableProxy: false });
      lua.global.set("__src", fs.readFileSync(f, "utf8"));
      lua.global.set("__name", "@" + rel);
      const err = await lua.doString("local fn, e = load(__src, __name); return e");
      if (err) {
        bad++;
        console.log(`✗ ${err}`);
      }
    } catch (e) {
      bad++;
      console.log(`✗ ${rel}: harness error — ${e.message}`);
    } finally {
      try { lua && lua.global.close(); } catch {}
    }
  }
  console.log(`${files.length - bad}/${files.length} Lua files compile under Lua 5.4`);
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(1);
});
