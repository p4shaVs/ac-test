// Parses every .lua file under the given roots with luaparse (Lua 5.3 grammar,
// which also accepts FiveM's integer/float literals and `//`). FiveM's CfxLua
// adds a few extensions (backtick hashes, compound assignment `+=`, safe
// navigation `?.`); files using those would be reported, so we list them
// separately instead of failing the run.
const fs = require("fs");
const path = require("path");
const luaparse = require("luaparse");

const roots = process.argv.slice(2);
let files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".lua")) files.push(p);
  }
}
roots.forEach(walk);

let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  try {
    luaparse.parse(src, { luaVersion: "5.3", comments: false, locations: false });
  } catch (e) {
    bad++;
    console.log(`✗ ${path.relative(process.cwd(), f)}: ${e.message}`);
  }
}
console.log(`${files.length - bad}/${files.length} Lua files parse cleanly`);
process.exit(bad ? 1 : 0);
