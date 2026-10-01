

const fs = require("fs");
const https = require("https");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const agent = new https.Agent({ keepAlive: true, maxSockets: 6 });

const ENDPOINTS = [
  { id: "B", url: (s) => `https://music.163.com/api/search/get?s=${s}&type=1&limit=10` },
  { id: "C", url: (s) => `https://music.163.com/api/cloudsearch/pc?s=${s}&type=1&limit=10&offset=0` },
  { id: "D", url: (s) => `https://music.163.com/api/search/suggest/web?s=${s}&limit=10` },
  { id: "E", url: (s) => `https://music.163.com/api/search/get?s=${s}&type=1&limit=30` },
];
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
    .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\u4e00-\u9faf]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function baseTitle(s) {
  return norm(String(s).replace(/[（(][^)）]*[)）]/g, " ").replace(/\[[^\]]*\]/g, " "));
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
  if (Math.abs(m - n) > Math.max(m, n) * 0.75) return 0;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let k = 1; k <= n; k++) {
      cur[k] = Math.min(prev[k] + 1, prev[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
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
  if (rn === qn || (qb && rb && rb === qb)) return 1;
  if (qb && rb && rb.length >= 3 && (rb.indexOf(qb) === 0 || qb.indexOf(rb) === 0)) return 0.95;
  if (qn.length >= 3 && (rn.indexOf(qn) === 0 || rn.indexOf(qn) > -1)) return 0.9;
  if (qb && rb && rb.length >= 3 && rb.indexOf(qb) > -1) return 0.85;
  return Math.max(jaccard(qTitle, rName), levRatio(qn, rn), qb && rb ? levRatio(qb, rb) : 0);
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
  ra.forEach((r) => {
    if (r === qFull) best = Math.max(best, 1);
    if (r.indexOf(qFull) > -1 || qFull.indexOf(r) > -1) best = Math.max(best, 0.9);
    best = Math.max(best, levRatio(qFull, r) * 0.95);
    parts.forEach((p) => {
      if (p === r) best = Math.max(best, 1);
      else if (r.indexOf(p) > -1 || p.indexOf(r) > -1) best = Math.max(best, 0.9);
      else best = Math.max(best, jaccard(p, r));
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
    const s1 = t1 * 0.65 + (a1 === null ? 0.35 : a1 * 0.35) - i * 0.01;
    const s2 = t2 * 0.65 + (a2 === null ? 0.35 : a2 * 0.35) - i * 0.01;
    const use = s1 >= s2 ? { t: t1, a: a1, sc: s1 } : { t: t2, a: a2, sc: s2 };
    if (use.t >= minT && (use.a === null || use.a >= minA)) {
      if (!best || use.sc > best.sc) best = { song: s, ...use };
    }
  });
  return best;
}

const STATE_FILE = require("path").join(__dirname, "matches_v2.json");
const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
const failedTexts = Object.keys(state).filter((k) => !state[k].ok);
console.log("Starting ultimate rescue for", failedTexts.length, "failed items...");

let done = 0,
  rescued = 0,
  rl = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state));

async function worker() {
  while (true) {
    if (done >= failedTexts.length) return;
    const idx = done++;
    const text = failedTexts[idx];
    const { a, b, clean } = parseSides(text);
    const queries = [
      clean,
      b ? b + " " + a : "",
      a.replace(/[（(][^)）]*[)）]/g, "").trim(),
      a,
    ].filter((q) => q && q.length > 1);

    let hit = null;
    for (let qi = 0; qi < queries.length && !hit; qi++) {

      let emptyTries = 0;
      for (let attempt = 0; attempt < 3 && !hit; attempt++) {
        const ep = nextEndpoint();
        if (!ep) {
          await sleep(3000);
          attempt--;
          continue;
        }
        const body = await get(ep.url(encodeURIComponent(queries[qi].slice(0, 110))));
        if (!body) {
          await sleep(1500);
          attempt--;
          continue;
        }
        if (/操作频繁/.test(body)) {
          cooldown[ep.id] = Date.now() + 30000;
          rl++;
          attempt--;
          await sleep(1200);
          continue;
        }
        let songs = [];
        try {
          const j = JSON.parse(body);
          songs = (j.result && j.result.songs) || [];
        } catch (e) {}
        if (!songs.length) {

          emptyTries++;
          cooldown[ep.id] = Date.now() + 4000;
          await sleep(2500 + Math.random() * 1500);
          continue;
        }
        const best = evalSongs(text, songs, 0.78, 0.5);
        if (best) hit = best;
        break;
      }
      if (!hit) await sleep(1600 + Math.random() * 600);
    }

    if (hit) {
      const s = hit.song;
      state[text] = {
        ok: true,
        id: s.id,
        name: s.name,
        artist: ((s.artists || s.ar || []).map((x) => x.name) || []).join(" / "),
        via: "rescue",
      };
      rescued++;
    }
    if ((idx + 1) % 30 === 0) {
      save();
      console.log(`[${idx + 1}/${failedTexts.length}] rescued=${rescued} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
}

Promise.all(Array.from({ length: 4 }, worker)).then(() => {
  save();
  const all = Object.keys(state);
  const okc = all.filter((k) => state[k].ok).length;
  console.log(`RESCUE DONE total=${all.length} matched=${okc} (${((okc / all.length) * 100).toFixed(1)}%)`);
  process.exit(0);
});
