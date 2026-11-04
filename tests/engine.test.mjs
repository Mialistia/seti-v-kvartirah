// Контрольные примеры движка И4 (docs/assets/js/engine.js): 31 пример отчёта И4 —
// 15 базовых (К1–К5 × бюджетный / оптимальный / премиальный) и 16 специальных случаев (S1–S16).
// Ожидаемые значения рассчитаны эталоном на Python (engine_i4.py). Каталог заморожен на 03.11.2026
// (tests/fixtures/equipment_i4.json), чтобы ежечасная выгрузка из Notion не меняла результат проверки.
import assert from "node:assert/strict";
import fs from "node:fs";
await import("../docs/assets/js/engine.js");
const NE = globalThis.NetEngine;
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));
const eng = NE.create({ plans: read("../docs/assets/data/plans.json"), catalog: read("./fixtures/equipment_i4.json") });
const cases = [...read("./fixtures/cases_i4_base.json").cases, ...read("./fixtures/cases_i4_spec.json").cases];
assert.equal(cases.length, 31, "должно быть 31 контрольный пример");
assert.equal(NE.REF_VERSION, read("./fixtures/cases_i4_base.json").version, "версия эталона");
assert.match(NE.VERSION, /^engine_i4 1\.\d+ /, "версия движка");

// Краткая сводка результата — те же поля, что в эталоне (cases_i4.py, функция brief)
function brief(r) {
  const o = r.rec.opt, a = r.arch_ref, rnd = NE.pyRound;
  const pick = (x, keys) => Object.fromEntries(keys.map((k) => [k, x[k]]));
  return { code: r.sh2.code, Ic_A: r.sh2.ic_A.Ic, Ldop_A: r.sh2.ic_A.Ldop, B: r.sh3.B, N: r.sh3.N,
    arch_ref: a ? a.arch : null, TCP_ref: a ? rnd(a.TCPz) : null, L_ref: a ? a.L : null, Pz_ref: a ? rnd(a.Pz, 1) : null,
    K_ref: a ? rnd(a[r.input.level === 3 ? "K95" : "K90"], 1) : null, flag: r.flag,
    opt: o ? pick(o, ["id", "name", "src", "n", "arch", "L", "TCPz", "Pz", "K90", "K95", "SNRz", "C", "capex", "opex", "tco", "rub_m2", "S", "notes"]) : null,
    alt: Object.fromEntries(["eco", "res", "best_market"].filter((k) => r.rec[k]).map((k) => [k, pick(r.rec[k], ["id", "name", "src", "n", "arch", "TCPz", "tco", "S"])])),
    user: (r.rec.user || []).map((u) => pick(u, ["name", "arch", "n", "TCPz", "tco", "S", "notes"])),
    user_excl: r.excluded.filter((x) => x.user), counts: r.counts, seg_note: r.seg_note ?? null, kt_fallback: r.rec.kt_fallback ?? null,
    best_effort: r.best_effort ?? null, robust: r.robust, tree: r.tree.map((t) => [t.arch, t.skip ? "skip" : t.ok ? "ok" : "нет", t.TCPz ?? null, t.L ?? null]) };
}
// Сравнение: строки и флаги — точно, числа — до 1e-9 (отличия только в последнем знаке double)
function same(a, b, path) {
  if (typeof a === "number" && typeof b === "number") {
    assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)), `${path}: ${a} ≠ ${b}`); return;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") { assert.equal(a ?? null, b ?? null, path); return; }
  assert.equal(Array.isArray(a), Array.isArray(b), path);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) same(a[k], b[k], `${path}.${k}`);
}
for (const c of cases) same(brief(eng.calc(structuredClone(c.input))), c.expect, c.id);

// Пример К3-2 из отчёта И4: двухкомнатная «распашонка», оптимальный уровень, тариф 500 Мбит/с
const r = eng.calc({ cls: "К3", level: 2, tariff: 500 });
assert.equal(r.sh2.code, "К3-Р-П");
assert.equal(r.sh3.B, 334.45);
assert.equal(r.arch_ref.arch, "В-радио");
assert.deepEqual([r.rec.opt.name, r.rec.opt.n, r.rec.opt.arch, r.rec.opt.TCPz, r.rec.opt.tco, r.rec.opt.S], ["Mercusys MR1500X", 2, "В-радио", 320, 13880, 0.725]);
assert.deepEqual([r.counts.total, r.counts.passed, r.counts.passed_kt], [67, 26, 4]);
// Своё оборудование с ошибкой — понятное сообщение
assert.throws(() => eng.calc({ cls: "К3", user: [{ name: "X", type: "Роутер", std: 6, bands: ["5"], wan: 300, lan: 2 }] }), /скорость WAN/);
console.log(`Движок И4: контрольных примеров — ${cases.length}, все совпали с эталоном`);
