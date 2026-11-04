// Калькулятор подбора — интерфейс страницы docs/calculator.md.
// Форма повторяет поля чек-листа обследования (коды A1–G3), расчёт — движок И4 (engine.js, шаги Ш2–Ш12).
// Данные: ../data/plans.json (типовые планы И2) и ../data/equipment.json (база Notion «Оборудование К Телеком»),
// пути считаются от адреса calc.js. Функции без DOM (toParams, render, planSvg) проверяются в tests/calc.test.mjs.
// Подсказки «?» к терминам — glossary.js (подключается до calc.js; без него калькулятор работает без подсказок).
(function (root) {
  "use strict";
  const NE = root.NetEngine;
  if (!NE) throw new Error("calc.js: сначала подключите engine.js");
  const GL = root.NetGlossary;
  const q = (id) => (GL ? GL.q(id) : "");   // маркер «?»: подсказка и ссылка на раздел «Термины и обозначения»
  const DEV_KEYS = ["tv", "console", "laptop", "phone", "pc", "iot"];   // «Планшет» заменён на «ПК» (И1, табл. 10)
  const DEV_FORM = { tv: 1, console: 1, laptop: 2, phone: 3, pc: 1, iot: 8 };   // семья из 3 человек (И1, табл. 11), планшет → ПК
  const BANDS = ["2,4", "5", "6"];
  // варианты К Телеком в таблице «Подобранное оборудование» (engine.js, R.kt): Эконом → Оптимальный → Премиум; fb — ближайший вариант парка
  const ROLE = { eco: "Эконом", opt: "Оптимальный", prem: "Премиум", fb: "Ближайший К Телеком" };
  const ROLE_Q = { eco: "eco", opt: "opt", prem: "prem", fb: "near" };
  const ROLE_HINT = { eco: "наименьшая стоимость владения TCO за 5 лет среди моделей К Телеком",
    opt: "наибольший балл S (AHP) среди моделей К Телеком — рекомендуем", prem: "наибольшие скорость TCP<sub>z</sub> и уровень P<sub>z</sub> в худшей зоне среди моделей К Телеком",
    fb: "в парке К Телеком нет модели, выполняющей все требования уровня, — ближайший вариант парка, условно" };
  const EX_BY = { eco: "дешевле по TCO", opt: "с наибольшим баллом S", prem: "с наибольшими TCP<sub>z</sub> и P<sub>z</sub>", fb: "с наибольшим баллом S" };
  const USER_TYPES = ["Роутер", "Mesh-система", "Интернет-центр", "Mesh-ретранслятор", "Точка доступа"];
  const MESH = ["EasyMesh", "Deco", "Halo", "AiMesh", "Netcraze Mesh", "SNR Mesh", "Huawei Mesh", "Xiaomi Mesh", "Tenda Mesh", "Netis Mesh", "CAPsMAN"];

  // ---------------------------------------------------------------- формат
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const f = (v, nd = 0) => (isNum(v) ? (nd ? NE.fmt(v, nd).replace(".", ",") : Math.round(NE.pyRound(v)).toLocaleString("ru-RU")) : "—");
  const rub = (v) => (isNum(v) ? f(v) + " ₽" : "—");
  const dmy = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join(".") : "—");
  const num = (v) => (v === "" || v === null || v === undefined || typeof v === "boolean" || !Number.isFinite(+v) ? null : +v);

  // ---------------------------------------------------------------- поля формы → параметры движка
  function defaults() {
    return { rooms: "2", area: "", cls: "", constr: "", L_W1: "", tariff: "500", entry_at: "прихожая", iptv: false, cable_ok: true, pl_mbps: "",
      air160: true, dev: { ...DEV_FORM }, need6: false, vpn: false, level: "2", budget: "", user: [] };
  }
  function userParams(u) {   // своё оборудование (G3): обязательные поля и то, что указано; остальное движок оценит по классу
    const e = { name: String(u.name ?? "").trim(), type: u.type, std: u.std, bands: (u.bands || []).slice(), wan: num(u.wan), lan: num(u.lan) };
    if (u.cls) e.cls = u.cls;
    for (const k of ["nss", "ch", "u", "price", "pw"]) { const v = num(u[k]); if (v !== null && v > 0) e[k] = v; }
    const eirp = {};
    for (const b of BANDS) { const v = num(u.eirp?.[b]); if (v !== null) eirp[b] = v; }
    if (Object.keys(eirp).length) e.eirp = eirp;
    if (u.mesh) e.mesh = u.mesh;
    for (const k of ["vpn", "iptv"]) if (num(u[k]) !== null) e[k] = num(u[k]);
    if (u.owned) e.owned = true;
    return e;
  }
  function toParams(fm) {   // возвращает { p — параметры calc, err — ошибки ввода }
    const err = [], p = { level: [1, 2, 3].includes(+fm.level) ? +fm.level : 2, entry_at: fm.entry_at === "центр" ? "центр" : "прихожая",
      cable_ok: !!fm.cable_ok, iptv: !!fm.iptv, vpn: !!fm.vpn, need6: !!fm.need6, air160: !!fm.air160, dev: {}, user: [] };
    const rng = (key, label, lo, hi, need = false) => {
      const raw = fm[key], v = num(raw);
      if (v === null) { if (need || (raw !== "" && raw !== null && raw !== undefined)) err.push(`${label}: укажите число`); return null; }
      if (v < lo || v > hi) { err.push(`${label}: допустимо ${lo}–${hi}`); return null; }
      return v;
    };
    p.tariff = rng("tariff", "C2 «Тариф, Мбит/с»", 10, 10000, true) ?? 500;
    const area = rng("area", "A2 «Общая площадь, м²»", 15, 300); if (area !== null) p.area = area;
    if (fm.cls) p.cls = fm.cls; else p.rooms = rng("rooms", "A3 «Число комнат»", 0, 5, true) ?? 2;
    if (fm.constr) p.constr = fm.constr;
    const lw = rng("L_W1", "B1 «Потери несущей стены, дБ»", 1, 40); if (lw !== null) p.L_W1 = lw;
    const pl = rng("pl_mbps", "D4 «Тест Powerline, Мбит/с»", 1, 2500); if (pl !== null) p.pl_mbps = pl;
    const b = rng("budget", "G2 «Бюджет, ₽»", 1, 10000000); if (b !== null) p.budget = b;
    for (const k of DEV_KEYS) {
      const v = num(fm.dev?.[k]);
      if (v === null || v < 0 || v > 200 || !Number.isInteger(v)) { if (v !== null || (fm.dev?.[k] ?? "") !== "") err.push(`F1 «${NE.DEV[k][0]}»: целое число 0–200`); p.dev[k] = 0; }
      else p.dev[k] = v;
    }
    if (!Object.values(p.dev).some((v) => v > 0)) err.push("F1: укажите хотя бы одно устройство");
    p.user = (fm.user || []).map(userParams);
    return { p, err };
  }

  // ---------------------------------------------------------------- план квартиры (SVG): помещения, стены, узлы, кабель, карта RSSI 5 ГГц
  const RSSI = [[-40, "#006837", "≥ −40"], [-50, "#1a9850", "−50…−40"], [-60, "#66bd63", "−60…−50"], [-67, "#a6d96a", "−67…−60"],
    [-72, "#fee08b", "−72…−67"], [-80, "#fc8d59", "−80…−72"], [-Infinity, "#d73027", "< −80"]];
  const rssiColor = (P) => RSSI.find(([t]) => P >= t)[1];
  const ROOM_FILL = { "ж": "#f5f5f5", "к": "#fff8e1", "с": "#e3f2fd", "п": "#eeeeee", "х": "#e0e0e0" };
  const WALL = { W1: [16, "#263238"], W2: [10, "#455a64"], W3: [6, "#78909c"], W4: [5, "#a1887f"], W6: [10, "#1565c0"], W7a: [10, "#455a64"], W7b: [16, "#263238"] };
  const c = (v) => Math.round(v * 100);   // метры → сантиметры: в SVG целые координаты и шрифт обычного размера
  function crossings(g, a, b) {   // сколько стен пересекает отрезок a–b (дверь — половина)
    let n = 0;
    for (const [x1, y1, x2, y2, t] of g.walls) {
      if (t === "O") continue;
      const d1 = (b[0] - a[0]) * (y1 - a[1]) - (b[1] - a[1]) * (x1 - a[0]), d2 = (b[0] - a[0]) * (y2 - a[1]) - (b[1] - a[1]) * (x2 - a[0]);
      const d3 = (x2 - x1) * (a[1] - y1) - (y2 - y1) * (a[0] - x1), d4 = (x2 - x1) * (b[1] - y1) - (y2 - y1) * (b[0] - x1);
      if (d1 * d2 < 0 && d3 * d4 < 0) n += t === "W4" ? 0.5 : 1;
    }
    return n;
  }
  function planSvg(R, o) {
    const g = R.geom, pad = 0.6, out = [];
    out.push(`<svg class="nc-plan" viewBox="${c(-pad)} ${c(-pad)} ${c(g.W + 2 * pad)} ${c(g.H + 2 * pad)}" xmlns="http://www.w3.org/2000/svg" role="img">`,
      `<title>${esc(g.title)}: ${o ? "уровень сигнала 5 ГГц для варианта «" + esc(o.name) + "»" : "типовой план"}</title>`,
      `<rect x="${c(-pad)}" y="${c(-pad)}" width="${c(g.W + 2 * pad)}" height="${c(g.H + 2 * pad)}" fill="#fff"/>`);
    for (const [, t, rs] of g.rooms) for (const [x0, y0, x1, y1] of rs)
      out.push(`<rect x="${c(x0)}" y="${c(y0)}" width="${c(x1) - c(x0)}" height="${c(y1) - c(y0)}" fill="${ROOM_FILL[t] || "#f5f5f5"}"/>`);
    if (o && R.map) {
      const st = c(R.map.step);
      out.push(`<g shape-rendering="crispEdges">`);
      for (const [x, y, P] of R.map.pts) out.push(`<rect x="${c(x) - st / 2}" y="${c(y) - st / 2}" width="${st}" height="${st}" fill="${rssiColor(P)}"/>`);
      out.push(`</g>`);
    }
    for (const [x1, y1, x2, y2, t] of g.walls) {
      if (t === "O") continue;
      const [w, col] = WALL[t] || [8, "#546e7a"];
      out.push(`<line x1="${c(x1)}" y1="${c(y1)}" x2="${c(x2)}" y2="${c(y2)}" stroke="${col}" stroke-width="${w}" stroke-linecap="square"/>`);
    }
    for (const [name, , rs] of g.rooms) {
      const [x0, y0, x1, y1] = rs.reduce((a, r) => ((r[2] - r[0]) * (r[3] - r[1]) > (a[2] - a[0]) * (a[3] - a[1]) ? r : a));
      out.push(`<text x="${c((x0 + x1) / 2)}" y="${c((y0 + y1) / 2)}" class="nc-room">${esc(name)}</text>`);
    }
    const e = g.pos.entry;
    out.push(`<rect x="${c(e[0]) - 17}" y="${c(e[1]) - 17}" width="34" height="34" fill="#fff" stroke="#e65100" stroke-width="6"/>`,
      `<text x="${c(e[0])}" y="${c(e[1]) + 48}" class="nc-lab">ввод</text>`);
    if (o) {
      o.aps.forEach((a, i) => {
        if (!o.cable[i]) return;
        const s = o.arch === "Б" ? e : o.aps[0], pl = o.arch === "В-PL", k1 = [a[0], s[1]], k2 = [s[0], a[1]];   // трасса из двух отрезков: меньше стен
        const k = crossings(g, s, k1) + crossings(g, k1, a) <= crossings(g, s, k2) + crossings(g, k2, a) ? k1 : k2;
        out.push(`<polyline points="${c(s[0])},${c(s[1])} ${c(k[0])},${c(k[1])} ${c(a[0])},${c(a[1])}" fill="none" stroke="${pl ? "#6a1b9a" : "#e65100"}" stroke-width="7" stroke-dasharray="${pl ? "5 12" : "25 12"}"/>`);
      });
      o.aps.forEach((a, i) => out.push(`<circle cx="${c(a[0])}" cy="${c(a[1])}" r="26" fill="${i ? "#00897b" : "#283593"}" stroke="#fff" stroke-width="6"/>`,
        `<text x="${c(a[0])}" y="${c(a[1])}" class="nc-ap">${i + 1}</text>`));
    }
    out.push("</svg>");
    return out.join("");
  }
  function legend(R, o) {
    const kpi = R.sh3.kpi;
    return (o ? `<p class="nc-legend"><b>Уровень сигнала 5 ГГц, дБм</b>${q("rssi")} (медиана): ${RSSI.map(([, col, t]) => `<span><i style="background:${col}"></i>${t}</span>`).join("")}<br>` +
      `<small>KPI уровня «${esc(kpi.name)}»${q("kpi")} — P<sub>z</sub>${q("pz")} ≥ ${f(kpi.Pz)} дБм в худшей зоне с запасом на замирания z·σ, поэтому медиана на карте должна быть выше порога.</small></p>` : "") +
      `<p class="nc-legend"><span><i class="nc-sq"></i>ввод кабеля</span><span><i class="nc-dot" style="background:#283593"></i>1 — корневой узел${q("node")}</span>` +
      `<span><i class="nc-dot" style="background:#00897b"></i>2, 3 — спутники</span><span><i class="nc-ln"></i>кабель (схема трассы)${q("cable")}</span>` +
      `<span>толщина линии — тип стены: несущая, перегородка, дверь${q("lw1")}</span></p>`;
  }

  // ---------------------------------------------------------------- результат
  const td = (v) => `<td>${v}</td>`;
  // строка таблицы: массив ячеек, { c: ячейки, a: атрибуты <tr> } или { raw: готовая строка <tr>…</tr> }
  const tr = (r) => (Array.isArray(r) ? `<tr>${r.map(td).join("")}</tr>` : r.raw ? r.raw : `<tr${r.a ? " " + r.a : ""}>${r.c.map(td).join("")}</tr>`);
  // attrs — атрибуты таблицы для tables.js: data-st-fix (закреплённые столбцы), data-st-sort / data-st-sorted (сортировка)
  const table = (head, rows, cls = "", attrs = "") => `<div class="nc-tw ${cls}"><table${attrs ? " " + attrs : ""}><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(tr).join("")}</tbody></table></div>`;
  const box = (kind, html) => `<div class="admonition ${kind}"><p>${html.charAt(0).toUpperCase() + html.slice(1)}</p></div>`;
  const kOf = (x, lv) => (lv === 3 ? x.K95 : x.K90);
  const plural = (n, a, b, c) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);
  const modelCell = (x) => `<b>${esc(x.name)}</b><br><small>${esc(x.src)}${x.wifi ? ", " + esc(x.wifi) : ""}${x.cls ? ", " + esc(x.cls) : ""}</small>` +
    (x.notes && x.notes.length ? `<br><small class="nc-note">${x.notes.map(esc).join("; ")}</small>` : "");
  const varCells = (R, x) => [`<span title="${esc(NE.ARCH_NAME[x.arch])}">${esc(x.arch)}</span><br><small>узлов: ${x.n}${x.kits && x.kits !== x.n ? `, комплектов: ${x.kits}` : ""}${x.L ? `, кабель ${f(x.L)} м` : ""}</small>`,
    `${f(x.TCPz)}<br><small>P<sub>z</sub> ${f(x.Pz, 1)} дБм, K ${f(kOf(x, R.input.level), 1)} %</small>`,
    `${rub(x.tco)}<br><small>CAPEX ${rub(x.capex)}</small>`, isNum(x.S) ? f(x.S, 3) : "—"];
  function analogs(R, row) {   // параметры подбора варианта — по ним можно выбрать аналог другого производителя
    const s = R.kt.req, x = row.card, n = x.n, radio = x.arch.endsWith("радио"), li = [];
    li.push(`Схема ${esc(x.arch)} — ${esc(NE.ARCH_NAME[x.arch])}${q("arch")}: ${n} ${plural(n, "узел", "узла", "узлов")} (${esc(row.type)})` +
      (n > 1 ? `, одна Mesh-экосистема${row.mesh ? ` (у варианта — ${esc(row.mesh)})` : ""}${q("mesh")}, связь узлов — ${radio ? "по радио 5 ГГц" : x.arch === "В-PL" ? "Powerline (после теста)" : `кабель${x.L ? ` ${f(x.L)} м` : ""}`}${q("backhaul")}` : x.L ? `, кабель от ввода ${f(x.L)} м${q("cable")}` : ""));
    li.push(`Wi-Fi${q("std")} не ниже ${s.std}; диапазоны 2,4 и 5 ГГц${s.need6 ? " и 6 ГГц" : ""}; порт WAN${q("wan")} ≥ ${f(s.wan)} Мбит/с; «тариф до» ≥ ${f(s.tariff)} Мбит/с; клиентов ≥ ${Math.ceil(s.dev - 1e-9)} (1,25 × N${q("n")}, N = ${R.sh3.N})`);
    li.push(`KPI уровня «${esc(s.name)}»${q("kpi")} в худшей зоне: K${q("kz")} ≥ ${s.K} %, P<sub>z</sub>${q("pz")} ≥ ${f(s.Pz)} дБм, SNR${q("snr")} ≥ ${s.SNR} дБ, TCP<sub>z</sub>${q("tcp")} ≥ ${s.TCP} Мбит/с; ёмкость C${q("c")} ≥ B<sub>эфф</sub> = ${f(s.Beff, 1)} Мбит/с. ` +
      `Ориентир — ${esc(x.name)}: TCP<sub>z</sub> ${f(x.TCPz)} Мбит/с, P<sub>z</sub> ${f(x.Pz, 1)} дБм, K ${f(kOf(x, s.level), 1)} %`);
    const fn = [s.iptv ? "IPTV" : "", s.vpn ? "VPN" : ""].filter(Boolean);
    li.push(`${fn.length ? `Функции${q("func")}: ${fn.join(", ")}; ` : ""}WPA3${n > 1 ? ", роуминг 802.11k/v" : ""}; гостевая сеть / VLAN для гостей и IoT — ${s.guest ? "обязательно для премиума" : "желательно"}`);
    li.push(`Цена оборудования${q("seg")} ${s.cap ? `не выше ${s.cap.toLocaleString("ru-RU")} ₽ — граница ценового сегмента уровня` : "— без ограничения сегмента"}; TCO 5 лет${q("tco")} варианта — ${rub(x.tco)}, для сравнения`);
    const ex = Object.entries(row.ex).filter(([, l]) => l.length);
    const exl = ex.length ? ex.map(([r, l]) => `<li>${EX_BY[r]}: ${l.map((e) => `<b>${esc(e.name)}</b> × ${e.n}, ${esc(e.arch)}, TCP<sub>z</sub> ${f(e.TCPz)} Мбит/с, TCO ${rub(e.tco)}, S ${f(e.S, 3)} <small>(№ ${e.i})</small>`).join("; ")}</li>`).join("")
      : "<li>подходящих моделей рынка нет</li>";
    return `<div class="nc-an"><p><b>Параметры подбора</b> — аналог другого производителя должен им соответствовать:</p><ul>${li.map((t) => `<li>${t}</li>`).join("")}</ul>` +
      `<p><b>Примеры с рынка</b> из списка «Все подходящие варианты»${q("src")}:</p><ul>${exl}</ul>` +
      `<p><small>Другую модель можно проверить в блоке <a href="#nc-own">«Своё оборудование» (G3)</a>${q("own")} — она рассчитывается наравне с каталогом.` +
      `${R.kt.fb ? " Если вариант не устраивает — проконсультируйтесь со специалистом К Телеком." : ""}</small></p></div>`;
  }
  function variantRows(R, uid) {   // строки К Телеком (Эконом → Оптимальный → Премиум), под каждой — раскрывающиеся «Аналоги»; затем своё оборудование
    const rows = [];
    R.kt.rows.forEach((v, i) => {
      const x = v.card, id = `nc-an-${uid}-${i}`, rec = v.roles.includes("opt") || v.roles.includes("fb");
      const lab = v.roles.map((r) => `<b>${ROLE[r]}</b>${q(ROLE_Q[r])}`).join(" · ") +
        (v.roles.includes("opt") ? `<br><span class="nc-badge">★ Рекомендуем</span>` : v.roles.includes("fb") ? `<br><span class="nc-badge nc-cond">условно</span>` : "");
      rows.push({ a: `class="nc-row-v${rec ? " nc-rec" : ""}"`, c: [lab, modelCell(x) +
        `<br><span class="nc-nw"><button type="button" class="nc-an-b" aria-expanded="false" aria-controls="${id}">Аналоги <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg></button>${q("analog")}</span>`, ...varCells(R, x)] });
      rows.push({ raw: `<tr id="${id}" class="nc-an-row" hidden><td colspan="6">${analogs(R, v)}</td></tr>` });
    });
    for (const u of R.rec.user || []) rows.push([`<b>Своё</b>${q("own")}`, modelCell(u), ...varCells(R, u)]);
    return rows;
  }
  const archs = (R) => [...new Set(R.kt.rows.map((v) => v.card.arch).concat((R.rec.user || []).map((u) => u.arch)))];
  let UID = 0;
  function render(R, meta = {}) {
    const s2 = R.sh2, s3 = R.sh3, kpi = s3.kpi, lv = R.input.level, a = R.arch_ref, h = [], uid = ++UID;
    const kt = R.kt, o = kt.best || R.rec.opt, P = kt.plan ? { ...R, ...kt.plan } : R;   // план, частоты, кабель, паспорт — для рекомендованного варианта
    const kz = lv === 3 ? "1,645" : "1,28";
    h.push(`<h2 id="nc-res">Результат расчёта${q("steps")}</h2>`);
    h.push(table(["Показатель", "Значение"], [
      [`Код квартиры (Ш2)${q("code")}`, `<b>${esc(s2.code)}</b> — ${esc(R.geom.title)}; класс ${esc(s2.code.split("-")[0])}${q("cls")}; ${f(s2.area, 1)} м², масштаб плана k${q("k")} = ${f(s2.k, 3)}`],
      [`Индекс сложности у ввода, I<sub>сл</sub>${q("ic")}`, `${f(s2.ic_A.Ic, 1)} дБ (до помещения «${esc(s2.ic_A.room)}»), допустимо L<sub>доп</sub>${q("ldop")} = ${f(s2.ic_A.Ldop, 1)} дБ → ${s2.ic_A.one_node ? "один узел у ввода может справиться" : "одного узла у ввода мало"}`],
      [`Индекс сложности из центра${q("ic")}`, `${f(s2.ic_B.Ic, 1)} дБ (до «${esc(s2.ic_B.room)}»), L<sub>доп</sub>${q("ldop")} = ${f(s2.ic_B.Ldop, 1)} дБ → ${s2.ic_B.one_node ? "одного узла в центре достаточно" : "одного узла в центре мало"}`],
      [`Требуемая скорость (Ш3)${q("breq")}`, `B<sub>треб</sub> = ${f(s3.B, 1)} Мбит/с; с учётом тарифа B<sub>эфф</sub>${q("beff")} = ${f(s3.Beff, 1)} Мбит/с; устройств N${q("n")} = ${s3.N}`],
      [`KPI уровня «${esc(kpi.name)}»${q("kpi")}`, `покрытие K${q("kz")} ≥ ${kpi.K} % (z = ${kz}); уровень в худшей зоне P<sub>z</sub>${q("pz")} ≥ ${f(kpi.Pz)} дБм; SNR${q("snr")} ≥ ${kpi.SNR} дБ; TCP${q("tcp")} ≥ ${kpi.TCP} Мбит/с; Wi-Fi${q("std")} ≥ ${kpi.std}; WAN${q("wan")} ≥ ${f(kpi.wan)} Мбит/с`],
      [`Архитектура по дереву решений (Ш5)${q("arch")}`, a ? `<b>${esc(a.arch)}</b> — ${esc(NE.ARCH_NAME[a.arch])}: TCP<sub>z</sub> ${f(a.TCPz)} Мбит/с, K ${f(kOf(a, lv), 1)} %, P<sub>z</sub> ${f(a.Pz, 1)} дБм, кабель ${f(a.L)} м (эталонный узел${q("ref")})` : "нет — см. предупреждение"],
    ]));
    if (s2.warn) h.push(box("warning", esc(s2.warn)));
    if (R.flag) h.push(box("danger", esc(R.flag)));
    if (!R.robust.stable && R.robust.note) h.push(box("warning", `${esc(R.robust.note)}. Проверка: ${R.robust.variants.map(([l, v]) => `${esc(l)} → ${esc(v ?? "нет")}`).join("; ")}.`));
    if (R.seg_note) h.push(box("note", esc(R.seg_note)));
    h.push(`<h3>Подобранное оборудование (Ш9)</h3>`);
    const rows = variantRows(R, uid);
    if (rows.length) {
      h.push(table(["Вариант", `Модель${q("src")}`, `Схема${q("arch")}<br><small>узлов${q("node")}, кабель${q("cable")}</small>`,
        `TCP<sub>z</sub>${q("tcp")}, Мбит/с<br><small>P<sub>z</sub>${q("pz")}, K${q("kz")}</small>`, `TCO 5 лет${q("tco")}<br><small>CAPEX${q("capex")}</small>`, `Балл S${q("s")}`], rows, "nc-var"));
      const roles = [...new Set(kt.rows.flatMap((v) => v.roles))];
      h.push(`<p><small>${roles.map((k) => `<b>${ROLE[k]}</b> — ${ROLE_HINT[k]}`).join("; ")}${roles.length ? ". " : ""}` +
        `${kt.rows.length ? "Кнопка «Аналоги» — параметры подбора и примеры моделей других производителей. " : ""}Схемы: ${archs(R).map((a) => `${esc(a)} — ${esc(NE.ARCH_NAME[a])}`).join("; ")}.</small></p>`);
    }
    if (kt.best) {
      const x = kt.best, v = kt.rows.find((r) => r.card === x), also = v ? v.roles.filter((r) => r !== "opt") : [];
      const why = kt.fb ? esc(kt.why) : "наибольший балл S среди моделей К Телеком" + (also.length ? ` — он же ${also.map((r) => (r === "eco" ? "самый экономичный" : "самый быстрый")).join(" и ")}` : "");
      h.push(`<p class="nc-best">${kt.fb ? `<span class="nc-badge nc-cond">условно</span> <b>Ближайший вариант К Телеком</b>${q("near")}` : `<span class="nc-badge">★ Рекомендуем</span> <b>Оптимальный</b>${q("opt")}`}: ` +
        `<b>${esc(x.name)} × ${x.n}</b>, схема ${esc(x.arch)} — ${esc(NE.ARCH_NAME[x.arch])}; TCP<sub>z</sub> ${f(x.TCPz)} Мбит/с, K ${f(kOf(x, lv), 1)} %, TCO 5 лет ${rub(x.tco)}${isNum(x.S) ? `, S ${f(x.S, 3)}` : ""}. ` +
        `Почему: ${why}.${kt.fb ? " Если вариант не устраивает — проконсультируйтесь со специалистом К Телеком." : ""}</p>`);
    } else if (R.rank.length) h.push(box("warning", `в парке К Телеком нет подходящей модели — см. «Все подходящие варианты» ниже; план и паспорт сети показаны для лучшего варианта с рынка (${esc(R.rec.opt.name)}). Проконсультируйтесь со специалистом К Телеком.`));
    if (!R.rank.length && !kt.rows.length) h.push(box("danger", "Ни один вариант из каталога не выполняет KPI уровня."));
    const be = R.best_effort;
    if (be) h.push(box("warning", `${esc(be.why)}. Лучший вариант: ${esc(be.name)} (${esc(be.src)}), ${esc(be.arch)}, TCP<sub>z</sub> ${f(be.TCPz)} Мбит/с, P<sub>z</sub> ${f(be.Pz, 1)} дБм.` +
      (be.cond && !R.input.pl_mbps ? " Проведите тест Powerline, укажите результат в поле D4 и пересчитайте." : "")));
    const ux = R.excluded.filter((x) => x.user);
    if (ux.length) h.push(box("note", "Своё оборудование не подошло: " + ux.map((x) => `${esc(x.name)} — ${x.why.map(esc).join("; ")}` +
      (x.best ? ` (лучший расчёт: ${esc(x.best.arch)}, TCP<sub>z</sub> ${f(x.best.TCPz)} Мбит/с, уровень ${x.best.level})` : "") + (x.warn && x.warn.length ? `; ${x.warn.map(esc).join("; ")}` : "")).join(" · ")));
    for (const u of R.rec.user || []) if (u.warn && u.warn.length) h.push(box("warning", `${esc(u.name)}: ${u.warn.map(esc).join("; ")}`));
    if (o) {
      h.push(`<p><small>${kt.best ? (kt.fb ? "Ближайший вариант К Телеком" : "Оптимальный") : "Лучший вариант с рынка"} (${esc(o.name)}): стоимость ${rub(o.capex)}${q("capex")} (оборудование ${rub(o.eq)} + монтаж), электроэнергия за 5 лет ${rub(o.opex)}${q("opex")}, ${f(o.rub_m2)} ₽/м²${q("rubm2")}; ` +
        `запас к KPI${q("margin")}: P<sub>z</sub> +${f(o.margin.Pz, 1)} дБ, TCP × ${f(o.margin.TCP, 2)}, ёмкость C${q("c")} × ${f(o.margin.C, 2)}.</small></p>`);
    }
    h.push(`<h3>План квартиры и покрытие (Ш4, Ш6)</h3>`, `<div class="nc-planbox">${planSvg(P, o)}</div>`, legend(R, o));
    if (o) {
      h.push(`<h3>Размещение, частоты, кабель (Ш6–Ш8)</h3>`);
      h.push(table([`Узел${q("node")}`, "Роль", "Координаты, м", "Помещение"], o.aps.map((p, i) => [String(i + 1), esc(P.sh6.roles[i]), `${f(p[0], 2)}; ${f(p[1], 2)}`, esc(roomAt(R.geom, p))])));
      h.push(`<ul>${P.sh7.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
      if (P.sh8.length) h.push(table(["№", "Откуда", "Куда", "Длина, м", `Кабель${q("cable")}`, "Трасса"], P.sh8.map((c) => [c.n, esc(c.frm), esc(c.to), f(c.L), esc(c.cat), esc(c.route)])));
      else h.push(`<p>Кабель прокладывать не нужно.</p>`);
      h.push(`<h3>Паспорт сети: что проверить замером (Ш11–Ш12)</h3>`);
      h.push(table(["Помещение", `Точка замера (центр), м${q("passport")}`, `Ожидаемый уровень 5 ГГц, дБм${q("rssi")}`], P.sh12.points.map((pt) => [esc(pt.room), `${f(pt.x, 2)}; ${f(pt.y, 2)}`, f(pt.P, 1)])));
      h.push(`<p><small>В худшей зоне: P<sub>z</sub>${q("pz")} ${f(P.sh12.Pz, 1)} дБм, TCP<sub>z</sub>${q("tcp")} ${f(P.sh12.TCPz)} Мбит/с — для уровня «${esc(P.sh12.kpi)}». Замер «после» сравнивается с этими значениями.</small></p>`);
    }
    h.push(`<details><summary>Дерево архитектур (Ш5) и устойчивость решения</summary>`);
    h.push(table([`Архитектура${q("arch")}`, `Итог${q("tree")}`, `K${q("kz")}, %`, `P<sub>z</sub>${q("pz")}, дБм`, `TCP<sub>z</sub>${q("tcp")}, Мбит/с`, `C${q("c")}, Мбит/с`, `Кабель${q("cable")}, м`, `Не выполнено${q("kpi")}`], R.tree.map((t) => t.skip
      ? [esc(t.arch) + " — " + esc(NE.ARCH_NAME[t.arch]), "не рассматривается", "—", "—", "—", "—", "—", "—"]
      : [esc(t.arch) + " — " + esc(NE.ARCH_NAME[t.arch]), t.ok ? (t.cond ? "✔ условно" : "✔ проходит") : "✘ не проходит", f(kOf(t, lv), 1), f(t.Pz, 1), f(t.TCPz), f(t.C), f(t.L), t.fails.map(esc).join("; ") || "—"]), "", 'data-st-sort="0,1,2,3,4,5,6"'));
    h.push(`<p><small>Устойчивость${q("robust")} (площадь ±5 %, потери несущей стены ±2 дБ): ${R.robust.variants.map(([l, v]) => `${esc(l)} → ${esc(v ?? "нет")}`).join("; ") || "не проверялась"} — ${R.robust.stable ? "решение устойчиво" : "решение на границе"}.</small></p></details>`);
    h.push(`<details><summary>Требуемая скорость по устройствам (Ш3)</summary>`);
    h.push(table(["Устройство", `Шт.${q("n")}`, `Скорость b${q("b")}, Мбит/с`, `k<sub>одн</sub>${q("kodn")}`, `Вклад n·b·k<sub>одн</sub>, Мбит/с`], s3.rows.map((r) => [esc(r[0]), r[1], f(r[2], 1), f(r[3], 3), f(r[4], 2)])));
    h.push(`<p><small>${esc(s3.note)}${q("c")}. B<sub>треб</sub>${q("breq")} = (Σ + 6) × 1,25 = ${f(s3.B, 2)} Мбит/с.</small></p></details>`);
    h.push(`<details><summary>Все подходящие варианты (${R.rank.length}) — ранжирование по баллу S</summary>`);
    h.push(table(["№", "Модель", `Источник${q("src")}`, `Узлов${q("node")}`, `Архитектура${q("arch")}`, `TCP<sub>z</sub>${q("tcp")}`, `P<sub>z</sub>${q("pz")}`, `TCO 5 лет${q("tco")}`, `S${q("s")}`, `k1…k5${q("kk")}`], R.rank.map((x, i) =>
      [i + 1, esc(x.name), esc(x.src), x.n, esc(x.arch), f(x.TCPz), f(x.Pz, 1), rub(x.tco), f(x.S, 3), x.k.map((v) => f(v, 2)).join(" / ")]), "", 'data-st-fix="2" data-st-sort="0,1,2,3,4,5,6,7,8" data-st-sorted="8:desc"'));
    h.push(`<p><small>k1 — скорость, k2 — покрытие, k3 — проводная часть, k4 — функции, k5 — стоимость (И4, формула 10); веса AHP${q("ahp")} уровня «${esc(kpi.name)}». Сортировка — кнопки ↕ в заголовках столбцов.</small></p></details>`);
    h.push(`<details><summary>Исключённые модели (${R.excluded.length})</summary><ul>${R.excluded.map((x) => `<li>${esc(x.name)} <small>(${esc(x.src)})</small> — ${x.why.map(esc).join("; ")}</li>`).join("")}</ul></details>`);
    h.push(`<p class="nc-foot"><small>Каталог: ${R.counts.total} моделей${meta.kt !== undefined ? ` (парк К Телеком — ${meta.kt})` : ""}, данные на ${dmy(meta.updated)}; подошло ${R.counts.passed}, из парка ${R.counts.passed_kt}. ` +
      `Расчёт — ${esc(R.version)}; это прогноз по типовому плану, итог проверяется замером «после» (Ш11)${q("passport")}.</small></p>`);
    return h.join("\n");
  }
  function roomAt(g, p) {
    for (const [name, , rs] of g.rooms) for (const [x0, y0, x1, y1] of rs) if (p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1) return name;
    return "—";
  }

  root.NetCalcUI = { defaults, toParams, userParams, render, planSvg, rssiColor };
  if (typeof document === "undefined") return;

  // ---------------------------------------------------------------- страница
  const SRC = document.currentScript && document.currentScript.src;   // адрес calc.js — от него ищем ../data/*.json
  const getJson = (name) => fetch(new URL("../data/" + name, SRC || location.href)).then((r) => { if (!r.ok) throw new Error(name + ": " + r.status); return r.json(); });
  let eng = null, meta = {}, users = [], lastR = null;
  const opt = (v, t, sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(t)}</option>`;
  const row = (code, label, ctl, hint = "") => `<label class="nc-row"><span><b class="nc-code">${code}</b> ${label}${hint ? ` <small>${hint}</small>` : ""}</span>${ctl}</label>`;
  function form(plans) {
    const d = defaults(), W = plans.WT, PL = NE.PLAN_OF;
    const lv = (n) => { const L = NE.LEVELS[n]; return `${L.name} — K ≥ ${L.K} %, TCP ≥ ${L.TCP} Мбит/с`; };
    return `<form id="nc-form" novalidate onsubmit="return false">
<fieldset><legend>Квартира (блоки A, B чек-листа)${q("codes")}</legend>
${row("A3", "Число комнат" + q("cls"), `<select name="rooms">${[0, 1, 2, 3, 4, 5].map((n) => opt(n, n ? n : "студия", String(n) === d.rooms)).join("")}</select>`)}
${row("A2", "Общая площадь, м²" + q("k"), `<input name="area" type="number" min="15" max="300" step="0.1" placeholder="как в типовом плане">`, "пусто — площадь типового плана")}
${row("A4", "Тип планировки" + q("code"), `<select name="cls">${opt("", "авто — по числу комнат и площади", true)}${Object.keys(PL).map((c) => opt(c, `${c} — ${plans.plans[PL[c]].title} (${PL[c]})`)).join("")}</select>`)}
${row("A1", "Тип дома" + q("code"), `<select name="constr">${opt("", "как в типовом плане", true)}${[["П", "П — панельный"], ["М", "М — монолитный"], ["К", "К — кирпичный"], ["С", "С — смешанный"]].map(([v, t]) => opt(v, t)).join("")}</select>`)}
${row("B1", "Потери несущей стены на 5 ГГц, дБ" + q("lw1"), `<input name="L_W1" type="number" min="1" max="40" step="0.5" placeholder="по типу дома">`, `пусто — ж/б ${W.W1[1]} дБ, кирпич ${W.W1k[1]} дБ`)}
</fieldset>
<fieldset><legend>Ввод провайдера и кабель (C, D)</legend>
${row("C2", "Тариф, Мбит/с" + q("tariff"), `<input name="tariff" type="number" min="10" max="10000" step="10" value="${d.tariff}">`)}
${row("C3", "Место ввода кабеля", `<select name="entry_at">${opt("прихожая", "прихожая", true)}${opt("центр", "центр квартиры")}</select>`)}
${row("C4", "Нужно IPTV" + q("func"), `<input name="iptv" type="checkbox">`)}
${row("D3", "Можно проложить кабель" + q("cable"), `<select name="cable_ok">${opt("1", "да (плинтус, кабель-канал)", true)}${opt("", "нет")}</select>`)}
${row("D4", "Тест Powerline между точками, Мбит/с" + q("pl"), `<input name="pl_mbps" type="number" min="1" max="2500" placeholder="не проводился">`, "если кабель нельзя")}
</fieldset>
<fieldset><legend>Радиообстановка (E)</legend>
${row("E2", "Свободны каналы 36–64 (5 ГГц)" + q("ch"), `<select name="air160">${opt("1", "да — на премиальном уровне 160 МГц", true)}${opt("", "нет — 80 МГц")}</select>`, "по анализатору Wi-Fi")}
</fieldset>
<fieldset><legend>Пользователи и устройства (F)</legend>
<p class="nc-sub"><b class="nc-code">F1</b> Устройства, одновременно в сети, шт.${q("n")} <small>справа — скорость b${q("b")} и коэффициент одновременности k<sub>одн</sub>${q("kodn")}; из них считается B<sub>треб</sub>${q("breq")}</small></p>
${DEV_KEYS.map((k) => row("", esc(NE.DEV[k][0]), `<input name="dev_${k}" type="number" min="0" max="200" step="1" value="${d.dev[k]}">`, `${f(NE.DEV[k][1], 1)} Мбит/с, k<sub>одн</sub> ${f(NE.DEV[k][2], 3)}`)).join("\n")}
${row("F2", "Есть клиенты Wi-Fi 6E/7 и нужен диапазон 6 ГГц" + q("ghz6"), `<input name="need6" type="checkbox">`)}
${row("F4", "Нужен VPN на роутере (удалённая работа)" + q("func"), `<input name="vpn" type="checkbox">`)}
</fieldset>
<fieldset><legend>Требования и ограничения (G)</legend>
${row("G1", "Уровень обслуживания" + q("level") + q("kpi"), `<select name="level">${[1, 2, 3].map((n) => opt(n, lv(n), String(n) === d.level)).join("")}</select>`)}
${row("G2", "Бюджет на оборудование и монтаж, ₽" + q("capex"), `<input name="budget" type="number" min="1" step="100" placeholder="без ограничения">`)}
<details id="nc-own"><summary><b class="nc-code">G3</b> Своё оборудование — рассчитать наравне с каталогом</summary>
<div class="nc-own">
<p class="nc-sub"><small>Своё оборудование${q("own")}: обязательные поля отмечены *; незаполненные параметры принимаются по классу скорости (оценка${q("est")}).</small></p>
${row("", "Название *", `<input name="u_name" type="text" maxlength="80" placeholder="например, TP-Link Archer AX55">`)}
${row("", "Тип *", `<select name="u_type">${USER_TYPES.map((t, i) => opt(t, t, !i)).join("")}</select>`)}
${row("", "Стандарт Wi-Fi *" + q("std"), `<select name="u_std">${["4", "5", "6", "6E", "7"].map((s) => opt(s, "Wi-Fi " + s, s === "6")).join("")}</select>`)}
${row("", "Диапазоны *", BANDS.map((b) => `<span class="nc-chk"><input type="checkbox" name="u_band" value="${b}"${b !== "6" ? " checked" : ""}> ${b} ГГц</span>`).join(" "))}
${row("", "WAN, Мбит/с *" + q("wan"), `<select name="u_wan">${[100, 1000, 2500, 5000, 10000].map((w) => opt(w, w, w === 1000)).join("")}</select>`)}
${row("", "LAN, шт *" + q("lan"), `<input name="u_lan" type="number" min="0" max="16" value="4">`)}
${row("", "Класс скорости" + q("scls"), `<select name="u_cls">${opt("", "не знаю — по стандарту", true)}${Object.keys(NE.CLASS_DEF).map((c) => opt(c, c)).join("")}</select>`)}
${row("", "ЭИИМ 2,4 / 5 / 6 ГГц, дБм" + q("eirp"), BANDS.map((b) => `<input name="u_e${b}" type="number" min="0" max="36" step="0.5" class="nc-s" placeholder="${b}">`).join(" "), "из datasheet; пусто — по умолчанию")}
${row("", "Mesh-протокол" + q("mesh"), `<select name="u_mesh">${opt("", "не знаю / нет", true)}${MESH.map((m) => opt(m, m)).join("")}</select>`, "без Mesh считается только один узел")}
${row("", "Узлов в комплекте", `<input name="u_u" type="number" min="1" max="6" value="1">`)}
${row("", "Цена комплекта, ₽" + q("est"), `<input name="u_price" type="number" min="0" step="100" placeholder="медиана рынка по классу">`)}
${row("", "Уже куплено (первый узел есть)" + q("capex"), `<input name="u_owned" type="checkbox" checked>`)}
<p><button type="button" id="nc-uadd" class="md-button">Добавить в расчёт</button> <span id="nc-umsg" class="nc-err"></span></p>
<ul id="nc-ulist"></ul>
</div></details>
</fieldset>
<p><button id="nc-run" class="md-button md-button--primary" type="submit">Рассчитать</button> <a id="nc-json" href="#" hidden>Скачать расчёт (JSON)</a></p>
<div id="nc-err" class="nc-err"></div>
</form>
<div id="nc-out"></div>`;
  }
  function readForm(fe) {
    const v = (n) => fe.elements[n].value, c = (n) => fe.elements[n].checked;
    const fm = { rooms: v("rooms"), area: v("area"), cls: v("cls"), constr: v("constr"), L_W1: v("L_W1"), tariff: v("tariff"), entry_at: v("entry_at"),
      iptv: c("iptv"), cable_ok: !!v("cable_ok"), pl_mbps: v("pl_mbps"), air160: !!v("air160"), need6: c("need6"), vpn: c("vpn"), level: v("level"),
      budget: v("budget"), dev: {}, user: users };
    for (const k of DEV_KEYS) fm.dev[k] = v("dev_" + k);
    return fm;
  }
  function readUser(fe) {
    const v = (n) => fe.elements[n].value;
    return { name: v("u_name"), type: v("u_type"), std: v("u_std"), bands: [...fe.querySelectorAll('[name="u_band"]:checked')].map((x) => x.value),
      wan: v("u_wan"), lan: v("u_lan"), cls: v("u_cls"), eirp: Object.fromEntries(BANDS.map((b) => [b, v("u_e" + b)])), mesh: v("u_mesh"),
      u: v("u_u"), price: v("u_price"), owned: fe.elements.u_owned.checked };
  }
  function showUsers(el) {
    el.querySelector("#nc-ulist").innerHTML = users.map((u, i) => `<li>${esc(u.name)} — ${esc(u.type)}, Wi-Fi ${esc(u.std)}, ${u.bands.map(esc).join(" / ")} ГГц, WAN ${esc(u.wan)}` +
      `${u.owned ? ", уже есть" : ""} <button type="button" class="nc-del" data-i="${i}" title="Убрать">✕</button></li>`).join("");
  }
  function run(el) {
    const fe = el.querySelector("#nc-form"), out = el.querySelector("#nc-out"), er = el.querySelector("#nc-err"), dl = el.querySelector("#nc-json");
    const { p, err } = toParams(readForm(fe));
    er.innerHTML = err.map(esc).join("<br>");
    if (err.length) { out.innerHTML = ""; dl.hidden = true; return; }
    try { lastR = eng.calc(p); } catch (e) { er.textContent = "Ошибка расчёта: " + e.message; out.innerHTML = ""; dl.hidden = true; return; }
    out.innerHTML = render(lastR, meta);
    dl.hidden = false;
    out.querySelector("#nc-res").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function init() {
    const el = document.getElementById("netcalc"); if (!el) return;
    el.innerHTML = "<p>Загрузка данных калькулятора…</p>";
    let plans, cat;
    try { [plans, cat] = await Promise.all([getJson("plans.json"), getJson("equipment.json")]); }
    catch (e) { el.innerHTML = `<p class="nc-err">Не удалось загрузить данные калькулятора (${esc(e.message)}). Обновите страницу.</p>`; return; }
    const items = (cat.items || []).filter((i) => i && i.name && isNum(i.std) && isNum(i.price) && Array.isArray(i.bands));
    if (!items.length) { el.innerHTML = `<p class="nc-err">Данные об оборудовании в устаревшем формате — обновите страницу (Ctrl+F5).</p>`; return; }
    eng = NE.create({ plans, catalog: { items } });
    meta = { updated: cat.updated, kt: items.filter((i) => i.src === "К Телеком").length };
    el.innerHTML = form(plans);
    const fe = el.querySelector("#nc-form");
    fe.addEventListener("submit", (ev) => { ev.preventDefault(); run(el); });
    el.querySelector("#nc-uadd").addEventListener("click", () => {
      const msg = el.querySelector("#nc-umsg"), u = readUser(fe);
      try { eng.userItem(userParams(u), users.length); } catch (e) { msg.textContent = e.message; return; }
      if (users.length >= 5) { msg.textContent = "не больше 5 моделей"; return; }
      users.push(u); msg.textContent = ""; fe.elements.u_name.value = ""; showUsers(el);
    });
    el.querySelector("#nc-ulist").addEventListener("click", (ev) => {
      const b = ev.target.closest(".nc-del"); if (!b) return; users.splice(+b.dataset.i, 1); showUsers(el);
    });
    el.querySelector("#nc-json").addEventListener("click", (ev) => {
      ev.preventDefault(); if (!lastR) return;
      const { map, ...R } = lastR;
      if (R.kt && R.kt.plan) R.kt = { ...R.kt, plan: { ...R.kt.plan, map: undefined } };   // карта покрытия в JSON не нужна
      const url = URL.createObjectURL(new Blob([JSON.stringify(R, null, 1)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `raschet_${R.sh2.code}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  // «Аналоги ▾» — и на странице, и в окне «На весь экран» (таблица переносится туда); ссылка на G3 раскрывает блок
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest && ev.target.closest(".nc-an-b");
    if (b) {
      const r = document.getElementById(b.getAttribute("aria-controls")); if (!r) return;
      const open = r.hidden; r.hidden = !open;
      b.setAttribute("aria-expanded", String(open));
      return;
    }
    const a = ev.target.closest && ev.target.closest('a[href="#nc-own"]');
    if (a) { const d = document.getElementById("nc-own"); if (d) d.open = true; }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
