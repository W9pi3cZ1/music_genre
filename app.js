

(function () {
  "use strict";

  var board = document.getElementById("board");
  var tocEl = document.getElementById("toc");
  var tocList = document.getElementById("toc-list");
  var masthead = document.getElementById("masthead");

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

  function escBr(s) {
    return String(s)
      .split(/<br\s*\/?>/i)
      .map(esc)
      .join("<br>");
  }
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function clip(s, n) {
    var t = String(s).replace(/\s+/g, " ").trim();
    var arr = Array.from(t);
    return arr.length > n ? arr.slice(0, n).join("") + "…" : t;
  }

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
        '<a class="link-out" href="' +
        url +
        '" target="_blank" rel="noopener" title="打开链接">' +
        esc(label) +
        "</a>" +
        tail
      );
    });
  }

  if (typeof DATA === "undefined" || !DATA.chapters || !DATA.genres) {
    board.innerHTML =
      '<section class="mast"><h1 class="mast-title">数据加载失败</h1>' +
      '<p class="mast-deck">data.js 未能读取，请刷新重试。</p></section>';
    return;
  }

  var GENRES = DATA.genres;
  var CH_I = {};
  var CHAPTER_NO = {};

  var chapters = DATA.chapters.filter(function (ch) {
    return ch && ch.tree && ch.tree.length;
  });
  chapters.forEach(function (ch, i) {
    CH_I[ch.name] = i;
    CHAPTER_NO[ch.name] = pad2(i + 1);
  });
  function chClass(name) {
    return CH_I[name] === undefined ? "" : " c" + CH_I[name];
  }

  var NETEASE = (typeof window !== "undefined" && window.NETEASE_LINKS) || null;
  function neteaseFor(text) {
    if (!NETEASE) return null;
    var v = NETEASE[text];
    return v && v[0] ? v : null;
  }

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

  var ROW_MAP = new Map();
  var GENRE_ROW = new Map();
  var totalNodes = 0;
  var totalDesc = 0;
  var totalEx = 0;

  var DESC_BY_CH = {};
  var totalNm = 0;
  Object.keys(GENRES).forEach(function (k) {
    var g = GENRES[k];
    if (!g || !g.chapter) return;
    DESC_BY_CH[g.chapter] = (DESC_BY_CH[g.chapter] || 0) + 1;
    if (g.examples && g.examples.length) {
      totalEx += g.examples.length;
      g.examples.forEach(function (x) {
        if (neteaseFor(x)) totalNm++;
      });
    }
  });

  function treeHtml(nodes, level, chapterName) {
    var h = '<ul class="tree">';
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var g = findGenre(n.label);
      var has = !!g;
      var kids = n.children || [];
      var lead = "";
      if (level === 0 && g && g.desc) {
        lead = '<span class="r-lead">' + esc(clip(g.desc, 78)) + "</span>";
      }
      h +=
        "<li" +
        (kids.length ? ' class="has-kids"' : "") +
        ">" +
        '<a class="row l' +
        Math.min(level, 3) +
        (has ? " has-desc" : " no-desc") +
        '" href="#' +
        encodeURIComponent(n.label) +
        '" data-name="' +
        esc(n.label) +
        '" data-chapter="' +
        esc(chapterName) +
        '" data-desc="' +
        (has ? "1" : "0") +
        '"' +
        (g && g.aka ? ' data-aka="' + esc(g.aka) + '"' : "") +
        (level > 0 ? ' title="' + esc(n.label) + '"' : "") +
        ">" +
        '<span class="r-mark" aria-hidden="true"></span>' +
        '<span class="r-body"><span class="r-name">' +
        esc(n.label) +
        "</span>" +
        lead +
        "</span>" +
        '<span class="r-open" aria-hidden="true">打开 →</span>' +
        "</a>";
      if (kids.length) h += treeHtml(kids, level + 1, chapterName);
      h += "</li>";
    }
    return h + "</ul>";
  }

  function chapterHtml(ch, i) {
    var nodeCount = countTree(ch.tree);
    var descCount = DESC_BY_CH[ch.name] || 0;
    totalNodes += nodeCount;
    totalDesc += descCount;
    return (
      '<section class="chapter c' +
      i +
      '" id="ch-' +
      i +
      '" data-chapter="' +
      esc(ch.name) +
      '">' +
      '<header class="chapter-head">' +
      '<span class="ch-bar" aria-hidden="true"></span>' +
      '<span class="ch-no">' +
      CHAPTER_NO[ch.name] +
      "</span>" +
      '<h2 class="ch-title">' +
      esc(ch.name) +
      "</h2>" +
      '<span class="ch-meta">' +
      nodeCount +
      " 条目 · " +
      descCount +
      " 篇介绍</span>" +
      '<button type="button" class="ch-toggle" aria-expanded="true" aria-controls="ch-body-' +
      i +
      '"><span class="tg-ico" aria-hidden="true"></span><span class="tg-txt">折叠</span></button>' +
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

  var keyStrip =
    '<ol class="key-strip">' +
    chapters
      .map(function (ch, i) {
        return (
          '<li class="key-item c' +
          i +
          '"><a href="#ch-' +
          i +
          '" data-i="' +
          i +
          '" title="' +
          esc(ch.name) +
          " · " +
          countTree(ch.tree) +
          ' 条">' +
          '<span class="key-block" aria-hidden="true"></span>' +
          '<span class="key-no">' +
          CHAPTER_NO[ch.name] +
          "</span>" +
          "</a></li>"
        );
      })
      .join("") +
    "</ol>";

  var mastHtml =
    '<section class="mast">' +
    '<div class="mast-eyebrow"><span>叶亦苏 Yeisu 整理</span></div>' +
    '<h1 class="mast-title">电子音乐风格体系</h1>' +
    '<p class="mast-latin">An Electronic Music Taxonomy</p>' +
    '<p class="mast-deck"><span class="deck-counts">收录 <b>UK Bass</b>、<b>US Bass</b>、<b>HDM</b>、<b>Hardcore</b>、<b>Trance</b>、<b>Techno</b>、<b>House</b>、<b>Breakbeat</b> 等 ' +
    chapters.length +
    " 个篇章、共 <b>" +
    totalNodes +
    "</b> 条曲风条目，其中 <b>" +
    totalDesc +
    "</b> 条附有介绍。</span><span class=\"deck-keys\">左侧目录按篇章编号索引，点击任意条目在右侧展开详情；按 <kbd>/</kbd> 直接搜索，按 <kbd>R</kbd> 随机翻一条。</span><span class=\"deck-touch\">点击任意条目查看详细介绍，或在上方搜索框输入曲风、别名。</span></p>" +
    '<div class="mast-stats">' +
    '<div class="stat"><b>' +
    chapters.length +
    "</b><span>篇章 Chapters</span></div>" +
    '<div class="stat"><b>' +
    totalNodes +
    "</b><span>曲风条目 Entries</span></div>" +
    '<div class="stat"><b>' +
    totalDesc +
    "</b><span>附有介绍 Noted</span></div>" +
    '<div class="stat"><b>' +
    totalEx +
    "</b><span>例曲推荐 Tracks</span></div>" +
    "</div>" +
    '<div class="key">' +
    '<div class="key"><div class="key-head"><span>色标</span><i>Colour Key</i><span class="key-hint">点击色块跳转篇章</span><span class="key-live" id="key-live"><em>01</em>House</span></div>' +
    keyStrip +
    '<div class="key-note">' +
    '<span><i class="on"></i>附有介绍</span>' +
    '<span><i></i>介绍待补充</span>' +
    "<span>色块 = 篇章标识，目录、章节与详情面板同色</span>" +
    "</div>" +
    "</div>" +
    '<div class="mast-links">' +
    '<button type="button" class="btn js-random">随便看一条</button>' +
    '<a class="link-quiet" href="https://www.bilibili.com/video/BV1tusFePEUM/?share_source=copy_web&amp;vd_source=4a668a5ff37aa77ec566058febd2633a" target="_blank" rel="noopener">资料来源 ↗</a>' +
    '<a class="link-quiet" href="https://github.com/YeisuQwQ/music_genre/issues" target="_blank" rel="noopener">纠错 / 补充 ↗</a>' +
    "</div>" +
    "</section>";

  var colophonHtml =
    '<footer class="colophon">' +
    '<dl class="colo-rows">' +
    "<div class=\"colo-row\"><dt>篇章</dt><dd>" +
    chapters.length +
    " 个</dd></div>" +
    "<div class=\"colo-row\"><dt>条目</dt><dd>" +
    totalNodes +
    " 条</dd></div>" +
    "<div class=\"colo-row\"><dt>介绍</dt><dd>" +
    totalDesc +
    " 篇</dd></div>" +
    "<div class=\"colo-row\"><dt>例曲</dt><dd>" +
    totalEx +
    " 首" +
    (totalNm ? "（" + totalNm + " 首可跳转网易云）" : "") +
    "</dd></div>" +
    "<div class=\"colo-row\"><dt>反馈</dt><dd>GitHub Issues · QQ 3069309919</dd></div>" +
    "</dl>" +
    '<a class="colo-top" href="#top">回到顶部 ↑</a>' +
    "</footer>";

  board.innerHTML = mastHtml + chaptersHtml + colophonHtml;

  var sections = $$(".chapter", board);
  var allRows = $$(".row", board);

  allRows.forEach(function (row, i) {
    row.dataset.idx = i;
    var nk = normKey(row.dataset.name);
    if (!ROW_MAP.has(nk)) ROW_MAP.set(nk, row);
    var g = findGenre(row.dataset.name);
    if (g && !GENRE_ROW.has(g)) GENRE_ROW.set(g, row);
  });

  tocList.innerHTML = chapters
    .map(function (ch, i) {
      return (
        "<li>" +
        '<a class="toc-item c' +
        i +
        '" href="#ch-' +
        i +
        '" data-i="' +
        i +
        '" title="' +
        esc(ch.name) +
        '">' +
        '<span class="toc-chip" aria-hidden="true"></span>' +
        '<span class="toc-no">' +
        CHAPTER_NO[ch.name] +
        "</span>" +
        '<span class="toc-name">' +
        esc(ch.name) +
        "</span>" +
        '<span class="toc-lead" aria-hidden="true"></span>' +
        '<span class="toc-n2">' +
        countTree(ch.tree) +
        "</span>" +
        "</a></li>"
      );
    })
    .join("");

  var tocItems = $$(".toc-item", tocList);
  var tocTotal = document.getElementById("toc-total");
  if (tocTotal) tocTotal.textContent = pad2(chapters.length);
  var tocFoot = document.getElementById("toc-foot");
  if (tocFoot) {
    tocFoot.innerHTML =
      "共 " +
      totalNodes +
      " 条曲风 · " +
      totalDesc +
      " 篇介绍<br />" +
      '<button type="button" class="link-quiet js-expand" style="margin-top:8px">全部展开</button> ' +
      '<button type="button" class="link-quiet js-collapse" style="margin-top:8px">全部折叠</button>';
  }

  function tocIsHorizontal() {
    return tocEl.scrollWidth > tocEl.clientWidth + 4;
  }
  function ensureTocVisible(item) {
    if (!item) return;
    if (tocIsHorizontal()) {
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
  var sbNow = document.getElementById("sb-now");
  var brandMark = $(".brand .mark-label");
  function setTocActive(i) {
    if (i === spyActive) return;
    spyActive = i;
    tocItems.forEach(function (b, k) {
      b.classList.toggle("on", k === i);
    });
    var ch = chapters[i];
    if (ch && sbNow) {
      sbNow.style.setProperty("--ch", "var(--ch-d)");
      sbNow.className = "sb-now" + chClass(ch.name);
      sbNow.textContent = CHAPTER_NO[ch.name] + "  " + ch.name;
    }
    if (ch && brandMark) brandMark.style.fill = "";
    ensureTocVisible(tocItems[i]);
  }

  function setChapterCollapsed(sec, collapsed) {
    sec.classList.toggle("collapsed", collapsed);
    var tg = $(".ch-toggle", sec);
    if (tg) {
      tg.setAttribute("aria-expanded", collapsed ? "false" : "true");
      var txt = $(".tg-txt", tg);
      if (txt) txt.textContent = collapsed ? "展开" : "折叠";
    }
  }

  function jumpToChapter(i, smooth) {
    var sec = sections[i];
    if (!sec) return;
    setChapterCollapsed(sec, false);
    sec.scrollIntoView({ behavior: smooth === false ? "auto" : "smooth", block: "start" });
    setTocActive(i);
  }

  tocItems.forEach(function (item, i) {
    item.addEventListener("click", function (e) {
      e.preventDefault();
      jumpToChapter(i);
    });
  });

  $$(".key-item a", board).forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      jumpToChapter(parseInt(a.dataset.i, 10));
    });
  });

  var keyLive = document.getElementById("key-live");
  function keyLiveSet(i) {
    var ch = chapters[i];
    if (!ch || !keyLive) return;
    keyLive.className = "key-live" + chClass(ch.name);
    keyLive.innerHTML =
      "<em>" + CHAPTER_NO[ch.name] + "</em>" + esc(ch.name) + " · " + countTree(ch.tree) + " 条目";
  }
  $$(".key-item a", board).forEach(function (a) {
    var i = parseInt(a.dataset.i, 10);
    a.addEventListener("mouseenter", function () {
      keyLiveSet(i);
    });
    a.addEventListener("focus", function () {
      keyLiveSet(i);
    });
  });
  keyLiveSet(0);

  function probeOffset() {
    var off = 20;
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

  var aboutStats = document.getElementById("about-stats");
  if (aboutStats) {
    aboutStats.textContent =
      chapters.length +
      " 个篇章 · " +
      totalNodes +
      " 条曲风 · " +
      totalDesc +
      " 篇介绍 · " +
      totalEx +
      " 首例曲" +
      (totalNm ? "（" + totalNm + " 首可跳转网易云音乐）" : "");
  }

  var detailEl = document.getElementById("detail");
  var detailInner = document.getElementById("detail-inner");
  var dimEl = document.getElementById("dim");
  var currentRow = null;

  function isMobile() {
    return window.matchMedia("(max-width: 980px)").matches;
  }
  function isSheet() {
    return window.matchMedia("(max-width: 700px)").matches;
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
    detailInner.scrollTop = 0;
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

  var dTop = document.getElementById("d-top");
  if (dTop) {
    var dragFrom = null;
    var dragDy = 0;
    dTop.addEventListener(
      "touchstart",
      function (e) {
        if (!isSheet() || e.touches.length !== 1) return;
        dragFrom = e.touches[0].clientY;
        dragDy = 0;
        detailEl.style.transition = "none";
      },
      { passive: true }
    );
    dTop.addEventListener(
      "touchmove",
      function (e) {
        if (dragFrom === null) return;
        dragDy = Math.max(0, e.touches[0].clientY - dragFrom);
        detailEl.style.transform = "translateY(" + dragDy + "px)";
        if (e.cancelable) e.preventDefault();
      },
      { passive: false }
    );
    function endDrag() {
      if (dragFrom === null) return;
      dragFrom = null;
      var closing = dragDy > 88;
      detailEl.style.transition = "";
      detailEl.style.transform = "";
      if (closing) closeDetail();
    }
    dTop.addEventListener("touchend", endDrag);
    dTop.addEventListener("touchcancel", endDrag);
  }

  function sec(label, sub, inner) {
    return (
      '<section class="d-sec"><h3 class="d-label">' +
      label +
      (sub ? " · " + sub : "") +
      "</h3>" +
      inner +
      "</section>"
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
          '<button type="button" class="chip" data-name="' + esc(row.dataset.name) + '">' + esc(v) + "</button>"
        );
      }

      if (findGenre(v)) {
        return '<button type="button" class="chip" data-genre="' + esc(v) + '">' + esc(v) + "</button>";
      }
      return "<span>" + esc(v) + "</span>";
    });
    return (
      '<div class="rel"><dt>' +
      esc(label) +
      "<i>" +
      esc(note) +
      "</i></dt><dd>" +
      parts.join("") +
      "</dd></div>"
    );
  }

  var curIdx = -1;

  function detailNavHtml() {
    if (curIdx < 0) return "";
    var prev = curIdx > 0 ? allRows[curIdx - 1] : null;
    var next = curIdx < allRows.length - 1 ? allRows[curIdx + 1] : null;
    return (
      '<div class="d-nav">' +
      '<button type="button" class="d-step" data-step="-1"' +
      (prev ? ' title="' + esc(prev.dataset.name) + '"' : " disabled") +
      ">← 上一条</button>" +
      '<button type="button" class="d-step" data-step="1"' +
      (next ? ' title="' + esc(next.dataset.name) + '"' : " disabled") +
      ">下一条 →</button>" +
      "</div>"
    );
  }

  function showDetail(name, chapter, idx) {
    var g = findGenre(name);
    var cc = CH_I[chapter];
    detailEl.className = cc === undefined ? "show" : "show c" + cc;
    curIdx = typeof idx === "number" ? idx : -1;

    var h = "";
    h +=
      '<div class="d-meta">' +
      (cc === undefined ? "未分类" : "CH." + CHAPTER_NO[chapter] + " <em>" + esc(chapter) + "</em>") +
      (curIdx >= 0 ? " · 第 " + pad2(curIdx + 1) + " / " + allRows.length + " 条" : "") +
      "</div>";
    h += '<h2 class="d-title" id="detail-title">' + esc(name) + "</h2>";
    if (g && g.aka) h += '<div class="d-aka"><b>A.K.A.</b> ' + esc(g.aka) + "</div>";
    if (g && g.chapter && g.chapter !== chapter) {
      h += '<div class="d-xref">详细介绍来自「' + esc(g.chapter) + "」篇章</div>";
    }

    if (!g || !g.desc) {
      h +=
        '<section class="d-sec"><div class="no-desc"><div class="nd-zh">暂无详细介绍</div>' +
        '<span class="nd-hint">欢迎在讨论区补充这一曲风的资料</span></div></section>';
      h +=
        '<footer class="d-foot"><button type="button" class="d-copy" data-name="' +
        esc(name) +
        '">复制链接</button>' +
        detailNavHtml() +
        "</footer>";
      detailInner.innerHTML = h;
      openDetail();
      setHash(name);
      return;
    }

    h += sec("简介", "Notes", '<div class="d-desc">' + linkify(escBr(g.desc)) + "</div>");

    var rels =
      relBlock("上位", "影响 / 来源", g.ups) +
      relBlock("下位", "派生子风格", g.downs) +
      (g.related
        ? '<div class="rel"><dt>相关<i>Related</i></dt><dd>' + esc(g.related) + "</dd></div>"
        : "");
    if (rels) h += sec("关联", "Lineage", '<dl class="d-rel">' + rels + "</dl>");

    if (g.examples && g.examples.length) {
      var ex =
        '<ol class="d-ex">' +
        g.examples
          .map(function (x, i) {
            var nm = neteaseFor(x);
            return (
              '<li><span class="ex-no">' +
              pad2(i + 1) +
              '</span><span class="ex-t">' +
              linkify(escBr(x)) +
              "</span>" +
              (nm
                ? '<span class="ex-act">' +
                  '<button type="button" class="ex-play" data-id="' +
                  esc(nm[0]) +
                  '" data-label="' +
                  esc(nm[1]) +
                  '" aria-expanded="false" title="页面内试听：' +
                  esc(nm[1]) +
                  '">试听</button>' +
                  '<a class="ex-nm" href="https://music.163.com/song?id=' +
                  encodeURIComponent(nm[0]) +
                  '" target="_blank" rel="noopener" title="网易云音乐：' +
                  esc(nm[1]) +
                  '">网易云<i>↗</i></a>' +
                  "</span>"
                : "") +
              "</li>"
            );
          })
          .join("") +
        "</ol>";
      h += sec("例曲", "Tracks", ex);
    }

    h +=
      '<footer class="d-foot"><button type="button" class="d-copy" data-name="' +
      esc(name) +
      '">复制链接</button>' +
      detailNavHtml() +
      "</footer>";

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

  function openRow(row, opts) {
    if (!row) return;
    opts = opts || {};
    var secEl = row.closest(".chapter");
    if (secEl && secEl.classList.contains("collapsed")) setChapterCollapsed(secEl, false);
    selectRow(row);
    showDetail(row.dataset.name, row.dataset.chapter, parseInt(row.dataset.idx, 10));
    if (opts.reveal !== false) {
      row.scrollIntoView({
        behavior: opts.instant ? "auto" : "smooth",
        block: isSheet() ? "start" : "center",
      });
      flashRow(row);
    }
  }

  function stepDetail(dir) {
    if (curIdx < 0) return;
    var target = allRows[curIdx + dir];
    if (!target) return;
    openRow(target);
  }

  var searchInput = document.getElementById("search");
  var searchBox = document.getElementById("search-results");
  if (searchInput && window.matchMedia("(max-width: 700px)").matches) {
    searchInput.setAttribute("placeholder", "搜索曲风 / 别名");
  }
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
        cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
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
    if (searchInput) searchInput.setAttribute("aria-expanded", "false");
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
      var via = "name";
      var ak = row.dataset.aka;
      if (ak && (!r || r.type !== "contains")) {
        var akc = normClean(ak);
        var ra = fuzzySearch(qc, akc);
        if (ra && (!r || ra.score > r.score + 4)) {
          r = ra;
          nc = akc;
          via = "aka";
        }
      }
      if (r) scored.push({ row: row, r: r, nc: nc, via: via });
    });
    scored.sort(function (a, b) {
      return b.r.score - a.r.score || a.r.start - b.r.start;
    });
    if (!scored.length) {
      searchBox.style.display = "block";
      searchBox.innerHTML = '<div class="sr-empty">没有找到与「' + esc(q) + "」相关的曲风</div>";
      searchInput.setAttribute("aria-expanded", "true");
      return;
    }
    var exact = scored
      .filter(function (x) {
        return x.r.type === "contains";
      })
      .slice(0, 40);
    var fuzzy = scored
      .filter(function (x) {
        return x.r.type !== "contains";
      })
      .slice(0, 20);
    searchMatches = exact.concat(fuzzy).map(function (x) {
      return x.row;
    });

    function itemHtml(x, i) {
      var row = x.row;
      var r = x.r;
      var nc = x.nc;
      var name = row.dataset.name;
      var shown = x.via === "aka" ? row.dataset.aka : name;
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
      for (var k4 = 0; k4 < shown.length; k4++) {
        hl += oriSet.has(k4) ? "<mark>" + esc(shown[k4]) + "</mark>" : esc(shown[k4]);
      }
      if (x.via === "aka") hl += '<i class="sr-alias">（' + esc(name) + "）</i>";
      return (
        '<div class="sr-item' +
        chClass(row.dataset.chapter) +
        '" role="option" id="sr-opt-' +
        i +
        '" aria-selected="false" data-idx="' +
        i +
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

  board.addEventListener("click", function (e) {
    var tg = e.target.closest(".ch-toggle");
    if (tg) {
      var secEl = tg.closest(".chapter");
      setChapterCollapsed(secEl, !secEl.classList.contains("collapsed"));
      return;
    }
    var row = e.target.closest(".row");
    if (row) {
      e.preventDefault();
      openRow(row, { reveal: false });
      return;
    }
    if (e.target.closest(".js-random")) {
      randomEntry();
    }
  });

  document.addEventListener("click", function (e) {
    var ex = e.target.closest(".js-expand");
    if (ex) {
      sections.forEach(function (s) {
        setChapterCollapsed(s, false);
      });
      return;
    }
    var co = e.target.closest(".js-collapse");
    if (co) {
      sections.forEach(function (s) {
        setChapterCollapsed(s, true);
      });
      return;
    }
  });

  detailEl.addEventListener("click", function (e) {
    var playBtn = e.target.closest(".ex-play");
    if (playBtn) {
      var li = playBtn.closest("li");
      if (!li) return;
      var active = playBtn.classList.contains("on");

      $$(".ex-player", detailEl).forEach(function (el) {
        el.remove();
      });
      $$(".ex-play.on", detailEl).forEach(function (b) {
        b.classList.remove("on");
        b.setAttribute("aria-expanded", "false");
        b.textContent = "试听";
      });
      if (active) return;

      playBtn.classList.add("on");
      playBtn.setAttribute("aria-expanded", "true");
      playBtn.textContent = "收起";

      var songId = playBtn.dataset.id;
      var songLabel = playBtn.dataset.label;
      var wrap = document.createElement("div");
      wrap.className = "ex-player";
      wrap.innerHTML =
        '<iframe frameborder="no" border="0" marginwidth="0" marginheight="0" width="330" height="86" src="https://music.163.com/outchain/player?type=2&id=' +
        encodeURIComponent(songId) +
        '&auto=1&height=66" title="网易云音乐外链播放器：' +
        esc(songLabel) +
        '"></iframe>' +
        '<span class="ex-player-note">外链播放器 · 网易云音乐</span>';
      li.appendChild(wrap);
      return;
    }

    var step = e.target.closest(".d-step");
    if (step) {
      stepDetail(parseInt(step.dataset.step, 10));
      return;
    }
    var link = e.target.closest(".chip");
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
    if (copy) copyLink(copy);
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

  $(".d-close").addEventListener("click", function () {
    closeDetail();
  });
  if (dimEl)
    dimEl.addEventListener("click", function () {
      closeDetail();
    });

  function randomEntry() {
    var pool = allRows.filter(function (r) {
      return r.dataset.desc === "1";
    });
    if (!pool.length) return;
    openRow(pool[Math.floor(Math.random() * pool.length)]);
  }
  var randomBtn = document.getElementById("random-btn");
  if (randomBtn) randomBtn.addEventListener("click", randomEntry);

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

  function inPath(e, sel) {
    if (e.composedPath) {
      var path = e.composedPath();
      for (var i = 0; i < path.length; i++) {
        var el = path[i];
        if (el && el.nodeType === 1 && el.matches && el.matches(sel)) return true;
      }
      return false;
    }
    var t = e.target;
    return !!(t && t.closest && t.closest(sel));
  }

  document.addEventListener("click", function (e) {
    if (
      !inPath(e, ".row") &&
      !inPath(e, ".js-random") &&
      !inPath(e, "#detail") &&
      !inPath(e, "#masthead") &&
      !inPath(e, "#toc")
    ) {
      closeDetail();
    }
    if (!inPath(e, "#search-results") && !inPath(e, "#search")) hideSearch();
    if (!inPath(e, "#about-dialog") && !inPath(e, "#about-btn")) closeAbout();
    if (!inPath(e, "#group-dialog") && !inPath(e, "#group-btn")) closeGroup();
  });

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
    var d = document.getElementById("about-dialog");
    d.classList.add("show");
    d.focus({ preventScroll: true });
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
      frame.contentWindow.postMessage({ giscus: { setConfig: { theme: giscusTheme() } } }, "https://giscus.app");
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
    var bar = ld.querySelector(".gl-bar");
    if (bar) bar.style.display = "none";
    var txt = ld.querySelector(".gl-txt");
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
    var d = document.getElementById("group-dialog");
    d.classList.add("show");
    d.focus({ preventScroll: true });
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

  var themeBtn = document.getElementById("theme-btn");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("mg-theme", next);
      } catch (e) {}
      var m = document.getElementById("meta-theme");
      if (m) m.setAttribute("content", next === "dark" ? "#0e0e0f" : "#f7f5f0");
      giscusSetTheme();
    });
  }

  var menuBtn = document.getElementById("menu-btn");
  var mmenu = document.getElementById("mmenu");
  var mmTheme = document.getElementById("mm-theme-state");
  function closeMenu() {
    if (!mmenu || !mmenu.classList.contains("show")) return;
    mmenu.classList.remove("show");
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
  }
  function toggleMenu() {
    if (!mmenu) return;
    var on = !mmenu.classList.contains("show");
    mmenu.classList.toggle("show", on);
    if (menuBtn) menuBtn.setAttribute("aria-expanded", on ? "true" : "false");
    if (on && mmTheme) {
      mmTheme.textContent = document.documentElement.dataset.theme === "dark" ? "深色" : "浅色";
    }
  }
  if (menuBtn) {
    menuBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleMenu();
    });
  }
  function bindMenu(id, fn) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", function () {
        closeMenu();
        fn();
      });
    }
  }
  bindMenu("mm-random", function () {
    randomEntry();
  });
  bindMenu("mm-group", function () {
    openGroup();
  });
  bindMenu("mm-about", function () {
    openAbout();
  });
  bindMenu("mm-theme", function () {
    if (themeBtn) themeBtn.click();
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#masthead")) closeMenu();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeDetail();
      closeAbout();
      closeGroup();
      closeMenu();
      hideSearch();
      if (document.activeElement === searchInput) searchInput.blur();
      return;
    }
    var typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (typing) return;
    if (e.key === "/") {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }
    if (e.key === "r" || e.key === "R") {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      randomEntry();
      return;
    }
    if (e.key === "ArrowRight" && detailEl.classList.contains("show")) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      stepDetail(1);
      return;
    }
    if (e.key === "ArrowLeft" && detailEl.classList.contains("show")) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      stepDetail(-1);
    }
  });

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
      if (dy > 70 && detailInner.scrollTop <= 0) closeDetail();
    },
    { passive: true }
  );

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
    "神秘电子音乐体系 · INDEX — " +
      chapters.length +
      " 篇章, " +
      totalNodes +
      " 条目, " +
      totalDesc +
      " 篇介绍, " +
      totalEx +
      " 首例曲"
  );
})();
