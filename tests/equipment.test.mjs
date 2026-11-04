// Выгрузка базы Notion «Оборудование К Телеком» в каталог калькулятора и проверка docs/assets/data/equipment.json.
// В check.yml запускается дважды: до выгрузки (файл из репозитория) и после (свежие данные Notion).
import assert from "node:assert/strict";
import fs from "node:fs";
import { fromNotionPage, toJson, checkItem, missing, MIN_ITEMS } from "../scripts/equipment.mjs";
await import("../docs/assets/js/engine.js");
const NE = globalThis.NetEngine;
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));

// 1. Перевод записи Notion (формат API); записи базы на 03.11.2026
const T = (s) => ({ title: [{ plain_text: s }] }), RT = (s) => ({ rich_text: s ? [{ plain_text: s }] : [] }), S = (s) => ({ select: s ? { name: s } : null });
const M = (a) => ({ multi_select: a.map((name) => ({ name })) }), N = (x) => ({ number: x }), C = (b) => ({ checkbox: b });
const page = (o) => ({ properties: {
  "№": N(o.n), "Модель": T(o.m), "Производитель": S(o.br), "Тип": S(o.t), "Wi-Fi": S(o.wf), "Класс скорости": RT(o.cls), "Диапазоны": M(o.bands),
  "Скорость клиента 2×2, Мбит/с": N(o.r2), "MIMO 5 ГГц, потоков": N(o.nss ?? null), "Канал макс., МГц": N(o.ch), "WAN, Мбит/с": N(o.wan ?? null), "LAN, шт": N(o.lan),
  "LAN ≥ 2,5 Гбит/с": C(false), "Узлов в комплекте": N(o.u), "Mesh-протокол": S(o.mp), "Источник модели": M(o.src), "Цена, ₽": N(o.pk ?? null),
  "Цена рынка (медиана), ₽": N(o.pm ?? null), "ЭИИМ 2,4 ГГц, дБм": N(o.e24 ?? null), "ЭИИМ 5 ГГц, дБм": N(o.e5 ?? null), "ЭИИМ 6 ГГц, дБм": N(null),
  "Тариф до, Мбит/с": N(o.tar ?? null), "Потребление узла, Вт": N(o.pw ?? null), "VPN": C(!!o.vpn), "Функции (И3)": RT(o.fn), "Пакет (И3)": M(o.pak || []),
  "Нет в каталоге сайта": C(!!o.nocat), "Заказ партии в офис": S(o.ord), "Активных устройств": RT(o.dev), "Данные на": { date: { start: "2026-11-03" } } } });
const mr = { n: 1, m: "Mercusys MR1500X", br: "Mercusys", t: "Роутер", wf: "Wi-Fi 6", cls: "AX1500", bands: ["2.4 ГГц", "5 ГГц"], r2: 1201, nss: 2, ch: 80,
  wan: 1000, lan: 4, u: 1, mp: "EasyMesh", src: ["К Телеком"], pk: 4400, tar: 1000, vpn: true, ord: "да", dev: "60–100+" };
let e = fromNotionPage(page(mr));
assert.deepEqual(checkItem(e), []);
assert.deepEqual([e.id, e.src, e.std, e.bands, e.price, e.pw, e.pw_default, e.vpn, e.iptv, e.dev_max, e.tariff_max, e.sale_off, e.date],
  [1, "К Телеком", 6, ["2,4", "5"], 4400, 6, true, 1, null, 100, 1000, false, "2026-11-03"]);
// модель рынка: цена — медиана продавцов, функции из «Функции (И3)»
e = fromNotionPage(page({ n: 22, m: "Huawei WiFi AX2 (WS7001-22)", br: "Huawei", t: "Роутер", wf: "Wi-Fi 6", cls: "AX1500", bands: ["2.4 ГГц", "5 ГГц"], r2: 1201, nss: 2,
  ch: 80, wan: 1000, lan: 2, u: 1, mp: "Huawei Mesh", src: ["Рынок (И3)"], pm: 2999, pw: 6, fn: "IPTV — частично; VPN — нет; USB — нет; ПО — частично", pak: ["П1 — альтернатива"] }));
