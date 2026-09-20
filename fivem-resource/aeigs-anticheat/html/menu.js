// Core Shield — in-game admin panel (NUI).
//
// Pure UI. Every action and every data request goes to the server, which
// re-checks the admin's permission (server/live.lua) before doing anything.
//
// SECURITY: player names, reasons, messages and identifiers are attacker-
// controlled. Everything is built with DOM nodes + textContent — data never
// touches innerHTML.
"use strict";

let RES = "aeigs-anticheat";
let PERMS = {};
let SELF = 0;
let MENU_KEY = "";
let PLAYERS = [];
let TAB = "players";
let SELECTED = null;
let DETAIL = null;
let PFILTER = "";
let SPEC = { on: false, target: null };
let refreshTimer = null;
let searchTimer = null;
const tabRows = {};
const tabLoaded = {};
const tabErr = {};
const tabQuery = {};
const tabToken = {};
const R = {};

const $ = (id) => document.getElementById(id);
const arr = (v) => (Array.isArray(v) ? v : []);
const can = (p) => PERMS[p] === true;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(typeof kid === "object" ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const NS = "http://www.w3.org/2000/svg";
const ICONS = {
  users: [["path", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"], ["circle", { cx: 9, cy: 7, r: 4 }], ["path", "M22 21v-2a4 4 0 0 0-3-3.87"], ["path", "M16 3.13a4 4 0 0 1 0 7.75"]],
  user: [["path", "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"], ["circle", { cx: 12, cy: 7, r: 4 }]],
  ban: [["circle", { cx: 12, cy: 12, r: 10 }], ["path", "M4.93 4.93l14.14 14.14"]],
  kick: [["path", "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"], ["path", "M16 17l5-5-5-5"], ["path", "M21 12H9"]],
  warn: [["path", "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"], ["path", "M12 9v4"], ["path", "M12 17h.01"]],
  shield: [["path", "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"], ["path", "M12 8v4"], ["path", "M12 16h.01"]],
  shieldPlus: [["path", "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"], ["path", "M9 12h6"], ["path", "M12 9v6"]],
  list: [["path", "M8 6h13"], ["path", "M8 12h13"], ["path", "M8 18h13"], ["path", "M3 6h.01"], ["path", "M3 12h.01"], ["path", "M3 18h.01"]],
  server: [["rect", { x: 2, y: 3, width: 20, height: 8, rx: 2 }], ["rect", { x: 2, y: 13, width: 20, height: 8, rx: 2 }], ["path", "M6 7h.01"], ["path", "M6 17h.01"]],
  megaphone: [["path", "M3 11l18-5v12L3 14v-3z"], ["path", "M11.6 16.8a3 3 0 1 1-5.8-1.6"]],
  message: [["path", "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"]],
  close: [["path", "M18 6 6 18"], ["path", "M6 6l12 12"]],
  refresh: [["path", "M21 12a9 9 0 1 1-2.64-6.36"], ["path", "M21 3v6h-6"]],
  search: [["circle", { cx: 11, cy: 11, r: 8 }], ["path", "M21 21l-4.35-4.35"]],
  eye: [["path", "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"], ["circle", { cx: 12, cy: 12, r: 3 }]],
  heart: [["path", "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"]],
  goto: [["path", "M7 17 17 7"], ["path", "M7 7h10v10"]],
  bring: [["path", "M17 7 7 17"], ["path", "M17 17H7V7"]],
  lock: [["rect", { x: 3, y: 11, width: 18, height: 11, rx: 2 }], ["path", "M7 11V7a5 5 0 0 1 10 0v4"]],
  unlock: [["rect", { x: 3, y: 11, width: 18, height: 11, rx: 2 }], ["path", "M7 11V7a5 5 0 0 1 9.9-1"]],
  camera: [["path", "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"], ["circle", { cx: 12, cy: 13, r: 4 }]],
  inbox: [["path", "M22 12h-6l-2 3h-4l-2-3H2"], ["path", "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"]],
  broom: [["path", "M19 3l2 2-7 7"], ["path", "M15 7l-9 9a3 3 0 0 0 0 4l1 1"], ["path", "M9 21l6-6"]],
};

function icon(name) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const [tag, a] of ICONS[name] || []) {
    const el = document.createElementNS(NS, tag);
    if (typeof a === "string") el.setAttribute("d", a);
    else for (const k of Object.keys(a)) el.setAttribute(k, String(a[k]));
    svg.appendChild(el);
  }
  return svg;
}

function post(name, body) {
  return fetch(`https://${RES}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body || {}),
  }).catch(() => {});
}

function toast(msg, kind) {
  const box = $("toasts");
  const t = h("div", { class: "toast" + (kind ? " " + kind : "") }, msg);
  box.appendChild(t);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(() => t.remove(), 3200);
}

function copyText(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); toast("Copied to clipboard", "ok"); } catch (e) {}
  ta.remove();
}

function ago(iso) {
  const t = new Date(iso).getTime();
  if (!t) return "—";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const hr = Math.floor(m / 60);
  if (hr < 24) return hr + "h ago";
  const d = Math.floor(hr / 24);
  if (d < 30) return d + "d ago";
  return new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function untilText(iso) {
  const t = new Date(iso).getTime();
  if (!t) return "—";
  const s = Math.floor((t - Date.now()) / 1000);
  if (s <= 0) return "Expired";
  const m = Math.floor(s / 60);
  if (m < 60) return "in " + Math.max(1, m) + "m";
  const hr = Math.floor(m / 60);
  if (hr < 48) return "in " + hr + "h";
  return "in " + Math.floor(hr / 24) + "d";
}
function fmtPlay(sec) {
  const m = Math.floor((sec || 0) / 60);
  if (m < 60) return m + "m";
  const hr = Math.floor(m / 60);
  if (hr < 48) return hr + "h " + (m % 60) + "m";
  return Math.floor(hr / 24) + "d " + (hr % 24) + "h";
}
function pingClass(p) {
  if (!(p > 0)) return "p-unknown";
  if (p < 80) return "p-good";
  if (p < 160) return "p-mid";
  return "p-bad";
}
function short(text, n) {
  const s = String(text || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function badge(text, tone) { return h("span", { class: "badge " + (tone || "b-gray") }, text); }

// Discord avatar (or letter fallback). Broken images fall back to the letter.
function letterAvatar(name, cls) {
  return h("span", { class: cls }, (String(name).trim()[0] || "?").toUpperCase());
}
function avatarNode(url, name, cls) {
  if (!url) return letterAvatar(name, cls);
  const img = document.createElement("img");
  img.src = url;
  img.alt = "";
  img.className = cls + " img";
  img.addEventListener("error", () => {
    const p = img.parentNode;
    if (p) p.replaceChild(letterAvatar(name, cls), img);
  });
  return img;
}

const SEVERITY_TONE = { CRITICAL: "b-red", HIGH: "b-amber", MEDIUM: "b-blue", LOW: "b-gray" };
const ACTION_TONE = { BAN: "b-red", KICK: "b-amber", LOG: "b-gray" };
const LEVEL_TONE = { ERROR: "b-red", WARN: "b-amber", DETECTION: "b-violet", INFO: "b-gray" };
const KIND = { BAN: ["Ban", "b-red"], KICK: ["Kick", "b-amber"], WARN: ["Warning", "b-amber"], UNBAN: ["Unban", "b-green"], DETECTION: ["Detection", "b-violet"] };
const PERM_LABEL = {
  kick: "Kick", ban: "Ban", unban: "Unban", warn: "Warn", dm: "DM", spectate: "Spectate",
  revive: "Heal/Revive", reset: "Reset", tp: "Go to", bring: "Bring", freeze: "Freeze",
  announce: "Announce", screenshot: "Screenshot", logs: "View logs",
};

// -------------------------------------------------------------------- tabs
const TABS = [
  { id: "players", label: "Players", icon: "users", perms: null },
  { id: "bans", label: "Bans", icon: "ban", perms: ["ban", "unban"] },
  { id: "kicks", label: "Kicks", icon: "kick", perms: ["kick"] },
  { id: "warns", label: "Warnings", icon: "warn", perms: ["warn"] },
  { id: "detections", label: "Detections", icon: "shield", perms: ["logs"], sep: true },
  { id: "logs", label: "Server Logs", icon: "list", perms: ["logs"] },
  { id: "server", label: "Server", icon: "server", perms: null, sep: true },
];
function visibleTabs() { return TABS.filter((t) => !t.perms || t.perms.some(can)); }

function renderTabs() {
  const nav = $("tabs");
  nav.textContent = "";
  visibleTabs().forEach((t) => {
    if (t.sep) nav.appendChild(h("div", { class: "tab-sep" }));
    nav.appendChild(h("button", { class: "tab" + (TAB === t.id ? " active" : ""), onclick: () => switchTab(t.id) }, icon(t.icon), h("span", null, t.label)));
  });
  nav.appendChild(h("div", { class: "tab-foot" }, `Esc${MENU_KEY ? " or " + MENU_KEY : ""} to close.`, h("br"), "Every action is re-checked by the server."));
}
function switchTab(id) {
  if (TAB === id) return;
  TAB = id;
  renderTabs();
  renderView();
  if (TABLES[id]) fetchTab(id);
}
function renderView() {
  for (const k of Object.keys(R)) delete R[k];
  if (TAB === "players") renderPlayersView();
  else if (TAB === "server") renderServerView();
  else renderDataView(TAB);
}
function viewHead(title, sub, tools) {
  const subEl = h("div", { class: "view-sub" }, sub || "");
  const head = h("div", { class: "view-head" }, h("div", null, h("div", { class: "view-title" }, title), subEl), h("div", { class: "view-tools" }, tools || []));
  return { head, subEl };
}
function updateOnline() { $("onlineCount").textContent = PLAYERS.length; }
function updateSpec() {
  $("specPill").classList.toggle("hidden", !SPEC.on);
  $("specText").textContent = SPEC.target ? `Spectating #${SPEC.target}` : "Spectating";
}

// ----------------------------------------------------------------- players
const ACTION_GROUPS = [
  { title: "Assist", items: [
    { key: "heal", label: "Heal", icon: "heart", perm: "revive", self: true },
    { key: "armor", label: "Armor", icon: "shieldPlus", perm: "revive", self: true },
    { key: "revive", label: "Revive", icon: "heart", self: true },
    { key: "reset", label: "Reset", icon: "broom", self: true },
  ]},
  { title: "Movement", items: [
    { key: "tp", label: "Go to", icon: "goto" },
    { key: "bring", label: "Bring", icon: "bring" },
    { key: "spectate", label: "Spectate", icon: "eye" },
    { key: "freeze", label: "Freeze", icon: "lock", arg: "on" },
    { key: "freeze", label: "Unfreeze", icon: "unlock", arg: "off" },
  ]},
  { title: "Communicate", items: [
    { key: "dm", label: "Message", icon: "message", modal: "dm" },
    { key: "warn", label: "Warn", icon: "warn", modal: "warn", tone: "warnish" },
    { key: "screenshot", label: "Screenshot", icon: "camera" },
  ]},
  { title: "Moderation", items: [
    { key: "kick", label: "Kick", icon: "kick", modal: "kick", tone: "danger" },
    { key: "ban", label: "Ban", icon: "ban", modal: "ban", tone: "danger" },
  ]},
];

function renderPlayersView() {
  const v = $("view");
  v.textContent = "";
  const { head, subEl } = viewHead("Players", "", [
    h("button", { class: "btn sm", onclick: () => { post("refresh"); if (SELECTED !== null) requestDetail(SELECTED); } }, icon("refresh"), "Refresh"),
  ]);
  R.psub = subEl;
  v.appendChild(head);

  const search = h("input", { type: "text", placeholder: "Search by name or ID…", oninput: (e) => { PFILTER = e.target.value || ""; renderPlayerList(); } });
  search.value = PFILTER;
  R.plist = h("div", { class: "plist" });
  R.detail = h("div", { class: "detail" });
  v.appendChild(h("div", { class: "players-layout" }, h("div", { class: "plist-wrap" }, h("div", { class: "search full" }, icon("search"), search), R.plist), R.detail));
  renderPlayerList();
  renderDetail();
}

function renderPlayerList() {
  if (!R.plist) return;
  const q = PFILTER.trim().toLowerCase();
  const list = PLAYERS.slice().sort((a, b) => a.id - b.id).filter((p) => !q || String(p.id).includes(q) || String(p.name || "").toLowerCase().includes(q));
  if (R.psub) R.psub.textContent = `${PLAYERS.length} online · select a player to manage them`;
  R.plist.textContent = "";
  if (!list.length) {
    R.plist.appendChild(h("div", { class: "state" }, h("span", { class: "big" }, icon("users")), PLAYERS.length ? "No players match." : "No players online."));
    return;
  }
  list.forEach((p) => {
    const nm = p.name || "Player#" + p.id;
    R.plist.appendChild(h("button", { class: "prow" + (p.id === SELECTED ? " active" : ""), onclick: () => selectPlayer(p.id) },
      avatarNode(p.avatar, nm, "mini-av"),
      h("span", { class: "pmeta" },
        h("span", { class: "pname" }, nm),
        h("span", { class: "psub" }, h("span", { class: "pid" }, "#" + p.id), p.id === SELF ? h("span", { class: "you" }, "You") : null)
      ),
      typeof p.ping === "number" ? h("span", { class: "ping " + pingClass(p.ping) }, (p.ping > 0 ? p.ping : "—") + "ms") : null
    ));
  });
}

function selectPlayer(id) {
  SELECTED = id;
  const p = PLAYERS.find((x) => x.id === id);
  DETAIL = { live: p ? { id: p.id, name: p.name, ping: p.ping } : null, profile: null, loading: true };
  renderPlayerList();
  renderDetail();
  requestDetail(id);
}
function requestDetail(id) { post("playerDetail", { id }); }

function ring(pct, color, label) {
  const C = 138.23; // 2*pi*22
  const has = pct !== null && pct !== undefined;
  const val = has ? clamp(pct, 0, 100) : 0;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 52 52"); svg.setAttribute("width", "52"); svg.setAttribute("height", "52");
  const mk = (cls, extra) => {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", "26"); c.setAttribute("cy", "26"); c.setAttribute("r", "22");
    c.setAttribute("fill", "none"); c.setAttribute("stroke-width", "5"); c.setAttribute("class", cls);
    for (const k in (extra || {})) c.setAttribute(k, extra[k]);
    return c;
  };
  svg.appendChild(mk("track"));
  svg.appendChild(mk("val", { stroke: color, "stroke-dasharray": C, "stroke-dashoffset": C * (1 - val / 100), "stroke-linecap": "round" }));
  return h("div", { class: "ring" }, svg, h("div", { class: "ring-c" }, h("b", null, has ? Math.round(val) : "—"), h("span", null, label)));
}

function stat(label, value, tone) {
  return h("div", { class: "stat" }, h("div", { class: "stat-l" }, label), h("div", { class: "stat-v" + (tone ? " " + tone : "") }, value));
}
function idRow(label, value) {
  return h("div", { class: "idrow" }, h("span", { class: "idk" }, label), h("span", { class: "idv", title: value }, value), h("button", { class: "btn sm", onclick: () => copyText(value) }, "Copy"));
}

function renderDetail() {
  if (!R.detail) return;
  const box = R.detail;
  box.textContent = "";

  if (SELECTED === null) {
    box.appendChild(h("div", { class: "detail-empty" }, h("span", { class: "big" }, icon("user")),
      h("div", { style: "font-weight:800;color:var(--text);font-size:15px" }, "No player selected"),
      h("div", null, "Pick a player to see their profile, history and actions.")));
    return;
  }

  const online = PLAYERS.some((p) => p.id === SELECTED);
  const live = (DETAIL && DETAIL.live) || {};
  const prof = DETAIL && DETAIL.profile;
  const name = live.name || "Player#" + SELECTED;
  const isSelf = SELECTED === SELF;

  const hpPct = typeof live.health === "number" ? clamp(live.health - 100, 0, 100) : null;
  const arPct = typeof live.armour === "number" ? clamp(live.armour, 0, 100) : null;

  box.appendChild(h("div", { class: "d-hero" },
    avatarNode((prof && prof.avatarUrl) || live.avatar, name, "avatar"),
    h("div", { style: "min-width:0;flex:1" },
      h("div", { class: "d-name" }, name),
      h("div", { class: "d-meta" },
        h("span", { class: "pid" }, "#" + SELECTED),
        isSelf ? h("span", { class: "you" }, "You") : null,
        online ? badge("Online", "b-green") : badge("Left", "b-gray"),
        typeof live.ping === "number" ? h("span", { class: "ping " + pingClass(live.ping) }, (live.ping > 0 ? live.ping : "—") + " ms") : null
      )
    ),
    (hpPct !== null || arPct !== null) ? h("div", { class: "rings" }, ring(hpPct, "#34d399", "HP"), ring(arPct, "#818cf8", "Armor")) : null
  ));

  if (prof) {
    const ts = typeof prof.trustScore === "number" ? prof.trustScore : null;
    const c = prof.counts || {};
    box.appendChild(h("div", { class: "stats" },
      stat("Trust", ts === null ? "—" : ts, ts === null ? "" : ts >= 70 ? "good" : ts >= 40 ? "mid" : "bad"),
      stat("Playtime", fmtPlay(prof.playtimeSec)),
      stat("Detections", c.detections || 0, (c.detections || 0) > 0 ? "mid" : ""),
      stat("Bans", c.bans || 0, (c.bans || 0) > 0 ? "bad" : ""),
      stat("Kicks", c.kicks || 0),
      stat("Warns", c.warns || 0, (c.warns || 0) > 0 ? "mid" : "")
    ));
  } else if (DETAIL && DETAIL.loading) {
    box.appendChild(h("div", { class: "state", style: "padding:14px" }, h("div", { class: "spinner" })));
  }

  if (live.license || live.discord) {
    box.appendChild(h("div", { class: "ids" }, live.license ? idRow("License", live.license) : null, live.discord ? idRow("Discord", live.discord) : null));
  }

  if (online) {
    ACTION_GROUPS.forEach((g) => {
      const items = g.items.filter((a) => can(a.perm || a.key) && (!isSelf || a.self));
      if (!items.length) return;
      box.appendChild(h("div", { class: "agroup" },
        h("div", { class: "agroup-t" }, g.title),
        h("div", { class: "actions" }, items.map((a) => h("button", { class: "btn " + (a.tone || ""), onclick: () => runAction(a, SELECTED, name) }, icon(a.icon), a.label)))
      ));
    });
  }

  if (prof) {
    box.appendChild(h("div", { class: "section-t" }, "Recent history"));
    const hist = arr(prof.history);
    if (!hist.length) {
      box.appendChild(h("div", { class: "t-muted", style: "padding:4px 2px" }, prof.known ? "Clean record — nothing on file." : "First time seen on this server."));
    } else {
      box.appendChild(h("div", { class: "timeline" }, hist.map((ev) => {
        const k = KIND[ev.kind] || [ev.kind || "Event", "b-gray"];
        return h("div", { class: "ev" }, badge(k[0], k[1]), h("span", { class: "ev-text", title: ev.text || "" }, ev.text || ""), h("span", { class: "ev-by" }, (ev.by ? ev.by + " · " : "") + ago(ev.at)));
      })));
    }
  }
}

function runAction(a, id, name) {
  if (a.modal) { openActionModal(a.modal, id, name); return; }
  post("action", { action: a.key, targetId: id, arg: a.arg });
  const msgs = {
    spectate: `Spectating ${name}`,
    revive: `Revived ${name}`,
    heal: `Healed ${name}`,
    armor: `Gave armor to ${name}`,
    reset: `Reset ${name}`,
    tp: `Teleporting to ${name}`,
    bring: `Bringing ${name}`,
    screenshot: "Screenshot requested — appears in the web panel",
  };
  const text = a.key === "freeze" ? (a.arg === "on" ? `Froze ${name}` : `Unfroze ${name}`) : msgs[a.key] || "Sent";
  toast(text, "ok");
  if (a.key === "spectate") { closeMenu(); return; }
  setTimeout(() => { if (SELECTED === id) requestDetail(id); }, 1200);
}

// ------------------------------------------------------------------ modals
const REASONS = {
  warn: ["Breaking server rules", "Fail RP", "Toxic behaviour", "Spamming"],
  kick: ["AFK", "Breaking server rules", "Toxic behaviour", "Please rejoin"],
  ban: ["Cheating / modding", "Exploiting", "Harassment", "Ban evasion", "RDM / VDM"],
  dm: ["Please follow the server rules", "Return to the city", "Contact an admin on Discord", "Stop what you are doing"],
};
const DURATIONS = [
  { h: 1, l: "1 hour" }, { h: 6, l: "6 hours" }, { h: 12, l: "12 hours" }, { h: 24, l: "1 day" },
  { h: 72, l: "3 days" }, { h: 168, l: "7 days" }, { h: 720, l: "30 days" }, { h: null, l: "Permanent" },
];
const MODAL_CFG = {
  warn: { title: "Warn", sub: "They see the warning on screen and it is logged.", tone: "warnish", icon: "warn", verb: "Warn" },
  kick: { title: "Kick", sub: "Removes them from the server. They can rejoin.", tone: "danger", icon: "kick", verb: "Kick" },
  ban: { title: "Ban", sub: "Removes them and blocks rejoining for the chosen time.", tone: "danger", icon: "ban", verb: "Ban" },
  dm: { title: "Message", sub: "Sends a private message they see on their screen.", tone: "primary", icon: "message", verb: "Send" },
};

function showModal(card) { const m = $("modal"); m.textContent = ""; m.appendChild(card); m.classList.remove("hidden"); }
function closeModal() { const m = $("modal"); m.classList.add("hidden"); m.textContent = ""; }
function modalOpen() { return !$("modal").classList.contains("hidden"); }

function openActionModal(kind, id, name) {
  const cfg = MODAL_CFG[kind];
  let hours = null;
  const input = h("input", { class: "inp", type: "text", maxlength: "200", placeholder: kind === "dm" ? "Type your message…" : "Reason…" });

  let durWrap = null;
  if (kind === "ban") {
    const btns = [];
    durWrap = h("div", { class: "durations" }, DURATIONS.map((d) => {
      const b = h("button", { class: "dur" + (d.h === null ? " perm on" : ""), onclick: () => { hours = d.h; btns.forEach((x) => x.classList.remove("on")); b.classList.add("on"); } }, d.l);
      btns.push(b);
      return b;
    }));
  }

  function submit() {
    const val = input.value.trim();
    if (kind === "dm" && !val) return;
    const reason = val || "Admin";
    const arg = { reason };
    if (kind === "ban" && hours) arg.hours = hours;
    post("action", { action: kind, targetId: id, arg });
    if (kind === "dm") toast(`Message sent → ${short(name, 26)}`, "ok");
    else {
      const dur = kind === "ban" ? (hours ? ` (${DURATIONS.find((d) => d.h === hours).l})` : " (permanent)") : "";
      toast(`${cfg.title} sent → ${short(name, 24)}${dur}`, "ok");
      setTimeout(() => post("refresh"), 1500);
    }
    closeModal();
  }
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  showModal(h("div", { class: "modal-card" },
    h("h3", { title: name }, `${cfg.title} ${short(name, 30)}`),
    h("div", { class: "m-sub" }, `#${id} · ${cfg.sub}`),
    h("label", null, kind === "dm" ? "Message" : "Reason"),
    input,
    h("div", { class: "presets" }, REASONS[kind].map((r) => h("button", { class: "preset", onclick: () => { input.value = r; input.focus(); } }, r))),
    durWrap ? h("label", null, "Duration") : null,
    durWrap,
    h("div", { class: "row-end" },
      h("button", { class: "btn", onclick: closeModal }, "Cancel"),
      h("button", { class: "btn " + cfg.tone, onclick: submit }, icon(cfg.icon), `${cfg.verb} ${kind === "dm" ? "message" : "player"}`)
    )
  ));
  setTimeout(() => input.focus(), 30);
}

function confirmUnban(row) {
  showModal(h("div", { class: "modal-card" },
    h("h3", { title: row.name }, `Unban ${short(row.name, 30)}`),
    h("div", { class: "m-sub" }, `Ban ID ${row.code || "—"} · ${row.reason || "No reason"}`),
    h("div", { class: "t-muted", style: "font-size:12px" }, "They can join again straight away. This also clears your network-reputation contribution."),
    h("div", { class: "row-end" },
      h("button", { class: "btn", onclick: closeModal }, "Cancel"),
      h("button", { class: "btn primary", onclick: () => { post("unban", { banId: row.id }); closeModal(); toast(`Lifting ban for ${short(row.name, 22)}…`); } }, "Lift ban")
    )
  ));
}

// -------------------------------------------------------------- data tabs
const TABLES = {
  bans: {
    title: "Bans", sub: "Active bans on this server — newest first", empty: "No active bans.",
    cols: [
      { label: "Player", w: "19%", cls: "t-name", cell: (r) => r.name },
      { label: "Ban ID", w: "12%", cls: "t-code", cell: (r) => r.code || "—" },
      { label: "Reason", title: (r) => r.reason, cell: (r) => r.reason },
      { label: "By", w: "14%", cls: "t-muted", cell: (r) => r.by },
      { label: "Issued", w: "10%", cls: "t-muted", cell: (r) => ago(r.at) },
      { label: "Expires", w: "12%", cell: (r) => (r.permanent || !r.expiresAt ? badge("Permanent", "b-red") : badge(untilText(r.expiresAt), "b-amber")) },
      { label: "", w: "86px", right: true, cell: (r) => (can("unban") ? h("button", { class: "btn sm", onclick: () => confirmUnban(r) }, "Unban") : null) },
    ],
  },
  kicks: {
    title: "Kicks", sub: "Recent kicks — in-game, web panel and automatic", empty: "No kicks yet.",
    cols: [
      { label: "Player", w: "24%", cls: "t-name", cell: (r) => r.name },
      { label: "Reason", title: (r) => r.reason, cell: (r) => r.reason },
      { label: "By", w: "20%", cls: "t-muted", cell: (r) => r.by },
      { label: "When", w: "12%", cls: "t-muted", cell: (r) => ago(r.at) },
    ],
  },
  warns: {
    title: "Warnings", sub: "Recent warnings", empty: "No warnings yet.",
    cols: [
      { label: "Player", w: "24%", cls: "t-name", cell: (r) => r.name },
      { label: "Reason", title: (r) => r.reason, cell: (r) => r.reason },
      { label: "By", w: "20%", cls: "t-muted", cell: (r) => r.by },
      { label: "When", w: "12%", cls: "t-muted", cell: (r) => ago(r.at) },
    ],
  },
  detections: {
    title: "Detections", sub: "What the anti-cheat caught, and what it did", empty: "No detections — all quiet.",
    cols: [
      { label: "Player", w: "22%", cls: "t-name", cell: (r) => r.name },
      { label: "Detection", title: (r) => r.type, cell: (r) => r.label || r.type },
      { label: "Severity", w: "14%", cell: (r) => badge(r.severity || "LOW", SEVERITY_TONE[r.severity] || "b-gray") },
      { label: "Action", w: "11%", cell: (r) => badge(r.action || "LOG", ACTION_TONE[r.action] || "b-gray") },
      { label: "When", w: "12%", cls: "t-muted", cell: (r) => ago(r.at) },
    ],
  },
  logs: {
    title: "Server Logs", sub: "Connections, admin actions and anti-cheat events", empty: "No log entries yet.",
    cols: [
      { label: "Level", w: "17%", cell: (r) => badge(r.level || "INFO", LEVEL_TONE[r.level] || "b-gray") },
      { label: "Source", w: "13%", cls: "t-muted", cell: (r) => r.source },
      { label: "Message", title: (r) => r.message, cell: (r) => r.message },
      { label: "When", w: "12%", cls: "t-muted", cell: (r) => ago(r.at) },
    ],
  },
};

function renderDataView(tab) {
  const cfg = TABLES[tab];
  const v = $("view");
  v.textContent = "";
  const search = h("input", { type: "text", placeholder: "Search…", oninput: (e) => { tabQuery[tab] = e.target.value || ""; clearTimeout(searchTimer); searchTimer = setTimeout(() => fetchTab(tab), 400); } });
  search.value = tabQuery[tab] || "";
  const { head } = viewHead(cfg.title, cfg.sub, [
    h("div", { class: "search" }, icon("search"), search),
    h("button", { class: "btn sm", onclick: () => fetchTab(tab) }, icon("refresh"), "Refresh"),
  ]);
  v.appendChild(head);
  R.body = h("div", { class: "view-body" });
  v.appendChild(R.body);
  renderDataBody(tab);
}
function fetchTab(tab) {
  tabLoaded[tab] = false; tabErr[tab] = false;
  const token = (tabToken[tab] || 0) + 1; tabToken[tab] = token;
  renderDataBody(tab);
  post("fetchTab", { tab, q: (tabQuery[tab] || "").trim() });
  setTimeout(() => { if (tabToken[tab] === token && !tabLoaded[tab]) { tabLoaded[tab] = true; tabErr[tab] = true; renderDataBody(tab); } }, 7000);
}
function renderDataBody(tab) {
  if (!R.body || TAB !== tab) return;
  const cfg = TABLES[tab];
  const rows = tabRows[tab];
  R.body.textContent = "";
  if (!tabLoaded[tab] && !rows) { R.body.appendChild(h("div", { class: "state" }, h("div", { class: "spinner" }), "Loading…")); return; }
  if (tabErr[tab] && !(rows && rows.length)) { R.body.appendChild(h("div", { class: "state" }, h("span", { class: "big" }, icon("warn")), "Could not load — the web panel did not answer. Try Refresh.")); return; }
  if (!rows || !rows.length) { R.body.appendChild(h("div", { class: "state" }, h("span", { class: "big" }, icon("inbox")), (tabQuery[tab] || "").trim() ? "Nothing matches your search." : cfg.empty)); return; }
  const thead = h("thead", null, h("tr", null, cfg.cols.map((c) => h("th", { class: c.right ? "t-right" : null, style: c.w ? "width:" + c.w : null }, c.label))));
  const tbody = h("tbody", null, rows.map((r) => h("tr", null, cfg.cols.map((c) => h("td", { class: c.cls || (c.right ? "t-right" : null), title: c.title ? c.title(r) || "" : null }, c.cell(r))))));
  R.body.appendChild(h("table", { class: "table" }, thead, tbody));
}

// ------------------------------------------------------------------ server
function renderServerView() {
  const v = $("view");
  v.textContent = "";
  v.appendChild(viewHead("Server", "Announcements, your access and session info").head);
  const cards = h("div", { class: "cards" });

  if (can("announce")) {
    const ta = h("textarea", { class: "inp", rows: "4", maxlength: "200", placeholder: "Message shown to every player as a banner…" });
    const counter = h("span", { class: "counter" }, "0 / 200");
    ta.addEventListener("input", () => { counter.textContent = ta.value.length + " / 200"; });
    cards.appendChild(h("div", { class: "card" },
      h("h4", null, "Announcement"),
      h("p", null, "Broadcast a banner to everyone online. It slides in from the top of their screen."),
      ta,
      h("div", { class: "row-end" }, counter, h("button", { class: "btn primary", onclick: () => {
        const t = ta.value.trim(); if (!t) return;
        post("action", { action: "announce", arg: t }); ta.value = ""; counter.textContent = "0 / 200"; toast("Announcement broadcast", "ok");
      } }, icon("megaphone"), "Broadcast"))
    ));
  }

  cards.appendChild(h("div", { class: "card" },
    h("h4", null, "Your access"),
    h("p", null, "Granted from the web panel (Server → Admins). The server re-checks every action."),
    h("div", { class: "chips" }, Object.keys(PERMS).sort().map((p) => badge(PERM_LABEL[p] || p, "b-blue")))
  ));

  const line = (k, val) => h("div", { class: "idrow" }, h("span", { class: "idk", style: "width:auto;flex:1" }, k), h("span", { class: "idv" }, val));
  cards.appendChild(h("div", { class: "card" },
    h("h4", null, "Session"),
    h("p", null, "Live information from this server."),
    h("div", { class: "ids" }, line("Players online", String(PLAYERS.length)), line("Your server ID", "#" + SELF), line("Spectating", SPEC.on ? (SPEC.target ? "#" + SPEC.target : "Yes") : "No"))
  ));

  v.appendChild(h("div", { class: "view-body" }, cards));
}

// ------------------------------------------------- announcement + DM overlays
function progressBar(seconds) {
  const bar = h("div", { class: "a-bar run" });
  bar.style.animationDuration = seconds + "s";
  return bar;
}
function showAnnounce(message, from) {
  if (!message) return;
  const box = $("banner");
  const el = h("div", { class: "announce" },
    h("div", { class: "a-ico" }, icon("megaphone")),
    h("div", { class: "a-body" },
      h("div", { class: "a-lbl" }, "Announcement"),
      h("div", { class: "a-msg" }, message),
      from ? h("div", { class: "a-from" }, "— " + from) : null
    ),
    progressBar(8)
  );
  box.appendChild(el);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 400); }, 8000);
}
function showDm(from, message) {
  if (!message) return;
  const box = $("dmStack");
  const el = h("div", { class: "dm" },
    h("div", { class: "dm-av" }, (String(from).trim()[0] || "A").toUpperCase()),
    h("div", { class: "dm-body" },
      h("div", { class: "dm-from" }, from, h("small", null, " · Admin")),
      h("div", { class: "dm-msg" }, message)
    ),
    progressBar(14)
  );
  box.appendChild(el);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, 14000);
}

