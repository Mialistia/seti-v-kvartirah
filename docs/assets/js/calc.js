// Калькулятор подбора — интерфейс страницы docs/calculator.md.
// Форма повторяет поля чек-листа обследования (коды A1–G3), расчёт — движок И4 (engine.js, шаги Ш2–Ш12).
// Данные: ../data/plans.json (типовые планы И2) и ../data/equipment.json (база Notion «Оборудование К Телеком»),
// пути считаются от адреса calc.js. Функции без DOM (toParams, render, planSvg) проверяются в tests/calc.test.mjs.
(function (root) {
  "use strict";
  const NE = root.NetEngine;
  if (!NE) throw new Error("calc.js: сначала подключите engine.js");
  const DEV_KEYS = ["tv", "console", "laptop", "phone", "tablet", "iot"];
  const BANDS = ["2,4", "5", "6"];
  const ROLE = { opt: "Оптимум", eco: "Эконом", res: "Запас", best_market: "Лучший с рынка" };
  const ROLE_HINT = { opt: "лучший по баллу S (AHP) вариант из парка К Телеком, а если парк не проходит — лучший из всех",
    eco: "наименьшая стоимость владения TCO за 5 лет среди остальных", res: "наибольшая скорость TCP в худшей зоне среди остальных",
    best_market: "лучший по баллу S вариант с рынка (И3)" };
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
      air160: true, dev: { ...NE.DEFAULTS.dev }, need6: false, vpn: false, level: "2", budget: "", user: [] };
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
    return (o ? `<p class="nc-legend"><b>Уровень сигнала 5 ГГц, дБм</b> (медиана): ${RSSI.map(([, col, t]) => `<span><i style="background:${col}"></i>${t}</span>`).join("")}<br>` +
      `<small>KPI уровня «${esc(kpi.name)}» — P<sub>z</sub> ≥ ${f(kpi.Pz)} дБм в худшей зоне с запасом на замирания z·σ, поэтому медиана на карте должна быть выше порога.</small></p>` : "") +
      `<p class="nc-legend"><span><i class="nc-sq"></i>ввод кабеля</span><span><i class="nc-dot" style="background:#283593"></i>1 — корневой узел</span>` +
      `<span><i class="nc-dot" style="background:#00897b"></i>2, 3 — спутники</span><span><i class="nc-ln"></i>кабель (схема трассы)</span>` +
      `<span>толщина линии — тип стены: несущая, перегородка, дверь</span></p>`;
  }

  // ---------------------------------------------------------------- результат
  const td = (v) => `<td>${v}</td>`;
  const table = (head, rows, cls = "") => `<div class="nc-tw ${cls}"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map(td).join("")}</tr>`).join("")}</tbody></table></div>`;
  const box = (kind, html) => `<div class="admonition ${kind}"><p>${html.charAt(0).toUpperCase() + html.slice(1)}</p></div>`;
  const kOf = (x, lv) => (lv === 3 ? x.K95 : x.K90);
  function variantRows(R) {
    const lv = R.input.level, rows = [];
    const add = (label, hint, x) => rows.push([`<b title="${esc(hint)}">${label}</b>`,
      `<b>${esc(x.name)}</b><br><small>${esc(x.src)}${x.wifi ? ", " + esc(x.wifi) : ""}${x.cls ? ", " + esc(x.cls) : ""}</small>` +
        (x.notes && x.notes.length ? `<br><small class="nc-note">${x.notes.map(esc).join("; ")}</small>` : ""),
      `<span title="${esc(NE.ARCH_NAME[x.arch])}">${esc(x.arch)}</span><br><small>узлов: ${x.n}${x.kits && x.kits !== x.n ? `, комплектов: ${x.kits}` : ""}${x.L ? `, кабель ${f(x.L)} м` : ""}</small>`,
      `${f(x.TCPz)}<br><small>P<sub>z</sub> ${f(x.Pz, 1)} дБм, K ${f(kOf(x, lv), 1)} %</small>`,
      `${rub(x.tco)}<br><small>CAPEX ${rub(x.capex)}</small>`, f(x.S, 3)]);
    for (const k of ["opt", "eco", "res", "best_market"]) if (R.rec[k]) add(ROLE[k], ROLE_HINT[k], R.rec[k]);
    for (const u of R.rec.user || []) add("Своё", "пользовательское оборудование (G3): расчёт наравне с каталогом", u);
    return rows;
  }
  const archs = (R) => [...new Set(["opt", "eco", "res", "best_market"].filter((k) => R.rec[k]).map((k) => R.rec[k].arch).concat((R.rec.user || []).map((u) => u.arch)))];
  function render(R, meta = {}) {
    const s2 = R.sh2, s3 = R.sh3, kpi = s3.kpi, lv = R.input.level, o = R.rec.opt, a = R.arch_ref, h = [];
    const kz = lv === 3 ? "1,645" : "1,28";
    h.push(`<h2 id="nc-res">Результат расчёта</h2>`);
    h.push(table(["Показатель", "Значение"], [
      ["Код квартиры (Ш2)", `<b>${esc(s2.code)}</b> — ${esc(R.geom.title)}; ${f(s2.area, 1)} м², масштаб плана k = ${f(s2.k, 3)}`],
      ["Индекс сложности у ввода, I<sub>сл</sub>", `${f(s2.ic_A.Ic, 1)} дБ (до помещения «${esc(s2.ic_A.room)}»), допустимо L<sub>доп</sub> = ${f(s2.ic_A.Ldop, 1)} дБ → ${s2.ic_A.one_node ? "один узел у ввода может справиться" : "одного узла у ввода мало"}`],
      ["Индекс сложности из центра", `${f(s2.ic_B.Ic, 1)} дБ (до «${esc(s2.ic_B.room)}»), L<sub>доп</sub> = ${f(s2.ic_B.Ldop, 1)} дБ → ${s2.ic_B.one_node ? "одного узла в центре достаточно" : "одного узла в центре мало"}`],
      ["Требуемая скорость (Ш3)", `B<sub>треб</sub> = ${f(s3.B, 1)} Мбит/с; с учётом тарифа B<sub>эфф</sub> = ${f(s3.Beff, 1)} Мбит/с; устройств N = ${s3.N}`],
      [`KPI уровня «${esc(kpi.name)}»`, `покрытие K ≥ ${kpi.K} % (z = ${kz}); уровень в худшей зоне P<sub>z</sub> ≥ ${f(kpi.Pz)} дБм; SNR ≥ ${kpi.SNR} дБ; TCP ≥ ${kpi.TCP} Мбит/с; Wi-Fi ≥ ${kpi.std}; WAN ≥ ${f(kpi.wan)} Мбит/с`],
      ["Архитектура по дереву решений (Ш5)", a ? `<b>${esc(a.arch)}</b> — ${esc(NE.ARCH_NAME[a.arch])}: TCP<sub>z</sub> ${f(a.TCPz)} Мбит/с, K ${f(kOf(a, lv), 1)} %, P<sub>z</sub> ${f(a.Pz, 1)} дБм, кабель ${f(a.L)} м (эталонный узел)` : "нет — см. предупреждение"],
    ]));
    if (s2.warn) h.push(box("warning", esc(s2.warn)));
    if (R.flag) h.push(box("danger", esc(R.flag)));
    if (!R.robust.stable && R.robust.note) h.push(box("warning", `${esc(R.robust.note)}. Проверка: ${R.robust.variants.map(([l, v]) => `${esc(l)} → ${esc(v ?? "нет")}`).join("; ")}.`));
    if (R.seg_note) h.push(box("note", esc(R.seg_note)));
    h.push(`<h3>Подобранное оборудование (Ш9)</h3>`);
    const rows = variantRows(R);
    if (rows.length) {
      h.push(table(["Вариант", "Модель", "Схема", "TCP<sub>z</sub>, Мбит/с", "TCO 5 лет", "Балл S"], rows, "nc-var"));
      h.push(`<p><small>${Object.keys(ROLE).filter((k) => R.rec[k]).map((k) => `<b>${ROLE[k]}</b> — ${ROLE_HINT[k]}`).join("; ")}. ` +
        `Схемы: ${archs(R).map((a) => `${esc(a)} — ${esc(NE.ARCH_NAME[a])}`).join("; ")}.</small></p>`);
    }
    else h.push(box("danger", "Ни один вариант из каталога не выполняет KPI уровня."));
    const fb = R.rec.kt_fallback;
    if (fb) h.push(box("note", `Парк К Телеком: ${esc(fb.name)} × ${fb.n} (${esc(fb.arch)}) — TCP<sub>z</sub> ${f(fb.TCPz)} Мбит/с, P<sub>z</sub> ${f(fb.Pz, 1)} дБм, уровень ${fb.level}${fb.conditional ? ", условно" : ""}: ${esc(fb.why)}.`));
    const be = R.best_effort;
    if (be) h.push(box("warning", `${esc(be.why)}. Лучший вариант: ${esc(be.name)} (${esc(be.src)}), ${esc(be.arch)}, TCP<sub>z</sub> ${f(be.TCPz)} Мбит/с, P<sub>z</sub> ${f(be.Pz, 1)} дБм.` +
      (be.cond && !R.input.pl_mbps ? " Проведите тест Powerline, укажите результат в поле D4 и пересчитайте." : "")));
    const ux = R.excluded.filter((x) => x.user);
    if (ux.length) h.push(box("note", "Своё оборудование не подошло: " + ux.map((x) => `${esc(x.name)} — ${x.why.map(esc).join("; ")}` +
      (x.best ? ` (лучший расчёт: ${esc(x.best.arch)}, TCP<sub>z</sub> ${f(x.best.TCPz)} Мбит/с, уровень ${x.best.level})` : "") + (x.warn && x.warn.length ? `; ${x.warn.map(esc).join("; ")}` : "")).join(" · ")));
    for (const u of R.rec.user || []) if (u.warn && u.warn.length) h.push(box("warning", `${esc(u.name)}: ${u.warn.map(esc).join("; ")}`));
    if (o) {
      h.push(`<p><small>Оптимум: стоимость ${rub(o.capex)} (оборудование ${rub(o.eq)} + монтаж), электроэнергия за 5 лет ${rub(o.opex)}, ${f(o.rub_m2)} ₽/м²; ` +
        `запас к KPI: P<sub>z</sub> +${f(o.margin.Pz, 1)} дБ, TCP × ${f(o.margin.TCP, 2)}, ёмкость C × ${f(o.margin.C, 2)}.</small></p>`);
    }
    h.push(`<h3>План квартиры и покрытие (Ш4, Ш6)</h3>`, `<div class="nc-planbox">${planSvg(R, o)}</div>`, legend(R, o));
    if (o) {
      h.push(`<h3>Размещение, частоты, кабель (Ш6–Ш8)</h3>`);
      h.push(table(["Узел", "Роль", "Координаты, м", "Помещение"], o.aps.map((p, i) => [String(i + 1), esc(R.sh6.roles[i]), `${f(p[0], 2)}; ${f(p[1], 2)}`, esc(roomAt(R.geom, p))])));
      h.push(`<ul>${R.sh7.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
      if (R.sh8.length) h.push(table(["№", "Откуда", "Куда", "Длина, м", "Кабель", "Трасса"], R.sh8.map((c) => [c.n, esc(c.frm), esc(c.to), f(c.L), esc(c.cat), esc(c.route)])));
      else h.push(`<p>Кабель прокладывать не нужно.</p>`);
      h.push(`<h3>Паспорт сети: что проверить замером (Ш11–Ш12)</h3>`);
      h.push(table(["Помещение", "Точка замера (центр), м", "Ожидаемый уровень 5 ГГц, дБм"], R.sh12.points.map((pt) => [esc(pt.room), `${f(pt.x, 2)}; ${f(pt.y, 2)}`, f(pt.P, 1)])));
      h.push(`<p><small>В худшей зоне: P<sub>z</sub> ${f(R.sh12.Pz, 1)} дБм, TCP<sub>z</sub> ${f(R.sh12.TCPz)} Мбит/с — для уровня «${esc(R.sh12.kpi)}». Замер «после» сравнивается с этими значениями.</small></p>`);
    }
    h.push(`<details><summary>Дерево архитектур (Ш5) и устойчивость решения</summary>`);
    h.push(table(["Архитектура", "Итог", "K, %", "P<sub>z</sub>, дБм", "TCP<sub>z</sub>, Мбит/с", "C, Мбит/с", "Кабель, м", "Не выполнено"], R.tree.map((t) => t.skip
      ? [esc(t.arch) + " — " + esc(NE.ARCH_NAME[t.arch]), "не рассматривается", "—", "—", "—", "—", "—", "—"]
      : [esc(t.arch) + " — " + esc(NE.ARCH_NAME[t.arch]), t.ok ? (t.cond ? "условно ✔" : "✔") : "✘", f(kOf(t, lv), 1), f(t.Pz, 1), f(t.TCPz), f(t.C), f(t.L), t.fails.map(esc).join("; ") || "—"])));
    h.push(`<p><small>Устойчивость (площадь ±5 %, потери несущей стены ±2 дБ): ${R.robust.variants.map(([l, v]) => `${esc(l)} → ${esc(v ?? "нет")}`).join("; ") || "не проверялась"} — ${R.robust.stable ? "решение устойчиво" : "решение на границе"}.</small></p></details>`);
    h.push(`<details><summary>Требуемая скорость по устройствам (Ш3)</summary>`);
    h.push(table(["Устройство", "Шт.", "Скорость, Мбит/с", "k<sub>одн</sub>", "Вклад, Мбит/с"], s3.rows.map((r) => [esc(r[0]), r[1], f(r[2], 1), f(r[3], 3), f(r[4], 2)])));
    h.push(`<p><small>${esc(s3.note)}. B<sub>треб</sub> = (Σ + 6) × 1,25 = ${f(s3.B, 2)} Мбит/с.</small></p></details>`);
    h.push(`<details><summary>Все подходящие варианты (${R.rank.length}) — ранжирование по баллу S</summary>`);
    h.push(table(["№", "Модель", "Источник", "Узлов", "Архитектура", "TCP<sub>z</sub>", "P<sub>z</sub>", "TCO 5 лет", "S", "k1…k5"], R.rank.map((x, i) =>
      [i + 1, esc(x.name), esc(x.src), x.n, esc(x.arch), f(x.TCPz), f(x.Pz, 1), rub(x.tco), f(x.S, 3), x.k.map((v) => f(v, 2)).join(" / ")])));
    h.push(`<p><small>k1 — радиопоказатели, k2 — скорость, k3 — порты, k4 — функции, k5 — стоимость; веса AHP уровня «${esc(kpi.name)}».</small></p></details>`);
    h.push(`<details><summary>Исключённые модели (${R.excluded.length})</summary><ul>${R.excluded.map((x) => `<li>${esc(x.name)} <small>(${esc(x.src)})</small> — ${x.why.map(esc).join("; ")}</li>`).join("")}</ul></details>`);
    h.push(`<p class="nc-foot"><small>Каталог: ${R.counts.total} моделей${meta.kt !== undefined ? ` (парк К Телеком — ${meta.kt})` : ""}, данные на ${dmy(meta.updated)}; подошло ${R.counts.passed}, из парка ${R.counts.passed_kt}. ` +
      `Расчёт — ${esc(R.version)}; это прогноз по типовому плану, итог проверяется замером «после» (Ш11).</small></p>`);
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
<fieldset><legend>Квартира (блоки A, B чек-листа)</legend>
${row("A3", "Число комнат", `<select name="rooms">${[0, 1, 2, 3, 4, 5].map((n) => opt(n, n ? n : "студия", String(n) === d.rooms)).join("")}</select>`)}
${row("A2", "Общая площадь, м²", `<input name="area" type="number" min="15" max="300" step="0.1" placeholder="как в типовом плане">`, "пусто — площадь типового плана")}
${row("A4", "Тип планировки", `<select name="cls">${opt("", "авто — по числу комнат и площади", true)}${Object.keys(PL).map((c) => opt(c, `${c} — ${plans.plans[PL[c]].title} (${PL[c]})`)).join("")}</select>`)}
${row("A1", "Тип дома", `<select name="constr">${opt("", "как в типовом плане", true)}${[["П", "П — панельный"], ["М", "М — монолитный"], ["К", "К — кирпичный"], ["С", "С — смешанный"]].map(([v, t]) => opt(v, t)).join("")}</select>`)}
${row("B1", "Потери несущей стены на 5 ГГц, дБ", `<input name="L_W1" type="number" min="1" max="40" step="0.5" placeholder="по типу дома">`, `пусто — ж/б ${W.W1[1]} дБ, кирпич ${W.W1k[1]} дБ`)}
</fieldset>
<fieldset><legend>Ввод провайдера и кабель (C, D)</legend>
${row("C2", "Тариф, Мбит/с", `<input name="tariff" type="number" min="10" max="10000" step="10" value="${d.tariff}">`)}
${row("C3", "Место ввода кабеля", `<select name="entry_at">${opt("прихожая", "прихожая", true)}${opt("центр", "центр квартиры")}</select>`)}
${row("C4", "Нужно IPTV", `<input name="iptv" type="checkbox">`)}
${row("D3", "Можно проложить кабель", `<select name="cable_ok">${opt("1", "да (плинтус, кабель-канал)", true)}${opt("", "нет")}</select>`)}
${row("D4", "Тест Powerline между точками, Мбит/с", `<input name="pl_mbps" type="number" min="1" max="2500" placeholder="не проводился">`, "если кабель нельзя")}
</fieldset>
<fieldset><legend>Радиообстановка (E)</legend>
${row("E2", "Свободны каналы 36–64 (5 ГГц)", `<select name="air160">${opt("1", "да — на премиальном уровне 160 МГц", true)}${opt("", "нет — 80 МГц")}</select>`, "по анализатору Wi-Fi")}
</fieldset>
<fieldset><legend>Пользователи и устройства (F)</legend>
<p class="nc-sub"><b class="nc-code">F1</b> Устройства, одновременно в сети, шт.</p>
${DEV_KEYS.map((k) => row("", esc(NE.DEV[k][0]), `<input name="dev_${k}" type="number" min="0" max="200" step="1" value="${d.dev[k]}">`, `${f(NE.DEV[k][1], 1)} Мбит/с, k<sub>одн</sub> ${f(NE.DEV[k][2], 3)}`)).join("\n")}
${row("F2", "Есть клиенты Wi-Fi 6E/7 и нужен диапазон 6 ГГц", `<input name="need6" type="checkbox">`)}
${row("F4", "Нужен VPN на роутере (удалённая работа)", `<input name="vpn" type="checkbox">`)}
</fieldset>
<fieldset><legend>Требования и ограничения (G)</legend>
${row("G1", "Уровень обслуживания", `<select name="level">${[1, 2, 3].map((n) => opt(n, lv(n), String(n) === d.level)).join("")}</select>`)}
${row("G2", "Бюджет на оборудование и монтаж, ₽", `<input name="budget" type="number" min="1" step="100" placeholder="без ограничения">`)}
<details id="nc-own"><summary><b class="nc-code">G3</b> Своё оборудование — рассчитать наравне с каталогом</summary>
<div class="nc-own">
${row("", "Название *", `<input name="u_name" type="text" maxlength="80" placeholder="например, TP-Link Archer AX55">`)}
${row("", "Тип *", `<select name="u_type">${USER_TYPES.map((t, i) => opt(t, t, !i)).join("")}</select>`)}
${row("", "Стандарт Wi-Fi *", `<select name="u_std">${["4", "5", "6", "6E", "7"].map((s) => opt(s, "Wi-Fi " + s, s === "6")).join("")}</select>`)}
${row("", "Диапазоны *", BANDS.map((b) => `<span class="nc-chk"><input type="checkbox" name="u_band" value="${b}"${b !== "6" ? " checked" : ""}> ${b} ГГц</span>`).join(" "))}
${row("", "WAN, Мбит/с *", `<select name="u_wan">${[100, 1000, 2500, 5000, 10000].map((w) => opt(w, w, w === 1000)).join("")}</select>`)}
${row("", "LAN, шт *", `<input name="u_lan" type="number" min="0" max="16" value="4">`)}
${row("", "Класс скорости", `<select name="u_cls">${opt("", "не знаю — по стандарту", true)}${Object.keys(NE.CLASS_DEF).map((c) => opt(c, c)).join("")}</select>`)}
${row("", "ЭИИМ 2,4 / 5 / 6 ГГц, дБм", BANDS.map((b) => `<input name="u_e${b}" type="number" min="0" max="36" step="0.5" class="nc-s" placeholder="${b}">`).join(" "), "из datasheet; пусто — по умолчанию")}
${row("", "Mesh-протокол", `<select name="u_mesh">${opt("", "не знаю / нет", true)}${MESH.map((m) => opt(m, m)).join("")}</select>`, "без Mesh считается только один узел")}
${row("", "Узлов в комплекте", `<input name="u_u" type="number" min="1" max="6" value="1">`)}
${row("", "Цена комплекта, ₽", `<input name="u_price" type="number" min="0" step="100" placeholder="медиана рынка по классу">`)}
${row("", "Уже куплено (первый узел есть)", `<input name="u_owned" type="checkbox" checked>`)}
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
      const { map, ...R } = lastR, url = URL.createObjectURL(new Blob([JSON.stringify(R, null, 1)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `raschet_${R.sh2.code}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
