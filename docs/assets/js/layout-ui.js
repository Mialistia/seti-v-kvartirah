// Конструктор квартиры — блок «Планировка» в форме калькулятора (A2–A4).
// В форме — мини-план, строка состояния и кнопки; конструктор открывается поверх страницы на весь экран:
// старт («Похожа на типовую» К1–К5, «С нуля», «Открыть сохранённую»), вкладки «Комнаты» (край комнаты тянется кружком — соседние
// подстраиваются; размеры числом; тип, деление, объединение; новая комната обводкой прямоугольником; отражение, поворот, ширина квартиры,
// входная дверь) и «Стены» (тип участка из палитры И2 с потерями на 5 ГГц, дверь, «нет стены», сразу для группы стен).
// Мышь, перо, касание (Pointer Events), колесо и два пальца — масштаб. Отмена и повтор; сохранение в браузере и в файл JSON.
// Модель, проверка и рисунок мини-плана — layout.js (подключается до этого файла); calc.js берёт планировку через mount(...).value().
(function (root) {
  "use strict";
  const LA = root.NetLayout;
  if (!LA) throw new Error("layout-ui.js: сначала подключите layout.js");
  if (typeof document === "undefined") return;
  const NE = root.NetEngine, { EPS, eq, r4, clone, esc, fm, q, wname, area, big, mkW, segDist } = LA._;
  const { RT, RNAME, WALL, RF, DOOR, SNAP, MIN } = LA;
  const KEY = "netcalc.plan.v1", r2 = (v) => Math.round(v * 100) / 100, cm = (v) => Math.round(v * 100);
  const num = (v) => (v === "" || v === null || v === undefined || !Number.isFinite(+v) ? null : +v);
  const FB = (act, text, extra = "") => `<button type="button" class="nc-lay-b" data-act="${act}"${extra}>${text}</button>`;   // кнопки в форме
  const B = (act, text, extra = "") => `<button type="button" class="kq-b" data-act="${act}"${extra}>${text}</button>`;        // кнопки конструктора
  const ic = (d) => `<svg class="kq-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;   // значки рисунком: символы есть не во всех шрифтах
  const IC = { undo: ic("M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"), redo: ic("M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13"),
    fit: ic("M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"), rot: ic("M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"),
    mirx: ic("M12 3v18M9 7 4 12l5 5M15 7l5 5-5 5"), miry: ic("M3 12h18M7 9l5-5 5 5M7 15l5 5 5-5") };
  const PAL = ["W1", "W7b", "W2", "W7a", "W3", "W6", "W4"];
  const SIDES = [["низ", "снизу"], ["верх", "сверху"], ["лево", "слева"], ["право", "справа"]];
  const RSHORT = { "ж": "Комната", "к": "Кухня", "п": "Коридор", "с": "Санузел", "х": "Кладовая" };
  const sample = (t) => { const [w, c] = t === "" ? [3, "#9e9e9e"] : WALL[t] || [8, "#546e7a"];
    return `<svg class="kq-ws" viewBox="0 0 40 14" aria-hidden="true" focusable="false"><line x1="3" y1="7" x2="37" y2="7" stroke="${c}" stroke-width="${Math.max(2, w / 2)}" stroke-linecap="square"${t === "" ? ' stroke-dasharray="5 4"' : ""}/></svg>`; };

  function mount(host, opts) {
    const PLD = opts.plans, fe = opts.form, F = (n) => fe.elements[n];
    LA.init(PLD);
    const S = { pl: null, base: null, open: false, view: "start", tab: "rooms", sel: null, scope: "one", nt: "W2", nd: true, draw: false, more: false,
      hist: [], fut: [], drag: null, z: 1, cx: 0, cy: 0, k: 1, note: "", knote: "", undo: null, changed: false, ptr: new Map(),
      img: null, bgOn: true, bgOp: 1 };   // img — картинка-подложка { src, iw, ih } (только в браузере, см. layout-img.js)
    const custom = () => !!S.pl && (!S.base || !LA.same(S.pl, S.base));
    const areaNow = () => { const v = num(F("area").value); return v !== null && v >= 15 && v <= 300 ? v : null; };
    const curCls = () => F("cls").value || opts.eng.classify(F("rooms").value, areaNow())[0];
    const typ = (c) => PLD.plans[NE.PLAN_OF[c]];
    const geo = (p) => (p.manual ? p : { ...p, auto: true });   // после правок геометрии узлы — по правилам размещения (Ш6), если не заданы вручную
    let K = null, lastFocus = null;
    host.innerHTML = `<div class="nc-lay-form"></div><input type="file" class="nc-lay-file" accept=".json,application/json" hidden>`;
    const $h = (s) => host.querySelector(s);
    function wt5() {   // потери стен на 5 ГГц для подписей (И2, табл. 4; тип дома A1 и замер B1 — как в engine.js)
      const W = {}; for (const [k, v] of Object.entries(PLD.WT)) W[k] = v[1];
      if (F("constr").value === "К") { W.W1 = PLD.WT.W1k[1]; W.W7b = W.W1 + 3; }
      const b = num(F("L_W1").value); if (b !== null && b >= 1 && b <= 40) { W.W1 = b; W.W7b = b + 3; }
      W.O = 0; return W;
    }

    // ------------------------------------------------------------ блок в форме
    function formHtml() {
      const own = custom(), p = own ? S.pl : LA.fromTemplate(PLD, curCls(), areaNow()), h = [];
      h.push(`<p class="nc-sub"><b>Планировка</b>${q("layout")} — типовая квартира своего класса или своя планировка в конструкторе; общая площадь — как в A2.</p>`,
        `<div class="nc-lay-sum"><button type="button" class="nc-lay-thumb" data-act="open" aria-label="Открыть конструктор квартиры">${LA.draw(p, { mini: true })}</button><div>`);
      if (own) h.push(`<p><b>Своя планировка</b> — ${p.base ? `изменён типовой план ${esc(p.base)}` : p.bg ? "по картинке" : "создана с нуля"}: ${fm(p.W)} × ${fm(p.H)} м, ${fm(p.W * p.H, 1)} м², ` +
        `помещений — ${p.rooms.length}. Расчёт ведётся по ней, код квартиры — со «*».</p>`);
      else { const c = curCls(), t = typ(c), A = areaNow();
        h.push(`<p>Типовой план <b>${esc(NE.PLAN_OF[c])}</b> — ${esc(t.title)}${A ? `, под площадь ${fm(A, 1)} м² (масштаб k = ${fm(Math.sqrt(A / t.area), 3)})` : `, ${fm(t.area, 1)} м²`}` +
          `${F("cls").value ? "" : " — выбран автоматически по A2 и A3"}. Свою квартиру можно собрать в конструкторе.</p>`); }
      const er = own ? LA.check(S.pl).err : [];
      if (er.length) h.push(`<p class="nc-err">Планировку нужно исправить: ${er.map(esc).join("; ")}.</p>`);
      h.push(`<p class="nc-lay-acts">${FB("open", own ? "Открыть конструктор" : "Изменить планировку", ' data-main="1"')}` +
        `${own ? FB("reset", "Сбросить к типовому") + FB("save", "Сохранить в файл") : ""}${FB("load", "Загрузить из файла")}</p></div></div>`);
      if (S.undo && !S.open) h.push(`<p class="nc-lay-warn">${esc(S.undo.why)} ${FB("restore", "Вернуть")}</p>`);
      if (S.note && !S.open) h.push(`<p class="nc-note">${esc(S.note)}</p>`);
      if (S.changed && opts.hasResult && opts.hasResult()) h.push(`<p class="nc-lay-stale" role="status">Планировка изменена — результат ниже устарел. ${FB("run", "Пересчитать")}</p>`);
      return h.join("");
    }
    const renderForm = () => { $h(".nc-lay-form").innerHTML = formHtml(); };
    function render() { renderForm(); if (K) paint(); }

    // ------------------------------------------------------------ состояние и действия
    function save() { try { if (custom()) localStorage.setItem(KEY, JSON.stringify({ v: 1, saved: new Date().toISOString(), plan: S.pl })); else localStorage.removeItem(KEY); } catch (e) { /* хранилище недоступно */ } }
    function changed() { S.changed = true; save(); render(); if (opts.onChange) opts.onChange(); }
    function commit(np, sel) {
      S.hist.push(S.pl); if (S.hist.length > 80) S.hist.shift(); S.fut = [];
      S.pl = np; if (sel !== undefined) S.sel = sel;
      if (custom()) { F("cls").value = S.pl.cls; if (!areaNow()) F("area").value = String(r2(S.pl.W * S.pl.H)); }
      S.note = ""; S.knote = ""; S.undo = null; changed();
    }
    const tryDo = (fn) => { try { fn(); } catch (e) { S.knote = e.message; S.note = e.message; render(); } };
    function template(c, A) { S.pl = LA.fromTemplate(PLD, c, A); S.base = clone(S.pl); S.hist = []; S.fut = []; S.sel = null; }
    function adopt(pl, why) {   // своя планировка из хранилища или файла
      const p = LA.normalize(clone(pl)), c = LA.check(p);
      if (c.err.length) throw new Error("планировка не прошла проверку: " + c.err.join("; "));
      if (!NE.PLAN_OF[p.cls]) p.cls = curCls();
      S.hist.push(S.pl); S.fut = []; S.pl = p; S.base = p.base && PLD.plans[p.base] ? LA.fromTemplate(PLD, p.cls, p.W * p.H) : null; S.sel = null;
      F("cls").value = p.cls; F("area").value = String(r2(p.W * p.H)); S.note = why; S.knote = why; S.undo = null;
    }
    function drop(why) {   // своя планировка заменена: можно вернуть
      if (!custom()) return;
      S.undo = { pl: S.pl, why }; S.pl = null; S.base = null; S.hist = []; S.fut = []; S.sel = null; S.note = "";
    }
    const download = (obj, name) => { const u = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" })), a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); };
    const bare = (p) => { const c = clone(p); delete c.bg; return c; };   // без привязки картинки: в расчёт и в файл
    const saveFile = () => { if (custom()) download({ netcalc_plan: 1, saved: new Date().toISOString(), plan: bare(S.pl) }, `planirovka_${S.pl.base || "svoya"}.json`); };

    // ------------------------------------------------------------ конструктор: окно поверх страницы
    function openK(view) {
      lastFocus = document.activeElement;
      if (!K) {
        K = document.createElement("div"); K.className = "kq"; K.tabIndex = -1;
        K.setAttribute("role", "dialog"); K.setAttribute("aria-modal", "true"); K.setAttribute("aria-label", "Конструктор квартиры");
        document.body.appendChild(K); bindK();
      }
      S.open = true; S.view = view || (custom() ? "edit" : "start"); S.sel = null; S.draw = false; S.more = false; S.z = 1; S.knote = S.note || "";
      document.documentElement.classList.add("kq-lock");
      S.built = null; paint(); K.focus({ preventScroll: true });
    }
    function closeK() {
      S.open = false; S.sel = null; S.draw = false; S.drag = null; S.ptr.clear();
      if (K) { K.remove(); K = null; }
      document.documentElement.classList.remove("kq-lock");
      renderForm();
      const b = $h('[data-act="open"].nc-lay-b'); if (b) b.focus({ preventScroll: true }); else if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    const $k = (s) => K.querySelector(s);
    // точки расширения: layout-img.js (по картинке), layout-net.js (роутер) — подключаются после этого файла, до calc.js
    const X = { S, F, PLD, opts, LA, NE, host, B, FB, IC, SIDES, RSHORT, num, r2, cm, $k, $h, K: () => K, paint: () => paint(), stage: (l) => stage(l), render: () => render(),
      commit: (np, sel) => commit(np, sel), changed: () => changed(), tryDo, drop: (w) => drop(w), curCls, areaNow, typ, vb: (p) => vb(p), geo, custom,
      tabs: [["rooms", "Комнаты"], ["walls", "Стены"]], views: {}, tab: {}, drags: {}, acts: {}, cards: [], planSide: [], onChange: [], onInput: [], layers: { under: [], over: [] } };
    function stat() {   // строка состояния: площадь помещений и проверка плана
      const v = X.views[S.view]; if (v) return v.stat();
      const p = S.pl; if (!p) return "";
      const c = LA.check(p), sum = p.rooms.reduce((s, r) => s + r[2].reduce((t, x) => t + area(x), 0), 0);
      if (c.err.length) return `<span class="kq-bad">⚠ ${esc(c.err[0])}${c.err.length > 1 ? ` и ещё ${c.err.length - 1}` : ""}</span>`;
      return `Помещения: ${fm(sum, 1)} из ${fm(p.W * p.H, 1)} м² · без наложений${c.warn.length ? ` · <span class="kq-warn">предупреждений: ${c.warn.length}</span>` : ""}`;
    }
    function topHtml() {
      return `<div class="kq-top"><b class="kq-title">Конструктор<span class="kq-t"> квартиры</span></b><span class="kq-stat" role="status" aria-live="polite"></span><span class="kq-tools">` +
        (S.view === "edit" ? B("undo", IC.undo + "<span class=\"kq-t\">Отменить</span>", ' title="Отменить (Ctrl+Z)" aria-label="Отменить"') + B("redo", IC.redo + "<span class=\"kq-t\">Повторить</span>", ' title="Повторить (Ctrl+Y)" aria-label="Повторить"') +
          B("more", "⋯<span class=\"kq-t\"> Ещё</span>", ' aria-haspopup="true" aria-label="Ещё"') : "") + B("done", "Готово", ' data-main="1"') +
        `</span><div class="kq-menu" hidden>${B("restart", "Начать заново: типовая, с нуля, файл")}${B("ksave", "Сохранить в файл")}${B("kload", "Загрузить из файла")}${B("auto", "Расставить узлы по правилам")}</div></div>`;
    }
    function paint() {   // перерисовка окна: каркас — при смене вида, дальше — части
      if (!K) return;
      const ae = document.activeElement, key = ae && K.contains(ae) ? focusKey(ae) : null, side = S.built === S.view + S.tab ? $k(".kq-side") : null, st = side ? side.scrollTop : 0;
      if (S.built !== S.view + S.tab) {
        const zoom = `<div class="kq-zoom">${B("zin", "+", ' aria-label="Крупнее"')}${B("zout", "−", ' aria-label="Мельче"')}${B("zfit", IC.fit, ' aria-label="Целиком"')}</div>`;
        K.innerHTML = topHtml() + (S.view === "start" ? `<div class="kq-start"></div>` : X.views[S.view] ?
          `<div class="kq-main"><div class="kq-stage"><div class="kq-cv" aria-label="${esc(X.views[S.view].label || "Рисунок")}" role="img"></div><p class="kq-hint"></p>${zoom}</div><aside class="kq-side"></aside></div>` :
          `<div class="kq-tabs" role="tablist" aria-label="Режим">${X.tabs.map(([t, n]) => `<button type="button" role="tab" class="kq-tab" data-act="tab" data-t="${t}" aria-selected="${S.tab === t}">${n}</button>`).join("")}</div>` +
          `<div class="kq-main"><div class="kq-stage"><div class="kq-cv" aria-label="План квартиры" role="img"></div><p class="kq-hint"></p>` +
          `${zoom}</div><aside class="kq-side"></aside></div>`);
        S.built = S.view + S.tab;
      }
      $k(".kq-stat").innerHTML = stat();
      const m = $k(".kq-menu"); m.hidden = !S.more; const mb = $k('[data-act="more"]'); if (mb) mb.setAttribute("aria-expanded", String(S.more));
      if (S.view === "start") { $k(".kq-start").innerHTML = startHtml(); }
      else if (X.views[S.view]) { stage(); const sd = $k(".kq-side"); sd.innerHTML = X.views[S.view].side(); sd.scrollTop = st; }
      else {
        $k('[data-act="undo"]').disabled = !S.hist.length; $k('[data-act="redo"]').disabled = !S.fut.length;
        stage(); const sd = $k(".kq-side"); sd.innerHTML = sideHtml(); sd.scrollTop = st;
      }
      if (key) { const el = K.querySelector(key); if (el) el.focus({ preventScroll: true }); }
    }
    function focusKey(el) {
      const d = el.dataset || {}, attr = (n) => (d[n] !== undefined ? `[data-${n}="${String(d[n]).replace(/"/g, '\\"')}"]` : "");
      if (d.act) return `[data-act="${d.act}"]` + attr("t") + attr("dir") + attr("d") + attr("ri") + attr("rj") + attr("cls");
      return el.classList && el.classList.length ? "." + el.classList[0] : null;
    }

    // ------------------------------------------------------------ старт: как задать планировку
    function startHtml() {
      const A = areaNow(), c0 = curCls(), auto = !F("cls").value, h = [];
      h.push(`<div class="kq-start-in"><h2>Как задать планировку?</h2><p>Общая площадь из A2: <b>${A ? fm(A, 1) + " м²" : "не указана — как в типовом плане"}</b>. ` +
        `Планировка хранится только в этом браузере и в файле, если сохраните.</p>`);
      if (S.knote) h.push(`<p class="kq-note">${esc(S.knote)}</p>`);
      h.push(`<div class="kq-cards"><section class="kq-card kq-rec"><h3>Похожа на типовую <span class="kq-badge">быстро</span></h3>` +
        `<p>Выберите похожую квартиру, потом отразите, поверните и подгоните размеры комнат.</p><div class="kq-minis">` +
        Object.keys(NE.PLAN_OF).map((c) => { const t = typ(c), Ac = A || t.area;
          return `<button type="button" class="kq-mini" data-act="tpl" data-cls="${c}" aria-pressed="${c === c0}">${LA.draw(t, { mini: true })}<span><b>${c}</b> · ${fm(Ac, 1)} м²` +
            `${c === c0 && auto ? ' <small class="kq-badge">авто</small>' : ""}<br><small>${esc(t.title)}</small></span></button>`; }).join("") + `</div></section>`);
      const Ab = A || typ(c0).area, w = r2(Math.round(Math.sqrt(Ab * 1.25) / SNAP) * SNAP);
      h.push(`<section class="kq-card"><h3>С нуля</h3><p>Прямоугольный контур площадью ${fm(Ab, 1)} м²: задайте ширину — длина посчитается. Потом делите комнаты и обводите новые.</p>` +
        `<div class="kq-f"><label>Ширина, м <input type="number" class="kq-nw" min="2" max="30" step="0.05" value="${w}"></label><span>длина — <b class="kq-nh">${fm(Ab / w)}</b> м</span></div>` +
        `<div class="kq-f"><label>Входная дверь <select class="kq-nside">${SIDES.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>` +
        `<label>отступ от угла, м <input type="number" class="kq-noff" min="0" step="0.05" value="0.4"></label></div><p class="kq-err kq-nerr"></p>${B("create", "Создать", ' data-main="1"')}</section>`);
      h.push(X.cards.map((f) => f()).join(""));
      h.push(`<section class="kq-card"><h3>Открыть сохранённую</h3><p>Файл JSON из конструктора («Сохранить в файл») или JSON-выгрузка расчёта.</p>${B("kload", "Выбрать файл")}` +
        (S.undo ? `<p class="kq-note">${esc(S.undo.why)}</p>${B("restore", "Вернуть прошлую планировку")}` : "") + `</section></div>`);
      if (S.pl) h.push(`<p>${B("back", "← Вернуться к плану")}</p>`);
      h.push(`</div>`);
      return h.join("");
    }

    // ------------------------------------------------------------ план: масштаб, рисунок
    const PAD = 0.45;
    function vb(p) {   // видимая часть плана, м: весь план или приближение (S.z, центр S.cx, S.cy)
      const fx = -PAD, fy = -PAD, fw = p.W + 2 * PAD, fh = p.H + 2 * PAD;
      if (S.z <= 1.001) return [fx, fy, fw, fh];
      const w = fw / S.z, h = fh / S.z, cx = Math.min(fx + fw - w / 2, Math.max(fx + w / 2, S.cx)), cy = Math.min(fy + fh - h / 2, Math.max(fy + h / 2, S.cy));
      S.cx = cx; S.cy = cy; return [cx - w / 2, cy - h / 2, w, h];
    }
    function selPiece(p) {   // выбранный участок стены (после правок участки пересобираются — ищем по середине)
      if (!S.sel || S.sel.k !== "piece") return null;
      const m = S.sel.at;
      return LA.pieces(p).find((x) => x.o === S.sel.o && eq(x.c, S.sel.c) && m >= x.a - EPS && m <= x.b + EPS) || null;
    }
    function scopeList(p, pc) {   // участки, к которым применяется тип: этот, вся линия, все стены помещения, все такого же типа
      const all = LA.pieces(p);
      if (!pc || S.scope === "one") return pc ? [pc] : [];
      if (S.scope === "line") {
        const on = all.filter((x) => x.o === pc.o && eq(x.c, pc.c)).sort((a, b) => a.a - b.a), out = [pc];
        let lo = pc.a, hi = pc.b, ch = true;
        while (ch) { ch = false; for (const x of on) if (!out.includes(x) && (eq(x.b, lo) || eq(x.a, hi))) { out.push(x); lo = Math.min(lo, x.a); hi = Math.max(hi, x.b); ch = true; } }
        return out;
      }
      if (S.scope === "r1" || S.scope === "r2") { const ri = S.scope === "r1" ? pc.r1 : pc.r2; return all.filter((x) => x.r1 === ri || x.r2 === ri); }
      if (S.scope === "type") return all.filter((x) => x.t === pc.t);
      return [pc];
    }
    function stage(light) {
      if (X.views[S.view]) return X.views[S.view].stage(light);
      const cv = $k(".kq-cv"); if (!cv || !S.pl) return;
      const d = S.drag, p = d && d.pl ? d.pl : S.pl, [x0, y0, w, h] = vb(p);
      const cw = cv.clientWidth || 600, ch = cv.clientHeight || 400; S.k = Math.min(cw / (w * 100), ch / (h * 100));   // пикселей на сантиметр
      const px = (n) => n / S.k, fs = Math.round(Math.min(px(15), Math.max(px(11), Math.min(34, Math.max(18, Math.max(p.W, p.H) * 100 / 28)))));
      const out = [`<svg class="kq-svg" viewBox="${cm(x0)} ${cm(y0)} ${cm(w)} ${cm(h)}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="font-size:${fs}px">`,
        `<rect x="${cm(-PAD)}" y="${cm(-PAD)}" width="${cm(p.W + 2 * PAD)}" height="${cm(p.H + 2 * PAD)}" fill="#fff"/>`];
      const bad = LA.badRooms(p), selR = S.sel && S.sel.k === "room" && S.sel.ri < p.rooms.length ? S.sel.ri : -1, bg = S.img && p.bg && p.bg.m && S.bgOn;
      if (bg) out.push(`<image href="${S.img.src}" x="0" y="0" width="${p.bg.iw}" height="${p.bg.ih}" preserveAspectRatio="none" opacity="${S.bgOp}" transform="matrix(${p.bg.m.map((v) => Math.round(v * 1e8) / 1e6).join(" ")})"/>`);
      p.rooms.forEach(([, t, rs], i) => { for (const r of rs) out.push(`<rect x="${cm(r[0])}" y="${cm(r[1])}" width="${cm(r[2]) - cm(r[0])}" height="${cm(r[3]) - cm(r[1])}" fill="${i === selR ? "#ffe0b2" : RF[t] || "#f5f5f5"}"${bg ? ` fill-opacity="${i === selR ? 0.45 : 0.25}"` : ""}/>`); });
      for (const f of X.layers.under) f(p, out, px);   // слои расширений под стенами (карта сигнала)
      out.push(`<rect x="0" y="0" width="${cm(p.W)}" height="${cm(p.H)}" fill="none" stroke="#37474f" stroke-width="${px(3)}"/>`);
      for (const wd of p.windows || []) out.push(`<line x1="${cm(wd[0][0])}" y1="${cm(wd[0][1])}" x2="${cm(wd[1][0])}" y2="${cm(wd[1][1])}" stroke="#81d4fa" stroke-width="${px(5)}"/>`);
      for (const b of LA.openB(p)) { const l = mkW(b.o, b.c, b.a, b.b); out.push(`<line x1="${cm(l[0])}" y1="${cm(l[1])}" x2="${cm(l[2])}" y2="${cm(l[3])}" stroke="#9e9e9e" stroke-width="${px(1.5)}" stroke-dasharray="${px(5)} ${px(4)}"/>`); }
      for (const l of p.walls) {
        const [sw, col] = l[4] === "O" ? [4, "#bdbdbd"] : WALL[l[4]] || [8, "#546e7a"];
        out.push(`<line x1="${cm(l[0])}" y1="${cm(l[1])}" x2="${cm(l[2])}" y2="${cm(l[3])}" stroke="${col}" stroke-width="${Math.max(sw, px(2))}" stroke-linecap="square"${l[4] === "O" ? ` stroke-dasharray="${px(4)} ${px(4)}"` : ""}/>`);
      }
      if (p.door && p.door.length === 2) out.push(`<line x1="${cm(p.door[0][0])}" y1="${cm(p.door[0][1])}" x2="${cm(p.door[1][0])}" y2="${cm(p.door[1][1])}" stroke="#e65100" stroke-width="${Math.max(12, px(5))}"/>`);
      bad.forEach((i) => { for (const r of p.rooms[i][2]) out.push(`<rect x="${cm(r[0])}" y="${cm(r[1])}" width="${cm(r[2]) - cm(r[0])}" height="${cm(r[3]) - cm(r[1])}" fill="none" stroke="#d50000" stroke-width="${px(3)}" stroke-dasharray="${px(6)} ${px(4)}"/>`); });
      if (S.tab === "walls") {
        const pc = selPiece(p);
        if (pc) {
          for (const x of scopeList(p, pc)) { const l = mkW(x.o, x.c, x.a, x.b); out.push(`<line x1="${cm(l[0])}" y1="${cm(l[1])}" x2="${cm(l[2])}" y2="${cm(l[3])}" stroke="#ff6d00" stroke-opacity=".35" stroke-width="${px(12)}" stroke-linecap="round"/>`); }
          const l = mkW(pc.o, pc.c, pc.a, pc.b); out.push(`<line x1="${cm(l[0])}" y1="${cm(l[1])}" x2="${cm(l[2])}" y2="${cm(l[3])}" stroke="#ff6d00" stroke-width="${px(5)}" stroke-linecap="round"/>`);
        }
      }
      if (selR >= 0) {   // выбранная комната: контур, размеры, кружки на внутренних краях
        const rs = p.rooms[selR][2], r = big(rs);
        for (const x of rs) out.push(`<rect x="${cm(x[0])}" y="${cm(x[1])}" width="${cm(x[2]) - cm(x[0])}" height="${cm(x[3]) - cm(x[1])}" fill="none" stroke="#ff6d00" stroke-width="${px(2.5)}"/>`);
        out.push(`<text x="${cm((r[0] + r[2]) / 2)}" y="${cm(r[1]) + px(14)}" class="kq-dim">${fm(r[2] - r[0])} м</text>`,
          `<text x="${cm(r[0]) + px(14)}" y="${cm((r[1] + r[3]) / 2)}" class="kq-dim" transform="rotate(-90 ${cm(r[0]) + px(14)} ${cm((r[1] + r[3]) / 2)})">${fm(r[3] - r[1])} м</text>`);
      }
      p.rooms.forEach(([n, , rs]) => {
        const r = big(rs), a = rs.reduce((s, x) => s + area(x), 0), x = cm((r[0] + r[2]) / 2), y = cm((r[1] + r[3]) / 2);
        out.push(`<text x="${x}" y="${y - fs * 0.55}" class="kq-room">${esc(n)}</text><text x="${x}" y="${y + fs * 0.6}" class="kq-area">${fm(a, 1)} м²</text>`);
      });
      const P = p.pos;
      if (P) {
        const rr = Math.max(14, px(7));
        out.push(`<g class="kq-pos"><rect x="${cm(P.entry[0]) - rr * 0.8}" y="${cm(P.entry[1]) - rr * 0.8}" width="${rr * 1.6}" height="${rr * 1.6}" fill="#fff" stroke="#e65100" stroke-width="${rr / 4}"/>`);
        [P.center].concat(P.sat).forEach((c, i) => out.push(`<circle cx="${cm(c[0])}" cy="${cm(c[1])}" r="${rr}" fill="${i ? "#00897b" : "#283593"}" fill-opacity=".85" stroke="#fff" stroke-width="${rr / 4}"/>` +
          `<text x="${cm(c[0])}" y="${cm(c[1])}" class="kq-node" style="font-size:${rr * 1.1}px">${i ? "С" + i : "Ц"}</text>`));
        out.push("</g>");
      }
      if (selR >= 0 && !S.draw) for (const e of LA.roomEdges(p, selR)) {   // кружки
        const m = (e.lo + e.hi) / 2, [hx, hy] = e.o === "v" ? [e.c, m] : [m, e.c], R = px(15), on = d && d.kind === "edge" && d.e.o === e.o && eq(d.e.lo, e.lo) && eq(d.e.hi, e.hi);
        out.push(`<circle cx="${cm(hx)}" cy="${cm(hy)}" r="${R}" fill="${on ? "#e65100" : "#ff6d00"}" stroke="#fff" stroke-width="${px(3)}"/><text x="${cm(hx)}" y="${cm(hy)}" class="kq-hd" style="font-size:${px(17)}px">${e.o === "v" ? "↔" : "↕"}</text>`);
      }
      if (d && d.kind === "edge" && d.pl) {
        const e = d.e, v = d.v, l = mkW(e.o, v, e.lo, e.hi), mx = (l[0] + l[2]) / 2, my = (l[1] + l[3]) / 2;
        out.push(`<text x="${cm(mx) + (e.o === "v" ? 0 : 0)}" y="${cm(my) - px(26)}" class="kq-tip">${e.o === "v" ? "x" : "y"} = ${fm(v)} м</text>`);
      }
      if (d && d.kind === "rect") {
        const r = LA.snapRect(p, [d.p0[0], d.p0[1], d.p1[0], d.p1[1]]);
        out.push(`<rect x="${cm(r[0])}" y="${cm(r[1])}" width="${cm(r[2]) - cm(r[0])}" height="${cm(r[3]) - cm(r[1])}" fill="#ff6d00" fill-opacity=".15" stroke="#ff6d00" stroke-width="${px(2.5)}" stroke-dasharray="${px(6)} ${px(4)}"/>`,
          `<text x="${cm((r[0] + r[2]) / 2)}" y="${cm((r[1] + r[3]) / 2)}" class="kq-tip">${fm(r[2] - r[0])} × ${fm(r[3] - r[1])} м</text>`);
      }
      for (const f of X.layers.over) f(p, out, px);   // слои расширений поверх плана
      out.push(`<text x="${cm(p.W / 2)}" y="${cm(-0.22)}" class="kq-out">${fm(p.W)} м</text><text x="${cm(-0.22)}" y="${cm(p.H / 2)}" class="kq-out" transform="rotate(-90 ${cm(-0.22)} ${cm(p.H / 2)})">${fm(p.H)} м</text>`);
      out.push("</svg>");
      cv.innerHTML = out.join("");
      cv.setAttribute("aria-label", `План: ${fm(p.W)} × ${fm(p.H)} м, помещений — ${p.rooms.length}`);
      cv.classList.toggle("kq-drawing", !!S.draw);
      if (!light) $k(".kq-hint").textContent = hint();
    }
    function hint() {
      const v = X.views[S.view] || X.tab[S.tab]; if (v && v.hint) return v.hint();
      if (S.tab === "walls") return S.sel ? "Выберите тип в панели — для этого участка или сразу для группы." : "Нажмите на стену или пунктир между комнатами.";
      if (S.draw) return "Проведите по плану прямоугольник — получится новая комната.";
      return S.sel ? "Тяните оранжевые кружки — соседние комнаты подстроятся." : "Нажмите на комнату, чтобы изменить её.";
    }

    // ------------------------------------------------------------ боковая панель
    function sideHtml() {
      const p = S.pl, h = [];
      if (S.knote) h.push(`<p class="kq-note kq-flash">${esc(S.knote)}</p>`);
      const c = LA.check(p);
      if (c.err.length) h.push(`<div class="kq-err"><b>Нужно исправить:</b><ul>${c.err.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`);
      if (c.warn.length) h.push(`<div class="kq-warn"><ul>${c.warn.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`);
      if (X.tab[S.tab]) return h.join("") + X.tab[S.tab].side(p);
      if (S.tab === "walls") return h.join("") + wallsSide(p);
      if (S.sel && S.sel.k === "room" && S.sel.ri < p.rooms.length) return h.join("") + roomSide(p, S.sel.ri);
      return h.join("") + planSide(p);
    }
    const wopt = (sel, none) => { const L = wt5(); return (none ? `<option value=""${sel === "" ? " selected" : ""}>без стены — граница зон</option>` : "") +
      PAL.filter((t) => t !== "W4").map((t) => `<option value="${t}"${t === sel ? " selected" : ""}>${esc(wname(t))} — ${fm(L[t], 0)} дБ</option>`).join(""); };
    function planSide(p) {
      const ds = LA.doorSide(p);
      return `<h3>Комнаты</h3><p class="kq-note">Нажмите на комнату на плане или здесь:</p><div class="kq-chips">${p.rooms.map(([n, t], i) => `<button type="button" class="kq-chip" data-act="pick" data-ri="${i}"><i style="background:${RF[t]}"></i>${esc(n)}</button>`).join("")}</div>` +
        `<h4>Новая комната</h4><p>${B("draw", S.draw ? "Отменить обводку" : "＋ Нарисовать комнату", ` aria-pressed="${S.draw}"`)}</p>` +
        `<p class="kq-note">Проведите по плану прямоугольник: новая комната заберёт площадь у тех, кого накроет. Края ближе 35 см к стене прилипают к ней.</p>` +
        `<div class="kq-f"><label>Стены новой комнаты <select class="kq-nt">${wopt(S.nt, true)}</select></label><label class="kq-chk"><input type="checkbox" class="kq-nd"${S.nd ? " checked" : ""}> с дверью ${fm(DOOR, 1)} м</label></div>` +
        `<h4>Весь план</h4><div class="kq-acts">${B("mirx", IC.mirx + "Отразить слева направо")}${B("miry", IC.miry + "Отразить сверху вниз")}${B("rot", IC.rot + "Повернуть на 90°")}</div>` +
        `<div class="kq-f"><label>Ширина квартиры, м <input type="number" class="kq-W" min="2" max="30" step="0.05" value="${r2(p.W)}"></label><span>длина — ${fm(p.H)} м; площадь ${fm(p.W * p.H, 1)} м² не меняется</span></div>` +
        `<div class="kq-f"><label>Входная дверь <select class="kq-dside">${SIDES.map(([v, t]) => `<option value="${v}"${v === ds.side ? " selected" : ""}>${t}</option>`).join("")}</select></label>` +
        `<label>отступ от угла, м <input type="number" class="kq-doff" min="0" step="0.05" value="${r2(ds.off)}"></label></div>` +
        X.planSide.map((f) => f(p)).join("") +
        `<h4>Узлы сети</h4><p class="kq-note">Ц — корневой узел, С1, С2 — спутники, □ — ввод кабеля у входной двери. Места: ${p.manual ? "заданы вручную" : p.auto ? "по правилам размещения (Ш6) — пересчитываются после каждой правки" : "типовые (И4)"}.</p>` +
        `<p>${B("auto", "Расставить по правилам")}${B("restart", "Другая типовая или с нуля")}</p>`;
    }
    function roomSide(p, ri) {
      const [n, t, rs] = p.rooms[ri], a = rs.reduce((s, r) => s + area(r), 0), r = rs[0], nb = LA.neighbors(p, ri);
      const sz = (dir, lab, v) => `<div class="kq-dim-row"><span>${lab}</span>${B("size", "−", ` data-dir="${dir}" data-d="-1" aria-label="${lab}: меньше на 5 см"`)}` +
        `<input type="number" class="kq-sz" data-dir="${dir}" min="0.3" step="0.05" value="${r2(v)}" aria-label="${lab}, м">${B("size", "+", ` data-dir="${dir}" data-d="1" aria-label="${lab}: больше на 5 см"`)}<span>м</span></div>`;
      return `<h3>${esc(n)} <small>· ${fm(a, 1)} м²</small></h3>` +
        `<div class="kq-f"><label>Название <input type="text" class="kq-name" maxlength="40" value="${esc(n)}"></label></div>` +
        `<div class="kq-chips" role="group" aria-label="Тип помещения">${RT.map(([k, v]) => `<button type="button" class="kq-chip" data-act="rtype" data-t="${k}" aria-pressed="${k === t}" title="${esc(v)}"><i style="background:${RF[k]}"></i>${RSHORT[k]}</button>`).join("")}</div>` +
        (rs.length === 1 ? `<h4>Размеры</h4>${sz("v", "Ширина", r[2] - r[0])}${sz("h", "Длина", r[3] - r[1])}<p class="kq-note">Меняется край, за которым соседняя комната; край у наружной стены не двигается.</p>`
          : `<p class="kq-note">Комната из нескольких прямоугольников — размеры меняйте кружками на плане.</p>`) +
        `<h4>Разделить пополам</h4><div class="kq-acts">${B("split", "│ вертикальной стеной", ' data-dir="v"')}${B("split", "─ горизонтальной стеной", ' data-dir="h"')}</div>` +
        `<div class="kq-f"><label>Новая стена <select class="kq-nt">${wopt(S.nt, true)}</select></label><label class="kq-chk"><input type="checkbox" class="kq-nd"${S.nd ? " checked" : ""}> с дверью ${fm(DOOR, 1)} м</label></div>` +
        (nb.length ? `<h4>Объединить с соседней</h4><div class="kq-chips">${nb.map((j) => `<button type="button" class="kq-chip" data-act="merge" data-rj="${j}"><i style="background:${RF[p.rooms[j][1]]}"></i>${esc(p.rooms[j][0])}</button>`).join("")}</div>` : "") +
        `<p>${B("unsel", "Снять выделение")}</p>`;
    }
    function wallsSide(p) {
      const L = wt5(), pc = selPiece(p);
      const pal = (cur, act) => `<div class="kq-pal">${PAL.map((t) => `<button type="button" class="kq-pb" data-act="${act}" data-t="${t}"${act ? ` aria-pressed="${t === cur}"` : " disabled"}>${sample(t)}<span>${esc(wname(t))}</span><b>${fm(L[t], 0)} дБ</b></button>`).join("")}` +
        `<button type="button" class="kq-pb" data-act="${act}" data-t=""${act ? ` aria-pressed="${cur === "" || cur === "O"}"` : " disabled"}>${sample("")}<span>нет стены — проём, арка, граница зон</span><b>0 дБ</b></button></div>`;
      if (!pc) return `<h3>Стены</h3><p class="kq-note">Стены строятся сами по границам комнат. Нажмите на стену или пунктир между комнатами, чтобы выбрать тип. Потери на 5 ГГц — по И2 (табл. 4) с учётом типа дома A1 и замера B1.</p>${pal(null, "")}`;
      const nm = (i) => (i >= 0 && p.rooms[i] ? `«${esc(p.rooms[i][0])}»` : "—"), all = LA.pieces(p), cnt = (sc) => { const o = S.scope; S.scope = sc; const n = scopeList(p, pc).length; S.scope = o; return n; };
      const scopes = [["one", "этот участок"], ["line", `вся линия (${cnt("line")})`]];
      if (pc.r1 >= 0) scopes.push(["r1", `все стены ${nm(pc.r1)} (${cnt("r1")})`]);
      if (pc.r2 >= 0 && pc.r2 !== pc.r1) scopes.push(["r2", `все стены ${nm(pc.r2)} (${cnt("r2")})`]);
      if (pc.t) scopes.push(["type", `все «${esc(wname(pc.t))}» (${all.filter((x) => x.t === pc.t).length})`]);
      return `<h3>${pc.t ? `Стена: ${esc(wname(pc.t))}` : "Без стены"} <small>· ${fm(pc.b - pc.a)} м</small></h3><p class="kq-note">Между ${nm(pc.r1)} и ${nm(pc.r2)}.</p>` +
        `<h4>Применить к</h4><div class="kq-chips" role="group" aria-label="К каким стенам применить">${scopes.map(([k, v]) => `<button type="button" class="kq-chip" data-act="scope" data-t="${k}" aria-pressed="${S.scope === k}">${v}</button>`).join("")}</div>` +
        `<h4>Тип</h4>${pal(pc.t, "wtype")}` +
        (pc.t && pc.t !== "W4" && pc.b - pc.a >= DOOR + 0.1 - EPS ? `<p>${B("door", `Дверь ${fm(DOOR, 1)} м в этом участке`)}</p>` : "") + `<p>${B("unsel", "Снять выделение")}</p>`;
    }

    // ------------------------------------------------------------ события конструктора
    function bindK() {
      K.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-act]"); if (!b || b.disabled || !K.contains(b)) return;
        const act = b.dataset.act, p = S.pl;
        if (act !== "more") S.more = false;
        tryDo(() => {
          if (X.acts[act]) X.acts[act](b, p);
          else if (act === "done") closeK();
          else if (act === "more") { S.more = !S.more; paint(); }
          else if (act === "undo" && S.hist.length) { S.fut.push(S.pl); S.pl = S.hist.pop(); S.sel = null; changed(); }
          else if (act === "redo" && S.fut.length) { S.hist.push(S.pl); S.pl = S.fut.pop(); S.sel = null; changed(); }
          else if (act === "restart") { S.view = "start"; S.knote = ""; paint(); }
          else if (act === "back") { S.view = "edit"; paint(); }
          else if (act === "ksave") saveFile();
          else if (act === "kload") $h(".nc-lay-file").click();
          else if (act === "restore" && S.undo) { const u = S.undo; S.undo = null; adopt(u.pl, ""); S.view = "edit"; changed(); }
          else if (act === "tpl") {
            const c = b.dataset.cls; if (custom()) drop(`Своя планировка заменена типовым планом ${NE.PLAN_OF[c]}.`);
            F("cls").value = c; template(c, areaNow()); S.view = "edit"; S.tab = "rooms"; S.z = 1;
            S.knote = `Типовой план ${NE.PLAN_OF[c]}. Подгоните под свою квартиру: отразите или поверните план, тяните края комнат.`; changed();
          }
          else if (act === "create") {
            const A = areaNow() || typ(curCls()).area, w = num($k(".kq-nw").value), er = $k(".kq-nerr");
            if (w === null || w < 2 || w > 30 || A / w < 2 || A / w > 30) { er.textContent = `ширина и длина — от 2 до 30 м (площадь ${fm(A, 1)} м²)`; return; }
            const c = curCls(); drop("Своя планировка заменена новой.");
            S.hist = []; S.fut = []; S.pl = LA.blank(PLD, c, A, w, $k(".kq-nside").value, num($k(".kq-noff").value) || 0); S.base = null;
            S.view = "edit"; S.tab = "rooms"; S.sel = { k: "room", ri: 0 }; S.z = 1; F("cls").value = c; if (!areaNow()) F("area").value = String(r2(A));
            S.knote = "Контур готов. Разделите комнату пополам или обведите новые комнаты прямоугольником."; changed();
          }
          else if (act === "tab") { S.tab = b.dataset.t; S.sel = null; S.draw = false; S.scope = "one"; S.knote = ""; paint(); }
          else if (act === "zin" || act === "zout") { zoomBy(act === "zin" ? 1.5 : 1 / 1.5, null); }
          else if (act === "zfit") { S.z = 1; stage(); }
          else if (act === "pick") { S.sel = { k: "room", ri: +b.dataset.ri }; S.knote = ""; paint(); }
          else if (act === "unsel") { S.sel = null; S.knote = ""; paint(); }
          else if (act === "draw") { S.draw = !S.draw; S.sel = null; S.knote = ""; paint(); }
          else if (act === "mirx" || act === "miry") commit(LA.mirror(p, act === "mirx" ? "x" : "y"));
          else if (act === "rot") { S.z = 1; commit(LA.rotate(p)); }
          else if (act === "auto") { const np = clone(p); np.auto = true; delete np.manual; commit(LA.finish(np)); }
          else if (act === "rtype" && S.sel) { const ri = S.sel.ri, t = b.dataset.t, old = p.rooms[ri];
            const nm = old[0].startsWith(RSHORT[old[1]] || "\u0000") && !p.rooms.some((r, i) => i !== ri && r[0] === (RSHORT[t] || old[0])) ? RSHORT[t] : undefined;
            commit(LA.setRoom(geo(p), ri, nm && nm !== old[0] ? uniqName(p, ri, t) : undefined, t)); }
          else if (act === "size" && S.sel) { const r = p.rooms[S.sel.ri][2][0], V = b.dataset.dir === "v"; commit(LA.finish(geo(LA.roomSize(p, S.sel.ri, b.dataset.dir, (V ? r[2] - r[0] : r[3] - r[1]) + +b.dataset.d * SNAP)))); }
          else if (act === "split" && S.sel) commit(LA.splitRoom(geo(p), S.sel.ri, b.dataset.dir, S.nt, S.nd), { k: "room", ri: S.sel.ri });
          else if (act === "merge" && S.sel) { const i = S.sel.ri, j = +b.dataset.rj; commit(LA.mergeRooms(geo(p), i, j), { k: "room", ri: i < j ? i : i - 1 }); }
          else if (act === "scope") { S.scope = b.dataset.t; paint(); }
          else if (act === "wtype") { const pc = selPiece(p); if (pc) { commit(LA.setPieces(geo(p), scopeList(p, pc), b.dataset.t)); } }
          else if (act === "door") { const pc = selPiece(p); if (pc) commit(LA.doorIn(geo(p), pc, S.sel.at)); }
        });
      });
      K.addEventListener("change", (ev) => {
        const t = ev.target, p = S.pl;
        tryDo(() => {
          if (X.onChange.some((f) => f(t, p))) return;
          if (t.matches(".kq-name") && S.sel) commit(LA.setRoom(p, S.sel.ri, t.value));
          else if (t.matches(".kq-nt")) S.nt = t.value;
          else if (t.matches(".kq-nd")) S.nd = t.checked;
          else if (t.matches(".kq-sz") && S.sel) { const v = num(t.value); if (v !== null) commit(LA.finish(geo(LA.roomSize(p, S.sel.ri, t.dataset.dir, v)))); }
          else if (t.matches(".kq-W")) { const v = num(t.value), H = p.W * p.H / v; if (v === null || v < 2 || v > 30 || H < 2 || H > 30) throw new Error("ширина и длина квартиры — от 2 до 30 м"); commit(LA.stretch(p, v)); }
          else if (t.matches(".kq-dside, .kq-doff")) commit(LA.setDoor(p, $k(".kq-dside").value, num($k(".kq-doff").value) || 0));
        });
      });
      K.addEventListener("input", (ev) => {
        const t = ev.target;
        if (X.onInput.some((f) => f(t))) return;
        if (!ev.target.matches(".kq-nw")) return;
        const A = areaNow() || typ(curCls()).area, w = num(ev.target.value), h = $k(".kq-nh"); if (h) h.textContent = w ? fm(A / w) : "—";
      });
      K.addEventListener("keydown", (ev) => {
        const tag = ev.target.tagName;
        if (ev.key === "Escape") { ev.preventDefault(); if (S.drag) { S.drag = null; stage(); } else if (S.more) { S.more = false; paint(); } else if (S.draw || S.sel) { S.draw = false; S.sel = null; paint(); } else closeK(); return; }
        if ((ev.ctrlKey || ev.metaKey) && !/INPUT|SELECT|TEXTAREA/.test(tag)) {
          const k = ev.key.toLowerCase();
          if (k === "z" && !ev.shiftKey && S.hist.length) { ev.preventDefault(); S.fut.push(S.pl); S.pl = S.hist.pop(); S.sel = null; changed(); }
          else if ((k === "y" || (k === "z" && ev.shiftKey)) && S.fut.length) { ev.preventDefault(); S.hist.push(S.pl); S.pl = S.fut.pop(); S.sel = null; changed(); }
        }
        if (ev.key === "Tab") {   // фокус не уходит из окна
          const f = [...K.querySelectorAll("button:not([disabled]), input, select, [tabindex='0']")].filter((e) => e.offsetParent !== null);
          if (!f.length) return;
          if (ev.shiftKey && document.activeElement === f[0]) { ev.preventDefault(); f[f.length - 1].focus(); }
          else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) { ev.preventDefault(); f[0].focus(); }
        }
      });
      // план: касание, перетаскивание, масштаб
      const cvOf = (ev) => ev.target.closest && ev.target.closest(".kq-cv");
      const toP = (ev) => { const svg = $k(".kq-cv svg"), m = svg && svg.getScreenCTM(); if (!m) return null; const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const r = pt.matrixTransform(m.inverse()); return [r.x / 100, r.y / 100]; };
      const pxm = () => S.k * 100;   // пикселей на метр
      function handleAt(p, pt) {
        let best = null;
        for (const e of LA.roomEdges(p, S.sel.ri)) { const m = (e.lo + e.hi) / 2, c = e.o === "v" ? [e.c, m] : [m, e.c], d = Math.hypot(c[0] - pt[0], c[1] - pt[1]) * pxm(); if (d <= 24 && (!best || d < best.d)) best = { d, e }; }
        return best && best.e;
      }
      function pieceAt(p, pt) {
        let best = null; const tol = Math.max(0.06, 16 / pxm());
        for (const x of LA.pieces(p)) { const d = segDist(pt, mkW(x.o, x.c, x.a, x.b)) - (x.t ? 0.01 : 0); if (d <= tol && (!best || d < best.d)) best = { d, x }; }
        return best && best.x;
      }
      K.addEventListener("pointerdown", (ev) => {
        const v = X.views[S.view];
        if (!cvOf(ev) || ev.button > 0 || (!S.pl && !v)) return;
        const pt = toP(ev); if (!pt) return;
        S.ptr.set(ev.pointerId, [ev.clientX, ev.clientY]);
        try { ev.target.closest(".kq-cv").setPointerCapture(ev.pointerId); } catch (e) { /* нет захвата */ }
        ev.preventDefault();
        if (S.ptr.size === 2) { const [a, b] = [...S.ptr.values()]; S.drag = { kind: "pinch", d0: Math.hypot(a[0] - b[0], a[1] - b[1]), z0: S.z }; stage(true); return; }
        const own = v || X.tab[S.tab], dd = own && own.down ? own.down(pt, ev) : null;   // расширение: своё перетаскивание
        if (dd) { S.drag = { ...dd, id: ev.pointerId }; stage(true); return; }
        if (!v && S.tab === "rooms" && S.sel && S.sel.k === "room" && !S.draw) { const e = handleAt(S.pl, pt); if (e) { S.drag = { kind: "edge", id: ev.pointerId, e, v: e.c, pl: null }; stage(true); return; } }
        if (!v && S.tab === "rooms" && S.draw) { S.drag = { kind: "rect", id: ev.pointerId, p0: pt, p1: pt }; return; }
        S.drag = { kind: "tap", id: ev.pointerId, pt, x0: ev.clientX, y0: ev.clientY, cx: S.cx, cy: S.cy, moved: false };
      });
      K.addEventListener("pointermove", (ev) => {
        const d = S.drag; if (!d) return;
        if (S.ptr.has(ev.pointerId)) S.ptr.set(ev.pointerId, [ev.clientX, ev.clientY]);
        if (d.kind === "pinch") { if (S.ptr.size === 2) { const [a, b] = [...S.ptr.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); S.z = Math.min(8, Math.max(1, d.z0 * dd / Math.max(1, d.d0))); stage(true); } return; }
        if (d.id !== ev.pointerId) return;
        const pt = toP(ev); if (!pt) return;
        if (d.kind === "edge") { const e = d.e, raw = e.o === "v" ? pt[0] : pt[1], np = LA.moveEdge(S.pl, e, raw), [mn, mx] = LA.range(S.pl, e), v = r4(Math.min(mx, Math.max(mn, Math.round(raw / SNAP) * SNAP)));
          if (!eq(v, d.v)) { d.v = v; d.pl = eq(v, e.c) ? null : np; stage(true); } }
        else if (d.kind === "rect") { d.p1 = pt; stage(true); }
        else if (X.drags[d.kind]) X.drags[d.kind].move(d, pt);
        else if (d.kind === "tap") {
          const dx = ev.clientX - d.x0, dy = ev.clientY - d.y0;
          if (!d.moved && Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
          if (d.moved && S.z > 1.001) { S.cx = d.cx - dx / pxm(); S.cy = d.cy - dy / pxm(); stage(true); }
        }
      });
      const end = (ev, ok) => {
        S.ptr.delete(ev.pointerId);
        const d = S.drag; if (!d) return;
        if (d.kind === "pinch") { if (S.ptr.size < 2) { S.drag = null; stage(); } return; }
        if (d.id !== ev.pointerId) return;
        S.drag = null;
        tryDo(() => {
          if (!ok) { stage(); return; }
          if (X.drags[d.kind]) X.drags[d.kind].end(d);
          else if (X.views[S.view]) stage();
          else if (d.kind === "edge") { if (d.pl) commit(LA.finish(geo(d.pl))); else stage(); }
          else if (d.kind === "rect") {
            const r = LA.snapRect(S.pl, [d.p0[0], d.p0[1], d.p1[0], d.p1[1]]);
            if (r[2] - r[0] < 0.5 || r[3] - r[1] < 0.5) { S.knote = "Слишком маленький прямоугольник — проведите крупнее (от 0,5 × 0,5 м)."; paint(); return; }
            const np = LA.carve(geo(S.pl), r, "ж", S.nt, S.nd), ri = np.rooms.findIndex((x) => !S.pl.rooms.some((y) => y[0] === x[0]));
            S.draw = false; commit(np, ri >= 0 ? { k: "room", ri } : null);
            S.knote = "Новая комната готова — выберите её тип и название."; paint();
          } else if (d.kind === "tap" && !d.moved) {
            if (X.tab[S.tab]) { if (X.tab[S.tab].tap) X.tab[S.tab].tap(d.pt); }
            else if (S.tab === "walls") { const x = pieceAt(S.pl, d.pt); S.sel = x ? { k: "piece", o: x.o, c: x.c, at: Math.min(x.b, Math.max(x.a, x.o === "v" ? d.pt[1] : d.pt[0])) } : null; S.scope = "one"; }
            else { const ri = LA.roomAt(S.pl, d.pt); S.sel = ri >= 0 ? { k: "room", ri } : null; }
            S.knote = ""; paint();
          } else stage();
        });
      };
      K.addEventListener("pointerup", (ev) => end(ev, true));
      K.addEventListener("pointercancel", (ev) => end(ev, false));
      K.addEventListener("wheel", (ev) => { if (!cvOf(ev)) return; ev.preventDefault(); zoomBy(ev.deltaY < 0 ? 1.2 : 1 / 1.2, toP(ev)); }, { passive: false });
    }
    function zoomBy(f, at) {
      const p = X.views[S.view] ? X.views[S.view].box() : S.pl; if (!p) return;
      const [x0, y0, w, h] = vb(p), z2 = Math.min(8, Math.max(1, S.z * f)), c = at || [x0 + w / 2, y0 + h / 2], k = S.z / z2;
      S.cx = c[0] - (c[0] - (x0 + w / 2)) * k; S.cy = c[1] - (c[1] - (y0 + h / 2)) * k; S.z = z2; stage();
    }
    function uniqName(p, ri, t) { const base = RSHORT[t] || "Помещение"; if (!p.rooms.some((r, i) => i !== ri && r[0] === base)) return base; let i = 2; while (p.rooms.some((r, j) => j !== ri && r[0] === `${base} ${i}`)) i++; return `${base} ${i}`; }
    let rz = 0; root.addEventListener("resize", () => { if (K && S.view !== "start") { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => stage()); } });

    // ------------------------------------------------------------ события блока в форме
    host.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-act]"); if (!b || b.disabled) return;
      const act = b.dataset.act;
      tryDo(() => {
        if (act === "open") openK();
        else if (act === "reset") { drop("Своя планировка сброшена к типовому плану."); changed(); }
        else if (act === "restore" && S.undo) { const u = S.undo; S.undo = null; adopt(u.pl, ""); changed(); }
        else if (act === "save") saveFile();
        else if (act === "load") $h(".nc-lay-file").click();
        else if (act === "run") { if (opts.run) opts.run(); }
      });
    });
    host.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!t.matches(".nc-lay-file") || !t.files || !t.files[0]) return;
      const f = t.files[0]; t.value = "";
      f.text().then((txt) => { tryDo(() => { const o = JSON.parse(txt), p = o.plan || (o.input && o.input.plan) || (o.rooms ? o : null);
        if (!p) throw new Error("в файле нет планировки"); if (custom()) drop("Своя планировка заменена планировкой из файла.");
        adopt(p, `Загружена планировка из файла «${f.name}».`); if (S.open) { S.view = "edit"; S.tab = "rooms"; S.z = 1; } changed(); }); });
    });
    fe.addEventListener("change", (ev) => {   // поля A1–A4, B1 формы
      const n = ev.target.name;
      if (n === "cls") { if (custom() && F("cls").value !== S.pl.cls) drop(`Своя планировка заменена: выбран ${F("cls").value ? "типовой план " + NE.PLAN_OF[F("cls").value] : "автовыбор плана"}.`); if (S.pl && !custom()) S.pl = null; render(); }
      else if (n === "area") {
        if (custom()) {
          const A = areaNow();
          if (A === null) { F("area").value = String(r2(S.pl.W * S.pl.H)); S.note = "Площадь своей планировки фиксирована — чтобы пересчитать план, укажите новое число 15–300 м²."; render(); }
          else if (Math.abs(A - S.pl.W * S.pl.H) > 0.005) { commit(LA.rescale(S.pl, A)); S.note = `Своя планировка пересчитана под площадь ${fm(A, 1)} м²: пропорции помещений сохранены.`; render(); }
        } else { S.pl = null; render(); }
      } else if (n === "rooms") { if (!custom()) S.pl = null; render(); }
      else if (n === "constr" || n === "L_W1") render();
    });
    try {   // своя планировка из прошлого сеанса (localStorage)
      const o = JSON.parse(localStorage.getItem(KEY) || "null");
      if (o && o.plan) adopt(o.plan, "Восстановлена своя планировка, сохранённая в этом браузере.");
      if (!custom()) { S.pl = null; S.note = ""; }
    } catch (e) { S.pl = null; S.note = ""; }
    S.hist = []; S.fut = []; S.knote = "";
    for (const e of LA.ext || []) e(X);
    render();
    return {
      value: () => (custom() ? bare(S.pl) : null),
      errors: () => (custom() ? LA.check(S.pl).err : []),
      ran: () => { if (S.changed) { S.changed = false; render(); } },
      state: () => S,
      open: (v) => openK(v), close: () => closeK(),
    };
  }
  LA.mount = mount;
})(typeof window !== "undefined" ? window : globalThis);
