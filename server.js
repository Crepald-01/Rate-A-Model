// Zero-dependency backend: static files + JSON API + JSON-file storage.
// Run: node server.js   (optional env: PORT, GOOGLE_CLIENT_ID, DATA_FILE)
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const PUB = path.join(__dirname, "public");
const MODELS = JSON.parse(fs.readFileSync(path.join(__dirname, "models.json"), "utf8"));
const modelIds = new Set(MODELS.map(m => m.id));

let db = { users: {}, sessions: {}, ratings: {} };   // ratings: {modelId:{userId:{stars,review,at}}}
try { db = { ...db, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) }; } catch {}
let saving = false, dirty = false;
function save() {
  if (saving) { dirty = true; return; }
  saving = true;
  const tmp = DATA_FILE + ".tmp";
  fs.writeFile(tmp, JSON.stringify(db), err => {
    if (!err) fs.rename(tmp, DATA_FILE, () => { saving = false; if (dirty) { dirty = false; save(); } });
    else saving = false;
  });
}

const hashPw = (pw, salt = crypto.randomBytes(16).toString("hex")) =>
  ({ salt, hash: crypto.scryptSync(pw, salt, 64).toString("hex") });
const checkPw = (pw, u) => {
  if (!u.hash) return false;
  const a = Buffer.from(hashPw(pw, u.salt).hash, "hex"), b = Buffer.from(u.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const uid = () => crypto.randomBytes(8).toString("hex");
const cookie = (req, n) => (req.headers.cookie || "").split(/;\s*/).map(c => c.split("=")).find(c => c[0] === n)?.[1];
const userOf = req => { const s = db.sessions[cookie(req, "sid")]; return (s && db.users[s.uid]) || null; };
const pub = u => u && { id: u.id, name: u.name, email: u.email };

function startSession(res, u) {
  const sid = crypto.randomBytes(24).toString("hex");
  db.sessions[sid] = { uid: u.id, at: Date.now() }; save();
  res.setHeader("Set-Cookie", `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`);
}
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => {
  let s = ""; req.on("data", c => { s += c; if (s.length > 20000) { req.destroy(); no(); } });
  req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch { no(); } });
});

// naive per-IP rate limit for auth endpoints
const hits = new Map();
function limited(req) {
  const k = req.socket.remoteAddress, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < 60000);
  a.push(now); hits.set(k, a); return a.length > 20;
}

function summary(m, me) {
  const r = db.ratings[m.id] || {}, list = Object.values(r), n = list.length;
  const dist = [0, 0, 0, 0, 0]; list.forEach(x => dist[x.stars - 1]++);
  return { ...m, count: n, avg: n ? list.reduce((a, x) => a + x.stars, 0) / n : 0, dist, mine: (me && r[me.id]) || null };
}

async function api(req, res, url) {
  const me = userOf(req), p = url.pathname, M = req.method;
  if (p === "/api/config") return send(res, 200, { googleClientId: GOOGLE_CLIENT_ID });
  if (p === "/api/me") return send(res, 200, { user: pub(me) });
  if (p === "/api/models" && M === "GET") {
    const users = new Set(); let total = 0;
    Object.values(db.ratings).forEach(r => Object.keys(r).forEach(u => { users.add(u); total++; }));
    return send(res, 200, { models: MODELS.map(m => summary(m, me)), totals: { models: MODELS.length, ratings: total, raters: users.size } });
  }
  let m;
  if ((m = p.match(/^\/api\/models\/([\w-]+)\/reviews$/)) && M === "GET") {
    const r = db.ratings[m[1]] || {};
    const reviews = Object.entries(r).filter(([, x]) => x.review).sort((a, b) => b[1].at - a[1].at).slice(0, 50)
      .map(([u, x]) => ({ name: db.users[u]?.name || "User", stars: x.stars, review: x.review, at: x.at }));
    return send(res, 200, { reviews });
  }
  if (M === "POST" && ["/api/signup", "/api/login", "/api/google"].includes(p)) {
    if (limited(req)) return send(res, 429, { error: "Too many attempts. Try again in a minute." });
    let b; try { b = await readBody(req); } catch { return send(res, 400, { error: "Bad request" }); }
    if (p === "/api/signup") {
      const name = String(b.name || "").trim().slice(0, 60), email = String(b.email || "").trim().toLowerCase(), pw = String(b.password || "");
      if (!name) return send(res, 400, { error: "Please enter your name." });
      if (!/^\S+@\S+\.\S+$/.test(email)) return send(res, 400, { error: "Enter a valid email." });
      if (pw.length < 8) return send(res, 400, { error: "Password must be at least 8 characters." });
      if (Object.values(db.users).some(u => u.email === email)) return send(res, 409, { error: "An account with this email already exists." });
      const u = { id: uid(), name, email, ...hashPw(pw) }; db.users[u.id] = u; startSession(res, u);
      return send(res, 200, { user: pub(u) });
    }
    if (p === "/api/login") {
      const email = String(b.email || "").trim().toLowerCase(), u = Object.values(db.users).find(x => x.email === email);
      if (!u || !checkPw(String(b.password || ""), u)) return send(res, 401, { error: "Incorrect email or password." });
      startSession(res, u); return send(res, 200, { user: pub(u) });
    }
    if (p === "/api/google") {
      if (!GOOGLE_CLIENT_ID) return send(res, 501, { error: "Google sign-in isn't configured on this server (set GOOGLE_CLIENT_ID)." });
      try {
        const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(b.credential || ""));
        const t = await r.json();
        if (!r.ok || t.aud !== GOOGLE_CLIENT_ID || String(t.email_verified) !== "true") throw 0;
        let u = Object.values(db.users).find(x => x.email === t.email.toLowerCase());
        if (!u) { u = { id: uid(), name: t.name || t.email.split("@")[0], email: t.email.toLowerCase(), google: true }; db.users[u.id] = u; }
        startSession(res, u); return send(res, 200, { user: pub(u) });
      } catch { return send(res, 401, { error: "Google sign-in failed." }); }
    }
  }
  if (p === "/api/logout" && M === "POST") {
    delete db.sessions[cookie(req, "sid")]; save();
    res.setHeader("Set-Cookie", "sid=; HttpOnly; Path=/; Max-Age=0"); return send(res, 200, {});
  }
  if ((m = p.match(/^\/api\/models\/([\w-]+)\/rating$/)) && (M === "PUT" || M === "DELETE")) {
    if (!me) return send(res, 401, { error: "Sign in to rate." });
    if (!modelIds.has(m[1])) return send(res, 404, { error: "Unknown model." });
    const r = (db.ratings[m[1]] ??= {});
    if (M === "DELETE") delete r[me.id];
    else {
      let b; try { b = await readBody(req); } catch { return send(res, 400, { error: "Bad request" }); }
      const stars = Number(b.stars);
      if (!Number.isInteger(stars) || stars < 1 || stars > 5) return send(res, 400, { error: "Stars must be 1-5." });
      r[me.id] = { stars, review: String(b.review || "").trim().slice(0, 500), at: Date.now() };
    }
    save(); return send(res, 200, { model: summary(MODELS.find(x => x.id === m[1]), me) });
  }
  send(res, 404, { error: "Not found" });
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/")) return api(req, res, url).catch(() => send(res, 500, { error: "Server error" }));
  const f = path.join(PUB, path.normalize(url.pathname === "/" ? "/index.html" : url.pathname));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(d);
  });
}).listen(PORT, () => console.log(`Rate the Models -> http://localhost:${PORT}`));
