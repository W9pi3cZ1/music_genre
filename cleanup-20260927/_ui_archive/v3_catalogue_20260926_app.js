/* ==========================================================================
   神秘电子音乐体系 · app.js (UI v3 "CATALOGUE")
   --------------------------------------------------------------------------
   保留原有能力：模糊搜索 + 高亮 / 键盘导航 / 深链 (#曲风名) / 焦点陷阱 /
   giscus 加载与失败状态 / 移动端下拉关闭
   版式改为「印刷目录」：左目录 + 卷首 + 篇章分节 + 右侧翻页卡（详情）
   新增：目录滚动联动、随机一条、关联条目互跳、复制链接、深浅配色
   ========================================================================== */
(function () {
  "use strict";

  var board = document.getElementById("board");
  var tocEl = document.getElementById("toc");
  var tocList = document.getElementById("toc-list");
  var masthead = document.getElementById("masthead");

  /* ------------------------------- helpers -------------------------------- */
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c;
    });
  }
  // 数据里的字面 <br> 是作者手写的换行标记：分段各自转义，仅 <br> 还原成真实换行
  function escBr(s) {
    return String(s)
      .split(/<br\s*\/?>/i)
      .map(esc)
      .join("<br>");
  }
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  // 把 【https://…】 与裸链接转成可点小链接（操作对象已是转义后的文本）
  var URL_RE = /【\s*(https?:\/\/[^】\s]+?)\s*】|(https?:\/\/[A-Za-z0-9\-._~:\/?#\[\]@!$&'()*+,;=%]+)/g;
  function linkify(html) {
    return String(html).replace(URL_RE, function (m, bracketed, bare) {
      var url = bracketed || bare;
      var tail = "";
      var label = "↗";
      if (!bracketed) {
        var t = /[.,;:!?]+$/.exec(url);
        if (t) {
          url = url.slice(0, -t[0].length);
          tail = t[0];
        }
        while (url.slice(-1) === ")" && url.split("(").length < url.split(")").length) {
          url = url.slice(0, -1);
          tail = ")" + tail;
        }
        var dm = /^https?:\/\/([^\/]+)/i.exec(url);
        label = (dm ? dm[1].replace(/^www\./i, "") : "链接") + " ↗";
      }
      return (
        '<a class="link-out" href="' + url + '" target="_blank" rel="noopener" title="打开链接">' +
        esc(label) +
        "</a>" +
        tail
      );
    });
  }

  /* -------------------------------- 数据索引 ------------------------------- */
  if (typeof DATA === "undefined" || !DATA.chapters || !DATA.genres) {
    board.innerHTML =
      '<div class="no-desc"><div class="nd-zh">数据加载失败</div>' +
      '<span class="nd-hint">data.js 未能读取，请刷新重试</span></div>';
    return;
  }

  var GENRES = DATA.genres;
  var CC = {};
  var CHAPTER_NO = {};

  var chapters = DATA.chapters.filter(function (ch) {
    return ch && ch.tree && ch.tree.length;
  });
  chapters.forEach(function (ch, i) {
    CC[ch.name] = ch.color || "#8a8a8a";
    CHAPTER_NO[ch.name] = pad2(i + 1);
  });

  function normKey(s) {
    return String(s)
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\*+$/, "")
      .replace(/[_\-/\\]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  var NORM_KEYS = new Map();
  Object.keys(GENRES).forEach(function (k) {
    var n = normKey(k);
    if (!NORM_KEYS.has(n)) NORM_KEYS.set(n, []);
    NORM_KEYS.get(n).push(k);
  });
  function findGenre(label) {
    if (!label) return null;
    var raw = String(label).toLowerCase();
    if (GENRES[raw]) return GENRES[raw];
    var n1 = normKey(label);
    var exact = NORM_KEYS.get(n1);
    if (exact) return GENRES[exact[0]];
    var n2 = n1.replace(/ /g, "");
    var hit = null;
    NORM_KEYS.forEach(function (ks, n) {
      if (!hit && n.replace(/ /g, "") === n2) hit = GENRES[ks[0]];
    });
    if (hit) return hit;
    var cands = Object.keys(GENRES).filter(function (k) {
      return normKey(k).indexOf(n1) !== -1 && normKey(k) !== n1;
    });
    if (cands.length === 1) return GENRES[cands[0]];
    return null;
  }

  function countTree(nodes) {
    var n = 0;
    (function walk(list) {
      list.forEach(function (x) {
        n++;
        if (x.children && x.children.length) walk(x.children);
      });
    })(nodes);
    return n;
  }

  /* ------------------------------- 构建版面 -------------------------------- */
  var ROW_MAP = new Map(); // normKey(label) -> row
  var GENRE_ROW = new Map(); // genre object -> row
  var totalNodes = 0;
  var totalDesc = 0;

  function treeHtml(nodes, level, chapterName) {
    var h = '<ul class="tree">';
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var has = !!findGenre(n.label);
      var kids = n.children || [];
      h +=
        "<li>" +
        '<div class="row l' +
        Math.min(level, 4) +
        (has ? " has-desc" : " no-desc") +
        '" data-name="' +
        esc(n.label) +
        '" data-chapter="' +
        esc(chapterName) +
        '" data-desc="' +
        (has ? "1" : "0") +
        '" title="' +
        esc(n.label) +
        '"><span class="dot"></span><span class="lbl">' +
        esc(n.label) +
        "</span></div>";
      if (kids.length) h += treeHtml(kids, level + 1, chapterName);
      h += "</li>";
    }
    return h + "</ul>";
  }

  function chapterHtml(ch, i) {
    var nodeCount = countTree(ch.tree);
    var descCount = 0;
    Object.keys(GENRES).forEach(function (k) {
      if (GENRES[k].chapter === ch.name) descCount++;
    });
    totalNodes += nodeCount;
    totalDesc += descCount;
    return (
      '<section class="chapter" id="ch-' +
      i +
      '" data-chapter="' +
      esc(ch.name) +
      '" style="--cc:' +
      esc(ch.color || "#8a8a8a") +
      '">' +
      '<header class="chapter-head">' +
      '<div class="chapter-titlebar">' +
      '<span class="chapter-no">' +
      CHAPTER_NO[ch.name] +
      "</span>" +
      '<h2 class="chapter-title">' +
      esc(ch.name) +
      "</h2>" +
      "</div>" +
      '<div class="chapter-side">' +
      '<span class="chapter-meta">' +
      nodeCount +
      " 个条目 · " +
      descCount +
      " 篇介绍</span>" +
      '<button type="button" class="chapter-toggle" aria-expanded="true" aria-controls="ch-body-' +
      i +
      '"><span class="tg-ico" aria-hidden="true"></span><span class="tg-txt">折叠</span></button>' +
      "</div>" +
      "</header>" +
      '<div class="chapter-body" id="ch-body-' +
      i +
      '">' +
      treeHtml(ch.tree, 0, ch.name) +
      "</div>" +
      "</section>"
    );
  }

  var chaptersHtml = chapters.map(chapterHtml).join("");

  var heroHtml =
    '<section class="hero">' +
    '<h1 class="hero-title">电子音乐风格体系</h1>' +
    '<p class="hero-sub">An Electronic Music Taxonomy</p>' +
    '<p class="hero-deck">收录 UK Bass、US Bass、HDM、Hardcore、Trance、Techno、House、Breakbeat 等 ' +
    chapters.length +
    " 个篇章、共 " +
    totalNodes +
    " 条曲风条目，其中 " +
    totalDesc +
    " 条附有介绍。点击任意条目展开详情，按 / 直接搜索。</p>" +
    '<div class="hero-stats">' +
    '<span class="stat"><b>' +
    chapters.length +
    "</b>篇章</span>" +
    '<span class="stat"><b>' +
    totalNodes +
    "</b>条目</span>" +
    '<span class="stat"><b>' +
    totalDesc +
    "</b>篇介绍</span>" +
    '<button type="button" class="ghost-btn" id="random-btn">随便看一条</button>' +
    '<a class="ghost-btn" href="https://www.bilibili.com/video/BV1tusFePEUM/?share_source=copy_web&amp;vd_source=4a668a5ff37aa77ec566058febd2633a" target="_blank" rel="noopener">资料来源 ↗</a>' +
    "</div>" +
    "</section>";

  var colophonHtml =
    '<footer class="colophon">' +
    '<div class="colo-brand">神秘电子音乐体系</div>' +
    '<a class="colo-top" href="#top">回到顶部 ↑</a>' +
    '<div class="colo-lines">' +
    "<p>由 叶亦苏 Yeisu（YeisuQwQ）整理维护。资料来源于 B 站视频《全网最全！1000+个电音风格/标签科普介绍视频》。</p>" +
    '<p>发现错误或有补充，欢迎前往 <a href="https://github.com/YeisuQwQ/music_genre/issues" target="_blank" rel="noopener">GitHub Issues</a>，或联系 QQ 3069309919。</p>' +
    "</div>" +
    "</footer>";

  board.innerHTML = heroHtml + chaptersHtml + colophonHtml;

  var sections = $$(".chapter", board);
  var allRows = $$(".row", board);

  allRows.forEach(function (row) {
    var nk = normKey(row.dataset.name);
    if (!ROW_MAP.has(nk)) ROW_MAP.set(nk, row);
    var g = findGenre(row.dataset.name);
    if (g && !GENRE_ROW.has(g)) GENRE_ROW.set(g, row);
  });

  /* ------------------------------- 篇章目录 -------------------------------- */
  tocList.innerHTML = chapters
    .map(function (ch, i) {
      return (
        "<li>" +
        '<a class="toc-item" href="#ch-' +
        i +
        '" data-i="' +
        i +
        '" style="--cc:' +
        esc(ch.color || "#8a8a8a") +
        '">' +
        '<span class="toc-tick" aria-hidden="true"></span>' +
        '<span class="toc-no">' +
        CHAPTER_NO[ch.name] +
        "</span>" +
        '<span class="toc-name">' +
        esc(ch.name) +
        "</span>" +
        '<span class="toc-n">' +
        countTree(ch.tree) +
        "</span>" +
        "</a></li>"
      );
    })
    .join("");

  var tocItems = $$(".toc-item", tocList);
  var tocTotal = document.getElementById("toc-total");
  if (tocTotal) tocTotal.textContent = chapters.length;
  var tocFoot = document.getElementById("toc-foot");
  if (tocFoot) {
    tocFoot.innerHTML =
      "共 " + totalNodes + " 条曲风 · " + totalDesc + " 篇介绍<br />按 / 搜索，Esc 关闭面板";
  }

  function tocIsHorizontal() {
    return tocEl.scrollWidth > tocEl.clientWidth + 4;
  }
  function ensureTocVisible(item) {
    if (!item) return;
    var horiz = tocIsHorizontal();
    if (horiz) {
      var target = item.offsetLeft - tocEl.clientWidth / 2 + item.offsetWidth / 2;
      var max = tocEl.scrollWidth - tocEl.clientWidth;
      tocEl.scrollTo({ left: Math.max(0, Math.min(max, target)), behavior: "smooth" });
    } else {
      var it = item.offsetTop;
      var ib = it + item.offsetHeight;
      var st = tocEl.scrollTop;
      var sb = st + tocEl.clientHeight;
      if (it < st + 8 || ib > sb - 8) {
        tocEl.scrollTo({
          top: Math.max(0, it - tocEl.clientHeight / 2 + item.offsetHeight / 2),
          behavior: "smooth",
        });
      }
    }
  }

  var spyActive = -1;
  function setTocActive(i) {
    if (i === spyActive) return;
    spyActive = i;
    tocItems.forEach(function (b, k) {
      b.classList.toggle("on", k === i);
    });
    ensureTocVisible(tocItems[i]);
  }

  function jumpToChapter(i, smooth) {
    var sec = sections[i];
    if (!sec) return;
    sec.classList.remove("collapsed");
    var tg = $(".chapter-toggle", sec);
    if (tg) {
      tg.setAttribute("aria-expanded", "true");
      var txt = $(".tg-txt", tg);
      if (txt) txt.textContent = "折叠";
    }
    sec.scrollIntoView({ behavior: smooth === false ? "auto" : "smooth", block: "start" });
    setTocActive(i);
  }

  tocItems.forEach(function (item, i) {
    item.addEventListener("click", function (e) {
      e.preventDefault();
      jumpToChapter(i);
    });
  });

  /* ------------------------------- 滚动联动 -------------------------------- */
  function probeOffset() {
    var off = 24;
    if (masthead && getComputedStyle(masthead).position === "sticky") {
      off += masthead.getBoundingClientRect().height;
    }
    if (tocEl && getComputedStyle(tocEl).position === "sticky" && tocIsHorizontal()) {
      off += tocEl.getBoundingClientRect().height;
    }
    return off;
  }
  function updateSpy() {
    if (!sections.length) return;
    var probe = window.scrollY + probeOffset();
    var best = 0;
    for (var i = 0; i < sections.length; i++) {
      var top = sections[i].getBoundingClientRect().top + window.scrollY;
      if (top <= probe) best = i;
    }
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 6) {
      best = sections.length - 1;
    }
    setTocActive(best);
  }
  var spyTick = false;
  window.addEventListener(
    "scroll",
    function () {
      if (spyTick) return;
      spyTick = true;
      requestAnimationFrame(function () {
        spyTick = false;
        updateSpy();
      });
    },
    { passive: true }
  );
  window.addEventListener("resize", updateSpy);

  /* -------------------------------- 计数 ---------------------------------- */
  var countText =
    chapters.length + " 篇章 · " + totalNodes + " 节点 · " + totalDesc + " 篇介绍";
  var aboutStats = document.getElementById("about-stats");
  if (aboutStats) aboutStats.textContent = countText;

  /* -------------------------------- 详情 ---------------------------------- */
  var detailEl = document.getElementById("detail");
  var detailInner = document.getElementById("detail-inner");
  var dimEl = document.getElementById("dim");
  var currentRow = null;

  function isMobile() {
    return window.matchMedia("(max-width: 900px)").matches;
  }
  function selectRow(row) {
    if (currentRow && currentRow !== row) currentRow.classList.remove("sel");
    currentRow = row;
    if (row) row.classList.add("sel");
  }
  function setHash(name) {
    try {
      history.replaceState(null, "", "#" + encodeURIComponent(name));
    } catch (e) {}
  }
  function clearHash() {
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {}
  }
  function openDetail() {
    detailEl.classList.add("show");
    if (isMobile() && dimEl) {
      dimEl.classList.add("show");
      document.body.classList.add("locked");
    }
    detailEl.scrollTop = 0;
  }
  function closeDetail(skipHash) {
    if (!detailEl.classList.contains("show")) {
      if (!skipHash) clearHash();
      return;
    }
    detailEl.classList.remove("show");
    if (dimEl) dimEl.classList.remove("show");
    document.body.classList.remove("locked");
    selectRow(null);
    if (!skipHash) clearHash();
  }

  function sec(label, inner) {
    return (
      '<section class="d-sec"><h3 class="d-label">' + label + "</h3>" + inner + "</section>"
    );
  }
  function relRowFor(value) {
    var row = ROW_MAP.get(normKey(value));
    if (row) return row;
    var g = findGenre(value);
    if (g && GENRE_ROW.has(g)) return GENRE_ROW.get(g);
    return null;
  }
  function relBlock(label, note, arr) {
    if (!arr || !arr.length) return "";
    var parts = arr.map(function (v) {
      var row = relRowFor(v);
      if (row) {
        return (
          '<button type="button" class="rel-link" data-name="' +
          esc(row.dataset.name) +
          '">' +
          esc(v) +
          "</button>"
        );
      }
      // 数据里有介绍、但目录树中没有出现的曲风：仍然可以直接打开
      if (findGenre(v)) {
        return (
          '<button type="button" class="rel-link" data-genre="' + esc(v) + '">' + esc(v) + "</button>"
        );
      }
      return "<span>" + esc(v) + "</span>";
    });
    return (
      '<div class="d-rel"><dt>' +
      esc(label) +
      "<i>" +
      esc(note) +
      "</i></dt><dd>" +
      parts.join('<span class="rel-sep">·</span>') +
      "</dd></div>"
    );
  }

  function showDetail(name, chapter) {
    var g = findGenre(name);
    var cc = CC[chapter] || "#8a8a8a";
    detailEl.style.setProperty("--cc", cc);

    var h = "";
    h += '<div class="d-chapter"><span class="d-dot" aria-hidden="true"></span>';
    h += esc(chapter || "未分类") + (CHAPTER_NO[chapter] ? " · " + CHAPTER_NO[chapter] : "");
    h += "</div>";
    h += '<h2 class="d-title" id="detail-title">' + esc(name) + "</h2>";
    if (g && g.aka) h += '<div class="d-aka">A.K.A. ' + esc(g.aka) + "</div>";
    if (g && g.chapter && g.chapter !== chapter) {
      h += '<div class="d-xref">↳ 详细介绍来自「' + esc(g.chapter) + "」篇章</div>";
    }

    if (!g || !g.desc) {
      h +=
        '<div class="no-desc"><div class="nd-zh">暂无详细介绍</div>' +
        '<span class="nd-hint">欢迎在讨论区补充这一曲风的资料</span></div>';
      h +=
        '<footer class="d-foot"><button type="button" class="d-copy" data-name="' +
        esc(name) +
        '">复制链接</button></footer>';
      detailInner.innerHTML = h;
      openDetail();
      setHash(name);
      return;
    }

    h += sec("简介", '<div class="d-desc">' + linkify(escBr(g.desc)) + "</div>");

    var rels =
      relBlock("上位", "影响 / 衍生来源", g.ups) +
      relBlock("下位", "派生子风格", g.downs) +
      (g.related
        ? '<div class="d-rel"><dt>相关<i>Related To</i></dt><dd>' +
          esc(g.related) +
          "</dd></div>"
        : "");
    if (rels) h += sec("关联", rels);

    if (g.examples && g.examples.length) {
      var ex =
        '<ol class="d-ex">' +
        g.examples
          .map(function (ex2, i) {
            return (
              '<li><span class="ex-no">' +
              pad2(i + 1) +
              '</span><span class="ex-t">' +
              linkify(escBr(ex2)) +
              "</span></li>"
            );
          })
          .join("") +
        "</ol>";
      h += sec("例曲", ex);
    }

    h +=
      '<footer class="d-foot"><button type="button" class="d-copy" data-name="' +
      esc(name) +
      '">复制链接</button></footer>';

    detailInner.innerHTML = h;
    openDetail();
    setHash(name);
  }

  function flashRow(row) {
    row.classList.remove("flash");
    void row.offsetWidth;
    row.classList.add("flash");
    setTimeout(function () {
      row.classList.remove("flash");
    }, 1200);
  }

  // 打开某条曲风（并保证它可见）
  function openRow(row, opts) {
    if (!row) return;
    opts = opts || {};
    var secEl = row.closest(".chapter");
    if (secEl && secEl.classList.contains("collapsed")) {
      secEl.classList.remove("collapsed");
      var tg = $(".chapter-toggle", secEl);
      if (tg) {
        tg.setAttribute("aria-expanded", "true");
        var txt = $(".tg-txt", tg);
        if (txt) txt.textContent = "折叠";
      }
    }
    selectRow(row);
    showDetail(row.dataset.name, row.dataset.chapter);
    if (opts.reveal !== false) {
      row.scrollIntoView({
        behavior: opts.instant ? "auto" : "smooth",
        block: "center",
      });
      flashRow(row);
    }
  }

  /* -------------------------------- 搜索 ---------------------------------- */
  var searchInput = document.getElementById("search");
  var searchBox = document.getElementById("search-results");
  var searchMatches = [];
  var searchTimer = null;
  var srActive = -1;

  function normClean(s) {
    var keep = [];
    var map = [];
    for (var i = 0; i < s.length; i++) {
      var c = s[i].toLowerCase();
      if (/[\s\-_（）()\[\]【】·,，.、/\\"''']/.test(c)) continue;
      keep.push(c);
      map.push(i);
    }
    return { clean: keep.join(""), map: map };
  }
  function editDist(a, b) {
    var prev = new Array(b.length + 1);
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      var cur = [i];
      for (var k = 1; k <= b.length; k++) {
        cur[k] = Math.min(
          prev[k] + 1,
          cur[k - 1] + 1,
          prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }
  function fuzzySearch(q, name) {
    var qn = q.clean;
    var nn = name.clean;
    if (!qn || !nn) return null;
    if (nn.indexOf(qn) !== -1) {
      var idx = nn.indexOf(qn);
      return { score: 100 - idx * 0.5, start: idx, len: qn.length, type: "contains" };
    }
    if (qn.length < 2) return null;
    var thr = qn.length <= 3 ? 1 : Math.min(2, Math.floor(qn.length / 3));
    var best = { d: 99, start: -1, L: qn.length };
    for (var L = qn.length; L <= qn.length + 1; L++) {
      for (var s = 0; s + L <= nn.length; s++) {
        var d = editDist(qn, nn.slice(s, s + L));
        if (d < best.d) best = { d: d, start: s, L: L };
      }
    }
    if (best.d <= thr && best.start >= 0) {
      return { score: 70 - best.d * 8, start: best.start, len: best.L, type: "fuzzy" };
    }
    var p = 0;
    var matched = [];
    for (var i2 = 0; i2 < nn.length && p < qn.length; i2++) {
      if (nn[i2] === qn[p]) {
        matched.push(i2);
        p++;
      }
    }
    if (p === qn.length) {
      return {
        score: 50 - (nn.length - qn.length) * 0.3,
        start: matched[0],
        len: matched.length,
        matched: matched,
        type: "subseq",
      };
    }
    return null;
  }

  function clearActiveOption() {
    srActive = -1;
    if (searchInput) searchInput.removeAttribute("aria-activedescendant");
  }
  function setActiveOption(i) {
    var items = $$(".sr-item", searchBox);
    if (!items.length) {
      clearActiveOption();
      return;
    }
    if (i < 0) i = items.length - 1;
    if (i >= items.length) i = 0;
    srActive = i;
    items.forEach(function (it, k) {
      it.setAttribute("aria-selected", k === i ? "true" : "false");
    });
    var id = items[i].id;
    if (searchInput && id) searchInput.setAttribute("aria-activedescendant", id);
    if (items[i].scrollIntoView) items[i].scrollIntoView({ block: "nearest" });
  }
  function hideSearch() {
    searchBox.style.display = "none";
    searchBox.innerHTML = "";
    searchInput.setAttribute("aria-expanded", "false");
    clearActiveOption();
  }

  function doSearch(q) {
    q = q.toLowerCase().trim();
    clearActiveOption();
    if (!q) {
      hideSearch();
      return;
    }
    var qc = normClean(q);
    var scored = [];
    allRows.forEach(function (row) {
      var nc = normClean(row.dataset.name);
      var r = fuzzySearch(qc, nc);
      if (r) scored.push({ row: row, r: r, nc: nc });
    });
    scored.sort(function (a, b) {
      return b.r.score - a.r.score || a.r.start - b.r.start;
    });
    if (!scored.length) {
      searchBox.style.display = "block";
      searchBox.innerHTML =
        '<div class="sr-empty">没有找到与「' + esc(q) + "」相关的曲风</div>";
      searchInput.setAttribute("aria-expanded", "true");
      return;
    }
    var exact = scored.filter(function (x) {
      return x.r.type === "contains";
    }).slice(0, 40);
    var fuzzy = scored.filter(function (x) {
      return x.r.type !== "contains";
    }).slice(0, 20);
    searchMatches = exact.concat(fuzzy).map(function (x) {
      return x.row;
    });

    function itemHtml(x, i) {
      var row = x.row;
      var r = x.r;
      var nc = x.nc;
      var name = row.dataset.name;
      var ori = [];
      if (r.type === "contains") {
        for (var k = r.start; k < r.start + r.len; k++) ori.push(nc.map[k]);
      } else if (r.type === "fuzzy") {
        for (var k2 = r.start; k2 < r.start + r.len; k2++) {
          if (nc.map[k2] !== undefined) ori.push(nc.map[k2]);
        }
      } else {
        r.matched.forEach(function (k3) {
          ori.push(nc.map[k3]);
        });
      }
      var oriSet = new Set(ori);
      var hl = "";
      for (var k4 = 0; k4 < name.length; k4++) {
        hl += oriSet.has(k4) ? "<mark>" + esc(name[k4]) + "</mark>" : esc(name[k4]);
      }
      var cc = CC[row.dataset.chapter] || "#8a8a8a";
      return (
        '<div class="sr-item" role="option" id="sr-opt-' +
        i +
        '" aria-selected="false" data-idx="' +
        i +
        '" style="--cc:' +
        esc(cc) +
        '"><span class="sr-tick" aria-hidden="true"></span><span class="sr-name">' +
        hl +
        '</span><span class="sr-chap">' +
        esc(row.dataset.chapter) +
        "</span></div>"
      );
    }

    var h = "";
    var idx = 0;
    exact.forEach(function (x) {
      h += itemHtml(x, idx++);
    });
    if (exact.length && fuzzy.length) h += '<div class="sr-divider">猜你想搜</div>';
    fuzzy.forEach(function (x) {
      h += itemHtml(x, idx++);
    });
    if (searchMatches.length < scored.length) {
      h +=
        '<div class="sr-empty">… 还有 ' +
        (scored.length - searchMatches.length) +
        " 个结果，继续输入以缩小范围</div>";
    }
    searchBox.innerHTML = h;
    searchBox.style.display = "block";
    searchInput.setAttribute("aria-expanded", "true");
  }

  function pickSearch(i) {
    var row = searchMatches[i];
    if (!row) return;
    hideSearch();
    openRow(row);
  }

  /* ------------------------------- 事件绑定 -------------------------------- */
  // 目录树 / 折叠
  board.addEventListener("click", function (e) {
    var tg = e.target.closest(".chapter-toggle");
    if (tg) {
      var secEl = tg.closest(".chapter");
      var collapsed = secEl.classList.toggle("collapsed");
      tg.setAttribute("aria-expanded", collapsed ? "false" : "true");
      var txt = $(".tg-txt", tg);
      if (txt) txt.textContent = collapsed ? "展开" : "折叠";
      return;
    }
    var row = e.target.closest(".row");
    if (row) openRow(row, { reveal: false });
  });

  // 详情面板内的关联跳转 / 复制链接
  detailEl.addEventListener("click", function (e) {
    var link = e.target.closest(".rel-link");
    if (link) {
      if (link.dataset.genre) {
        var g2 = findGenre(link.dataset.genre);
        if (g2) {
          selectRow(null);
          showDetail(g2.name || link.dataset.genre, g2.chapter || "");
        }
        return;
      }
      var row = relRowFor(link.dataset.name);
      if (row) openRow(row);
      return;
    }
    var copy = e.target.closest(".d-copy");
    if (copy) {
      copyLink(copy);
    }
  });

  function copyLink(btn) {
    var url = location.href.split("#")[0] + "#" + encodeURIComponent(btn.dataset.name);
    var done = function () {
      btn.classList.add("done");
      btn.textContent = "已复制";
      setTimeout(function () {
        btn.classList.remove("done");
        btn.textContent = "复制链接";
      }, 1600);
    };
    var fallback = function () {
      var ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } catch (e) {}
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else {
      fallback();
    }
  }

  document.querySelector(".d-close").addEventListener("click", function () {
    closeDetail();
  });
  if (dimEl) dimEl.addEventListener("click", function () {
    closeDetail();
  });

  // 随机一条
  var randomBtn = document.getElementById("random-btn");
  if (randomBtn) {
    randomBtn.addEventListener("click", function () {
      var pool = allRows.filter(function (r) {
        return r.dataset.desc === "1";
      });
      if (!pool.length) return;
      openRow(pool[Math.floor(Math.random() * pool.length)]);
    });
  }

  // 搜索交互
  searchInput.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      doSearch(searchInput.value);
    }, 160);
  });
  searchInput.addEventListener("keydown", function (e) {
    if (searchBox.style.display === "none" || !searchBox.style.display) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveOption(srActive + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveOption(srActive - 1);
    } else if (e.key === "Enter") {
      if (srActive >= 0) {
        e.preventDefault();
        pickSearch(srActive);
      }
    }
  });
  searchBox.addEventListener("click", function (e) {
    var item = e.target.closest(".sr-item");
    if (!item) return;
    e.stopPropagation();
    var idx = parseInt(item.dataset.idx, 10);
    if (!isNaN(idx)) pickSearch(idx);
  });

  document.addEventListener("click", function (e) {
    if (
      !e.target.closest(".row") &&
      !e.target.closest("#detail") &&
      !e.target.closest("#masthead") &&
      !e.target.closest("#toc")
    ) {
      closeDetail();
    }
    if (!e.target.closest("#search-results") && !e.target.closest("#search")) hideSearch();
    if (!e.target.closest("#about-dialog") && !e.target.closest("#about-btn")) closeAbout();
    if (!e.target.closest("#group-dialog") && !e.target.closest("#group-btn")) closeGroup();
  });

  /* ------------------------------ 弹窗（关于/讨论区） ------------------------ */
  var aboutLastFocus = null;
  var groupLastFocus = null;
  var FOCUS_TRAP = "#masthead, #toc, #board, #detail";

  function trapFocus(active) {
    $$(FOCUS_TRAP).forEach(function (el) {
      if (active) el.setAttribute("inert", "");
      else el.removeAttribute("inert");
    });
  }
  function openAbout() {
    aboutLastFocus = document.activeElement;
    trapFocus(true);
    document.getElementById("about-mask").classList.add("show");
    document.getElementById("about-dialog").classList.add("show");
    document.getElementById("about-dialog").focus({ preventScroll: true });
  }
  function closeAbout() {
    var dlg = document.getElementById("about-dialog");
    var wasOpen = dlg.classList.contains("show");
    document.getElementById("about-mask").classList.remove("show");
    dlg.classList.remove("show");
    if (wasOpen) trapFocus(false);
    if (wasOpen && aboutLastFocus && aboutLastFocus.focus) aboutLastFocus.focus();
  }

  var giscusLoaded = false;
  var giscusReady = false;
  var giscusErrorShown = false;
  var giscusTimeout = null;
  var giscusObs = null;

  function giscusTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }
  function giscusSetTheme() {
    var frame = document.querySelector("iframe.giscus-frame");
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage(
        { giscus: { setConfig: { theme: giscusTheme() } } },
        "https://giscus.app"
      );
    }
  }
  function groupLoadingError() {
    giscusErrorShown = true;
    giscusTimeout = null;
    if (giscusObs) {
      giscusObs.disconnect();
      giscusObs = null;
    }
    var ld = document.getElementById("group-loading");
    if (!ld) return;
    var spin = ld.querySelector(".group-spinner");
    if (spin) spin.style.display = "none";
    var txt = ld.querySelector("span");
    if (txt) txt.textContent = "评论区暂时无法加载，请检查网络后重试";
  }
  function hideGroupLoading() {
    if (giscusErrorShown) return;
    giscusReady = true;
    var ld = document.getElementById("group-loading");
    if (ld) ld.style.display = "none";
    if (giscusTimeout) {
      clearTimeout(giscusTimeout);
      giscusTimeout = null;
    }
  }
  function showGroupLoading() {
    var ld = document.getElementById("group-loading");
    if (ld && !giscusReady && !giscusErrorShown) ld.style.display = "flex";
  }
  function watchGiscusFrame() {
    var frame = document.querySelector(".giscus-frame");
    if (frame) {
      frame.addEventListener("load", hideGroupLoading);
      return;
    }
    if (typeof MutationObserver === "undefined" || giscusObs) return;
    giscusObs = new MutationObserver(function () {
      var f = document.querySelector(".giscus-frame");
      if (f) {
        f.addEventListener("load", hideGroupLoading);
        giscusObs.disconnect();
        giscusObs = null;
      }
    });
    giscusObs.observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener("message", function (e) {
    if (e.origin !== "https://giscus.app") return;
    var data = e.data && e.data.giscus;
    if (!data) return;
    if (data.signOut) {
      giscusReady = false;
      giscusErrorShown = false;
      return;
    }
    if (data.error) {
      if (/discussion not found/i.test(data.error)) hideGroupLoading();
      else groupLoadingError();
      return;
    }
    hideGroupLoading();
  });
  function openGroup() {
    groupLastFocus = document.activeElement;
    trapFocus(true);
    document.getElementById("group-mask").classList.add("show");
    document.getElementById("group-dialog").classList.add("show");
    document.getElementById("group-dialog").focus({ preventScroll: true });
    showGroupLoading();
    watchGiscusFrame();
    if (!giscusTimeout && !giscusReady && !giscusErrorShown) {
      giscusTimeout = setTimeout(groupLoadingError, 15000);
    }
    if (!giscusLoaded) {
      giscusLoaded = true;
      var s = document.createElement("script");
      s.src = "https://giscus.app/client.js";
      s.async = true;
      var attrs = {
        repo: "YeisuQwQ/music_genre",
        "repo-id": "R_kgDOTTgEmg",
        category: "General",
        "category-id": "DIC_kwDOTTgEms4DFSnO",
        mapping: "pathname",
        strict: "0",
        "reactions-enabled": "0",
        "emit-metadata": "0",
        "input-position": "top",
        theme: giscusTheme(),
        lang: "zh-CN",
      };
      for (var k in attrs) s.setAttribute("data-" + k, attrs[k]);
      document.querySelector("#group-dialog .giscus").appendChild(s);
    }
  }
  function closeGroup() {
    var dlg = document.getElementById("group-dialog");
    var wasOpen = dlg.classList.contains("show");
    document.getElementById("group-mask").classList.remove("show");
    dlg.classList.remove("show");
    if (giscusTimeout) {
      clearTimeout(giscusTimeout);
      giscusTimeout = null;
    }
    if (wasOpen) trapFocus(false);
    if (wasOpen && groupLastFocus && groupLastFocus.focus) groupLastFocus.focus();
  }

  document.getElementById("group-btn").addEventListener("click", openGroup);
  document.getElementById("about-btn").addEventListener("click", openAbout);
  document.getElementById("about-mask").addEventListener("click", closeAbout);
  document.querySelector("#about-dialog .dlg-close").addEventListener("click", closeAbout);
  document.getElementById("group-mask").addEventListener("click", closeGroup);
  document.querySelector("#group-dialog .dlg-close").addEventListener("click", closeGroup);

  /* ------------------------------- 深浅配色 -------------------------------- */
  var themeBtn = document.getElementById("theme-btn");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("mg-theme", next);
      } catch (e) {}
      var m = document.getElementById("meta-theme");
      if (m) m.setAttribute("content", next === "dark" ? "#141210" : "#f7f4ed");
      giscusSetTheme();
    });
  }

  /* ------------------------------- 键盘快捷键 ------------------------------ */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeDetail();
      closeAbout();
      closeGroup();
      hideSearch();
      if (document.activeElement === searchInput) searchInput.blur();
      return;
    }
    var typing =
      e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (!typing && e.key === "/") {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  /* ---------------------------- 移动端下拉关闭 ---------------------------- */
  var touchStartY = 0;
  detailEl.addEventListener(
    "touchstart",
    function (e) {
      touchStartY = e.touches[0].clientY;
    },
    { passive: true }
  );
  detailEl.addEventListener(
    "touchmove",
    function (e) {
      var dy = e.touches[0].clientY - touchStartY;
      if (dy > 70 && detailEl.scrollTop <= 0) closeDetail();
    },
    { passive: true }
  );

  /* ------------------------------- 深链恢复 -------------------------------- */
  (function openFromHash() {
    var raw = location.hash.slice(1);
    if (!raw) return;
    var name = raw;
    try {
      name = decodeURIComponent(raw);
    } catch (e) {}
    var row = ROW_MAP.get(normKey(name));
    if (row) {
      openRow(row, { instant: true });
      return;
    }
    var g = findGenre(name);
    if (g && g.desc) showDetail(g.name || name, g.chapter || "");
  })();

  updateSpy();

  console.log(
    "神秘电子音乐体系 · CATALOGUE — " +
      chapters.length +
      " 篇章, " +
      totalNodes +
      " 节点, " +
      totalDesc +
      " 篇介绍"
  );
})();
