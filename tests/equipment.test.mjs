// Контрольные примеры подбора оборудования и выгрузки базы «Оборудование К Телеком».
// Запускаются в проверке сборки (check.yml).
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromNotionPage, toJson } from "../scripts/equipment.mjs";
await import("../docs/assets/js/calc.js");
const { pickEquipment, buildKits } = globalThis.NetCalc;

// 1. Перевод записи Notion (формат API) в запись equipment.json
const T = (s) => [{ plain_text: s }];
const page = { properties: {
  "Модель": { title: T("Mercusys Halo H30G (3-pack)") }, "№": { number: 4 }, "Производитель": { select: { name: "Mercusys" } },
  "Тип": { select: { name: "Mesh-система" } }, "Wi-Fi": { select: { name: "Wi-Fi 5" } },
  "Диапазоны": { multi_select: [{ name: "2.4 ГГц" }, { name: "5 ГГц" }] }, "LAN, шт": { number: 6 },
  "Тариф до, Мбит/с": { number: 500 }, "Тариф (как в таблице)": { rich_text: T("100 / 500 Мбит/с") },
  "Активных устройств": { rich_text: T("15–30") }, "Площадь до, м²": { number: 150 }, "Mesh": { select: { name: "только Halo" } },
  "VPN": { checkbox: true }, "Цена, ₽": { number: 12900 }, "Заказ партии в офис": { select: { name: "да" } },
  "Нет в каталоге сайта": { checkbox: false }, "Данные на": { date: { start: "2026-11-03" } },
} };
const it = fromNotionPage(page);
assert.equal(it.model, "Mercusys Halo H30G (3-pack)");
assert.equal(it.nodes, 3);
assert.equal(it.wifi, 5);
assert.deepEqual(it.bands, ["2.4", "5"]);
assert.equal(it.clients, 30);
assert.equal(it.mesh, "halo");
assert.equal(it.order, true);
assert.equal(fromNotionPage({ properties: { "Модель": { title: T("Без цены") } } }), null); // неполная запись пропускается
assert.equal(JSON.parse(toJson([it], "notion")).items[0].price, 12900);
const sale = fromNotionPage({ properties: { ...page.properties, "Заказ партии в офис": { select: { name: "нет — распродажа остатков" } } } });
assert.equal(sale.order, false);

// 2. Файл данных сайта
const data = JSON.parse(fs.readFileSync(new URL("../docs/assets/data/equipment.json", import.meta.url), "utf8"));
const eq = data.items;
assert.ok(eq.length >= 10, "в equipment.json слишком мало моделей");
for (const m of eq) for (const f of ["model", "type", "price", "tariff", "area", "clients", "wifi"]) assert.ok(m[f] !== null && m[f] !== undefined && m[f] !== "", `${m.model}: нет поля ${f}`);

const base = { nodes: 1, area: 55, segment: "optimum", devices: 10, tariff: 300, vpn: false, budget: 0, wired: false, outdoor: false };
const names = (r) => r.variants.flatMap((v) => v.kit.items.map((i) => i.m.model));
// 3. Двухкомнатная, один узел: только одиночные устройства, без распродажи и без Wi-Fi 4
let r = pickEquipment(eq, base);
assert.ok(r.variants.length >= 1);
for (const v of r.variants) {
  assert.equal(v.kit.nodes, 1);
  assert.ok(v.kit.items.every((i) => i.m.order && i.m.wifi >= 5 && i.m.tariff >= 300));
}
assert.ok(!buildKits(eq, { ...base, area: 40 }).some((k) => k.main.nodes > 1), "Mesh-комплект не нужен, когда хватает одного узла");
// 4. Бюджетный сегмент: Wi-Fi 4 допускается, распродажа — нет
r = pickEquipment(eq, { ...base, area: 30, segment: "budget", tariff: 60, devices: 5 });
const econ = r.variants.find((v) => v.labels.includes("эконом")).kit;
assert.equal(econ.wifi, 4);
assert.ok(econ.items.every((i) => i.m.order));
assert.ok(r.excluded["снят с заказа (распродажа остатков)"] >= 1);
// 5. Два узла по радио, тариф 300: Halo не проходит (100 Мбит/с по радио), с кабелем — проходит
const mesh = { ...base, nodes: 2, area: 85, devices: 15 };
const halo = (rr) => buildKits(eq, rr).filter((k) => k.main.mesh === "halo");
assert.ok(halo(mesh).length >= 1);
assert.ok(halo(mesh).every((k) => k.far < 300));
assert.ok(halo({ ...mesh, wired: true }).every((k) => k.far >= 300));
r = pickEquipment(eq, mesh);
for (const v of r.variants) assert.ok(v.kit.nodes >= 2 && v.kit.mesh && v.kit.far >= 300);
// 6. Нужен VPN — модели без VPN исключаются; бюджет ограничивает цену
r = pickEquipment(eq, { ...base, tariff: 100, vpn: true, budget: 4000 });
for (const v of r.variants) { assert.ok(v.kit.main.vpn); assert.ok(v.kit.price <= 4000); }
assert.ok(r.excluded["нет VPN"] >= 1);
// 7. Невыполнимые требования — вариантов нет, показываются ближайшие
r = pickEquipment(eq, { ...base, nodes: 3, area: 120, tariff: 1000, budget: 3000 });
assert.equal(r.variants.length, 0);
assert.ok(r.nearest.length >= 1);
// 8. Улица — уличная точка доступа с заказом партии
assert.equal(pickEquipment(eq, { ...base, outdoor: true }).outdoor?.type, "Уличная точка доступа");
console.log(`Подбор оборудования: контрольные примеры пройдены (моделей в файле: ${eq.length}; источник: ${data.source}, данные на ${data.updated})`);
