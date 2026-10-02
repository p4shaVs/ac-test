// Loads the CoreAC server scripts (fxmanifest order) into a real Lua 5.4 VM with
// FiveM stubs, then runs a scenario file. Usage: node run.cjs <scenario.lua>
const fs = require("fs");
const path = require("path");
const { LuaFactory } = require("wasmoon");

const RES = path.join(__dirname, "..", "..", "fivem-resource", "coreac");

function serverScripts() {
  const m = fs.readFileSync(path.join(RES, "fxmanifest.lua"), "utf8");
  const block = m.slice(m.indexOf("server_scripts {"), m.indexOf("}", m.indexOf("server_scripts {")));
  return [...block.matchAll(/^\s*'([^']+\.lua)'/gm)].map((x) => x[1]);
}

(async () => {
  const lua = await new LuaFactory().createEngine({ injectObjects: false, enableProxy: false });
  lua.global.set("__jsprint", (s) => console.log(String(s)));
  // Scenarios using helpers.lua end with H.summary(), which sets the exit code through this.
  lua.global.set("__exit", (c) => { process.exitCode = Number(c) || 0; });
  await lua.doString(`local p = __jsprint; _G.print = function(...) local t = {} for i = 1, select('#', ...) do t[#t+1] = tostring(select(i, ...)) end p(table.concat(t, ' ')) end`);
  await lua.doString(fs.readFileSync(path.join(__dirname, process.env.CLIENT ? "prelude_client.lua" : "prelude.lua"), "utf8"));
  // Real (small) JSON — the preludes' stub returned '{}' for everything.
  await lua.doString(fs.readFileSync(path.join(__dirname, "json.lua"), "utf8"));

  const clientBase = ['config.lua','bridge/shared.lua','bridge/client.lua','bridge/weapon_data.lua','client/core.lua','client/legit_moves.lua'];
  const files = process.env.CLIENT ? clientBase.concat((process.env.CLIENT_FILES || 'client/godMode.lua,client/noclip.lua,client/teleport.lua').split(',')) : serverScripts();
  for (const f of files) {
    const src = fs.readFileSync(path.join(RES, f), "utf8");
    try {
      await lua.doString(`local chunk, err = load(${JSON.stringify(src)}, '@${f}')
if not chunk then error(err) end
local ok, e = pcall(chunk)
if not ok then SIM.err('load ${f}: ' .. tostring(e)) end`);
    } catch (e) {
      console.log("  !! LOAD FAIL", f, e.message);
    }
    if (f === "server/http.lua") {
      await lua.doString(`
CAC.request = function(path, method, body, cb)
  SIM.requests[#SIM.requests + 1] = { path = path, method = method, body = body }
  local h = SIM.api[path]
  if cb then
    if h then cb(h(body)) else cb(false, nil, 404) end
  end
end`);
    }
  }
  // Shared scenario helpers (server scenarios only; the client runner has its own prelude).
  if (!process.env.CLIENT && fs.existsSync(path.join(__dirname, "helpers.lua"))) {
    await lua.doString(fs.readFileSync(path.join(__dirname, "helpers.lua"), "utf8"));
  }
  const scenario = process.argv[2];
  await lua.doString(fs.readFileSync(path.resolve(__dirname, scenario), "utf8"));
  lua.global.close();
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });
