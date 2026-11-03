// Перевод записи базы Notion «Оборудование К Телеком» в запись docs/assets/data/equipment.json.
// Используется в scripts/sync.mjs и в tests/equipment.test.mjs.
export const EQUIPMENT_DB_DEFAULT = "6f5df9461b6643f4a99ff5519f134c54";
export const EQUIPMENT_FILE = "docs/assets/data/equipment.json";

const MESH = { "с любой моделью": "any", "только Netcraze": "netcraze", "только SNR": "snr", "только Halo": "halo", "нет": "none" };
const txt = (p) => (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text).join("").trim();
const sel = (p) => p?.select?.name ?? "";
const num = (p) => (typeof p?.number === "number" ? p.number : null);
const lastNum = (s) => { const m = String(s).match(/\d+/g); return m ? +m[m.length - 1] : null; };

export function fromNotionPage(page) {
  const p = page.properties ?? {};
  const model = txt(p["Модель"]);
  const price = num(p["Цена, ₽"]);
  if (!model || price === null) return null; // неполные записи на сайт не попадают
  const order = sel(p["Заказ партии в офис"]);
  const pack = model.match(/\((\d+)-pack\)/i);
  const clientsText = txt(p["Активных устройств"]);
  return {
    n: num(p["№"]),
    model,
    alias: txt(p["Артикул / другое название"]),
    vendor: sel(p["Производитель"]),
    type: sel(p["Тип"]),
    segment: sel(p["Сегмент"]),
    wifi: lastNum(sel(p["Wi-Fi"])),
    bands: (p["Диапазоны"]?.multi_select ?? []).map((o) => o.name.replace(/\s*ГГц/, "")),
    lan: num(p["LAN, шт"]),
    tariff: num(p["Тариф до, Мбит/с"]),
    tariffText: txt(p["Тариф (как в таблице)"]),
    clients: lastNum(clientsText),
    clientsText,
    area: num(p["Площадь до, м²"]),
    areaText: txt(p["Площадь покрытия, м²"]),
    mesh: MESH[sel(p["Mesh"])] ?? "none",
    vpn: !!p["VPN"]?.checkbox,
    ram: txt(p["ОЗУ, МБ"]),
    flash: num(p["Флеш, МБ"]),
    price,
    priceText: txt(p["Цена (как в таблице)"]),
    order: order.startsWith("да"),
    orderText: order,
    nodes: pack ? +pack[1] : 1,
    features: txt(p["Особенности"]),
    tasks: txt(p["Для каких задач"]),
    diff: txt(p["Расхождения с сайтом k-telecom.org"]),
    notOnSite: !!p["Нет в каталоге сайта"]?.checkbox,
    date: p["Данные на"]?.date?.start ?? null,
  };
}

// Одна модель — одна строка: изменения в pull request читаются построчно.
export function toJson(items, source) {
  const list = [...items].sort((a, b) => (a.n ?? 999) - (b.n ?? 999));
  const updated = list.map((i) => i.date).filter(Boolean).sort().at(-1) ?? null;
  const head = JSON.stringify({ source, updated, count: list.length });
  return `${head.slice(0, -1)},"items":[\n${list.map((i) => JSON.stringify(i)).join(",\n")}\n]}\n`;
}
