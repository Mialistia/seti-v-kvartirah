// Формулы методики И4 и функции интерфейса калькулятора (без браузера): запускаются в проверке сборки (check.yml).
import assert from "node:assert/strict";
import fs from "node:fs";
await import("../docs/assets/js/engine.js");
await import("../docs/assets/js/calc.js");
const NE = globalThis.NetEngine, UI = globalThis.NetCalcUI;
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));
const eng = NE.create({ plans: read("../docs/assets/data/plans.json"), catalog: read("./fixtures/equipment_i4.json") });
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
// 4. Допустимые потери в стенах: L_доп = ЭИИМ − L_св(d) − P_пор − z·σ
near(eng.Ldop(7.67, -67), 23 - NE.fspl(7.67, 5500) + 67 - 1.28 * 5.01, 1e-9, "L_доп");
assert.equal(NE.pyRound(eng.Ldop(7.67, -67), 1), 18.6);
// 5. Класс квартиры по числу комнат и площади (п. 4.7)
for (const [rooms, area, cls] of [[0, 30, "К1"], [1, 40, "К2"], [2, 55, "К3"], [3, 75, "К4"], [4, 100, "К5"], [3, 95, "К5"]]) assert.equal(eng.classify(rooms, area)[0], cls, `${rooms} комн., ${area} м²`);
assert.match(eng.classify(1, 60)[1], /вне ориентира класса К2/);
// 6. Округление как в Python (банковское) и процентиль numpy
assert.deepEqual([NE.pyRound(0.125, 2), NE.pyRound(2.5), NE.pyRound(3.5), NE.pyRound(-1.25, 1)], [0.12, 2, 4, -1.2]);
assert.equal(NE.pct10([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 1.9);

// 7. Форма → параметры движка: значения по умолчанию дают пример К3-2 отчёта И4
let { p, err } = UI.toParams(UI.defaults());
assert.deepEqual(err, []);
let r = eng.calc(p);
assert.equal(r.sh2.code, "К3-Р-П");
assert.deepEqual([r.rec.opt.name, r.rec.opt.n, r.rec.opt.arch], ["Mercusys MR1500X", 2, "В-радио"]);
// ошибки ввода
const bad = { ...UI.defaults(), area: "5", tariff: "", dev: { tv: "-1" } };
err = UI.toParams(bad).err;
assert.equal(err.length, 4, err.join(" | "));   // площадь, тариф, устройство, нет ни одного устройства
// своё оборудование (G3)
const u = UI.userParams({ name: " Мой роутер ", type: "Роутер", std: "6", bands: ["2,4", "5"], wan: "1000", lan: "4", eirp: { "2,4": "", "5": "21", "6": "" }, mesh: "", u: "1", price: "", owned: true });
assert.deepEqual(u, { name: "Мой роутер", type: "Роутер", std: "6", bands: ["2,4", "5"], wan: 1000, lan: 4, u: 1, eirp: { "5": 21 }, owned: true });
assert.equal(eng.userItem(u).est_fields.join(","), "cls,nss,ch,pw");
assert.throws(() => eng.userItem(UI.userParams({ name: "", type: "Роутер", std: "6", bands: [], wan: "1000", lan: "4" })), /name, bands/);

// 8. Вывод результата на всех 31 примере: без ошибок, без «undefined» и «NaN», на плане — узлы оптимума
const cases = [...read("./fixtures/cases_i4_base.json").cases, ...read("./fixtures/cases_i4_spec.json").cases];
for (const c of cases) {
  r = eng.calc(structuredClone(c.input));
  const html = UI.render(r, { updated: "2026-11-03", kt: 21 });
  assert.ok(!/undefined|NaN/.test(html), `${c.id}: в выводе undefined или NaN`);
  assert.ok(html.includes(r.sh2.code) && html.includes("<svg"), c.id);
  if (r.rec.opt) {
    assert.ok(html.includes(r.rec.opt.name.replace(/&/g, "&amp;")), c.id);
    assert.equal((UI.planSvg(r, r.rec.opt).match(/<circle /g) || []).length, r.rec.opt.n, `${c.id}: узлов на плане`);
  }
}
console.log("Калькулятор: формулы и вывод проверены");
