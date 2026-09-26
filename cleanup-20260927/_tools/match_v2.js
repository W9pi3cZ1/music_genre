

const fs = require("fs");
const https = require("https");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const agent = new https.Agent({ keepAlive: true, maxSockets: 8 });

const ENDPOINTS = [
  { id: "B", url: (s) => `https://music.163.com/api/search/get?s=${s}&type=1&limit=10` },
  { id: "C", url: (s) => `https://music.163.com/api/cloudsearch/pc?s=${s}&type=1&limit=10&offset=0` },
  { id: "D", url: (s) => `https://music.163.com/api/search/suggest/web?s=${s}&limit=10` },
  { id: "A", url: (s) => `https://music.163.com/api/search/get/web?s=${s}&type=1&offset=0&total=true&limit=10` },
  { id: "E", url: (s) => `https://music.163.com/api/search/get?s=${s}&type=1&limit=30` },
];

const STATE_FILE = require("path").join(__dirname, "matches_v2.json");
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
const cooldown = {};

function get(url) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        agent,
        headers: {
          "User-Agent": UA,
          Referer: "https://music.163.com/",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        timeout: 25000,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(d));
      }
    );
    req.on("error", () => resolve(""));
    req.on("timeout", () => {
      req.destroy();
      resolve("");
    });
  });
}
function nextEndpoint() {
  const now = Date.now();
  for (const ep of ENDPOINTS) if (!cooldown[ep.id] || cooldown[ep.id] < now) return ep;
  return null;
}

