
const fs = require("fs");
const path = require("path").join(__dirname, "..", "netease.js");
const src = process.argv[2] || require("path").join(__dirname, "matches_v2.json");
const matches = JSON.parse(fs.readFileSync(src, "utf8"));
const total = Object.keys(matches).length;
const ok = Object.entries(matches).filter(([, v]) => v.ok);

const lines = ok
  .sort((a, b) => (a[0] < b[0] ? -1 : 1))
  .map(([k, v]) => {
    const label = [v.name, v.artist].filter(Boolean).join(" · ");
    return "  " + JSON.stringify(k) + ": [" + v.id + ", " + JSON.stringify(label) + "],";
  });

const out =
  "/* ==========================================================================\n" +
  "   例曲 → 网易云音乐 跳转表（自动生成，可整体删除）\n" +
  "   --------------------------------------------------------------------------\n" +
  "   生成方式：按「曲名 - 艺术家」检索网易云音乐，逐条校验曲名与艺术家后写入。\n" +
  "   格式：\"例曲原文\": [歌曲 ID, \"匹配到的曲名 · 艺术家\"]\n" +
  "   删除本文件不会影响其它功能，只是详情页不再显示「网易云」跳转按钮。\n" +
  "   匹配成功：" +
  ok.length +
  " / " +
  total +
  " 条，生成时间：" +
  new Date().toISOString().slice(0, 10) +
  "\n" +
  "   ========================================================================== */\n" +
  "window.NETEASE_LINKS = {\n" +
  lines.join("\n") +
  "\n};\n";

fs.writeFileSync(path, out);
console.log("wrote", path, (out.length / 1024).toFixed(1) + "KB", "entries:", ok.length);
