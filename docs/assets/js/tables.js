// Таблицы сайта (v2): своя прокрутка (по высоте — не больше 70 % экрана), закреплённая шапка, кнопка «На весь экран».
// Обрабатываются таблицы страниц и таблицы, которые калькулятор выводит после расчёта (MutationObserver).
// К таблице добавляются только атрибуты data-st* (не class): стили Material для таблиц без класса сохраняются.
// Если таблица шире своей области: подсказка «прокрутите вбок», тени у краёв, закреплённый первый столбец
// (data-st-fix="2" у таблицы — два столбца). Текстовая таблица из 4+ столбцов с длинными ячейками (чек-лист),
// которая не помещается, на узком экране показывается карточками; на ПК и при печати — таблицей.
// Числовые столбцы (≥ 80 % ячеек — числа) выравниваются вправо, цифры — одной ширины.
// Таблицы с одинаковой шапкой на странице получают одинаковую ширину столбцов.
// Сортировка по клику на кнопку в заголовке — у таблиц с data-st-sort (список номеров столбцов с 0; пусто — все);
// data-st-sorted="8:desc" — исходный порядок строк уже отсортирован по столбцу 8.
// На весь экран: таблица переносится в окно поверх страницы (и Fullscreen API, если доступен), шрифт уменьшается,
// пока таблица не поместится по ширине (не меньше 12 px; иначе — прокрутка с закреплённым столбцом).
// Esc или «× Закрыть» возвращают таблицу на место.
(function (root) {
  "use strict";
  if (typeof document === "undefined") return;
  const SKIP = ".st-wrap, .st-ovl, .highlighttable, pre, code, .md-nav, [data-st-off]";
  const MIN_FS = 12, MAX_FS = 16, PIN_MAX = 0.6;   // закреплённые столбцы — не больше 60 % ширины области
  const CARD_COLS = 4, CARD_LEN = 120;              // карточки: не меньше 4 столбцов и есть ячейка длиннее 120 знаков
  const ICON = '<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5 5h5v2H7v3H5V5m9 0h5v5h-2V7h-3V5m3 9h2v5h-5v-2h3v-3m-7 3v2H5v-5h2v3h3z"/></svg>';   // значок «полный экран» (Material Design Icons)
  const HINT = "↔ Таблица шире экрана — прокрутите вбок";
  const NUM = /^[+\-−]?\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?\s*(?:%|₽|руб\.?|м²|м|дБм|дБ|Мбит\/с|Гбит\/с|Вт|шт\.?)?$/;
  const DASH = /^[—–-]?$/;
  let ovl = null, cur = null;   // cur — открытая на весь экран таблица: { t, ph, btn, w }

  // ---------------------------------------------------------------- ячейки
  const txt = (el) => { const c = el.cloneNode(true); c.querySelectorAll(".gl-q, .headerlink, .st-sort").forEach((x) => x.remove()); return c.textContent.replace(/\s+/g, " ").trim(); };
  const rowsOf = (t, part) => [...t.rows].filter((r) => r.parentElement.tagName === part);
  function grid(t) {   // ячейки по столбцам с учётом colspan: [{ cell, col, span }]
    const out = [];
    for (const r of t.rows) {
      let col = 0;
      for (const c of r.cells) { out.push({ cell: c, row: r, col, span: c.colSpan || 1 }); col += c.colSpan || 1; }
    }
    return out;
  }
  const head = (t) => { const r = t.tHead && t.tHead.rows[t.tHead.rows.length - 1]; return r ? [...r.cells] : []; };
  const sortVal = (c) => {   // число (null — «—» или пусто) или текст
    const s = txt(c);
    if (DASH.test(s)) return null;
    if (NUM.test(s)) return parseFloat(s.replace(/[\s\u00a0\u202f]/g, "").replace("−", "-").replace(",", "."));
    return s.toLowerCase();
  };
  function prepare(t) {   // один раз: номера столбцов, числовые столбцы, сортировка
    const g = grid(t), cols = new Map();
    for (const x of g) {
      if (x.span !== 1) continue;
      if (x.col < 2) x.cell.setAttribute("data-st-col", String(x.col + 1));
      if (x.row.parentElement.tagName !== "TBODY") continue;
      const s = txt(x.cell), m = cols.get(x.col) || { n: 0, num: 0 };
      if (!DASH.test(s)) { m.n++; if (NUM.test(s)) m.num++; }
      cols.set(x.col, m);
    }
    const numCol = new Set([...cols].filter(([, m]) => m.num && m.num >= 0.8 * m.n).map(([c]) => c));
    for (const x of g) if (x.span === 1 && numCol.has(x.col)) x.cell.setAttribute("data-st-num", "");
    if (t.hasAttribute("data-st-sort")) sortable(t, numCol);
  }

  // ---------------------------------------------------------------- сортировка
  function sortable(t, numCol) {
    const list = (t.getAttribute("data-st-sort") || "").split(/[\s,]+/).filter(Boolean).map(Number);
    const [dc, dd] = (t.getAttribute("data-st-sorted") || "").split(":");
    const body = t.tBodies[0]; if (!body) return;
    [...body.rows].forEach((r, i) => { r.dataset.stI = i; });
    head(t).forEach((th, i) => {
      if (list.length && !list.includes(i)) return;
      const b = document.createElement("button");
      b.type = "button"; b.className = "st-sort";
      b.setAttribute("aria-label", "Сортировать по столбцу «" + txt(th) + "»");
      th.append(" ", b);
      th.dataset.stNumeric = numCol.has(i) ? "1" : "";
      mark(th, dc !== undefined && dc !== "" && +dc === i ? (dd === "asc" ? "ascending" : "descending") : null);
    });
  }
  function mark(th, dir) {
    const b = th.querySelector(":scope > .st-sort");
    if (dir) th.setAttribute("aria-sort", dir); else th.removeAttribute("aria-sort");
    if (b) b.textContent = dir === "ascending" ? "↑" : dir === "descending" ? "↓" : "↕";
  }
  function sortBy(th) {
    const t = th.closest("table"), body = t.tBodies[0], hs = head(t), i = hs.indexOf(th);
    if (!body || i < 0) return;
    const was = th.getAttribute("aria-sort"), isNum = th.dataset.stNumeric === "1";
    // числа: сначала по убыванию; текст: сначала по возрастанию; третий щелчок — исходный порядок
    const seq = isNum ? ["descending", "ascending", null] : ["ascending", "descending", null];
    const [dc, dd] = (t.getAttribute("data-st-sorted") || "").split(":");
    const def = dc !== undefined && dc !== "" && +dc === i ? (dd === "asc" ? "ascending" : "descending") : null;   // исходный порядок отсортирован по этому столбцу
    const dir = seq[(seq.indexOf(was) + 1) % 3];
    hs.forEach((h) => { if (h !== th && h.querySelector(":scope > .st-sort")) mark(h, null); });
    const rows = [...body.rows];
    if (dir === null) rows.sort((a, b) => a.dataset.stI - b.dataset.stI);
    else {
      const k = dir === "ascending" ? 1 : -1;
      const cell = (r) => { let col = 0; for (const c of r.cells) { if (col === i) return c; col += c.colSpan || 1; } return null; };
      rows.sort((a, b) => {
        const ca = cell(a), cb = cell(b), x = ca ? sortVal(ca) : null, y = cb ? sortVal(cb) : null;
        if (x === null || y === null) return x === y ? a.dataset.stI - b.dataset.stI : x === null ? 1 : -1;   // «—» — всегда в конце
        if (typeof x === "number" && typeof y === "number") return (x - y) * k || a.dataset.stI - b.dataset.stI;
        return String(x).localeCompare(String(y), "ru", { numeric: true }) * k || a.dataset.stI - b.dataset.stI;
      });
    }
    body.append(...rows);
    mark(th, dir || def);
  }

  // ---------------------------------------------------------------- размеры: прокрутка, закреплённые столбцы, тени
  function pins(t, box, wide) {   // закрепить 1–2 первых столбца, если таблица шире области
    // data-st-pins: "1" — первый столбец, "2" — два первых, "b" — только второй (data-st-fix="2", а оба не помещаются: «Модель» важнее «№»)
    const want = wide ? (+t.getAttribute("data-st-fix") === 2 ? 2 : 1) : 0, max = PIN_MAX * box.clientWidth;
    const c1 = t.querySelector('[data-st-col="1"]'), c2 = t.querySelector('[data-st-col="2"]');
    const w1 = c1 ? c1.getBoundingClientRect().width : 0, w2 = c2 ? c2.getBoundingClientRect().width : 0;
    let m = "0", pw = 0;
    if (want === 2 && c2 && w1 + w2 <= max) { m = "2"; pw = w1 + w2; }
    else if (want === 2 && c2 && w2 <= max) { m = "b"; pw = w2; }
    else if (want && c1 && w1 <= max) { m = "1"; pw = w1; }
    t.setAttribute("data-st-pins", m);
    t.style.setProperty("--st-l2", w1 + "px");
    t.querySelectorAll("[data-st-col]").forEach((c) => c.toggleAttribute("data-st-pin", m === "2" || m === (c.getAttribute("data-st-col") === "1" ? "1" : "b")));
    return pw;
  }
  function shade(box) {   // тени у краёв: есть что прокрутить влево / вправо
    const v = box.parentElement;
    if (!v) return;
    const max = box.scrollWidth - box.clientWidth;
    v.classList.toggle("st-l", max > 1 && box.scrollLeft > 1);
    v.classList.toggle("st-r", max > 1 && box.scrollLeft < max - 1);
  }
  function measure(box, t) {   // своя прокрутка по оси — только если таблица в неё не помещается
    const tall = box.scrollHeight > box.clientHeight + 1, wide = box.scrollWidth > box.clientWidth + 1;
    box.classList.toggle("st-tall", tall);
    box.classList.toggle("st-wide", wide);
    box.style.setProperty("--st-w", box.clientWidth + "px");
    const pw = t ? pins(t, box, wide) : 0;
    if (box.parentElement) box.parentElement.style.setProperty("--st-pw", pw + "px");
    shade(box);
    return { tall, wide };
  }
  function layout(w) {   // пересчёт одной таблицы страницы
    if (!w || !w.isConnected || (cur && cur.w === w)) return;
    const box = w.querySelector(".st-box"), t = box && box.querySelector("table[data-st]");
    if (!t) return;
    if (w._cards) {   // карточки — только если таблица не помещается по ширине
      w.classList.remove("st-cardmode");
      const r = measure(box, t);
      if (r.wide) { cards(w, t); w.classList.add("st-cardmode"); }
    }
    const r = w.classList.contains("st-cardmode") ? { tall: false, wide: false } : measure(box, t);
    const hint = w.querySelector(".st-hint");
    if (hint) hint.hidden = !r.wide;
    if (r.wide || r.tall) {
      box.tabIndex = 0; box.setAttribute("role", "region");
      box.setAttribute("aria-label", "Таблица «" + title(w) + "» — прокручивается" + (r.wide ? " по горизонтали" : ""));
    } else ["tabindex", "role", "aria-label"].forEach((a) => box.removeAttribute(a));
  }
  function cards(w, t) {   // карточки для телефона: заголовок — первая ячейка, далее «шапка — значение»
    if (w.querySelector(".st-cards")) return;
    const hs = head(t).map((h) => h.innerHTML);
    const list = document.createElement("div");
    list.className = "st-cards"; list.setAttribute("role", "list");
    list.innerHTML = [...(t.tBodies[0] ? t.tBodies[0].rows : [])].map((r) => {
      const cs = [...r.cells];
      return '<div class="st-card" role="listitem"><div class="st-card-h">' + (cs[0] ? cs[0].innerHTML : "") + "</div><dl>" +
        cs.slice(1).map((c, i) => "<dt>" + (hs[i + 1] || "") + "</dt><dd>" + c.innerHTML + "</dd>").join("") + "</dl></div>";
    }).join("");
    w.append(list);
  }
  const wraps = new Set();
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver((es) => {
    const ws = new Set(es.map((e) => e.target.closest(".st-wrap")).filter(Boolean));
    ws.forEach(layout);
    if ([...ws].some((w) => w._grp)) syncLater();
  }) : null;

  // ---------------------------------------------------------------- одинаковая ширина столбцов у таблиц с одинаковой шапкой
  let syncPend = false;
  const syncLater = () => { if (syncPend) return; syncPend = true; requestAnimationFrame(() => { syncPend = false; sync(); }); };
  function sync() {
    const groups = new Map();
    for (const w of wraps) {
      if (!w.isConnected) { wraps.delete(w); continue; }
      const t = w.querySelector("table[data-st]");
      if (!t || w.closest(".netcalc")) continue;
      const hs = head(t);
      if (hs.length < 3) continue;
      const key = hs.map(txt).join("\u0001");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    for (const ts of groups.values()) {
      if (ts.length < 2) continue;
      const vis = ts.filter((t) => t.offsetParent !== null);
      if (!vis.length) continue;
      ts.forEach((t) => { t.style.tableLayout = ""; t.style.width = ""; head(t).forEach((h) => { h.style.width = ""; }); t.closest(".st-wrap")._grp = true; });
      const wmax = [];
      for (const t of vis) head(t).forEach((h, i) => { wmax[i] = Math.max(wmax[i] || 0, Math.ceil(h.getBoundingClientRect().width)); });
      const sum = wmax.reduce((s, x) => s + x, 0);
      for (const t of ts) {
        head(t).forEach((h, i) => { h.style.width = wmax[i] + "px"; });
        t.style.width = sum + "px"; t.style.tableLayout = "fixed";
      }
      ts.forEach((t) => layout(t.closest(".st-wrap")));
    }
  }

  // ---------------------------------------------------------------- обёртка
  function wrap(t) {
    if (t.hasAttribute("data-st") || !t.parentElement || t.parentElement.closest(SKIP) || t.parentElement.closest("table") || !t.querySelector("tr")) return;
    t.setAttribute("data-st", "");
    prepare(t);
    const node = t.closest(".md-typeset__scrollwrap") || t;   // обёртка Material, если она уже есть
    const w = document.createElement("div");
    w.className = "st-wrap";
    w.innerHTML = '<div class="st-bar"><span class="st-hint" hidden>' + HINT + '</span><button type="button" class="st-full" title="Открыть таблицу на весь экран">' + ICON + " На весь экран</button></div>" +
      '<div class="st-view"><div class="st-box"></div></div>';
    node.before(w);
    const box = w.querySelector(".st-box");
    box.append(node);
    box.addEventListener("scroll", () => shade(box), { passive: true });
    const hs = head(t);
    w._cards = !w.closest(".netcalc") && t.getAttribute("data-st-cards") !== "off" && !t.hasAttribute("data-st-sort") && !t.hasAttribute("data-st-fix") &&
      (t.getAttribute("data-st-cards") === "on" || (hs.length >= CARD_COLS && [...t.querySelectorAll("tbody td")].some((c) => txt(c).length > CARD_LEN)));
    wraps.add(w);
    if (ro) { ro.observe(w); ro.observe(t); }
    layout(w);
  }
  function scan() {
    const n = wraps.size;
    document.querySelectorAll(".md-typeset table").forEach(wrap);
    if (wraps.size !== n) syncLater();
  }
  let pend = false;
  const schedule = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; scan(); }); };

  // ---------------------------------------------------------------- на весь экран
  function title(w) {   // заголовок окна и имя области — ближайший заголовок или раскрывающийся блок над таблицей
    for (let n = w; n && !(n.classList && n.classList.contains("md-content__inner")); n = n.parentElement) {
      if (n.tagName === "DETAILS") { const s = n.querySelector(":scope > summary"); if (s) return txt(s); }
      for (let p = n.previousElementSibling; p; p = p.previousElementSibling) if (/^H[1-6]$/.test(p.tagName)) return txt(p);
    }
    return document.title.split(" - ")[0];
  }
  function build() {
    const o = document.createElement("div");
    o.className = "st-ovl"; o.hidden = true;
    o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-labelledby", "st-ovl-title");
    o.innerHTML = '<div class="st-ovl-bar"><span id="st-ovl-title" class="st-ovl-title"></span><span class="st-hint" hidden>' + HINT + "</span>" +
      '<button type="button" class="st-close" title="Вернуться к странице (Esc)">× Закрыть</button></div><div class="st-view"><div class="st-ovl-box md-typeset" tabindex="0"></div></div>';
    o.querySelector(".st-close").addEventListener("click", () => close());
    o.querySelector(".st-ovl-box").addEventListener("scroll", (e) => shade(e.target), { passive: true });
    o.addEventListener("click", (e) => {   // ссылка внутри страницы: сначала закрыть окно
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented) return;
      e.preventDefault(); const h = a.getAttribute("href");
      close().then(() => { location.hash = h; });
    });
    document.body.append(o);
    return o;
  }
  function fit() {   // наибольший шрифт MAX_FS…MIN_FS, при котором нет горизонтальной прокрутки; иначе — прокрутка
    if (!cur) return;
    const b = ovl.querySelector(".st-ovl-box");
    cur.t.setAttribute("data-st-pins", "0");
    cur.t.querySelectorAll("[data-st-pin]").forEach((c) => c.removeAttribute("data-st-pin"));
    b.classList.remove("st-nofit");
    let fs = MAX_FS;
    b.style.fontSize = fs + "px";
    while (b.scrollWidth > b.clientWidth + 1 && fs > MIN_FS) { fs -= 0.5; b.style.fontSize = fs + "px"; }
    if (b.scrollWidth > b.clientWidth + 1) b.classList.add("st-nofit");   // не помещается и при 12 px — обычная ширина столбцов и прокрутка
    const r = measure(b, cur.t);
    ovl.querySelector(".st-hint").hidden = !r.wide;
  }
  function open(w) {
    if (cur) return;
    const t = w.querySelector("table[data-st]"); if (!t) return;
    ovl = ovl || build();
    const ph = document.createComment("st-table");
    t.before(ph);
    const b = ovl.querySelector(".st-ovl-box");
    b.className = "st-ovl-box md-typeset" + (w.closest(".netcalc") ? " netcalc" : "");
    b.append(t); b.scrollTop = 0; b.scrollLeft = 0;
    ovl.querySelector(".st-ovl-title").textContent = title(w);
    b.setAttribute("aria-label", "Таблица «" + title(w) + "»");
    cur = { t, ph, btn: w.querySelector(".st-full"), w, sw: t.style.width, sl: t.style.tableLayout };
    t.style.width = ""; t.style.tableLayout = "";   // во весь экран — своя ширина столбцов
    ovl.hidden = false;
    document.documentElement.classList.add("st-lock");
    ovl.querySelector(".st-close").focus();
    fit();
    if (ovl.requestFullscreen && !document.fullscreenElement) ovl.requestFullscreen().then(fit, () => {});
  }
  function close() {
    if (!cur) return Promise.resolve();
    const { t, ph, btn, w, sw, sl } = cur;
    cur = null;
    const done = document.fullscreenElement === ovl ? document.exitFullscreen().catch(() => {}) : Promise.resolve();
    if (ph.isConnected) ph.replaceWith(t); else t.remove();
    t.style.width = sw; t.style.tableLayout = sl;
    ovl.hidden = true;
    ovl.querySelector(".st-ovl-box").style.fontSize = "";
    document.documentElement.classList.remove("st-lock");
    layout(w);
    if (btn && btn.isConnected) btn.focus({ preventScroll: true });
    return done;
  }
  document.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest(".st-full, .st-sort");
    if (!el) return;
    if (el.classList.contains("st-full")) open(el.closest(".st-wrap")); else sortBy(el.closest("th"));
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && cur) { e.preventDefault(); close(); } });
  document.addEventListener("fullscreenchange", () => { if (cur && document.fullscreenElement !== ovl) close(); else fit(); });
  document.addEventListener("focusin", (e) => { if (cur && !ovl.contains(e.target)) ovl.querySelector(".st-close").focus(); });
  window.addEventListener("resize", () => { if (cur) fit(); });

  root.NetTables = { scan, open, close, layout, sync, isOpen: () => !!cur };
  function init() {
    scan();
    new MutationObserver((ms) => {
      if (ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && (n.tagName === "TABLE" || (n.querySelector && n.querySelector("table")))))) schedule();
    }).observe(document.body, { childList: true, subtree: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { wraps.forEach(layout); syncLater(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
