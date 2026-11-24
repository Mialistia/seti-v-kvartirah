import assert from "node:assert/strict";
import fs from "node:fs";
await import("../docs/assets/js/engine.js");
await import("../docs/assets/js/glossary.js");
await import("../docs/assets/js/plan.js");
await import("../docs/assets/js/layout.js");

const LA = globalThis.NetLayout;
const PLD = JSON.parse(fs.readFileSync(new URL("../docs/assets/data/plans.json", import.meta.url), "utf8"));
LA.init(PLD);
const copy = (v) => JSON.parse(JSON.stringify(v));
const valid = () => LA.blank(PLD, "К3", 60, 10, "низ", 0.4);

const accepted = LA.validatePlan(valid());
assert.equal(accepted.network[0].id, "R1");
assert.equal(LA.parsePlanText(JSON.stringify({ netcalc_plan: 1, plan: valid() })).network[0].type, "router");
assert.equal(LA.parsePlanText(JSON.stringify(valid())).W, valid().W);

const infinite = valid();
infinite.rooms[0][2][0][0] = Infinity;
assert.throws(() => LA.validatePlan(infinite), /конеч|числ/i);

const maliciousPorts = valid();
maliciousPorts.network[0].ports = '1"><img src=x onerror=alert(1)>';
assert.throws(() => LA.validatePlan(maliciousPorts), /порт/i);

const badPosition = valid();
badPosition.network[0].pos = [1, 2, 3];
assert.throws(() => LA.validatePlan(badPosition), /координат|позици/i);

const badUplink = valid();
badUplink.network[0].uplink = "missing";
assert.throws(() => LA.validatePlan(badUplink), /uplink|подключ/i);

const tooManyRooms = valid();
tooManyRooms.rooms = Array.from({ length: 100 }, (_, i) => [`Комната ${i}`, "ж", [[0, 0, 10, 6]]]);
assert.throws(() => LA.validatePlan(tooManyRooms), /помещ|мног/i);

const malformedNetwork = valid();
malformedNetwork.network = {};
assert.throws(() => LA.validatePlan(malformedNetwork), /сетев|устройств|network/i);

const tooManyZones = valid();
tooManyZones.rooms = Array.from({ length: 64 }, (_, i) => [`Комната ${i}`, "ж", Array.from({ length: 34 }, () => [0, 0, 10, 6])]);
assert.throws(() => LA.validatePlan(tooManyZones), /зон|мног/i);

assert.throws(() => LA.parsePlanText(" ".repeat(3 * 1024 * 1024)), /больш|размер/i);
const invalidFixture = fs.readFileSync(new URL("./fixtures/invalid-plan.json", import.meta.url), "utf8");
assert.throws(() => LA.parsePlanText(invalidFixture), /помещ|проверк/i);

const externalImage = { src: "https://example.invalid/plan.svg", iw: 100, ih: 100, name: "plan.svg" };
assert.throws(() => LA.validateImage(externalImage), /data:image|формат/i);
assert.throws(() => LA.validateImage({ ...externalImage, src: "data:image/svg+xml,<svg/>" }), /data:image|формат/i);
assert.throws(() => LA.validateImage({ src: `data:image/jpeg;base64,${"A".repeat(5 * 1024 * 1024)}`, iw: 100, ih: 100 }), /больш|размер/i);

const safeImage = { src: "data:image/jpeg;base64,AAAA", iw: 100, ih: 80, name: "plan.jpg" };
assert.deepEqual(LA.validateImage(safeImage), safeImage);

const badMatrix = valid();
badMatrix.bg = { iw: 100, ih: 80, m: [1, 0, 0, 1, Infinity, 0] };
assert.throws(() => LA.validatePlan(badMatrix), /подлож|матриц|конеч/i);

const safeMatrix = valid();
safeMatrix.bg = { iw: 100, ih: 80, m: [0.1, 0, 0, 0.125, -2, -1] };
assert.equal(LA.validatePlan(safeMatrix).bg.m[4], -2);

const legacy = valid();
delete legacy.network;
assert.equal(LA.validatePlan(legacy).network[0].id, "R1", "старый план получает основное сетевое устройство");

console.log("Планировщик: импорт JSON, сеть и подложка отклоняют небезопасные данные");
