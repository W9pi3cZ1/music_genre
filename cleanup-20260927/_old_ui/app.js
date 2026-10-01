/* ==========================================================================
   神秘电子音乐体系 · app.js (UI v2 "ARCHIVE")
   逻辑沿用原实现：模糊搜索 / 键盘导航 / 焦点陷阱 / giscus 加载状态
   新增：篇章索引 rail + 滚动定位、折叠书脊、链接识别、深链 (#曲风名)、"/" 快捷键
   ========================================================================== */
(function () {
  "use strict";

  var container = document.getElementById("container");

  if (typeof DATA === "undefined" || !DATA.chapters || !DATA.genres) {
    container.innerHTML =
      '<div class="no-desc"><span class="nd-en">Load Error</span><span class="nd-zh">数据加载失败，请刷新重试</span></div>';
    return;
  }

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
  // 数据里的字面 <br> 是作者手写的换行标记：分段各自转义，仅 <br> 还原成真实换行（保持 XSS 安全）
  function escBr(s) {
    return String(s)
      .split(/<br\s*\/?>/i)
      .map(esc)
      .join("<br>");
  }
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function hexA(hex, a) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return "rgba(138,138,138," + a + ")";
    var v = parseInt(m[1], 16);
    return "rgba(" + ((v >> 16) & 255) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + a + ")";
  }
  // 把 【https://…】 以及裸链接转成可点的小链接（已转义文本上操作，安全）
  var URL_RE = /【\s*(https?:\/\/[^】\s]+?)\s*】|(https?:\/\/[A-Za-z0-9\-._~:\/?#\[\]@!$&'()*+,;=%]+)/g;
  function linkify(html) {
    return String(html).replace(URL_RE, function (m, bracketed, bare) {
      var url = bracketed || bare;
      var tail = "";
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
      }
      return (
        '<a class="ex-link" href="' + url + '" target="_blank" rel="noopener" title="打开链接">↗</a>' + tail
      );
    });
  }

  /* ------------------------------ 曲风索引 --------------------------------- */
  var CC = {};
  var CHAPTER_NO = {};
  DATA.chapters.forEach(function (ch, i) {
    CC[ch.name] = ch.color;
    CHAPTER_NO[ch.name] = pad2(i + 1);
  });
  var GENRES = DATA.genres;

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

  /* ------------------------------ 构建版面 --------------------------------- */
  var allNodes = [];
  var cols = [];
  var colChapters = [];

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

  function buildChapter(ch, i) {
    var trees = ch.tree || [];
    if (!trees.length) return null;

    var col = document.createElement("div");
    col.className = "col";
    col.style.setProperty("--cc", ch.color);

    var bodyId = "col-body-" + i;
    var head = document.createElement("button");
    head.type = "button";
    head.className = "col-head";
    head.setAttribute("aria-expanded", "true");
    head.setAttribute("aria-controls", bodyId);
    head.innerHTML =
      '<span class="col-num">' +
      CHAPTER_NO[ch.name] +
      '</span><span class="col-name">' +
      esc(ch.name) +
      '</span><span class="col-count">' +
      countTree(trees) +
      '</span><span class="col-chev" aria-hidden="true"></span>';

    var body = document.createElement("div");
    body.className = "col-body";
    body.id = bodyId;

    head.addEventListener("click", function () {
      var collapsed = col.classList.toggle("collapsed");
      head.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });

    function renderTree(nodes, level) {
      nodes.forEach(function (n) {
        var el = document.createElement("div");
        el.className = "node l" + Math.min(level, 4);
        var hasDesc = !!findGenre(n.label);
        if (hasDesc) el.classList.add("has-desc");
        el.innerHTML = '<span class="dot"></span><span class="lbl">' + esc(n.label) + "</span>";
        el.dataset.name = n.label;
        el.dataset.chapter = ch.name;
        el.dataset.hasDesc = hasDesc ? "1" : "0";
        el.dataset.level = String(level);
        el.title = n.label;
        el._norm = normClean(n.label);
        el.addEventListener("click", function (e) {
          e.stopPropagation();
          selectNode(el);
          showDetail(n.label, ch.name);
        });
        body.appendChild(el);
        allNodes.push(el);
        if (n.children && n.children.length) renderTree(n.children, level + 1);
      });
    }

    renderTree(trees, 0);
    col.appendChild(head);
    col.appendChild(body);
    return col;
  }

  DATA.chapters.forEach(function (ch, i) {
    var col = buildChapter(ch, i);
    if (!col) return;
    col.style.setProperty("--in-d", cols.length * 35 + "ms");
    container.appendChild(col);
    cols.push(col);
    colChapters.push(ch);
  });

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      container.classList.add("in");
      document.body.classList.add("in");
    });
  });

  /* ------------------------------ 篇章索引 rail ---------------------------- */
  var rail = document.getElementById("rail");
  var railItems = [];

  colChapters.forEach(function (ch, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "rail-item";
    b.title = ch.name;
    b.innerHTML =
      '<span class="rail-swatch" style="background:' +
      esc(ch.color) +
      '"></span><span class="rail-num">' +
      CHAPTER_NO[ch.name] +
      '</span><span class="rail-name">' +
      esc(ch.name) +
      "</span>";
    b.addEventListener("click", function () {
      jumpToChapter(i);
    });
    rail.appendChild(b);
    railItems.push(b);
  });

  function jumpToChapter(i) {
    var col = cols[i];
    if (!col) return;
    var head = $(".col-head", col);
    if (col.classList.contains("collapsed")) {
      col.classList.remove("collapsed");
      head.setAttribute("aria-expanded", "true");
    }
    col.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    col.classList.remove("flash");
    void col.offsetWidth;
    col.classList.add("flash");
    setTimeout(function () {
      col.classList.remove("flash");
    }, 900);
  }

  var spyActive = -1;
  function setRailActive(i) {
    if (i === spyActive) return;
    spyActive = i;
    railItems.forEach(function (b, k) {
      b.classList.toggle("on", k === i);
    });
    var item = railItems[i];
    if (!item) return;
    var rr = rail.getBoundingClientRect();
    var ir = item.getBoundingClientRect();
    if (ir.left < rr.left || ir.right > rr.right) {
      rail.scrollBy({ left: ir.left - rr.left - 48, behavior: "smooth" });
    }
  }
  function updateSpy() {
    if (!cols.length) return;
    var cr = container.getBoundingClientRect();
    var best = 0;
    var bestD = Infinity;
    for (var i = 0; i < cols.length; i++) {
      var d = Math.abs(cols[i].getBoundingClientRect().left - cr.left);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setRailActive(best);
  }
  var spyTick = false;
  container.addEventListener(
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
  var chCountText =
    DATA.chapters.length + " 篇章 · " + allNodes.length + " 节点 · " + Object.keys(GENRES).length + " 介绍";
  document.getElementById("ch-count").textContent = chCountText;
  var aboutStats = document.getElementById("about-stats");
  if (aboutStats) aboutStats.textContent = chCountText;

  /* -------------------------------- 详情 ---------------------------------- */
  var detailEl = document.getElementById("detail");
  var detailInner = document.getElementById("detail-inner");

  function selectNode(el) {
    $$(".node.sel").forEach(function (x) {
      x.classList.remove("sel");
    });
    el.classList.add("sel");
  }

  function sec(en, zh) {
    return (
      '<div class="sec"><span class="sec-en">' +
      en +
      '</span><span class="sec-zh">' +
      zh +
      '</span><span class="sec-rule"></span></div>'
    );
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
    document.getElementById("dim").classList.add("show");
    detailEl.classList.add("show");
    document.body.style.overflow = "hidden";
    detailEl.scrollTop = 0;
  }

  function closeDetail(skipHash) {
    detailEl.classList.remove("show");
    document.getElementById("dim").classList.remove("show");
    $$(".node.sel").forEach(function (x) {
      x.classList.remove("sel");
    });
    document.body.style.overflow = "";
    if (!skipHash) clearHash();
  }

  function showDetail(name, chapter) {
    var g = findGenre(name);
    var cc = CC[chapter] || "#8a8a8a";
    var h = "";
    h += '<div class="d-head">';
    h += '<div class="d-kicker">Genre Archive</div>';
    h += '<h2 id="detail-title">' + esc(name) + "</h2>";
    h += '<div class="d-meta">';
    h +=
      '<span class="chap" style="color:' +
      cc +
      ";border-color:" +
      hexA(cc, 0.45) +
      ";background:" +
      hexA(cc, 0.1) +
      '">' +
      esc(chapter || "未分类") +
      (CHAPTER_NO[chapter] ? " · " + CHAPTER_NO[chapter] : "") +
      "</span>";
    if (g && g.aka) h += '<span class="sep">/</span><span class="aka">A.K.A. ' + esc(g.aka) + "</span>";
    h += "</div>";
    if (g && g.chapter && g.chapter !== chapter) {
      h += '<div class="xref-note">↳ 详细介绍来自「' + esc(g.chapter) + "」篇章</div>";
    }
    h += "</div>";

    if (!g || !g.desc) {
      h +=
        '<div class="no-desc"><span class="nd-en">No Entry</span><span class="nd-zh">暂无详细介绍</span>' +
        '<span class="nd-hint">可在讨论区补充该曲风资料</span></div>';
      detailInner.innerHTML = h;
      openDetail();
      setHash(name);
      return;
    }

    h += sec("About", "简介");
    h += '<div class="desc">' + linkify(escBr(g.desc)) + "</div>";

    var ups = g.ups || [];
    var downs = g.downs || [];
    if (ups.length || downs.length || g.related) {
      h += sec("Relations", "关联");
      h += '<div class="rels">';
      if (ups.length) {
        h +=
          '<div class="rel-block"><div class="rel-title"><span class="sym up">↑</span>上位 <em>影响 / 衍生来源</em></div><div class="rel-tags">';
        ups.forEach(function (u) {
          h += '<span class="rel-tag">' + esc(u) + "</span>";
        });
        h += "</div></div>";
      }
      if (downs.length) {
        h +=
          '<div class="rel-block"><div class="rel-title"><span class="sym down">↓</span>下位 <em>派生子风格</em></div><div class="rel-tags">';
        downs.forEach(function (d) {
          h += '<span class="rel-tag">' + esc(d) + "</span>";
        });
        h += "</div></div>";
      }
      if (g.related) {
        h +=
          '<div class="rel-block"><div class="rel-title"><span class="sym rel">≈</span>相关 <em>Related To</em></div><div class="rel-tags"><span class="rel-tag">' +
          esc(g.related) +
          "</span></div></div>";
      }
      h += "</div>";
    }

    if (g.examples && g.examples.length) {
      h += sec("Tracks", "例曲");
      h += '<ol class="ex-list">';
      g.examples.forEach(function (ex, i) {
        h +=
          '<li class="ex-item"><span class="ex-num">' +
          pad2(i + 1) +
          '</span><span class="ex-t">' +
          linkify(escBr(ex)) +
          "</span></li>";
      });
      h += "</ol>";
    }

    detailInner.innerHTML = h;
    openDetail();
    setHash(name);
  }

  /* ------------------------------- 搜索 ----------------------------------- */
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
    for (var i = 0; i < nn.length && p < qn.length; i++) {
      if (nn[i] === qn[p]) {
        matched.push(i);
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

  function doSearch(q) {
    q = q.toLowerCase().trim();
    clearActiveOption();
    $$(".node.sel").forEach(function (x) {
      x.classList.remove("sel");
    });
    if (!q) {
      searchBox.style.display = "none";
      searchBox.innerHTML = "";
      searchInput.setAttribute("aria-expanded", "false");
      return;
    }
    var qc = normClean(q);
    searchMatches = [];
    var scored = [];
    allNodes.forEach(function (el) {
      var nc = el._norm || normClean(el.dataset.name);
      var r = fuzzySearch(qc, nc);
      if (r) scored.push({ el: el, r: r, nc: nc });
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
    var exact = scored.filter(function (x) {
      return x.r.type === "contains";
    }).slice(0, 40);
    var fuzzy = scored.filter(function (x) {
      return x.r.type !== "contains";
    }).slice(0, 20);
    searchMatches = exact.concat(fuzzy).map(function (x) {
      return x.el;
    });

    function itemHtml(x, i) {
      var el = x.el;
      var r = x.r;
      var nc = x.nc;
      var name = el.dataset.name;
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
      return (
        '<div class="sr-item" role="option" id="sr-opt-' +
        i +
        '" aria-selected="false" data-idx="' +
        i +
        '"><span class="sr-name">' +
        hl +
        '</span><span class="sr-chap">' +
        esc(el.dataset.chapter) +
        "</span></div>"
      );
    }

    var h = "";
    var idx = 0;
    exact.forEach(function (x) {
      h += itemHtml(x, idx++);
    });
    if (exact.length && fuzzy.length) {
      h += '<div class="sr-divider">猜你想搜</div>';
    }
    fuzzy.forEach(function (x) {
      h += itemHtml(x, idx++);
    });
    if (searchMatches.length < scored.length) {
      h +=
        '<div class="sr-empty">… 还有 ' +
        (scored.length - searchMatches.length) +
        " 个结果,继续输入以缩小范围</div>";
    }
    searchBox.innerHTML = h;
    searchBox.style.display = "block";
    searchInput.setAttribute("aria-expanded", "true");
  }

  function pickSearch(i) {
    var el = searchMatches[i];
    if (!el) return;
    selectNode(el);
    var col = el.closest(".col");
    if (col) {
      var cbody = $(".col-body", col);
      if (cbody && col.classList.contains("collapsed")) {
        col.classList.remove("collapsed");
        $(".col-head", col).setAttribute("aria-expanded", "true");
      }
      col.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
    requestAnimationFrame(function () {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    showDetail(el.dataset.name, el.dataset.chapter);
    searchBox.style.display = "none";
    searchBox.innerHTML = "";
    searchInput.setAttribute("aria-expanded", "false");
    clearActiveOption();
  }

  /* ------------------------------ 弹窗（关于/讨论区） ------------------------ */
  var aboutLastFocus = null;
  var groupLastFocus = null;
  var FOCUS_TRAP = "#topbar, #rail, .scroll-btn, #container, #swipe-hint";

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
    trapFocus(false);
    if (wasOpen && aboutLastFocus && aboutLastFocus.focus) aboutLastFocus.focus();
  }

  var giscusLoaded = false;
  var giscusReady = false;
  var giscusErrorShown = false;
  var giscusTimeout = null;
  var giscusObs = null;

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
      if (/discussion not found/i.test(data.error)) {
        hideGroupLoading();
      } else {
        console.warn("[giscus] error:", data.error);
        groupLoadingError();
      }
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
        theme: "transparent_dark",
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
    trapFocus(false);
    if (wasOpen && groupLastFocus && groupLastFocus.focus) groupLastFocus.focus();
  }

  /* ------------------------------- 事件绑定 -------------------------------- */
  searchInput.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      doSearch(searchInput.value);
    }, 180);
  });

  document.getElementById("group-btn").addEventListener("click", openGroup);
  document.getElementById("about-btn").addEventListener("click", openAbout);
  document.getElementById("about-mask").addEventListener("click", closeAbout);
  document.querySelector("#about-dialog .about-close").addEventListener("click", closeAbout);
  document.getElementById("group-mask").addEventListener("click", closeGroup);
  document.querySelector("#group-dialog .group-close").addEventListener("click", closeGroup);
  document.querySelector("#detail .close-btn").addEventListener("click", function () {
    closeDetail();
  });
  document.querySelector(".scroll-btn.left").addEventListener("click", function () {
    scrollColsPage(-1);
  });
  document.querySelector(".scroll-btn.right").addEventListener("click", function () {
    scrollColsPage(1);
  });

  function scrollColsPage(dir) {
    scrollCols(dir * Math.max(240, Math.round(container.clientWidth * 0.8)));
  }
  function scrollCols(amount) {
    container.scrollBy({ left: amount, behavior: "smooth" });
  }

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
    } else if (e.key === "Escape") {
      clearActiveOption();
    }
  });

  searchBox.addEventListener("click", function (e) {
    var item = e.target.closest(".sr-item");
    if (!item) return;
    // pickSearch 会立刻清空下拉（目标节点脱离 DOM），若不阻止冒泡，
    // 同一 click 到达 document 时 closest() 全为 null，会被当成「点到外面」而瞬间关闭面板。
    e.stopPropagation();
    var idx = parseInt(item.dataset.idx, 10);
    if (!isNaN(idx)) pickSearch(idx);
  });

  document.addEventListener("click", function (e) {
    if (
      !e.target.closest(".node") &&
      !e.target.closest("#detail") &&
      !e.target.closest("#search") &&
      !e.target.closest("#search-results")
    ) {
      closeDetail();
    }
    if (!e.target.closest("#about-dialog") && !e.target.closest("#about-btn")) closeAbout();
    if (!e.target.closest("#group-dialog") && !e.target.closest("#group-btn")) closeGroup();
    if (!e.target.closest("#search-results") && !e.target.closest("#search")) {
      searchBox.style.display = "none";
      searchInput.setAttribute("aria-expanded", "false");
      clearActiveOption();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeDetail();
      closeAbout();
      closeGroup();
      searchBox.style.display = "none";
      searchInput.setAttribute("aria-expanded", "false");
      clearActiveOption();
      if (document.activeElement === searchInput) searchInput.blur();
    }
    var typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (!typing && e.key === "/") {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }
    if (e.target && e.target.id === "search") return;
    if (e.key === "ArrowLeft") scrollColsPage(-1);
    if (e.key === "ArrowRight") scrollColsPage(1);
  });

  var touchStartY = 0;
  detailEl.addEventListener("touchstart", function (e) {
    touchStartY = e.touches[0].clientY;
  });
  detailEl.addEventListener("touchmove", function (e) {
    var dy = e.touches[0].clientY - touchStartY;
    if (dy > 60 && detailEl.scrollTop <= 0) closeDetail();
  });

  /* ----------------------------- 移动端滑动提示 ---------------------------- */
  (function () {
    var hint = document.getElementById("swipe-hint");
    if (!window.matchMedia("(max-width: 768px)").matches) return;
    hint.style.display = "block";
    var hinted = false;
    function hideHint() {
      if (!hinted) {
        hinted = true;
        hint.style.opacity = "0";
        setTimeout(function () {
          hint.style.display = "none";
        }, 500);
      }
    }
    container.addEventListener("scroll", hideHint, { once: true });
    container.addEventListener("touchstart", hideHint, { once: true });
    setTimeout(function () {
      if (!hinted) {
        hint.style.opacity = "0";
        setTimeout(function () {
          hint.style.display = "none";
        }, 500);
      }
    }, 5000);
  })();

  /* ------------------------------- 深链恢复 -------------------------------- */
  (function openFromHash() {
    var raw = location.hash.slice(1);
    if (!raw) return;
    var name = raw;
    try {
      name = decodeURIComponent(raw);
    } catch (e) {}
    var el = null;
    allNodes.forEach(function (n) {
      if (!el && n.dataset.name === name) el = n;
    });
    if (!el) {
      var nk = normKey(name);
      allNodes.forEach(function (n) {
        if (!el && normKey(n.dataset.name) === nk) el = n;
      });
    }
    if (!el) return;
    selectNode(el);
    var col = el.closest(".col");
    if (col) col.scrollIntoView({ block: "nearest", inline: "start" });
    el.scrollIntoView({ block: "center" });
    showDetail(el.dataset.name, el.dataset.chapter);
  })();

  updateSpy();

  console.log(
    "神秘电子音乐体系 — " + allNodes.length + " 节点, " + Object.keys(GENRES).length + " 介绍"
  );
})();
