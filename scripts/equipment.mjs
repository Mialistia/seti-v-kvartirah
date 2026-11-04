// Перевод записи базы Notion «Оборудование К Телеком» в запись каталога калькулятора (docs/assets/data/equipment.json).
// Формат записи — как в движке расчёта И4 (docs/assets/js/engine.js); правила те же, что в эталоне на Python (отчёт И4).
// Используется в scripts/sync.mjs и в tests/equipment.test.mjs.
export const EQUIPMENT_DB_DEFAULT = "6f5df9461b6643f4a99ff5519f134c54";
export const EQUIPMENT_FILE = "docs/assets/data/equipment.json";
export const MIN_ITEMS = 10;   // если подходящих записей меньше, выгрузка считается неудачной и остаётся прежний файл

const STD = { "Wi-Fi 4": 4, "Wi-Fi 5": 5, "Wi-Fi 6": 6, "Wi-Fi 6E": 6, "Wi-Fi 7": 7 };
// Потребление узла, Вт, если в базе не указано: медианы рынка И3 по классу скорости (допущение для парка), иначе 7 Вт
export const PW_CLASS = { N300: 4, AC750: 5, AC1200: 6, AC1300: 6, AX1500: 6, AX1800: 6, AX3000: 7, BE3600: 8 };
// Порты спутника, Мбит/с, если они медленнее порта корневого узла (Halo H1200 — 10/100 Мбит/с, реестр источников № 82)
export const SAT_PORT = { "Mercusys Halo H1200G (2-pack)": 100 };

const txt = (p) => (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text).join("").trim();
const sel = (p) => p?.select?.name ?? null;
const multi = (p) => (p?.multi_select ?? []).map((o) => o.name);
const num = (p) => (typeof p?.number === "number" ? p.number : null);
const chk = (p) => !!p?.checkbox;
const lastNum = (s) => { const m = String(s ?? "").match(/\d+/g); return m ? +m[m.length - 1] : null; };
// «Функции (И3)»: «IPTV — да; VPN — частично; USB — нет; ПО — да» → 1 / 0,5 / 0; нет текста или пункта — null
function fnVal(text, key) {
  const m = text ? text.match(new RegExp(key + " — (да|частично|нет)")) : null;
  return m ? { "да": 1.0, "частично": 0.5, "нет": 0.0 }[m[1]] : null;
}
const BAND = (b) => (b.startsWith("2") ? "2,4" : b.startsWith("5") ? "5" : b.startsWith("6") ? "6" : null);

// Причины, по которым запись не попадает в каталог (пустой список — запись подходит)
export function missing(page) {
  const p = page.properties ?? {}, kt = multi(p["Источник модели"]).includes("К Телеком");
  const price = kt && num(p["Цена, ₽"]) ? num(p["Цена, ₽"]) : num(p["Цена рынка (медиана), ₽"]);
  const r = [];
  if (num(p["№"]) === null) r.push("№");
  if (!txt(p["Модель"])) r.push("Модель");
  if (!sel(p["Тип"])) r.push("Тип");
  if (!(sel(p["Wi-Fi"]) in STD)) r.push("Wi-Fi");
  if (!multi(p["Диапазоны"]).map(BAND).filter(Boolean).length) r.push("Диапазоны");
  if (num(p["WAN, Мбит/с"]) === null) r.push("WAN, Мбит/с");
  if (price === null) r.push(kt ? "Цена, ₽" : "Цена рынка (медиана), ₽");
  return r;
}

export function fromNotionPage(page) {
  if (missing(page).length) return null;   // неполные записи на сайт не попадают
  const p = page.properties ?? {};
  const name = txt(p["Модель"]), kt = multi(p["Источник модели"]).includes("К Телеком");
  const pk = num(p["Цена, ₽"]), cls = txt(p["Класс скорости"]) || null, pw = num(p["Потребление узла, Вт"]);
  const fn = txt(p["Функции (И3)"]), order = sel(p["Заказ партии в офис"]) ?? "", wifi = sel(p["Wi-Fi"]);
  return {
    id: num(p["№"]), name, brand: sel(p["Производитель"]), type: sel(p["Тип"]), std: STD[wifi], wifi, cls,
    bands: multi(p["Диапазоны"]).map(BAND).filter(Boolean),
    nss: num(p["MIMO 5 ГГц, потоков"]) || 2, ch: num(p["Канал макс., МГц"]) || 40, r2: num(p["Скорость клиента 2×2, Мбит/с"]),
    wan: num(p["WAN, Мбит/с"]), lan: num(p["LAN, шт"]), lan25: chk(p["LAN ≥ 2,5 Гбит/с"]), u: num(p["Узлов в комплекте"]) || 1,
    mesh: sel(p["Mesh-протокол"]), src: kt ? "К Телеком" : "Рынок",
    price: kt && pk ? pk : num(p["Цена рынка (медиана), ₽"]),   // парк — цена К Телеком, рынок — медиана цен продавцов (И3)
    eirp: { "2,4": num(p["ЭИИМ 2,4 ГГц, дБм"]), "5": num(p["ЭИИМ 5 ГГц, дБм"]), "6": num(p["ЭИИМ 6 ГГц, дБм"]) },
    tariff_max: num(p["Тариф до, Мбит/с"]), dev_max: lastNum(txt(p["Активных устройств"])),
    pw: pw || PW_CLASS[cls] || 7, pw_default: pw === null,
    vpn: fn ? fnVal(fn, "VPN") : chk(p["VPN"]) ? 1.0 : 0.0, iptv: fnVal(fn, "IPTV"), usb: fnVal(fn, "USB"), fw: fnVal(fn, "ПО"),
    sale_off: order.startsWith("нет"), nocat: chk(p["Нет в каталоге сайта"]), pkg: multi(p["Пакет (И3)"]),
    sat_port: SAT_PORT[name] ?? null, url: null, date: p["Данные на"]?.date?.start ?? null,
  };
}

// Проверка записи каталога перед расчётом (тесты и выгрузка): пустой список — запись годится для движка
export function checkItem(e) {
  const r = [], isNum = (v) => typeof v === "number" && Number.isFinite(v);
  for (const k of ["id", "std", "nss", "ch", "wan", "u", "price", "pw"]) if (!isNum(e[k])) r.push(k);
  for (const k of ["name", "type", "wifi", "src"]) if (typeof e[k] !== "string" || !e[k]) r.push(k);
  if (!Array.isArray(e.bands) || !e.bands.length || e.bands.some((b) => !["2,4", "5", "6"].includes(b))) r.push("bands");
  if (![4, 5, 6, 7].includes(e.std)) r.push("std");
  if (!["К Телеком", "Рынок"].includes(e.src)) r.push("src");
  if (!e.eirp || typeof e.eirp !== "object") r.push("eirp");
  for (const k of ["vpn", "iptv", "usb", "fw"]) if (e[k] !== null && ![0, 0.5, 1].includes(e[k])) r.push(k);
  return r;
}

// Одна модель — одна строка: изменения в pull request читаются построчно.
export function toJson(items, source) {
  const list = [...items].sort((a, b) => a.id - b.id);
  const updated = list.map((i) => i.date).filter(Boolean).sort().at(-1) ?? null;
  const head = JSON.stringify({ source, format: "engine_i4", updated, count: list.length,
    kt: list.filter((i) => i.src === "К Телеком").length });
  return `${head.slice(0, -1)},"items":[\n${list.map((i) => JSON.stringify(i)).join(",\n")}\n]}\n`;
}
