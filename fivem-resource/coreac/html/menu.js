// CoreAC — in-game admin panel (NUI).
//
// Pure UI. Every action and every data request goes to the server, which
// re-checks the admin's permission (server/live.lua) before doing anything.
//
// SECURITY: player names, reasons, messages and identifiers are attacker-
// controlled. Everything is built with DOM nodes + textContent — data never
// touches innerHTML.
"use strict";

// NUI callbacks post to https://<resource>/<name>. The folder name is not fixed
// (the installer may give it a stealth name), so ask CEF for it.
let RES = typeof GetParentResourceName === "function" ? GetParentResourceName() : "coreac";
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
  wrench: [["path", "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"]],
  trash: [["path", "M3 6h18"], ["path", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"], ["path", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"]],
  mic: [["rect", { x: 9, y: 2, width: 6, height: 12, rx: 3 }], ["path", "M19 10v2a7 7 0 0 1-14 0v-2"], ["path", "M12 19v3"]],
  micOff: [["path", "M2 2l20 20"], ["path", "M18.89 13.23A7 7 0 0 0 19 12v-2"], ["path", "M5 10v2a7 7 0 0 0 12 5"], ["path", "M15 9.34V5a3 3 0 0 0-5.68-1.33"], ["path", "M9 9v3a3 3 0 0 0 5.12 2.12"], ["path", "M12 19v3"]],
  noWeapon: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", "M12 3v4"], ["path", "M12 17v4"], ["path", "M3 12h4"], ["path", "M17 12h4"], ["path", "M5 5l14 14"]],
  pin: [["path", "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"], ["circle", { cx: 12, cy: 10, r: 3 }]],
  tag: [["path", "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"], ["path", "M7 7h.01"]],
  bell: [["path", "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"], ["path", "M13.73 21a2 2 0 0 1-3.46 0"]],
  copy: [["rect", { x: 9, y: 9, width: 13, height: 13, rx: 2 }], ["path", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"]],
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
// Same as post(), but returns the callback's JSON answer (or null).
async function postJson(name, body) {
  try {
    const r = await fetch(`https://${RES}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(body || {}),
    });
    return await r.json();
  } catch (e) {
    return null;
  }
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
function pingNode(p) {
  if (typeof p !== "number") return null;
  return h("span", { class: "ping " + pingClass(p) }, h("span", { class: "bars" }, h("i"), h("i"), h("i")), (p > 0 ? p : "—") + "ms");
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
  revive: "Heal/Revive", reset: "Reset & wipe", tp: "Go to", bring: "Bring", freeze: "Freeze",
  announce: "Announce", screenshot: "Screenshot", logs: "View logs", disarm: "Disarm", mute: "Mute voice",
};
let ALERT_MODE = "actions";
let TAGS = false;

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
  visibleTabs().forEach((t, i) => {
    if (t.sep) nav.appendChild(h("div", { class: "tab-sep" }));
    nav.appendChild(h("button", { class: "tab" + (TAB === t.id ? " active" : ""), onclick: () => switchTab(t.id) },
      icon(t.icon), h("span", null, t.label), i < 9 ? h("kbd", null, String(i + 1)) : null));
  });
  nav.appendChild(h("div", { class: "tab-foot" },
    h("kbd", null, "1–" + Math.min(visibleTabs().length, 9)), " switch  ", h("kbd", null, "/"), " search", h("br"),
    h("kbd", null, "Esc"), " close · every action is re-checked by the server."));
  const cur = TABS.find((t) => t.id === TAB);
  $("crumb").textContent = cur ? cur.label : "";
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
    { key: "repair", label: "Repair vehicle", icon: "wrench", perm: "revive", self: true },
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
    { key: "mute", label: "Mute voice", icon: "micOff", arg: "on", tone: "warnish", hideIf: (l) => l.muted === true },
    { key: "mute", label: "Unmute voice", icon: "mic", arg: "off", hideIf: (l) => l.muted !== true },
    { key: "disarm", label: "Disarm", icon: "noWeapon", tone: "warnish" },
    { key: "wipe", label: "Wipe spawns", icon: "trash", perm: "reset", confirm: "wipe", tone: "warnish" },
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
      h("span", { class: "pid" }, "#" + p.id),
      h("span", { class: "pname" }, h("span", { style: "overflow:hidden;text-overflow:ellipsis" }, nm), p.id === SELF ? h("span", { class: "you" }, "You") : null),
      pingNode(p.ping)
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

function meter(label, pct, color) {
  const has = pct !== null && pct !== undefined;
  const val = has ? clamp(pct, 0, 100) : 0;
  return h("div", null,
    h("div", { class: "meter-top" }, label, h("b", null, has ? Math.round(val) : "—")),
    h("div", { class: "meter" }, h("i", { style: `width:${val}%;background:${color}` })));
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
      h("b", null, "No player selected"),
      h("div", null, "Pick a player on the left to see their profile, history and actions.")));
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
        live.inVehicle ? badge("In vehicle", "b-blue") : null,
        live.muted ? badge("Muted", "b-amber") : null,
        pingNode(live.ping)
      )
    )
  ));

  if (hpPct !== null || arPct !== null) {
    box.appendChild(h("div", { class: "vitals" }, meter("Health", hpPct, "var(--ok)"), meter("Armor", arPct, "var(--info)")));
  }

  if (prof) {
    const ts = typeof prof.trustScore === "number" ? prof.trustScore : null;
    const c = prof.counts || {};
    box.appendChild(h("div", { class: "strip" },
      stat("Trust", ts === null ? "—" : ts, ts === null ? "" : ts >= 70 ? "good" : ts >= 40 ? "mid" : "bad"),
      stat("Playtime", fmtPlay(prof.playtimeSec)),
      stat("Detections", c.detections || 0, (c.detections || 0) > 0 ? "mid" : ""),
      stat("Bans", c.bans || 0, (c.bans || 0) > 0 ? "bad" : ""),
      stat("Kicks", c.kicks || 0),
      stat("Warns", c.warns || 0, (c.warns || 0) > 0 ? "mid" : "")
    ));
  } else if (DETAIL && DETAIL.loading) {
    box.appendChild(h("div", { class: "state", style: "padding:18px" }, h("div", { class: "spinner" })));
  }

  if (live.license || live.discord) {
    box.appendChild(h("div", { class: "block" }, h("div", { class: "block-t" }, "Identifiers"),
      h("div", { class: "ids" }, live.license ? idRow("License", live.license) : null, live.discord ? idRow("Discord", live.discord) : null)));
  }

  if (online) {
    const groups = [];
    ACTION_GROUPS.forEach((g) => {
      const items = g.items.filter((a) => can(a.perm || a.key) && (!isSelf || a.self) && !(a.hideIf && a.hideIf(live)));
      if (!items.length) return;
      groups.push(h("div", { class: "agroup" },
        h("div", { class: "agroup-t" }, g.title),
        h("div", { class: "actions" }, items.map((a) => h("button", { class: "btn " + (a.tone || ""), onclick: () => runAction(a, SELECTED, name) }, icon(a.icon), a.label)))
      ));
    });
    if (groups.length) box.appendChild(h("div", { class: "block" }, h("div", { class: "block-t" }, "Actions"), groups));
  }

  if (prof) {
    const hist = arr(prof.history);
    box.appendChild(h("div", { class: "block" }, h("div", { class: "block-t" }, "Recent history"),
      !hist.length
        ? h("div", { class: "t-muted" }, prof.known ? "Clean record — nothing on file." : "First time seen on this server.")
        : h("div", { class: "timeline" }, hist.map((ev) => {
            const k = KIND[ev.kind] || [ev.kind || "Event", "b-gray"];
            return h("div", { class: "ev" }, badge(k[0], k[1]), h("span", { class: "ev-text", title: ev.text || "" }, ev.text || ""), h("span", { class: "ev-by" }, (ev.by ? ev.by + " · " : "") + ago(ev.at)));
          }))));
  }
}

function runAction(a, id, name, confirmed) {
  if (a.modal) { openActionModal(a.modal, id, name); return; }
  if (a.confirm === "wipe" && !confirmed) { confirmWipe(a, id, name); return; }
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
    repair: `Repairing ${name}'s vehicle`,
    disarm: `Disarmed ${name}`,
    wipe: `Wiping everything ${name} spawned`,
  };
  let text = msgs[a.key] || "Sent";
  if (a.key === "freeze") text = a.arg === "on" ? `Froze ${name}` : `Unfroze ${name}`;
  if (a.key === "mute") text = a.arg === "on" ? `Muted ${name}` : `Unmuted ${name}`;
  toast(text, "ok");
  if (a.key === "spectate") { closeMenu(); return; }
  setTimeout(() => { if (SELECTED === id) requestDetail(id); }, 1200);
}

function modalCard(title, sub, ...body) {
  return h("div", { class: "modal-card" },
    h("div", { class: "modal-head" }, h("h3", { title }, title), sub ? h("div", { class: "m-sub" }, sub) : null),
    h("div", { class: "modal-body" }, body));
}

function confirmWipe(a, id, name) {
  showModal(modalCard(`Wipe spawns · ${short(name, 28)}`, `#${id} · deletes every vehicle, object and NPC this player created on the server.`,
    h("div", { class: "t-muted", style: "font-size:12px;line-height:1.5" },
      "Use it after a cheater filled the map with props or cars. Their own garage vehicles count too — other players and the map are never touched."),
    h("div", { class: "row-end" },
      h("button", { class: "btn", onclick: closeModal }, "Cancel"),
      h("button", { class: "btn danger", onclick: () => { closeModal(); runAction(a, id, name, true); } }, icon("trash"), "Wipe spawns")
    )
  ));
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

  showModal(modalCard(`${cfg.title} · ${short(name, 30)}`, `#${id} · ${cfg.sub}`,
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
  showModal(modalCard(`Unban · ${short(row.name, 30)}`, `Ban ID ${row.code || "—"} · ${row.reason || "No reason"}`,
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
      { label: "Issued", w: "10%", cls: "t-time", cell: (r) => ago(r.at) },
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
      { label: "When", w: "12%", cls: "t-time", cell: (r) => ago(r.at) },
    ],
  },
  warns: {
    title: "Warnings", sub: "Recent warnings", empty: "No warnings yet.",
    cols: [
      { label: "Player", w: "24%", cls: "t-name", cell: (r) => r.name },
      { label: "Reason", title: (r) => r.reason, cell: (r) => r.reason },
      { label: "By", w: "20%", cls: "t-muted", cell: (r) => r.by },
      { label: "When", w: "12%", cls: "t-time", cell: (r) => ago(r.at) },
    ],
  },
  detections: {
    title: "Detections", sub: "What the anti-cheat caught, and what it did", empty: "No detections — all quiet.",
    cols: [
      { label: "Player", w: "22%", cls: "t-name", cell: (r) => r.name },
      { label: "Detection", title: (r) => r.type, cell: (r) => r.label || r.type },
      { label: "Severity", w: "14%", cell: (r) => badge(r.severity || "LOW", SEVERITY_TONE[r.severity] || "b-gray") },
      { label: "Action", w: "11%", cell: (r) => badge(r.action || "LOG", ACTION_TONE[r.action] || "b-gray") },
      { label: "When", w: "12%", cls: "t-time", cell: (r) => ago(r.at) },
    ],
  },
  logs: {
    title: "Server Logs", sub: "Connections, admin actions and anti-cheat events", empty: "No log entries yet.",
    cols: [
      { label: "Level", w: "17%", cell: (r) => badge(r.level || "INFO", LEVEL_TONE[r.level] || "b-gray") },
      { label: "Source", w: "13%", cls: "t-muted", cell: (r) => r.source },
      { label: "Message", title: (r) => r.message, cell: (r) => r.message },
      { label: "When", w: "12%", cls: "t-time", cell: (r) => ago(r.at) },
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
  v.appendChild(viewHead("Server", "Announcements, alerts, tools and your access").head);
  const cards = h("div", { class: "cards" });

  if (can("announce")) {
    const ta = h("textarea", { class: "inp", rows: "4", maxlength: "200", placeholder: "Message shown to every player as a banner…" });
    const counter = h("span", { class: "counter" }, "0 / 200");
    ta.addEventListener("input", () => { counter.textContent = ta.value.length + " / 200"; });
    cards.appendChild(h("div", { class: "card" },
      h("h4", null, icon("megaphone"), "Announcement"),
      h("p", null, "Broadcast to everyone online. It appears at the top centre of their screen."),
      ta,
      h("div", { class: "row-end" }, counter, h("button", { class: "btn primary", onclick: () => {
        const t = ta.value.trim(); if (!t) return;
        post("action", { action: "announce", arg: t }); ta.value = ""; counter.textContent = "0 / 200"; toast("Announcement broadcast", "ok");
      } }, icon("megaphone"), "Broadcast"))
    ));
  }

  if (can("logs")) {
    const modes = [["off", "Off"], ["actions", "Kicks & bans"], ["all", "Everything"]];
    const seg = h("div", { class: "seg" });
    const paint = () => { Array.from(seg.children).forEach((b) => b.classList.toggle("on", b.dataset.mode === ALERT_MODE)); };
    modes.forEach(([m, l]) => {
      const b = h("button", { class: "seg-b", "data-mode": m, onclick: async () => {
        const r = await postJson("setAlertMode", { mode: m });
        ALERT_MODE = (r && r.mode) || m; paint();
        toast(ALERT_MODE === "off" ? "Detection alerts off" : "Detection alerts: " + l, "ok");
      } }, l);
      seg.appendChild(b);
    });
    paint();
    cards.appendChild(h("div", { class: "card" },
      h("h4", null, icon("bell"), "Detection alerts"),
      h("p", null, "A pop-up in your corner of the screen the moment the anti-cheat catches someone — with their ID, so you can spectate straight away. Saved on this PC."),
      seg
    ));
  }

  const tools = [];
  if (can("tp")) {
    tools.push(h("button", { class: "btn", onclick: () => { post("action", { action: "tpm" }); closeMenu(); } }, icon("pin"), "Teleport to waypoint"));
  }
  if (can("spectate")) {
    const tagBtn = h("button", { class: "btn" + (TAGS ? " primary" : ""), onclick: async () => {
      const r = await postJson("setTags", { on: !TAGS });
      TAGS = !!(r && r.on);
      tagBtn.className = "btn" + (TAGS ? " primary" : "");
      tagLbl.textContent = TAGS ? "Player tags: on" : "Player tags: off";
    } }, icon("tag"));
    const tagLbl = h("span", null, TAGS ? "Player tags: on" : "Player tags: off");
    tagBtn.appendChild(tagLbl);
    tools.push(tagBtn);
  }
  const posVal = h("span", { class: "idv" }, "—");
  let posText = "";
  const refreshPos = async () => {
    const c = await postJson("coords");
    if (!c) return;
    const f = (n) => (Math.round(n * 100) / 100).toFixed(2);
    posText = `vector4(${f(c.x)}, ${f(c.y)}, ${f(c.z)}, ${f(c.h)})`;
    posVal.textContent = posText;
  };
  cards.appendChild(h("div", { class: "card" },
    h("h4", null, icon("wrench"), "Tools"),
    h("p", null, "Player tags show the server ID, name and health above everyone near you (only on your screen)."),
    tools.length ? h("div", { class: "tool-row" }, tools) : null,
    h("div", { class: "idrow", style: "margin-top:12px" },
      h("span", { class: "idk" }, "Position"), posVal,
      h("button", { class: "btn sm", onclick: async () => { await refreshPos(); if (posText) copyText(posText); } }, icon("copy"), "Copy")
    )
  ));
  refreshPos();

  cards.appendChild(h("div", { class: "card" },
    h("h4", null, icon("lock"), "Your access"),
    h("p", null, "Granted from the web panel (Server → Admins). The server re-checks every action."),
    h("div", { class: "chips" }, Object.keys(PERMS).sort().map((p) => badge(PERM_LABEL[p] || p, "b-blue")))
  ));

  const line = (k, val) => h("div", null, h("span", null, k), h("b", null, val));
  cards.appendChild(h("div", { class: "card" },
    h("h4", null, icon("server"), "Session"),
    h("p", null, "Live information from this server."),
    h("div", { class: "kv" }, line("Players online", String(PLAYERS.length)), line("Your server ID", "#" + SELF), line("Spectating", SPEC.on ? (SPEC.target ? "#" + SPEC.target : "yes") : "no"))
  ));

  v.appendChild(h("div", { class: "view-body" }, cards));
}

// ----------------------------------------- notices (announce / message / warning)
// One stack at the top centre of the screen, visible with or without the panel.
const NOTICE = {
  announce: { tag: "Announcement", icon: "megaphone", seconds: 9 },
  dm: { tag: "Message from staff", icon: "message", seconds: 14 },
  warn: { tag: "Warning", icon: "warn", seconds: 16 },
};
function showNotice(kind, message, from) {
  if (!message) return;
  const cfg = NOTICE[kind] || NOTICE.announce;
  const bar = h("div", { class: "n-bar run" });
  bar.style.animationDuration = cfg.seconds + "s";
  const el = h("div", { class: "notice " + kind },
    h("div", { class: "n-side" }, icon(cfg.icon)),
    h("div", { class: "n-body" },
      h("div", { class: "n-top" }, h("span", { class: "n-tag" }, cfg.tag), from ? h("span", { class: "n-from" }, from) : null),
      h("div", { class: "n-msg" }, message)
    ),
    bar
  );
  const box = $("notices");
  box.appendChild(el);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, cfg.seconds * 1000);
}

// Live anti-cheat alert (staff only — the server sends these to admins with
// the "logs" permission). Shown even while the menu is closed.
const ALERT_TONE = { BAN: ["Banned", "b-red"], KICK: ["Kicked", "b-amber"], LOG: ["Logged", "b-gray"] };
function showAlert(a) {
  if (!a) return;
  const box = $("alertStack");
  const tone = ALERT_TONE[a.action] || ALERT_TONE.LOG;
  const el = h("div", { class: "ac-alert " + (a.action === "BAN" ? "ban" : a.action === "KICK" ? "kick" : "log") },
    h("div", { class: "ac-top" }, h("span", { class: "ac-lbl" }, "CoreAC detection"), badge(tone[0], tone[1])),
    h("div", { class: "ac-msg" }, h("b", null, `#${a.id}`), short(a.name, 26)),
    h("div", { class: "ac-type" }, short(a.label, 44))
  );
  box.appendChild(el);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 300); }, 9000);
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
      ALERT_MODE = d.alertMode || ALERT_MODE;
      TAGS = !!d.tags;
      for (const k of Object.keys(tabRows)) delete tabRows[k];
      // A custom brand name replaces the wordmark; the default keeps its styling.
      if (d.brand && d.brand !== "CoreAC") $("brand").textContent = d.brand;
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
    case "announce": showNotice("announce", d.message || "", d.from || ""); break;
    case "dm": showNotice("dm", d.message || "", d.from || "Admin"); break;
    case "warn": showNotice("warn", d.message || "", d.from || ""); break;
    case "acAlert": showAlert(d.alert); break;
    case "close": hideMenu(); break;
  }
});

$("close").addEventListener("click", closeMenu);
$("specStop").addEventListener("click", () => { post("stopSpectate"); toast("Returning to your position…"); });
$("modal").addEventListener("mousedown", (e) => { if (e.target === $("modal")) closeModal(); });

document.addEventListener("keydown", (e) => {
  if ($("root").classList.contains("hidden")) return;
  const typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
  const menuKey = MENU_KEY && e.key && e.key.toUpperCase() === MENU_KEY.toUpperCase() && (!typing || MENU_KEY.length > 1);
  if (e.key === "Escape" || menuKey) {
    if (modalOpen()) { closeModal(); return; }
    if (typing) { e.target.blur(); return; }
    closeMenu();
    return;
  }
  if (typing || modalOpen()) return;
  // 1–9 switch tab · "/" focuses the current view's search box
  if (/^[1-9]$/.test(e.key)) {
    const t = visibleTabs()[Number(e.key) - 1];
    if (t) { e.preventDefault(); switchTab(t.id); }
  } else if (e.key === "/") {
    const inp = document.querySelector("#view .search input");
    if (inp) { e.preventDefault(); inp.focus(); }
  }
});
