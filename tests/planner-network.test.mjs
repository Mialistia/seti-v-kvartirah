import assert from "node:assert/strict";
import fs from "node:fs";
await import("../docs/assets/js/engine.js");
await import("../docs/assets/js/glossary.js");
await import("../docs/assets/js/plan.js");
await import("../docs/assets/js/layout.js");

const LA = globalThis.NetLayout, NE = globalThis.NetEngine;
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));
const PLD = read("../docs/assets/data/plans.json");
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
LA.init(PLD);

let plan = LA.blank(PLD, "К3", 60, 10, "низ", 0.4);
assert.equal(plan.network.length, 1, "новый план содержит основной роутер");
assert.equal(plan.network[0].type, "router");
assert.equal(plan.network[0].uplink, "entry");

const routerId = plan.network[0].id;
plan = LA.addDevice(plan, "switch", [3.123, 4.567], { name: "Коммутатор 8 портов", ports: 8, poe: 60, uplink: routerId });
const sw = plan.network.find((d) => d.type === "switch");
assert.ok(sw && sw.id !== routerId, "коммутатор получает отдельный ID");
near(sw.pos[0], 3.1); near(sw.pos[1], 4.55);
assert.equal(sw.ports, 8); assert.equal(sw.poe, 60); assert.equal(sw.uplink, routerId);

plan = LA.addDevice(plan, "ap", [6.25, 2.05], { name: "Точка доступа", uplink: sw.id });
const ap = plan.network.find((d) => d.type === "ap");
assert.ok(ap && ap.uplink === sw.id, "точка доступа подключена к коммутатору");

plan = LA.updateDevice(plan, sw.id, { ports: 16, poe: 120, name: "Коммутатор PoE" });
const updated = plan.network.find((d) => d.id === sw.id);
assert.equal(updated.ports, 16); assert.equal(updated.poe, 120); assert.equal(updated.name, "Коммутатор PoE");
assert.throws(() => LA.updateDevice(plan, sw.id, { ports: 0 }), /ports|порт/i);
assert.throws(() => LA.updateDevice(plan, sw.id, { uplink: sw.id }), /сам|себе|uplink/i);
assert.throws(() => LA.updateDevice(plan, ap.id, { uplink: ap.id }), /сам|себе|uplink/i);

plan = LA.moveDevice(plan, sw.id, [7.777, 1.111]);
near(plan.network.find((d) => d.id === sw.id).pos[0], 7.8);
near(plan.network.find((d) => d.id === sw.id).pos[1], 1.1);
assert.equal(LA.deviceAt(plan, [7.8, 1.1], 0.2).id, sw.id, "устройство находится на плане");

const mirrored = LA.mirror(plan, "x");
near(mirrored.network.find((d) => d.id === sw.id).pos[0], plan.W - 7.8);
const scaled = LA.rescale(plan, 120);
near(scaled.network.find((d) => d.id === sw.id).pos[0], 7.8 * Math.sqrt(2), 0.001);

const withoutSwitch = LA.removeDevice(plan, sw.id);
assert.ok(!withoutSwitch.network.some((d) => d.id === sw.id));
assert.equal(withoutSwitch.network.find((d) => d.id === ap.id).uplink, "entry", "uplink точки доступа не остаётся битым");

const catalog = read("./fixtures/equipment_i4.json");
const eng = NE.create({ plans: PLD, catalog });
const base = LA.blank(PLD, "К3", 60, 10, "низ", 0.4);
const withNetwork = LA.addDevice(base, "switch", [4, 4], { uplink: base.network[0].id });
const r1 = eng.calc({ cls: "К3", plan: base });
const r2 = eng.calc({ cls: "К3", plan: withNetwork });
assert.deepEqual([r1.rec.opt.name, r1.rec.opt.n, r1.rec.opt.arch], [r2.rec.opt.name, r2.rec.opt.n, r2.rec.opt.arch], "сетевые объекты не меняют расчёт И4");
assert.equal(LA.same(base, withNetwork), false, "изменение сети делает планировку своей");

console.log("Планировщик: роутеры, коммутаторы, точки доступа и соединения проверены");