function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\(feat\.?[^)]*\)|\[feat\.?[^\]]*\]/gi, " ")
    .replace(/\bfeat\.?\b|\bft\.?\b/gi, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function baseTitle(s) {
  return norm(
    String(s)
      .replace(/[（(][^)）]*[)）]/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
  );
}
function tokens(s) {
  return norm(s).split(" ").filter(Boolean);
}
function jaccard(a, b) {
  const A = new Set(tokens(a)),
    B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((x) => {
    if (B.has(x)) inter++;
  });
  return inter / (A.size + B.size - inter);
}
function levRatio(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (!a || !b) return 0;
  const m = a.length,
    n = b.length;
  if (Math.abs(m - n) > Math.max(m, n) * 0.7) return 0;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let k = 1; k <= n; k++) {
      cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

function titleScore(qTitle, rName) {
  const qn = norm(qTitle),
    qb = baseTitle(qTitle),
    rn = norm(rName),
    rb = baseTitle(rName);
  if (!qn || !rn) return 0;
  if (rn === qn || (qb && rb === qb)) return 1;

  const minLen = Math.min(qb.length, rb.length);
  if (qb && rb && minLen >= 4 && (rb.indexOf(qb) === 0 || qb.indexOf(rb) === 0)) return 0.95;
  if (qn.length >= 3 && (rn.indexOf(qn) === 0 || rn.indexOf(qn) > -1)) return 0.9;
  if (qb && rb && minLen >= 4 && rb.indexOf(qb) > -1) return 0.85;
  const j = Math.max(jaccard(qTitle, rName), jaccard(qb, rb) * 0.92);
  const l = Math.max(levRatio(qn, rn), qb && rb ? levRatio(qb, rb) : 0);
  return Math.max(j, l);
}

function artistScore(qArtist, rArtists) {
  if (!qArtist) return null;
  const qRaw = String(qArtist).replace(/[（(][^)）]*[)）]/g, " ");
  const qFull = norm(qRaw);
  const parts = qRaw
    .split(/\s*[\/&,、]\s*|\s+(?:and|x)\s+/i)
    .map(norm)
    .filter((x) => x.length > 1);
  const ra = (rArtists || []).map(norm).filter(Boolean);
  if (!ra.length || !qFull) return 0;
  let best = 0;
  const short = qFull.length < 8;
  ra.forEach((r) => {
    if (r === qFull) {
      best = 1;
      return;
    }
    if (r.indexOf(qFull) > -1 || qFull.indexOf(r) > -1) best = Math.max(best, 0.9);
    const lr = levRatio(qFull, r);
    if (!short || lr >= 0.92) best = Math.max(best, lr * 0.96);
    parts.forEach((p) => {
      if (p === r) best = Math.max(best, 1);
      else if (p.length >= 4 && (r.indexOf(p) > -1 || p.indexOf(r) > -1)) best = Math.max(best, 0.9);
      else best = Math.max(best, jaccard(p, r) * 0.95);
    });
  });
  return best;
}

function parseSides(text) {
  const clean = String(text)
    .replace(/【[^】]*】/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const parts = clean.split(/\s+-\s+/).filter(Boolean);
  if (parts.length >= 2) return { a: parts[0].trim(), b: parts.slice(1).join(" - ").trim(), clean };
  return { a: clean, b: "", clean };
}

function isNonTrack(t) {
  const s = String(t);
  if (s.length > 95) return true;
  if (/[|；;]/.test(s)) return true;
  if (/etc\.|等等|以下|如下/.test(s)) return true;
  if ((s.match(/\s+-\s+/g) || []).length >= 3) return true;
  if (/^[（(]?\d+\s*(stage|阶段)/i.test(s)) return true;
  if (!/\s+-\s+/.test(s) && !/[\u2013\u2014]/.test(s)) return true;
  return false;
}

function evalSongs(text, songs, minT, minA) {
  const { a, b } = parseSides(text);
  let best = null;
  songs.forEach((s, i) => {
    const rName = s.name || "";
    const rArtists = (s.artists || s.ar || []).map((x) => x.name || "");
    const t1 = titleScore(a, rName),
      a1 = artistScore(b, rArtists);
    const t2 = b ? titleScore(b, rName) : 0,
      a2 = a ? artistScore(a, rArtists) : 0;
    const s1 = t1 * 0.62 + (a1 === null ? 0.3 : a1 * 0.38) - i * 0.012;
    const s2 = t2 * 0.62 + (a2 === null ? 0.3 : a2 * 0.38) - i * 0.012;
    const use = s1 >= s2 ? { t: t1, a: a1, sc: s1, order: "T-A" } : { t: t2, a: a2, sc: s2, order: "A-T" };
    if (use.t >= minT && (use.a === null || use.a >= minA)) {
      if (!best || use.sc > best.sc) best = { song: s, ...use };
    }
  });
  return best;
}

const examples = JSON.parse(fs.readFileSync(require("path").join(__dirname, "examples.json"), "utf8"));
const unique = [...new Set(examples.map((e) => e.text))];
const todo = unique.filter((t) => !state[t]);
console.log("v2 todo:", todo.length, "done:", unique.length - todo.length);

let cursor = 0,
  done = 0,
  matched = 0,
  failed = 0,
  skipped = 0,
  rl = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state));

async function worker() {
  while (true) {
    const idx = cursor++;
    if (idx >= todo.length) return;
    const text = todo[idx];

    if (isNonTrack(text)) {
      state[text] = { ok: false, nonTrack: true };
      skipped++;
      done++;
      continue;
    }

    const { a, b, clean } = parseSides(text);
    const simple = (a.replace(/[（(][^)）]*[)）]/g, " ") + " " + b).replace(/\s+/g, " ").trim();
    const plans = [
      { q: clean, minT: 0.78, minA: 0.5 },
      { q: b ? b + " " + a : "", minT: 0.78, minA: 0.5 },
      { q: simple, minT: 0.78, minA: 0.5 },
      { q: a, minT: 0.95, minA: 0.6 },
      { q: b, minT: 0.9, minA: 0.6, ep: "E" },
    ].filter((p) => p.q && p.q.length > 1);

    let hit = null;
    for (let pi = 0; pi < plans.length && !hit; pi++) {
      const plan = plans[pi];
      let ep = plan.ep ? ENDPOINTS.find((e) => e.id === plan.ep) : nextEndpoint();
      if (!ep || (cooldown[ep.id] && cooldown[ep.id] > Date.now())) ep = nextEndpoint();
      if (!ep) {
        await sleep(3000);
        pi--;
        continue;
      }
      const body = await get(ep.url(encodeURIComponent(plan.q.slice(0, 120))));
      if (!body) {
        await sleep(1500);
        pi--;
        continue;
      }
      if (/操作频繁/.test(body)) {
        cooldown[ep.id] = Date.now() + 30000;
        rl++;
        pi--;
        await sleep(1200);
        continue;
      }
      let songs = [];
      try {
        const j = JSON.parse(body);
        songs = (j.result && j.result.songs) || [];
      } catch (e) {}
      const best = evalSongs(text, songs, plan.minT, plan.minA);
      if (best) hit = { best, plan: pi };
      if (!hit) await sleep(2200 + Math.random() * 800);
    }

    if (hit) {
      const s = hit.best.song;
      state[text] = {
        ok: true,
        id: s.id,
        name: s.name,
        artist: ((s.artists || s.ar || []).map((x) => x.name) || []).join(" / "),
        p: hit.plan,
        t: +hit.best.t.toFixed(2),
        a: hit.best.a === null ? null : +hit.best.a.toFixed(2),
      };
      matched++;
    } else {
      state[text] = { ok: false };
      failed++;
    }
    done++;
    if (done % 40 === 0) {
      save();
      console.log(
        `[${done}/${todo.length}] ok=${matched} fail=${failed} nonTrack=${skipped} rl=${rl} elapsed=${(
          (Date.now() - t0) / 1000
        ).toFixed(0)}s`
      );
    }
    await sleep(2200 + Math.random() * 800);
  }
}

Promise.all(Array.from({ length: 4 }, worker)).then(() => {
  save();
  const all = Object.keys(state);
  const okc = all.filter((k) => state[k].ok).length;
  console.log(`V2 DONE total=${all.length} matched=${okc} (${((okc / all.length) * 100).toFixed(1)}%)`);
  process.exit(0);
});
