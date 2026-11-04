// Формулы методики И4 и функции интерфейса калькулятора (без браузера): запускаются в проверке сборки (check.yml).
import assert from "node:assert/strict";
import fs from "node:fs";
await import("../docs/assets/js/engine.js");
await import("../docs/assets/js/glossary.js");
await import("../docs/assets/js/plan.js");
await import("../docs/assets/js/layout.js");
await import("../docs/assets/js/layout-ui.js");   // без DOM ничего не делает — проверка синтаксиса
await import("../docs/assets/js/layout-img.js");
await import("../docs/assets/js/layout-net.js");
await import("../docs/assets/js/calc.js");
const NE = globalThis.NetEngine, UI = globalThis.NetCalcUI, GL = globalThis.NetGlossary, LA = globalThis.NetLayout;
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));
const PLD = read("../docs/assets/data/plans.json");
const eng = NE.create({ plans: PLD, catalog: read("./fixtures/equipment_i4.json") });
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≠ ${b}`);
const top = (t) => t.r[t.r.length - 1];

// 1. Канальная скорость PHY: R = N_SS · N_SD · b · R_c / T_s (IEEE 802.11-2024)
near(top(NE.rateTable("HE", 2, 80)), 1201, 0.1, "Wi-Fi 6, 2×2, 80 МГц");
near(top(NE.rateTable("HE", 2, 160)), 2402, 0.1, "Wi-Fi 6, 2×2, 160 МГц");
near(top(NE.rateTable("VHT", 2, 80)), 866.7, 0.1, "Wi-Fi 5, 2×2, 80 МГц");
assert.equal(top(NE.rateTable("HT", 2, 40)), 300, "Wi-Fi 4, 2×2, 40 МГц");
assert.equal(NE.rphy1(-90, NE.rateTable("HE", 2, 80)), 0, "ниже чувствительности MCS0 — нет связи");
// 2. Потери в свободном пространстве (4.2) и шум канала 20 МГц
near(NE.fspl(1, 5500), 47.26, 0.01, "L_св(1 м, 5,5 ГГц)");
near(NE.fspl(10, 5500) - NE.fspl(1, 5500), 20, 1e-9, "+20 дБ на декаду");
near(NE.N20, -94.0, 0.02, "шум 20 МГц при NF 7 дБ");
// 3. Требуемая скорость (4.13): B_треб = (Σ n·b·k_одн + 6) · 1,25
near(eng.breq(NE.DEFAULTS.dev).B, 334.45, 1e-9, "B_треб семьи из 3 человек (И1)");
near(eng.breq({ tv: 2 }).B, (2 * 100 * 0.6 + 6) * 1.25, 1e-9, "B_треб: 2 ТВ 4K");
near(eng.breq({ pc: 1 }).B, (50 * 0.4 + 6) * 1.25, 1e-9, "B_треб: один ПК (И1, табл. 10: 50 Мбит/с, k_одн 0,4)");
// 4. Допустимые потери в стенах: L_доп = ЭИИМ − L_св(d) − P_пор − z·σ
near(eng.Ldop(7.67, -67), 23 - NE.fspl(7.67, 5500) + 67 - 1.28 * 5.01, 1e-9, "L_доп");
assert.equal(NE.pyRound(eng.Ldop(7.67, -67), 1), 18.6);
// 5. Класс квартиры по числу комнат и площади (п. 4.7)
for (const [rooms, area, cls] of [[0, 30, "К1"], [1, 40, "К2"], [2, 55, "К3"], [3, 75, "К4"], [4, 100, "К5"], [3, 95, "К5"]]) assert.equal(eng.classify(rooms, area)[0], cls, `${rooms} комн., ${area} м²`);
assert.match(eng.classify(1, 60)[1], /вне ориентира класса К2/);
// 6. Округление как в Python (банковское) и процентиль numpy
assert.deepEqual([NE.pyRound(0.125, 2), NE.pyRound(2.5), NE.pyRound(3.5), NE.pyRound(-1.25, 1)], [0.12, 2, 4, -1.2]);
assert.equal(NE.pct10([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 1.9);

// 7. Форма → параметры движка: по умолчанию — семья из 3 человек И1, вместо планшета ПК (60 × 0,275 → 50 × 0,4):
// B_треб = (60 + 20 + 82,5 + 82,5 + 20 + 0,06 + 6) × 1,25 = 338,825 → 338,82; подбор — как в примере К3-2 отчёта И4
let { p, err } = UI.toParams(UI.defaults());
assert.deepEqual(err, []);
assert.deepEqual(p.dev, { tv: 1, console: 1, laptop: 2, phone: 3, pc: 1, iot: 8 }, "в форме нет «Планшет», есть «ПК»");
let r = eng.calc(p);
assert.equal(r.sh2.code, "К3-Р-П");
assert.equal(r.sh3.B, 338.82);
assert.deepEqual([r.rec.opt.name, r.rec.opt.n, r.rec.opt.arch], ["Mercusys MR1500X", 2, "В-радио"]);
// Варианты К Телеком (R.kt): Эконом и Оптимальный совпали — одна строка, Премиум — SNR AX2 (TCP_z и P_z равны, k1 выше, S выше, чем у Netcraze Giga)
assert.deepEqual(r.kt.rows.map((v) => [v.roles.join("+"), v.card.name, v.card.src]), [["eco+opt", "Mercusys MR1500X", "К Телеком"], ["prem", "SNR AX2", "К Телеком"]]);
assert.equal(r.kt.best.name, r.rec.opt.name, "рекомендуемый вариант — оптимальный");
assert.ok(!r.kt.fb && !r.kt.plan);
for (const v of r.kt.rows) for (const l of Object.values(v.ex)) assert.ok(l.length >= 2 && l.every((e) => e.src === "Рынок" && e.i >= 1), "примеры аналогов — с рынка, из ранжирования");
let html = UI.render(r, { updated: "2026-11-03", kt: 21 });
assert.equal((html.match(/class="nc-an-b"/g) || []).length, 2, "кнопка «Аналоги» в каждой строке К Телеком");
assert.ok(html.includes("★ Рекомендуем") && html.includes("он же самый экономичный"));
assert.ok(!/Лучший с рынка|Оптимум/.test(html), "старые названия вариантов не выводятся");
assert.match(html, /data-st-fix="2" data-st-sort="[\d,]+" data-st-sorted="8:desc"/, "ранжирование: закреплены № и Модель, сортировка");
// Премиальный уровень: в парке нет Wi-Fi 7 — ближайший вариант К Телеком условно, план — для него
r = eng.calc({ ...p, level: 3 });
assert.equal(r.counts.passed_kt, 0);
assert.ok(r.kt.fb && r.kt.rows.length === 1 && r.kt.rows[0].roles[0] === "fb");
assert.equal(r.kt.best.name, r.rec.kt_fallback.name);
assert.equal(r.kt.best.S, null);
assert.equal(r.kt.plan.sh6.aps.length, r.kt.best.n);
html = UI.render(r, { updated: "2026-11-03", kt: 21 });
assert.ok(html.includes("условно") && html.includes("проконсультируйтесь со специалистом К Телеком"));
assert.equal((UI.planSvg({ ...r, ...r.kt.plan }, r.kt.best).match(/<circle /g) || []).length, r.kt.best.n, "на плане — узлы ближайшего варианта К Телеком");
// Переключатель вариантов на плане: Эконом / Оптимальный / Премиум / «Свой выбор» (R.planFor движка, UI.pick, UI.planView)
r = eng.calc(p);
assert.ok(!Object.keys(r).includes("planFor") && !JSON.stringify(r).includes("planFor"), "planFor не попадает в JSON-выгрузку");
assert.deepEqual(UI.pvButtons(r).map((b) => b.m), ["eco", "opt", "prem"]);
html = UI.render(r, { updated: "2026-11-03", kt: 21 });
assert.equal((html.match(/class="nc-pv-b"/g) || []).length, 4, "кнопки: Эконом, Оптимальный, Премиум, Свой выбор");
assert.equal((html.match(/class="nc-pv-b"[^>]*aria-pressed="true"/g) || []).length, 2, "Эконом и Оптимальный — одна модель: нажаты обе кнопки");
assert.ok(html.includes('id="nc-own-') && html.includes('value="+own"') && (html.match(/class="nc-pv-pick"/g) || []).length === r.rank.length, "строка «Свой выбор», ввод своего оборудования, «на план» в ранжировании");
const po = r.planFor(r.rec.opt.id);
assert.deepEqual([po.plan.sh6, po.plan.sh8, po.plan.sh12, po.plan.map], [r.sh6, r.sh8, r.sh12, r.map], "planFor(оптимальный) = Ш6–Ш8, Ш12 и карта расчёта");
const prem = UI.pick(r, UI.pvButtons(r)[2].key, "prem");
assert.equal(prem.x.name, "SNR AX2");
assert.equal((UI.planSvg(prem.P, prem.x).match(/<circle /g) || []).length, prem.x.n);
assert.ok(UI.planView(r, prem).startsWith('<p class="nc-pv-cost"><small><b>Премиум</b> — SNR AX2'), "строка стоимости — для выбранного варианта");
// легенда стен: образцы для каждого типа стены плана и потери на 5 ГГц (И2, табл. 4)
for (const t of new Set(r.geom.walls.map((w) => w[4]).filter((t) => t !== "O"))) assert.ok(r.geom.wt[t] && html.includes(`— <b>${String(r.geom.wt[t][1]).replace(".", ",")} дБ</b>`), `легенда: стена ${t}`);
assert.match(html, /несущая ж\/б — <b>13 дБ<\/b>/);
assert.match(UI.render(eng.calc({ ...p, constr: "К" }), {}), /несущая кирпич — <b>11 дБ<\/b>/);
// своё оборудование — в «Свой выбор» и на плане
const ur = eng.calc({ ...p, user: [UI.userParams({ name: "Мой роутер", type: "Mesh-система", std: "6", bands: ["2,4", "5"], wan: "1000", lan: "3", eirp: {}, mesh: "EasyMesh", u: "2", price: "9000", owned: false })] });
const us = UI.pick(ur, "U1", "own");
assert.ok(us && us.x.src === "Пользователь" && UI.render(ur, {}).includes('<optgroup label="Своё оборудование (G3)">'), "своё оборудование в списке «Свой выбор»");
assert.equal((UI.planSvg(us.P, us.x).match(/<circle /g) || []).length, us.x.n);
assert.ok(UI.ownX(ur, us, 1)[0].includes("Мой роутер") && UI.pvLabel(ur, us) === "Свой выбор");
// ошибки ввода
const bad = { ...UI.defaults(), area: "5", tariff: "", dev: { tv: "-1" } };
err = UI.toParams(bad).err;
assert.equal(err.length, 4, err.join(" | "));   // площадь, тариф, устройство, нет ни одного устройства
// своё оборудование (G3)
const u = UI.userParams({ name: " Мой роутер ", type: "Роутер", std: "6", bands: ["2,4", "5"], wan: "1000", lan: "4", eirp: { "2,4": "", "5": "21", "6": "" }, mesh: "", u: "1", price: "", owned: true });
assert.deepEqual(u, { name: "Мой роутер", type: "Роутер", std: "6", bands: ["2,4", "5"], wan: 1000, lan: 4, u: 1, eirp: { "5": 21 }, owned: true });
assert.equal(eng.userItem(u).est_fields.join(","), "cls,nss,ch,pw");
assert.throws(() => eng.userItem(UI.userParams({ name: "", type: "Роутер", std: "6", bands: [], wan: "1000", lan: "4" })), /name, bands/);

// 8. Вывод результата на всех 31 примере: без ошибок, без «undefined» и «NaN», на плане — узлы рекомендованного варианта
const cases = [...read("./fixtures/cases_i4_base.json").cases, ...read("./fixtures/cases_i4_spec.json").cases];
for (const c of cases) {
  r = eng.calc(structuredClone(c.input));
  const html = UI.render(r, { updated: "2026-11-03", kt: 21 });
  assert.ok(!/undefined|NaN/.test(html), `${c.id}: в выводе undefined или NaN`);
  assert.ok(html.includes(r.sh2.code) && html.includes("<svg"), c.id);
  for (const [, id] of html.matchAll(/data-g="([\w-]+)"/g)) assert.ok(GL.has(id), `${c.id}: нет термина ${id} в glossary.js`);
  if (r.rec.opt) {
    assert.ok(html.includes(r.rec.opt.name.replace(/&/g, "&amp;")), c.id);
    assert.equal((UI.planSvg(r, r.rec.opt).match(/<circle /g) || []).length, r.rec.opt.n, `${c.id}: узлов на плане`);
  }
  // таблица вариантов: только К Телеком (порядок Эконом → Оптимальный → Премиум) и своё оборудование
  const order = r.kt.rows.flatMap((v) => v.roles);
  assert.ok(r.kt.rows.every((v) => v.card.src === "К Телеком"), `${c.id}: в таблице вариантов только К Телеком`);
  assert.deepEqual(order, r.kt.fb ? ["fb"] : r.kt.rows.length ? order.slice().sort((x, y) => ["eco", "opt", "prem"].indexOf(x) - ["eco", "opt", "prem"].indexOf(y)) : [], `${c.id}: порядок вариантов`);
  if (r.counts.passed_kt) assert.deepEqual([r.kt.best.id, r.kt.best.n, r.kt.best.arch], [r.rec.opt.id, r.rec.opt.n, r.rec.opt.arch], `${c.id}: оптимальный = rec.opt`);
  // переключатель: каждый вариант кнопок и «Свой выбор» для любой модели ранжирования — узлов на плане = n, без undefined/NaN
  const s0 = UI.pvDefault(r);
  if (r.kt.best || r.rec.opt) assert.ok(s0 && s0.x.name === (r.kt.best || r.rec.opt).name, `${c.id}: по умолчанию — рекомендованный вариант`);
  for (const s of UI.pvButtons(r).map((b) => UI.pick(r, b.key, b.m)).concat(r.rank.map((x) => UI.pick(r, x.id, "own")))) {
    assert.ok(s && s.P.sh6.aps.length === s.x.n && s.P.map.pts.length > 0, `${c.id}: план варианта`);
    assert.equal((UI.planSvg(s.P, s.x).match(/<circle /g) || []).length, s.x.n, `${c.id}: узлов на плане — ${s.x.name}`);
    assert.ok(!/undefined|NaN/.test(UI.planView(r, s)), `${c.id}: ${s.x.name} — undefined или NaN`);
  }
}
// 10. Своя планировка (layout.js): типовой план, переданный как своя планировка, даёт тот же расчёт (код — со «*»);
// правки (сдвиг стены, деление, объединение, дверь, с нуля) проходят проверку, узлы — внутри квартиры
LA.init(PLD);
const inside = (pl, p) => p[0] >= -1e-9 && p[1] >= -1e-9 && p[0] <= pl.W + 1e-9 && p[1] <= pl.H + 1e-9;
for (const c of cases) {
  const r0 = eng.calc(structuredClone(c.input)), pl = LA.fromTemplate(PLD, r0.sh2.cls, r0.sh2.area);
  assert.deepEqual(LA.check(pl).err, [], `${c.id}: типовой план проходит проверку`);
  const r1 = eng.calc({ ...structuredClone(c.input), plan: pl });
  assert.equal(r1.sh2.code, r0.sh2.code + "*", `${c.id}: код своей планировки`);
  assert.ok(r1.geom.own && /изменён типовой план/.test(r1.sh2.own), c.id);
  const k = (r) => JSON.stringify([r.sh3 && r.sh3.B, r.rec.opt && [r.rec.opt.id, r.rec.opt.n, r.rec.opt.arch], r.kt.rows.map((v) => v.card.id + v.roles), r.rank.map((x) => [x.id, x.S]), r.counts]);
  assert.equal(k(r1), k(r0), `${c.id}: расчёт по типовому плану как своей планировке`);
  if (r0.rec.opt) near(r1.rec.opt.Pz, r0.rec.opt.Pz, 0.11, `${c.id}: P_z (округление координат до 0,1 мм)`);
  if (r0.sh6) r0.sh6.aps.forEach((a, i) => near(Math.hypot(a[0] - r1.sh6.aps[i][0], a[1] - r1.sh6.aps[i][1]), 0, 0.01, `${c.id}: место узла ${i + 1}`));
  assert.ok(!/undefined|NaN/.test(UI.render(r1, { updated: "2026-11-03", kt: 21 })), `${c.id}: вывод своей планировки`);
}
for (const cls of Object.keys(NE.PLAN_OF)) {
  const t = LA.fromTemplate(PLD, cls, null), ok = (pl, msg) => { assert.deepEqual(LA.check(pl).err, [], `${cls}: ${msg}`); for (const p of [pl.pos.center, ...pl.pos.sat, pl.pos.entry]) assert.ok(inside(pl, p), `${cls}: ${msg} — узел вне квартиры`); return pl; };
  assert.ok(LA.same(t, LA.fromTemplate(PLD, cls, null)) && LA.nsatOf(PLD, cls) === t.pos.sat.length, cls);
  // сдвиг каждой внутренней линии стен на 20 см в пределах допустимого диапазона
  const lines = new Map();
  for (const w of t.walls) { const s = LA.wseg(w); if (s && s.c > 0.01 && s.c < (s.o === "v" ? t.W : t.H) - 0.01) lines.set(s.o + s.c, s); }
  for (const s of lines.values()) {
    const e = LA.extentAt(t, s.o, s.c, (s.a + s.b) / 2, false); if (!e) continue;
    const [mn, mx] = LA.range(t, e), c2 = Math.min(mx, Math.max(mn, s.c + 0.2));
    const m = ok(LA.finish(LA.moveLine(t, e, c2)), `сдвиг линии ${s.o} = ${s.c} → ${c2}`);
    near(m.rooms.reduce((a, [, , rs]) => a + rs.reduce((b, r) => b + (r[2] - r[0]) * (r[3] - r[1]), 0), 0), t.W * t.H, 1e-6, `${cls}: площадь после сдвига`);
  }
  const big = t.rooms.findIndex(([, ty]) => ty === "ж");
  const sp = ok(LA.splitRoom(t, big, "v", "W2", true), "деление комнаты стеной с дверью");
  assert.equal(sp.rooms.length, t.rooms.length + 1);
  const mg = ok(LA.mergeRooms(sp, big, big + 1), "объединение обратно");
  assert.equal(mg.rooms.length, t.rooms.length);
  const wi = t.walls.findIndex((w) => w[4] === "W2" && Math.hypot(w[2] - w[0], w[3] - w[1]) >= 1.2);
  if (wi >= 0) ok(LA.insertDoor(t, wi, null), "дверь в перегородке");
  const ap = LA.autoPos(t, t.pos.sat.length, PLD.WT, true);
  assert.equal(ap.sat.length, t.pos.sat.length); for (const p of [ap.center, ...ap.sat]) assert.ok(inside(t, p), `${cls}: расстановка по правилам`);
  const r = eng.calc({ cls, plan: sp }), sc = LA.rescale(sp, 80);
  assert.ok(r.sh2.code === NE.PLAN_OF[cls] + "*" && r.rec.opt && !/undefined|NaN/.test(UI.render(r, {})), `${cls}: расчёт по изменённому плану`);
  near(sc.W * sc.H, 80, 0.01, `${cls}: план под площадь A2`); ok(sc, "пересчёт под площадь");
}
// с нуля: прямоугольник, деление стенами, проверка; ошибки проверки и формы
let nb = LA.blank(PLD, "К3", 60, 7.5, "низ", 0.4);
assert.deepEqual(LA.check(nb).err, []); assert.equal(nb.rooms.length, 1); near(nb.W * nb.H, 60, 1e-9, "с нуля: площадь");
nb = LA.splitRoom(LA.splitRoom(nb, 0, "v", "W1", true), 1, "h", "W2", true);
assert.deepEqual(LA.check(nb).err, []); assert.equal(nb.rooms.length, 3);
r = eng.calc({ cls: "К3", plan: nb });
assert.ok(r.sh2.code === "К3-*-П" && /с нуля/.test(r.sh2.own) && r.rec.opt, "код планировки с нуля");
const broken = structuredClone(nb); broken.rooms[1][2][0][2] += 1;
assert.ok(LA.check(broken).err.length > 0, "проверка ловит перекрытие и выход за контур");
assert.throws(() => eng.calc({ cls: "К3", plan: { ...nb, rooms: [] } }), /своя планировка/);
({ p, err } = UI.toParams({ ...UI.defaults(), area: "60", plan: nb, planErr: [] }));
assert.deepEqual(err, []); assert.ok(p.plan === nb && p.cls === "К3" && !("rooms" in p), "форма → параметры: своя планировка");
assert.match(UI.toParams({ ...UI.defaults(), plan: broken, planErr: LA.check(broken).err }).err.join(" | "), /^Планировка: /);
assert.ok(GL.has("layout") && LA.draw(nb).startsWith("<svg") && LA.draw(nb, { mini: true }).includes('aria-hidden="true"'));

// 11. Конструктор квартиры (layout.js): отражение, поворот, ширина, дверь, края комнат, обводка, типы стен
const eq = (a, b) => Math.abs(a - b) < 1e-6, sumA = (pl) => pl.rooms.reduce((a, [, , rs]) => a + rs.reduce((b, r) => b + (r[2] - r[0]) * (r[3] - r[1]), 0), 0);
for (const cls of Object.keys(NE.PLAN_OF)) {
  const t = LA.fromTemplate(PLD, cls, null), ok = (pl, msg) => { assert.deepEqual(LA.check(pl).err, [], `${cls}: ${msg}`); near(sumA(pl), pl.W * pl.H, 1e-6, `${cls}: ${msg} — площадь помещений`); return pl; };
  assert.equal(LA.badRooms(t).size, 0, `${cls}: в типовом плане нет слишком мелких помещений`);
  const tn = LA.normalize(structuredClone(t));   // отрезки стен на одной прямой — слитые
  for (const ax of ["x", "y"]) { const m = ok(LA.mirror(t, ax), `отражение ${ax}`); assert.ok(LA.same(LA.mirror(m, ax), tn), `${cls}: двойное отражение ${ax}`); }
  let ro = t; for (let i = 0; i < 4; i++) { ro = ok(LA.rotate(ro), `поворот ${i + 1}`); if (i === 0) assert.ok(eq(ro.W, t.H) && eq(ro.H, t.W), `${cls}: поворот меняет ширину и длину`); }
  assert.ok(LA.same(ro, tn), `${cls}: четыре поворота — исходный план`);
  const st = ok(LA.stretch(t, Math.round(t.W * 1.1 * 20) / 20), "другая ширина"); near(st.W * st.H, t.W * t.H, 0.01, `${cls}: площадь при другой ширине`);
  const dr = ok(LA.setDoor(t, "верх", 0.5), "дверь сверху"); assert.deepEqual(LA.doorSide(dr), { side: "верх", off: 0.5 }); assert.ok(inside(dr, dr.pos.entry), `${cls}: ввод у новой двери`);
  t.rooms.forEach((_, ri) => {
    const es = LA.roomEdges(t, ri);
    for (const e of es) { assert.ok(e.hi - e.lo > 0.05 && !eq(e.c, 0) && !eq(e.c, e.o === "v" ? t.W : t.H), `${cls}: край комнаты ${ri} внутри квартиры`);
      const [mn, mx] = LA.range(t, e), m = ok(LA.finish(LA.moveEdge(t, e, e.c + 0.2 * e.s)), `край ${ri} ${e.o} = ${e.c}`);
      if (mx - e.c >= 0.2 && e.c - mn >= 0.2) assert.ok(!LA.same(m, t), `${cls}: край ${ri} сдвинут`); }
    const rs = t.rooms[ri][2]; if (rs.length !== 1) return;
    const r = rs[0], w = r[2] - r[0];
    try { const m = ok(LA.finish(LA.roomSize(t, ri, "v", w - 0.1)), `ширина комнаты ${ri}`), r2 = m.rooms[ri][2]; if (r2.length === 1) near(r2[0][2] - r2[0][0], w - 0.1, 1e-6, `${cls}: ширина комнаты ${ri}`); }
    catch (e) { assert.match(e.message, /во всю|только у прямоугольной|короче|меньше|нельзя|упира/, `${cls}: размер комнаты ${ri}: ${e.message}`); }
  });
  const bi = t.rooms.findIndex(([, ty]) => ty === "ж"), R = t.rooms[bi][2][0], cx = Math.round((R[0] + R[2]) * 10) / 20, cy = Math.round((R[1] + R[3]) * 10) / 20, cr = [cx - 0.5, cy - 0.5, cx + 0.5, cy + 0.5], sr = LA.snapRect(t, cr);
  const cv = ok(LA.carve(t, cr, "х", "W2", true), "обводка новой комнаты"); assert.equal(cv.rooms.length, t.rooms.length + 1);
  const nr = cv.rooms[cv.rooms.length - 1]; assert.equal(nr[1], "х"); near(nr[2].reduce((a, r) => a + (r[2] - r[0]) * (r[3] - r[1]), 0), (sr[2] - sr[0]) * (sr[3] - sr[1]), 1e-6, `${cls}: площадь обведённой комнаты`);
  assert.ok(cv.walls.some((w) => w[4] === "W4"), `${cls}: у обведённой комнаты есть дверь`);
  const sn = LA.snapRect(t, [R[0] + 0.1, R[1] + 0.12, R[0] + 1.03, R[1] + 1.01]); assert.ok(eq(sn[0], R[0]) && eq(sn[1], R[1]) && eq(sn[2], R[0] + 1.05) && eq(sn[3], R[1] + 1), `${cls}: прилипание обводки ${sn}`);
  assert.throws(() => LA.carve(t, [cx - 0.1, cy - 0.1, cx + 0.1, cy + 0.1], "х"), /0,5 × 0,5/);
  const ps = LA.pieces(t); assert.ok(ps.length > 0 && ps.every((x) => x.b - x.a > 0.005), `${cls}: участки стен`);
  const pc = ps.find((x) => x.t === "W2" && x.b - x.a >= LA.DOOR + 0.1 && x.r1 !== x.r2);
  if (pc) {
    const op = ok(LA.setPieces(t, [pc], ""), "проём вместо стены"), m = (pc.a + pc.b) / 2;
    assert.ok(LA.pieces(op).some((x) => x.o === pc.o && eq(x.c, pc.c) && x.a <= m && x.b >= m && x.t === ""), `${cls}: участок без стены`);
    const w3 = ok(LA.setPieces(op, [pc], "W3"), "другой тип стены"); assert.ok(LA.pieces(w3).some((x) => x.o === pc.o && eq(x.c, pc.c) && x.a <= m && x.b >= m && x.t === "W3"));
    const dd = ok(LA.doorIn(w3, { ...pc, t: "W3" }, m), "дверь в участке"); assert.ok(dd.walls.some((w) => w[4] === "W4" && LA.wseg(w).o === pc.o && eq(LA.wseg(w).c, pc.c) && eq(LA.wseg(w).b - LA.wseg(w).a, LA.DOOR)), `${cls}: дверь ${LA.DOOR} м`);
    const r = eng.calc({ cls, plan: dd }); assert.ok(r.rec.opt && !/undefined|NaN/.test(UI.render(r, {})), `${cls}: расчёт после правки стен`);
  }
}

// 12. Картинка-подложка: рамка — контур квартиры; привязка следует за отражением, поворотом, шириной и площадью A2
{
  const fr = [100, 50, 900, 650], d = LA.frameSize(fr, 60, null), dL = LA.frameSize(fr, null, 8);
  near(d.W * d.H, 60, 1e-9, "по площади: площадь"); near(d.W / d.H, 800 / 600, 1e-9, "по площади: пропорции рамки"); assert.ok(dL.W === 8 && Math.abs(dL.H - 6) < 1e-9, "по ширине рамки");
  const bp = LA.blank(PLD, "К3", 60, d.W, "низ", 0.4); bp.bg = LA.bgFit(fr, 1000, 700, bp.W, bp.H);
  const at = (pl, u, v) => LA.bgAt(pl.bg.m, u, v), nearP = (a, b, eps, msg) => near(Math.hypot(a[0] - b[0], a[1] - b[1]), 0, eps, msg);
  nearP(at(bp, 100, 50), [0, 0], 1e-9, "рамка: левый верхний угол — угол контура"); nearP(at(bp, 900, 650), [bp.W, bp.H], 1e-9, "рамка: правый нижний угол");
  const mx = LA.mirror(bp, "x"), my = LA.mirror(bp, "y"), ro = LA.rotate(bp);
  nearP(at(mx, 100, 50), [mx.W, 0], 1e-6, "отражение слева направо: подложка"); nearP(at(my, 100, 50), [0, my.H], 1e-6, "отражение сверху вниз: подложка");
  nearP(at(ro, 100, 50), [ro.W, 0], 1e-6, "поворот: подложка"); nearP(at(ro, 900, 650), [0, ro.H], 1e-6, "поворот: подложка, другой угол");
  let r4x = bp; for (let i = 0; i < 4; i++) r4x = LA.rotate(r4x);
  r4x.bg.m.forEach((v, i) => near(v, bp.bg.m[i], 1e-6, "четыре поворота — та же привязка"));
  const sc = LA.rescale(bp, 75), st = LA.stretch(bp, 8);
  nearP(at(sc, 900, 650), [sc.W, sc.H], 1e-3, "новая площадь A2: подложка"); nearP(at(st, 900, 650), [st.W, st.H], 1e-6, "другая ширина: подложка");
  const cv = LA.carve(bp, [1, 1, 3.5, 3], "ж"); assert.deepEqual(cv.bg, bp.bg, "обводка не трогает подложку");
  assert.deepEqual(LA.check(cv).err, []); assert.ok(LA.same(LA.normalize(structuredClone(cv)), cv));
}

// 13. Предпросмотр сигнала в конструкторе (engine.js: preview, why; вкладка «Роутер» — layout-net.js): та же карта, что в расчёте,
// с точностью до ЭИИМ узла; разбор точки сходится с картой; расчёт И4 не меняется (31 пример — engine.test.mjs)
{
  let n = 0;
  for (const c of cases) {
    const r0 = eng.calc(structuredClone(c.input)); if (!r0.sh6 || !r0.map) continue;
    const pl = LA.fromTemplate(PLD, r0.sh2.cls, r0.sh2.area), r1 = eng.calc({ ...structuredClone(c.input), plan: pl });
    const Q = { plan: pl, cls: r0.sh2.cls, constr: c.input.constr, L_W1: c.input.L_W1 }, v = eng.preview(Q, r1.sh6.aps);
    assert.equal(v.pts.length, r1.map.pts.length, `${c.id}: предпросмотр — те же точки сетки`);
    const dP = v.pts.map((p, j) => { near(Math.hypot(p[0] - r1.map.pts[j][0], p[1] - r1.map.pts[j][1]), 0, 2e-3, `${c.id}: точка ${j}`); return p[2] - r1.map.pts[j][2]; });
    near(Math.max(...dP) - Math.min(...dP), 0, 0.15, `${c.id}: предпросмотр отличается от карты расчёта только ЭИИМ`);
    assert.ok(v.K >= 0 && v.K <= 100 && v.Kliv >= 0 && v.Kliv <= 100 && v.rooms.length === r1.sh12.points.length, `${c.id}: доли и комнаты`);
    if (++n >= 6) break;
  }
  assert.ok(n >= 3, "предпросмотр проверен на типовых планах");
  const pl = LA.fromTemplate(PLD, "К3", 62), Q = { plan: pl, cls: "К3" }, ap = pl.pos.center, one = eng.preview(Q, [ap]);
  assert.equal(one.E, NE.EIRP_DEF["5"], "ЭИИМ предпросмотра по умолчанию — 23 дБм");
  one.pts.forEach(([x, y, P]) => { const w = eng.why(one.g, ap, [x, y]); near(w.P, P, 0.1, `разбор точки ${x}, ${y} — как на карте`);
    near(w.E - w.fspl - w.walls.reduce((s, z) => s + z.L, 0), w.P, 1e-9, "разбор: ЭИИМ − расстояние − стены"); });
  const w0 = eng.why(one.g, ap, [ap[0] + 0.3, ap[1]]);
  assert.deepEqual(w0.walls, [], "рядом с узлом стен на пути нет"); near(w0.P, 23 - NE.fspl(1, 5500), 1e-9, "ближе 1 м — как на 1 м (4.2)");
  const far = one.pts.reduce((a, b) => (b[2] < a[2] ? b : a)), wf = eng.why(one.g, ap, [far[0], far[1]]);
  assert.ok(wf.walls.length > 0 && wf.walls.every((z) => z.L > 0 && one.g.WT[z.t]), "до самой слабой точки — стены с потерями из таблицы");
  const two = eng.preview(Q, [ap, pl.pos.sat[0]]);
  two.pts.forEach((p, j) => assert.ok(p[2] >= one.pts[j][2] - 1e-9, "второй узел не ослабляет сигнал"));
  assert.ok(two.K >= one.K, "со спутником покрытие не меньше");
  const kk = eng.preview({ ...Q, constr: "К" }, [ap]), kp = eng.preview({ ...Q, constr: "П" }, [ap]), kw = eng.preview({ ...Q, L_W1: 30 }, [ap]);
  assert.ok(kk.pts.some((p, j) => Math.abs(p[2] - kp.pts[j][2]) > 0.5), "тип дома меняет потери несущих стен");
  assert.ok(kw.pts.some((p, j) => p[2] < one.pts[j][2] - 1), "замер B1 учитывается в предпросмотре");
  assert.throws(() => eng.preview(Q, []), /нет узлов/);
}

// 9. Словарь терминов: у каждого термина есть пояснение и источник, каждый — ровно в одной группе раздела
const ids = Object.keys(GL.TERMS), grouped = GL.GROUPS.flatMap(([, g]) => g);
assert.deepEqual([...grouped].sort(), [...ids].sort(), "термины и группы раздела «Термины и обозначения»");
for (const id of ids) {
  const [term, text, src] = GL.TERMS[id];
  assert.ok(term && text.length > 30 && /И\d|движок/.test(src), `термин ${id}: нужны название, пояснение и источник`);
}
const sec = GL.section();
for (const id of ids) assert.ok(sec.includes(`id="g-${id}"`), `раздел: нет якоря g-${id}`);
assert.match(GL.q("tco"), /^<a class="gl-q" href="#g-tco" data-g="tco" aria-label="Пояснение: TCO 5 лет">\?<\/a>$/);
console.log("Калькулятор: формулы, вывод и подсказки проверены");
