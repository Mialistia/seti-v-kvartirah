// Таблицы сайта: своя прокрутка (по высоте — не больше 70 % экрана), закреплённая шапка и кнопка «На весь экран».
// Обрабатываются таблицы страниц и таблицы, которые калькулятор выводит после расчёта (MutationObserver).
// К таблице добавляется только атрибут data-st (не class): стили Material для таблиц без класса сохраняются.
// На весь экран: таблица переносится в окно поверх страницы (и Fullscreen API, если доступен), шрифт уменьшается,
// пока таблица не поместится по ширине (не меньше 10 px; если не помещается и так — остаётся прокрутка).
// Esc или «× Закрыть» возвращают таблицу на место.
(function (root) {
  "use strict";
  if (typeof document === "undefined") return;
  const SKIP = ".st-wrap, .st-ovl, .highlighttable, pre, code, .md-nav, [data-st-off]";
  const MIN_FS = 10, MAX_FS = 16;
  const ICON = '<svg viewBox="0 0 24 24" width="1.1em" height="1.1em" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5 5h5v2H7v3H5V5m9 0h5v5h-2V7h-3V5m3 9h2v5h-5v-2h3v-3m-7 3v2H5v-5h2v3h3z"/></svg>';   // значок «полный экран» (Material Design Icons)
  let ovl = null, cur = null;   // cur — открытая на весь экран таблица: { t, ph, btn }

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver((es) => es.forEach((e) => flags(e.target.closest(".st-box") || e.target))) : null;
  function flags(box) {   // своя прокрутка по оси — только если таблица в неё не помещается
    if (!box || !box.classList || !box.classList.contains("st-box")) return;
    box.classList.toggle("st-tall", box.scrollHeight > box.clientHeight + 1);
    box.classList.toggle("st-wide", box.scrollWidth > box.clientWidth + 1);
  }
  function wrap(t) {
    if (t.hasAttribute("data-st") || !t.parentElement || t.parentElement.closest(SKIP) || t.parentElement.closest("table") || !t.querySelector("tr")) return;
    t.setAttribute("data-st", "");
    const node = t.closest(".md-typeset__scrollwrap") || t;   // обёртка Material, если она уже есть
    const w = document.createElement("div");
    w.className = "st-wrap";
    w.innerHTML = '<div class="st-bar"><button type="button" class="st-full" title="Открыть таблицу на весь экран">' + ICON + ' На весь экран</button></div>' +
      '<div class="st-box" tabindex="0" role="region" aria-label="Таблица (прокручивается отдельно от страницы)"></div>';
    node.before(w);
    const box = w.lastChild;
    box.append(node);
    if (ro) { ro.observe(box); ro.observe(t); }
    flags(box);
  }
  function scan() { document.querySelectorAll(".md-typeset table").forEach(wrap); }
  let pend = false;
  const schedule = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; scan(); }); };

  // ---------------------------------------------------------------- на весь экран
  const txt = (el) => { const c = el.cloneNode(true); c.querySelectorAll(".gl-q, .headerlink").forEach((x) => x.remove()); return c.textContent.trim(); };
  function title(w) {   // заголовок окна — ближайший заголовок или раскрывающийся блок над таблицей
    for (let n = w; n && !n.classList.contains("md-content__inner"); n = n.parentElement) {
      if (n.tagName === "DETAILS") { const s = n.querySelector(":scope > summary"); if (s) return txt(s); }
      for (let p = n.previousElementSibling; p; p = p.previousElementSibling) if (/^H[1-6]$/.test(p.tagName)) return txt(p);
    }
    return document.title.split(" - ")[0];
  }
  function build() {
    const o = document.createElement("div");
    o.className = "st-ovl"; o.hidden = true;
    o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-labelledby", "st-ovl-title");
    o.innerHTML = '<div class="st-ovl-bar"><span id="st-ovl-title" class="st-ovl-title"></span>' +
      '<button type="button" class="st-close" title="Вернуться к странице (Esc)">× Закрыть</button></div><div class="st-ovl-box md-typeset" tabindex="0"></div>';
    o.querySelector(".st-close").addEventListener("click", () => close());
    o.addEventListener("click", (e) => {   // ссылка внутри страницы: сначала закрыть окно
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented) return;
      e.preventDefault(); const h = a.getAttribute("href");
      close().then(() => { location.hash = h; });
    });
    document.body.append(o);
    return o;
  }
  function fit() {   // наибольший шрифт MAX_FS…MIN_FS, при котором нет горизонтальной прокрутки
    if (!cur) return;
    const b = ovl.querySelector(".st-ovl-box");
    let fs = MAX_FS;
    b.style.fontSize = fs + "px";
    while (b.scrollWidth > b.clientWidth + 1 && fs > MIN_FS) { fs -= 0.5; b.style.fontSize = fs + "px"; }
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
    cur = { t, ph, btn: w.querySelector(".st-full") };
    ovl.hidden = false;
    document.documentElement.classList.add("st-lock");
    ovl.querySelector(".st-close").focus();
    fit();
    if (ovl.requestFullscreen && !document.fullscreenElement) ovl.requestFullscreen().then(fit, () => {});
  }
  function close() {
    if (!cur) return Promise.resolve();
    const { t, ph, btn } = cur;
    cur = null;
    const done = document.fullscreenElement === ovl ? document.exitFullscreen().catch(() => {}) : Promise.resolve();
    if (ph.isConnected) ph.replaceWith(t); else t.remove();
    ovl.hidden = true;
    ovl.querySelector(".st-ovl-box").style.fontSize = "";
    document.documentElement.classList.remove("st-lock");
    if (btn && btn.isConnected) btn.focus({ preventScroll: true });
    return done;
  }
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest(".st-full"); if (b) open(b.closest(".st-wrap")); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && cur) { e.preventDefault(); close(); } });
  document.addEventListener("fullscreenchange", () => { if (cur && document.fullscreenElement !== ovl) close(); else fit(); });
  document.addEventListener("focusin", (e) => { if (cur && !ovl.contains(e.target)) ovl.querySelector(".st-close").focus(); });
  window.addEventListener("resize", () => { if (cur) fit(); });

  root.NetTables = { scan, open, close, isOpen: () => !!cur };
  function init() {
    scan();
    new MutationObserver((ms) => {
      if (ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && (n.tagName === "TABLE" || (n.querySelector && n.querySelector("table")))))) schedule();
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
