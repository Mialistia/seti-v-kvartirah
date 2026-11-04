// Блок «Планировка» в форме калькулятора (A2–A4): карточки типовых планов К1–К5 и «С нуля», редактор своей планировки
// (SVG, Pointer Events: мышь, перо, касание; кнопки и стрелки клавиатуры), отмена и повтор, сохранение в браузере и в файл JSON.
// Модель, проверка и рисунок плана — layout.js (подключается до этого файла); calc.js берёт своя планировку через mount(...).value().
(function (root) {
  "use strict";
  const LA = root.NetLayout;
  if (!LA) throw new Error("layout-ui.js: сначала подключите layout.js");
  if (typeof document === "undefined") return;
  const NE = root.NetEngine, { EPS, eq, r4, clone, esc, fm, q, wname, area, big, mkW, onLine, segDist } = LA._;
  const { fromTemplate, blank, rescale, same, wseg, openB, extentAt, range, moveLine, normalize, splitRoom, neighbors, mergeRooms, setRoom, setWall, addWall,
    insertDoor, roomAt, check, draw, finish, RT, WTYPES, SNAP, DOOR } = LA;
  const KEY = "netcalc.plan.v1", r2 = (v) => Math.round(v * 100) / 100;
  const num = (v) => (v === "" || v === null || v === undefined || !Number.isFinite(+v) ? null : +v);
  const B = (act, text, extra = "") => `<button type="button" class="nc-lay-b" data-act="${act}"${extra}>${text}</button>`;
  function mount(host, opts) {
    const PLD = opts.plans, fe = opts.form, eng = opts.eng, F = (n) => fe.elements[n];
    LA.init(PLD);
    const S = { pl: null, base: null, open: false, sel: null, part: false, hist: [], fut: [], note: "", undo: null, drag: null, newOpen: false, nt: "W2", nd: true, changed: false };
    const custom = () => !!S.pl && (!S.base || !same(S.pl, S.base));
    const areaNow = () => { const v = num(F("area").value); return v !== null && v >= 15 && v <= 300 ? v : null; };
    const curCls = () => F("cls").value || eng.classify(F("rooms").value, areaNow())[0];
    const typ = (c) => PLD.plans[NE.PLAN_OF[c]];
    host.innerHTML = `<p class="nc-sub"><b>Планировка</b>${q("layout")} — типовая квартира своего класса или своя планировка; общая площадь — как в A2.</p>` +
      `<div class="nc-lay-cards" role="group" aria-label="Выбор планировки"></div><div class="nc-lay-st"></div><div class="nc-lay-new" hidden></div>` +
      `<div class="nc-lay-ed" hidden><div class="nc-lay-bar"></div><p class="nc-note nc-lay-help">Нажмите на помещение или стену. Стену можно перетащить мышью или пальцем ` +
      `(на телефоне — сначала коснитесь стены, затем тяните) или сдвинуть кнопками и стрелками клавиатуры. Шаг — 5 см. Ц — корневой узел в центре, С1, С2 — спутники, ` +
      `□ — ввод кабеля: типовые места (И4) или по правилам размещения.</p><div class="nc-lay-box" tabindex="0" aria-label="План квартиры: выберите помещение или стену"></div>` +
      `<div class="nc-lay-panel"></div><div class="nc-lay-msg" role="status" aria-live="polite"></div></div><input type="file" class="nc-lay-file" accept=".json,application/json" hidden>`;
    const $ = (s) => host.querySelector(s), box = $(".nc-lay-box");
    function wt5() {   // потери стен на 5 ГГц для подписей (И2, табл. 4; тип дома A1 и замер B1 — как в engine.js)
      const W = {}; for (const [k, v] of Object.entries(PLD.WT)) W[k] = v[1];
      if (F("constr").value === "К") { W.W1 = PLD.WT.W1k[1]; W.W7b = W.W1 + 3; }
      const b = num(F("L_W1").value); if (b !== null && b >= 1 && b <= 40) { W.W1 = b; W.W7b = b + 3; }
      W.O = 0; return W;
    }
    const wopts = (sel, none) => { const L = wt5(); return (none ? `<option value=""${sel === "" ? " selected" : ""}>без стены — граница зон</option>` : "") +
      WTYPES.map((t) => `<option value="${t}"${t === sel ? " selected" : ""}>${esc(wname(t))} — ${fm(L[t], 0)} дБ</option>`).join(""); };
    function cards() {
      const own = custom(), cur = own ? S.pl.cls : curCls(), scratch = own && !S.pl.base, auto = !F("cls").value && !own;
      return Object.keys(NE.PLAN_OF).map((c) => {
        const p = typ(c), on = c === cur && !scratch && !S.newOpen;
        return `<button type="button" class="nc-lay-card" data-cls="${c}" aria-pressed="${on}">${draw(p, { mini: true })}<span><b>${c}</b> · ${fm(p.area, 1)} м²` +
          `${on && auto ? ' <small class="nc-lay-auto">авто</small>' : on && own ? ' <small class="nc-lay-auto">изменён</small>' : ""}<br><small>${esc(p.title)}</small></span></button>`;
      }).join("") + `<button type="button" class="nc-lay-card" data-cls="new" aria-pressed="${scratch || S.newOpen}"><svg class="nc-lay-mini" viewBox="0 0 100 80" aria-hidden="true" focusable="false">` +
        `<rect x="8" y="8" width="84" height="64" fill="#fafafa" stroke="#37474f" stroke-width="3" stroke-dasharray="7 5"/><path d="M50 24v32M34 40h32" stroke="#37474f" stroke-width="6"/></svg>` +
        `<span><b>С нуля</b><br><small>свой контур, помещения и стены</small></span></button>`;
    }
    function status() {
      const h = [], own = custom();
      if (own) {
        const p = S.pl;
        h.push(`<p><b>Своя планировка</b> — ${p.base ? `изменён типовой план ${esc(p.base)}` : "создана с нуля"}: ${fm(p.W)} × ${fm(p.H)} м, ${fm(p.W * p.H, 1)} м², ` +
          `помещений — ${p.rooms.length}, стен — ${p.walls.length}. Расчёт ведётся по ней, код квартиры — со «*».</p>`);
      } else {
        const c = curCls(), p = typ(c), A = areaNow();
        h.push(`<p>Типовой план <b>${esc(NE.PLAN_OF[c])}</b> — ${esc(p.title)}${A ? `, под площадь ${fm(A, 1)} м² (масштаб k = ${fm(Math.sqrt(A / p.area), 3)})` : `, ${fm(p.area, 1)} м²`}.</p>`);
      }
      h.push(`<p class="nc-lay-acts">${B("edit", S.open ? "Свернуть редактор" : "Изменить планировку", ` aria-expanded="${S.open}"`)}` +
        (own ? B("reset", "Сбросить к типовому") + B("save", "Сохранить в файл") : "") + B("load", "Загрузить из файла") + `</p>`);
      if (S.undo) h.push(`<p class="nc-lay-warn">${esc(S.undo.why)} ${B("restore", "Вернуть")}</p>`);
      if (S.note) h.push(`<p class="nc-note">${esc(S.note)}</p>`);
      if (S.changed && opts.hasResult && opts.hasResult()) h.push(`<p class="nc-lay-stale" role="status">Планировка изменена — результат ниже устарел. ${B("run", "Пересчитать")}</p>`);
      return h.join("");
    }
    function newForm() {
      const A = areaNow() || typ(curCls()).area, w = r2(Math.round(Math.sqrt(A * 1.25) / SNAP) * SNAP);
      return `<p><b>Планировка с нуля</b> — прямоугольный контур площадью ${fm(A, 1)} м² (A2): задайте ширину, длина посчитается. Потом делите помещения стенами и задавайте типы.</p>` +
        `<div class="nc-lay-f"><label>Ширина, м <input type="number" class="nc-lay-w" min="2" max="30" step="0.05" value="${w}"></label> <span>длина — <b class="nc-lay-hh">${fm(A / w)}</b> м</span></div>` +
        `<div class="nc-lay-f"><label>Входная дверь <select class="nc-lay-side">${[["низ", "снизу"], ["верх", "сверху"], ["лево", "слева"], ["право", "справа"]].map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>` +
        ` <label>отступ от угла, м <input type="number" class="nc-lay-off" min="0" step="0.05" value="0.4"></label></div>` +
        `<p class="nc-lay-acts">${B("create", "Создать", ' data-main="1"')}${B("cancelnew", "Отмена")}</p><p class="nc-err nc-lay-nerr"></p>`;
    }
    function selInfo(p, sel) {
      if (!sel) return null;
      if (sel.k === "room") return sel.ri < p.rooms.length ? { ri: sel.ri } : null;
      let wi = -1;
      p.walls.forEach((w, i) => { const s = wseg(w); if (wi < 0 && onLine(s, sel.o, sel.c) && sel.at >= s.a - EPS && sel.at <= s.b + EPS) wi = i; });
      const ob = wi < 0 ? openB(p).find((s) => onLine(s, sel.o, sel.c) && sel.at >= s.a - EPS && sel.at <= s.b + EPS) : null;
      const ext = extentAt(p, sel.o, sel.c, sel.at, S.part);
      if (!ext || (wi < 0 && !ob)) return null;
      return { wi, ob, ext, seg: wi >= 0 ? p.walls[wi] : mkW(ob.o, ob.c, ob.a, ob.b) };
    }
    function panel(p, I) {
      if (!I) return `<p class="nc-note">Ничего не выбрано. Помещение: название, тип, деление стеной, объединение. Стена: тип, сдвиг, дверь, удаление. Пунктир — граница помещений без стены.</p>`;
      if (I.ri !== undefined) {
        const [n, t, rs] = p.rooms[I.ri], a = rs.reduce((s, r) => s + area(r), 0), r = big(rs), nb = neighbors(p, I.ri);
        return `<p><b>${esc(n)}</b> — ${fm(a, 1)} м²${rs.length === 1 ? `, ${fm(r[2] - r[0])} × ${fm(r[3] - r[1])} м` : ""}</p>` +
          `<div class="nc-lay-f"><label>Название <input type="text" class="nc-lay-name" maxlength="40" value="${esc(n)}"></label>` +
          `<label>Тип <select class="nc-lay-type">${RT.map(([k, v]) => `<option value="${k}"${k === t ? " selected" : ""}>${v}</option>`).join("")}</select></label></div>` +
          `<p class="nc-lay-acts"><span>Разделить:</span>${B("split", "│ вертикальной стеной", ' data-dir="v"')}${B("split", "─ горизонтальной стеной", ' data-dir="h"')}</p>` +
          `<div class="nc-lay-f"><label>Новая стена <select class="nc-lay-nt">${wopts(S.nt, true)}</select></label><label class="nc-chk"><input type="checkbox" class="nc-lay-nd"${S.nd ? " checked" : ""}> с дверью ${fm(DOOR, 1)} м</label></div>` +
          (nb.length ? `<p class="nc-lay-acts"><span>Объединить с:</span> <select class="nc-lay-mg">${nb.map((j) => `<option value="${j}">${esc(p.rooms[j][0])}</option>`).join("")}</select>${B("merge", "Объединить")}</p>` : "");
      }
      const e = I.ext, V = e.o === "v", [mn, mx] = range(p, e), s = wseg(I.seg), len = s.b - s.a, w = I.wi >= 0 ? p.walls[I.wi] : null;
      return `<p><b>${w ? `Стена: ${esc(wname(w[4]))}` : "Граница помещений без стены"}</b> — участок ${fm(len)} м; линия ${V ? "x" : "y"} = ${fm(e.c)} м от ${V ? "левого" : "верхнего"} края</p>` +
        (w ? `<div class="nc-lay-f"><label>Тип участка <select class="nc-lay-wt">${wopts(w[4], false)}</select></label></div>`
          : `<div class="nc-lay-f"><label>Поставить стену <select class="nc-lay-nt">${wopts(S.nt && S.nt !== "" ? S.nt : "W2", false)}</select></label>${B("addwall", "Поставить")}</div>`) +
        `<p class="nc-lay-acts"><span>Сдвинуть линию:</span>${B("nudge", V ? "← 5 см" : "↑ 5 см", ' data-d="-1"')}<input type="number" class="nc-lay-at" step="0.05" min="${r2(mn)}" max="${r2(mx)}" value="${r2(e.c)}" aria-label="Положение линии, м">` +
        `${B("nudge", V ? "5 см →" : "5 см ↓", ' data-d="1"')}<small>от ${fm(mn)} до ${fm(mx)} м</small></p>` +
        `<label class="nc-chk"><input type="checkbox" class="nc-lay-part"${S.part ? " checked" : ""}> двигать только участок между соседними стенами</label>` +
        (w ? `<p class="nc-lay-acts">${w[4] !== "W4" && len >= DOOR + 0.1 ? B("door", `Вставить дверь ${fm(DOOR, 1)} м`) : ""}${B("delwall", "Удалить участок стены")}</p>` : "");
    }
    function msgs(p) {
      const c = check(p);
      return (c.err.length ? `<p class="nc-err">Исправьте планировку: ${c.err.map(esc).join("; ")}.</p>` : "") +
        (c.warn.length ? `<p class="nc-lay-warn">${c.warn.map(esc).join("; ")}.</p>` : "") +
        (custom() ? "" : `<p class="nc-note">Пока планировка не изменена, расчёт идёт по типовому плану.</p>`);
    }
    const bar = () => `<p class="nc-lay-acts">${B("undo", "Отменить", S.hist.length ? "" : " disabled")}${B("redo", "Повторить", S.fut.length ? "" : " disabled")}` +
      `${B("auto", "Расставить узлы по правилам")}${B("done", "Готово")}</p>`;
    function renderEd(light) {
      const dr = S.drag && S.drag.pl, p = dr ? S.drag.pl : S.pl, sel = dr ? { ...S.sel, c: S.drag.c2 } : S.sel, I = selInfo(p, sel);
      if (!I && !dr) S.sel = null;
      box.innerHTML = draw(p, I ? { room: I.ri, ext: I.ext, seg: I.seg } : {});
      box.classList.toggle("nc-lay-drag", !!(I && I.ext));
      if (light) { const i = $(".nc-lay-at"); if (i && I && I.ext) i.value = r2(I.ext.c); return; }
      $(".nc-lay-bar").innerHTML = bar(); $(".nc-lay-panel").innerHTML = panel(p, I); $(".nc-lay-msg").innerHTML = msgs(p);
    }
    function render() {
      $(".nc-lay-cards").innerHTML = cards(); $(".nc-lay-st").innerHTML = status();
      const nw = $(".nc-lay-new"); if (S.newOpen && nw.hidden) nw.innerHTML = newForm(); nw.hidden = !S.newOpen;
      const ed = $(".nc-lay-ed"); ed.hidden = !(S.open && S.pl);
      if (!ed.hidden) renderEd();
    }
    function save() { try { if (custom()) localStorage.setItem(KEY, JSON.stringify({ v: 1, saved: new Date().toISOString(), plan: S.pl })); else localStorage.removeItem(KEY); } catch (e) { /* хранилище недоступно */ } }
    function changed() { S.changed = true; save(); render(); if (opts.onChange) opts.onChange(); }
    function commit(np, sel) {
      S.hist.push(S.pl); if (S.hist.length > 60) S.hist.shift(); S.fut = [];
      S.pl = np; if (sel !== undefined) S.sel = sel;
      if (custom()) { F("cls").value = S.pl.cls; if (!areaNow()) F("area").value = String(r2(S.pl.W * S.pl.H)); }
      S.note = ""; S.undo = null; changed();
    }
    const tryDo = (fn) => { try { fn(); } catch (e) { S.note = e.message; render(); } };
    function template(c, A) { S.pl = fromTemplate(PLD, c, A); S.base = clone(S.pl); S.hist = []; S.fut = []; S.sel = null; }
    function adopt(pl, why) {   // своя планировка из хранилища или файла
      const p = normalize(clone(pl)), c = check(p);
      if (c.err.length) throw new Error("планировка не прошла проверку: " + c.err.join("; "));
      if (!NE.PLAN_OF[p.cls]) p.cls = curCls();
      S.hist.push(S.pl); S.fut = []; S.pl = p; S.base = p.base && PLD.plans[p.base] ? fromTemplate(PLD, p.cls, p.W * p.H) : null; S.sel = null;
      F("cls").value = p.cls; F("area").value = String(r2(p.W * p.H)); S.note = why; S.undo = null;
    }
    function drop(why) {   // своя планировка заменена типовой: можно вернуть
      if (!custom()) return;
      S.undo = { pl: S.pl, why }; S.pl = null; S.base = null; S.hist = []; S.fut = []; S.sel = null; S.note = "";
    }
    function nudge(n) {
      const I = selInfo(S.pl, S.sel); if (!I || !I.ext) return;
      const [mn, mx] = range(S.pl, I.ext), c2 = r4(Math.min(mx, Math.max(mn, Math.round((I.ext.c + n * SNAP) / SNAP) * SNAP)));
      if (!eq(c2, I.ext.c)) commit(finish(moveLine(S.pl, I.ext, c2)), { ...S.sel, c: c2 });
    }
    const download = (obj, name) => { const u = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" })), a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); };
    host.addEventListener("click", (ev) => {
      const cd = ev.target.closest(".nc-lay-card");
      if (cd) {
        const c = cd.dataset.cls;
        if (c === "new") { S.newOpen = !S.newOpen || custom(); S.open = false; render(); const w = $(".nc-lay-w"); if (w && S.newOpen) w.focus({ preventScroll: true }); return; }
        if (custom()) drop(`Своя планировка заменена типовым планом ${NE.PLAN_OF[c]}.`);
        S.newOpen = false; F("cls").value = c;
        if (S.open) template(c, areaNow()); else S.pl = null;
        changed(); return;
      }
      const b = ev.target.closest("[data-act]"); if (!b || b.disabled) return;
      const act = b.dataset.act, I = S.pl ? selInfo(S.pl, S.sel) : null;
      tryDo(() => {
        if (act === "edit") { if (S.open) { S.open = false; S.sel = null; } else { if (!S.pl) template(curCls(), areaNow()); S.open = true; S.newOpen = false; } render(); }
        else if (act === "done") { S.open = false; S.sel = null; render(); }
        else if (act === "reset") { drop("Своя планировка сброшена к типовому плану."); if (S.open) template(curCls(), areaNow()); changed(); }
        else if (act === "restore" && S.undo) { const u = S.undo; S.undo = null; adopt(u.pl, ""); S.open = true; changed(); }
        else if (act === "save" && custom()) download({ netcalc_plan: 1, saved: new Date().toISOString(), plan: S.pl }, `planirovka_${S.pl.base || "svoya"}.json`);
        else if (act === "load") $(".nc-lay-file").click();
        else if (act === "run") { if (opts.run) opts.run(); }
        else if (act === "undo" && S.hist.length) { S.fut.push(S.pl); S.pl = S.hist.pop(); S.sel = null; changed(); }
        else if (act === "redo" && S.fut.length) { S.hist.push(S.pl); S.pl = S.fut.pop(); S.sel = null; changed(); }
        else if (act === "auto") { const p = clone(S.pl); p.auto = true; commit(finish(p)); }
        else if (act === "split" && I && I.ri !== undefined) commit(splitRoom(S.pl, I.ri, b.dataset.dir, S.nt, S.nd), { k: "room", ri: I.ri + 1 });
        else if (act === "merge" && I && I.ri !== undefined) { const j = +$(".nc-lay-mg").value; commit(mergeRooms(S.pl, I.ri, j), { k: "room", ri: I.ri < j ? I.ri : I.ri - 1 }); }
        else if (act === "nudge") nudge(+b.dataset.d);
        else if (act === "addwall" && I && I.ob) commit(addWall(S.pl, I.ob, $(".nc-lay-nt").value || "W2"));
        else if (act === "door" && I && I.wi >= 0) commit(insertDoor(S.pl, I.wi, S.sel.at));
        else if (act === "delwall" && I && I.wi >= 0) commit(setWall(S.pl, I.wi, ""));
        else if (act === "cancelnew") { S.newOpen = false; render(); }
        else if (act === "create") {
          const A = areaNow() || typ(curCls()).area, w = num($(".nc-lay-w").value), er = $(".nc-lay-nerr");
          if (w === null || w < 2 || w > 30 || A / w < 2 || A / w > 30) { er.textContent = `ширина и длина — от 2 до 30 м (площадь ${fm(A, 1)} м²)`; return; }
          const c = curCls(); drop("Своя планировка заменена новой.");
          S.hist = []; S.fut = []; S.pl = blank(PLD, c, A, w, $(".nc-lay-side").value, num($(".nc-lay-off").value) || 0); S.base = null;
          S.newOpen = false; S.open = true; S.sel = { k: "room", ri: 0 }; F("cls").value = c; if (!areaNow()) F("area").value = String(r2(A)); S.note = ""; changed();
        }
      });
    });
    host.addEventListener("change", (ev) => {
      const t = ev.target, I = S.pl ? selInfo(S.pl, S.sel) : null;
      tryDo(() => {
        if (t.matches(".nc-lay-name") && I && I.ri !== undefined) commit(setRoom(S.pl, I.ri, t.value));
        else if (t.matches(".nc-lay-type") && I && I.ri !== undefined) commit(setRoom(S.pl, I.ri, undefined, t.value));
        else if (t.matches(".nc-lay-nt")) S.nt = t.value;
        else if (t.matches(".nc-lay-nd")) S.nd = t.checked;
        else if (t.matches(".nc-lay-wt") && I && I.wi >= 0) commit(setWall(S.pl, I.wi, t.value));
        else if (t.matches(".nc-lay-part")) { S.part = t.checked; renderEd(); }
        else if (t.matches(".nc-lay-at") && I && I.ext) { const v = num(t.value); if (v !== null) nudge((v - I.ext.c) / SNAP); }
        else if (t.matches(".nc-lay-file") && t.files && t.files[0]) {
          const f = t.files[0]; t.value = "";
          f.text().then((txt) => { tryDo(() => { const o = JSON.parse(txt), p = o.plan || (o.input && o.input.plan) || (o.rooms ? o : null);
            if (!p) throw new Error("в файле нет планировки"); adopt(p, `Загружена планировка из файла «${f.name}».`); S.open = true; changed(); }); });
        }
      });
    });
    host.addEventListener("input", (ev) => {
      if (!ev.target.matches(".nc-lay-w")) return;
      const A = areaNow() || typ(curCls()).area, w = num(ev.target.value), h = $(".nc-lay-hh"); if (h) h.textContent = w ? fm(A / w) : "—";
    });
    fe.addEventListener("change", (ev) => {   // поля A1–A4, B1 формы
      const n = ev.target.name;
      if (n === "cls") { if (custom() && F("cls").value !== S.pl.cls) drop(`Своя планировка заменена: выбран ${F("cls").value ? "типовой план " + NE.PLAN_OF[F("cls").value] : "автовыбор плана"}.`); if (S.pl && !custom()) S.pl = null; if (S.open && !S.pl) template(curCls(), areaNow()); render(); }
      else if (n === "area") {
        if (custom()) {
          const A = areaNow();
          if (A === null) { F("area").value = String(r2(S.pl.W * S.pl.H)); S.note = "Площадь своей планировки фиксирована — чтобы пересчитать план, укажите новое число 15–300 м²."; render(); }
          else if (Math.abs(A - S.pl.W * S.pl.H) > 0.005) { commit(rescale(S.pl, A)); S.note = `Своя планировка пересчитана под площадь ${fm(A, 1)} м²: пропорции помещений сохранены.`; render(); }
        } else { if (S.pl) template(curCls(), areaNow()); render(); }
      } else if (n === "rooms") { if (!custom() && S.pl && S.pl.cls !== curCls()) template(curCls(), areaNow()); render(); }
      else if (n === "constr" || n === "L_W1") { if (S.open) renderEd(); }
    });
    // перетаскивание стен (Pointer Events): мышь, перо, касание; шаг SNAP
    const toP = (ev) => {
      const svg = box.querySelector("svg"), m = svg && svg.getScreenCTM(); if (!m) return null;
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const r = pt.matrixTransform(m.inverse()); return { p: [r.x / 100, r.y / 100], px: m.a * 100 };
    };
    function hit(p, px) {
      const tol = Math.max(0.08, 14 / px);
      let best = null;
      const see = (s, wi) => { const d = segDist(p, mkW(s.o, s.c, s.a, s.b)) - (wi >= 0 ? 0.02 : 0), along = s.o === "v" ? p[1] : p[0];
        if (d <= tol && (!best || d < best.d)) best = { d, o: s.o, c: s.c, at: Math.min(s.b - 1e-4, Math.max(s.a + 1e-4, along)) }; };
      S.pl.walls.forEach((w, i) => { const s = wseg(w); if (s) see(s, i); });
      openB(S.pl).forEach((s) => see(s, -1));
      return best;
    }
    box.addEventListener("pointerdown", (ev) => {
      if (ev.button > 0 || !S.pl) return;
      const t = toP(ev); if (!t) return;
      const h = hit(t.p, t.px);
      if (h) {
        S.sel = { k: "line", o: h.o, c: h.c, at: h.at };
        const ext = extentAt(S.pl, h.o, h.c, h.at, S.part);
        if (ext) { S.drag = { id: ev.pointerId, ext, rng: range(S.pl, ext), c2: h.c, pl: null, x0: ev.clientX, y0: ev.clientY }; try { box.setPointerCapture(ev.pointerId); } catch (e) { /* нет захвата */ } }
        if (ev.pointerType === "mouse") ev.preventDefault();
      } else { const ri = roomAt(S.pl, t.p); S.sel = ri >= 0 ? { k: "room", ri } : null; }
      renderEd();
    });
    box.addEventListener("pointermove", (ev) => {
      const t = toP(ev); if (!t || !S.pl) return;
      const d = S.drag;
      if (!d || d.id !== ev.pointerId) { if (ev.pointerType === "mouse") { const h = hit(t.p, t.px); box.style.cursor = h ? (h.o === "v" ? "ew-resize" : "ns-resize") : "pointer"; } return; }
      if (!d.pl && Math.abs(ev.clientX - d.x0) + Math.abs(ev.clientY - d.y0) < 4) return;
      const v = d.ext.o === "v" ? t.p[0] : t.p[1], c2 = r4(Math.min(d.rng[1], Math.max(d.rng[0], Math.round(v / SNAP) * SNAP)));
      if (eq(c2, d.c2)) return;
      d.c2 = c2; d.pl = eq(c2, d.ext.c) ? null : moveLine(S.pl, d.ext, c2);
      renderEd(true);
    });
    const end = (ev, ok) => {
      const d = S.drag; if (!d || d.id !== ev.pointerId) return;
      S.drag = null;
      if (ok && d.pl) commit(finish(d.pl), { ...S.sel, c: d.c2 }); else renderEd();
    };
    box.addEventListener("pointerup", (ev) => end(ev, true));
    box.addEventListener("pointercancel", (ev) => end(ev, false));
    box.addEventListener("keydown", (ev) => {
      if (S.sel && S.sel.k === "line" && /^Arrow/.test(ev.key)) {
        const V = S.sel.o === "v", k = ev.key;
        if (V ? k === "ArrowLeft" || k === "ArrowRight" : k === "ArrowUp" || k === "ArrowDown") { ev.preventDefault(); nudge((k === "ArrowRight" || k === "ArrowDown" ? 1 : -1) * (ev.shiftKey ? 5 : 1)); }
      } else if (ev.key === "Escape" && S.sel) { S.sel = null; renderEd(); }
    });
    try {   // своя планировка из прошлого сеанса (localStorage)
      const o = JSON.parse(localStorage.getItem(KEY) || "null");
      if (o && o.plan) adopt(o.plan, "Восстановлена своя планировка, сохранённая в этом браузере.");
      if (!custom()) { S.pl = null; S.note = ""; }
    } catch (e) { S.pl = null; S.note = ""; }
    S.hist = []; S.fut = [];
    render();
    return {
      value: () => (custom() ? clone(S.pl) : null),
      errors: () => (custom() ? check(S.pl).err : []),
      ran: () => { if (S.changed) { S.changed = false; render(); } },
      state: () => S,
    };
  }
  LA.mount = mount;
})(typeof window !== "undefined" ? window : globalThis);