assert.deepEqual([e.src, e.price, e.pw_default, e.iptv, e.vpn, e.usb, e.fw, e.pkg], ["Рынок", 2999, false, 0.5, 0, 0, 0.5, ["П1 — альтернатива"]]);
// Mesh-комплект Halo: спутник с портами 100 Мбит/с, ЭИИМ из datasheet, нет карточки на сайте
e = fromNotionPage(page({ n: 6, m: "Mercusys Halo H1200G (2-pack)", br: "Mercusys", t: "Mesh-система", wf: "Wi-Fi 5", cls: "AC1200", bands: ["2.4 ГГц", "5 ГГц"], r2: 867,
  nss: 2, ch: 80, wan: 1000, lan: 4, u: 2, mp: "Halo", src: ["К Телеком"], pk: 7900, e24: 20, e5: 23, tar: 500, vpn: true, nocat: true, ord: "да", dev: "15–30" }));
assert.deepEqual([e.u, e.sat_port, e.eirp, e.nocat, e.dev_max], [2, 100, { "2,4": 20, "5": 23, "6": null }, true, 30]);
// распродажа остатков; Wi-Fi 4 без MIMO — по умолчанию 2 потока
e = fromNotionPage(page({ n: 17, m: "TP-Link TL-WR850N", br: "TP-Link", t: "Роутер", wf: "Wi-Fi 4", cls: "N300", bands: ["2.4 ГГц"], r2: 300, ch: 40, wan: 100, lan: 4, u: 1,
  mp: "нет", src: ["К Телеком"], pk: 2100, tar: 60, vpn: true, nocat: true, ord: "нет — распродажа остатков", dev: "5–10" }));
assert.deepEqual([e.sale_off, e.nss, e.std, e.pw], [true, 2, 4, 4]);
// неполные записи не попадают в каталог
assert.equal(fromNotionPage(page({ ...mr, pk: null })), null);
assert.deepEqual(missing(page({ ...mr, pk: null, wan: null })), ["WAN, Мбит/с", "Цена, ₽"]);
assert.equal(fromNotionPage({ properties: {} }), null);

// 2. Файл: одна модель — одна строка, сортировка по №
const out = toJson([{ ...fromNotionPage(page(mr)), id: 5 }, fromNotionPage(page(mr))], "test");
assert.equal(out.split("\n").length, 5);
const parsed = JSON.parse(out);
assert.deepEqual([parsed.format, parsed.updated, parsed.count, parsed.kt, parsed.items.map((i) => i.id)], ["engine_i4", "2026-11-03", 2, 2, [1, 5]]);

// 3. docs/assets/data/equipment.json — годится для движка
const data = read("../docs/assets/data/equipment.json");
assert.equal(data.format, "engine_i4", "equipment.json в старом формате");
assert.ok(data.items.length >= MIN_ITEMS, "в equipment.json слишком мало моделей");
for (const it of data.items) assert.deepEqual(checkItem(it), [], `${it.name}: неверные поля`);
assert.equal(new Set(data.items.map((i) => i.id)).size, data.items.length, "номера моделей повторяются");
assert.ok(data.items.some((i) => i.src === "К Телеком"), "нет моделей парка К Телеком");

// 4. Дымовой расчёт 15 базовых примеров на этом каталоге: без ошибок; архитектура Ш5 от каталога не зависит
const eng = NE.create({ plans: read("../docs/assets/data/plans.json"), catalog: data });
let withOpt = 0;
for (const c of read("./fixtures/cases_i4_base.json").cases) {
  const r = eng.calc(structuredClone(c.input));
  assert.equal(r.arch_ref?.arch ?? null, c.expect.arch_ref, `${c.id}: архитектура`);
  assert.equal(r.counts.total, data.items.length);
  if (r.rec.opt) withOpt++;
}
assert.ok(withOpt >= 10, `вариант найден только в ${withOpt} из 15 базовых примеров`);
console.log(`Оборудование: моделей ${data.items.length}, расчёт 15 базовых примеров — вариант найден в ${withOpt}`);