// ------------------------------------------------------------- lifecycle
function startAutoRefresh() { stopAutoRefresh(); refreshTimer = setInterval(() => post("refresh"), 5000); }
function stopAutoRefresh() { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } }
function hideMenu() { closeModal(); stopAutoRefresh(); $("root").classList.add("hidden"); }
function closeMenu() { post("close"); hideMenu(); }

window.addEventListener("message", (e) => {
  const d = e.data || {};
  switch (d.type) {
    case "open": {
      RES = d.resource || RES;
      SELF = d.selfId || 0;
      MENU_KEY = d.menuKey || "";
      PERMS = {};
      arr(d.perms).forEach((p) => (PERMS[p] = true));
      PLAYERS = arr(d.players);
      SPEC = { on: !!d.spectating, target: SPEC.on ? SPEC.target : null };
      for (const k of Object.keys(tabRows)) delete tabRows[k];
      $("brand").textContent = d.brand || "CoreAC";
      if (!visibleTabs().some((t) => t.id === TAB)) TAB = "players";
      renderTabs();
      updateOnline();
      updateSpec();
      renderView();
      if (TABLES[TAB]) fetchTab(TAB);
      if (TAB === "players" && SELECTED !== null) requestDetail(SELECTED);
      $("root").classList.remove("hidden");
      startAutoRefresh();
      break;
    }
    case "players": {
      PLAYERS = arr(d.players);
      updateOnline();
      if (TAB === "players") { renderPlayerList(); if (SELECTED !== null) renderDetail(); }
      break;
    }
    case "tab": { tabRows[d.tab] = arr(d.rows); tabLoaded[d.tab] = true; tabErr[d.tab] = !d.ok; renderDataBody(d.tab); break; }
    case "player": {
      if (!d.live || d.live.id !== SELECTED) break;
      DETAIL = { live: d.live, profile: d.profile || null, loading: false };
      if (TAB === "players") renderDetail();
      break;
    }
    case "result": { if (d.action === "unban") { toast(d.ok ? "Ban lifted" : "Unban failed — it may already be lifted", d.ok ? "ok" : "err"); if (d.ok) fetchTab("bans"); } break; }
    case "spectate": { SPEC = { on: !!d.on, target: d.on ? d.target || null : null }; updateSpec(); break; }
    case "announce": showAnnounce(d.message || "", d.from || ""); break;
    case "dm": showDm(d.from || "Admin", d.message || ""); break;
    case "close": hideMenu(); break;
  }
});

$("close").appendChild(icon("close"));
$("close").addEventListener("click", closeMenu);
$("specStop").addEventListener("click", () => { post("stopSpectate"); toast("Returning to your position…"); });
$("modal").addEventListener("mousedown", (e) => { if (e.target === $("modal")) closeModal(); });

document.addEventListener("keydown", (e) => {
  const typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
  const menuKey = MENU_KEY && e.key && e.key.toUpperCase() === MENU_KEY.toUpperCase() && (!typing || MENU_KEY.length > 1);
  if (e.key === "Escape" || menuKey) {
    if (modalOpen()) { closeModal(); return; }
    closeMenu();
  }
});
