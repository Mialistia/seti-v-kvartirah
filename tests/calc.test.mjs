// Контрольные примеры калькулятора: запускаются в проверке сборки (check.yml).
import assert from "node:assert/strict";
await import("../docs/assets/js/calc.js");
const { compute } = globalThis.NetCalc;
const base = { area: 55, rooms: 2, layout: "Р", build: "П", dist: 9, walls: {}, dev: {}, cable: false,
  plc: "unknown", segment: "optimum", eirp: 20, z: 1.28, sigma: 6, kOdn: 0.7, kZap: 0.3 };
// 1. Двухкомнатная без стен — класс К3, хватает одного роутера
let r = compute(base);
assert.equal(r.code, "К3-Р-П");
assert.equal(r.oneOk, true);
// 2. Две бетонные стены 16 см — одного роутера мало, нужен Mesh
r = compute({ ...base, walls: { conc16: 2 } });
assert.equal(r.oneOk, false);
assert.ok(r.nodes >= 2);
// 3. Студия — класс К1; 4 комнаты — К5
assert.equal(compute({ ...base, rooms: 0 }).cls, 1);
assert.equal(compute({ ...base, rooms: 4 }).cls, 5);
// 4. Требуемая скорость (4.13): 2 ТВ 4K → 0,7 · 50 · 1,3 = 45,5 Мбит/с
assert.equal(Math.round(compute({ ...base, dev: { tv4k: 2 } }).breq * 10) / 10, 45.5);
console.log("Калькулятор: контрольные примеры пройдены");
