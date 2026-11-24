import assert from "node:assert/strict";
import fs from "node:fs";
await import("../docs/assets/js/engine.js");
await import("../docs/assets/js/glossary.js");
await import("../docs/assets/js/plan.js");
await import("../docs/assets/js/layout.js");
await import("../docs/assets/js/calc.js");

const NE = globalThis.NetEngine, UI = globalThis.NetCalcUI;
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));
const eng = NE.create({ plans: read("../docs/assets/data/plans.json"), catalog: read("./fixtures/equipment_i4.json") });
const input = { ...UI.defaults(), level: 1 };
const user = UI.userParams({ name: "Низкий ЭИИМ", type: "Mesh-система", std: "6", bands: ["2,4", "5"], wan: "1000", lan: "4", cls: "AX3000", eirp: { "5": "18" }, mesh: "EasyMesh", u: "2", price: "9000", owned: true });
const base = eng.calc(input);
const changed = eng.calc({ ...input, user: [user] });
const selected = UI.pick(changed, "U1", "own");
assert.ok(selected, "свой роутер проходит подбор на бюджетном уровне");
const colors = (s) => [...UI.planSvg(s.P, s.x).matchAll(/<rect[^>]*fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
assert.notDeepEqual(colors(UI.pvDefault(base)), colors(selected), "смена ЭИИМ пересчитывает тепловую карту");
assert.match(UI.planView(changed, selected), /Карта пересчитывается для выбранной модели/);

console.log("Покрытие: смена радиопараметров роутера обновляет карту");
