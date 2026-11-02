// Калькулятор подбора (черновик методики, развивается в И4).
// Формулы: (4.2) FSPL, (4.5) многостеновая модель на худшем пути, (4.9) запас, (4.13) требуемая скорость.
// Все коэффициенты — ориентиры из промта проекта; калибруются по замерам (И5).
(function (root) {
  // Потери в слое по ITU-R P.2040-4, дБ: [2,4 ГГц, 5,5 ГГц]; «капитальная» — для правила «≤ 1 капитальной стены между узлами»
  const MATERIALS = [
    { id: "conc_flat", name: "Бетонная стена квартиры (ITU-R P.1238)", l: [10, 13], cap: true },
    { id: "conc10", name: "Бетон 10 см", l: [8.1, 14.0], cap: true },
    { id: "conc16", name: "Бетон 16 см", l: [11.8, 21.5], cap: true },
    { id: "conc20", name: "Бетон 20 см", l: [14.6, 26.5], cap: true },
    { id: "brick12", name: "Кирпич 12 см", l: [3.5, 4.2], cap: false },
    { id: "brick25", name: "Кирпич 25 см", l: [6.4, 7.3], cap: true },
    { id: "brick38", name: "Кирпич 38 см", l: [9.5, 10.9], cap: true },
    { id: "gkl", name: "Гипсокартон 25 мм", l: [1.2, 2.0], cap: false },
    { id: "door", name: "Деревянная дверь 4 см", l: [0.6, 1.5], cap: false },
    { id: "glass", name: "Стекло 4 мм", l: [1.1, 3.0], cap: false },
    { id: "irr", name: "Энергосберегающее стекло (low-E)", l: [23.7, 24.6], cap: true },
  ];
  // Скорость на один поток, Мбит/с — ориентиры [ПРОВЕРИТЬ по источникам в И3–И4]
  const DEVICES = [
    { id: "tv4k", name: "ТВ / приставка 4K", b: 25 },
    { id: "game", name: "Облачные игры / консоль", b: 35 },
    { id: "call", name: "Видеосвязь, удалённая работа", b: 4 },
    { id: "laptop", name: "Ноутбук / ПК (веб, загрузки)", b: 10 },
    { id: "phone", name: "Смартфон", b: 5 },
    { id: "cam", name: "IP-камера", b: 4 },
    { id: "iot", name: "Умный дом (IoT)", b: 0.1 },
  ];
  const SEG = {
    budget: { name: "Бюджетный", rssi: -72, cover: 80, tcp: 100 },
    optimum: { name: "Оптимальный", rssi: -67, cover: 90, tcp: 300 },
    premium: { name: "Премиальный", rssi: -65, cover: 95, tcp: 600 },
  };
  const fspl = (d, fMHz) => 20 * Math.log10(Math.max(d, 1)) + 20 * Math.log10(fMHz) - 27.55; // (4.2)

  function compute(x) {
    const cls = x.area > 90 || x.rooms >= 4 ? 5 : x.rooms <= 0 ? 1 : x.rooms + 1; // студия=0 комнат
    const code = `К${cls}-${x.layout}-${x.build}`;
    let L24 = 0, L55 = 0, capWalls = 0;
    for (const m of MATERIALS) {
      const n = x.walls[m.id] || 0;
      L24 += n * m.l[0]; L55 += n * m.l[1]; if (m.cap) capWalls += n;
    }
    const isl = L55; // индекс сложности: потери в стенах на худшем пути, 5 ГГц
    const grade = isl <= 10 ? "низкая" : isl <= 20 ? "средняя" : "высокая";
    const seg = SEG[x.segment];
    const P55 = x.eirp - fspl(x.dist, 5500) - L55; // (4.5) для худшей точки
    const P24 = x.eirp - fspl(x.dist, 2437) - L24;
    const need = seg.rssi + x.z * x.sigma; // требуемый уровень с запасом (4.9)
    const M = P55 - seg.rssi;
    const oneOk = P55 >= need;
    let arch, nodes;
    if (oneOk) { arch = "Один роутер Wi-Fi 6/7 в центре квартиры"; nodes = 1; }
    else {
      const minByClass = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 }[cls];
      nodes = Math.max(2, minByClass, capWalls); // между узлами — не более одной капитальной стены
      if (x.cable) arch = "Mesh или точки доступа с проводным backhaul (витая пара); для потолочных ТД — PoE-коммутатор";
      else if (x.plc === "yes") arch = "Узел с Powerline-backhaul (тест скорости пройден)";
      else arch = "Трёхдиапазонный Mesh с беспроводным backhaul; не более 1 капитальной стены между узлами";
    }
    let sum = 0;
    for (const d of DEVICES) sum += (x.dev[d.id] || 0) * d.b;
    const breq = x.kOdn * sum * (1 + x.kZap); // (4.13)
    return { cls, code, isl, grade, P55, P24, need, M, oneOk, arch, nodes, breq, seg,
      plcNote: !oneOk && !x.cable && x.plc === "unknown" ? "Сначала проведите Powerline-тест между точками установки: если скорость ≥ требуемой, подойдёт Powerline-backhaul." : "" };
  }
  root.NetCalc = { MATERIALS, DEVICES, SEG, compute, fspl };
  if (typeof module !== "undefined") module.exports = root.NetCalc;

  // ---------- интерфейс ----------
  if (typeof document === "undefined") return;
  const f1 = (v) => v.toFixed(1).replace(".", ",");
  function init() {
    const box = document.getElementById("netcalc"); if (!box) return;
    box.querySelector("#nc-walls").innerHTML = MATERIALS.map((m) =>
      `<label class="nc-row"><span>${m.name} <small>(${f1(m.l[1])} дБ на 5 ГГц)</small></span><input type="number" min="0" max="10" value="0" data-wall="${m.id}"></label>`).join("");
    box.querySelector("#nc-devs").innerHTML = DEVICES.map((d) =>
      `<label class="nc-row"><span>${d.name} <small>(${f1(d.b)} Мбит/с)</small></span><input type="number" min="0" max="50" value="0" data-dev="${d.id}"></label>`).join("");
    box.querySelector("#nc-area").addEventListener("input", (e) => {
      const d = box.querySelector("#nc-dist"); if (!d.dataset.touched) d.value = Math.round(Math.sqrt(+e.target.value || 0) * 1.2);
    });
    box.querySelector("#nc-dist").addEventListener("input", (e) => (e.target.dataset.touched = 1));
    box.querySelector("#nc-run").addEventListener("click", run);
  }
  function run() {
    const box = document.getElementById("netcalc");
    const v = (id) => box.querySelector(id).value;
    const walls = {}, dev = {};
    box.querySelectorAll("[data-wall]").forEach((i) => (walls[i.dataset.wall] = +i.value || 0));
    box.querySelectorAll("[data-dev]").forEach((i) => (dev[i.dataset.dev] = +i.value || 0));
    const r = compute({ area: +v("#nc-area"), rooms: +v("#nc-rooms"), layout: v("#nc-layout"), build: v("#nc-build"),
      dist: +v("#nc-dist"), walls, dev, cable: v("#nc-cable") === "yes", plc: v("#nc-plc"), segment: v("#nc-seg"),
      eirp: +v("#nc-eirp"), z: 1.28, sigma: +v("#nc-sigma"), kOdn: 0.7, kZap: 0.3 });
    box.querySelector("#nc-out").innerHTML = `
      <table><tbody>
      <tr><td>Класс и код квартиры</td><td><b>${r.code}</b></td></tr>
      <tr><td>Индекс сложности (потери в стенах на худшем пути, 5 ГГц)</td><td>${f1(r.isl)} дБ — ${r.grade} сложность</td></tr>
      <tr><td>Уровень в худшей точке от одного роутера</td><td>5 ГГц: ${f1(r.P55)} дБм · 2,4 ГГц: ${f1(r.P24)} дБм</td></tr>
      <tr><td>Требуется (порог ${r.seg.rssi} дБм + запас)</td><td>${f1(r.need)} дБм → ${r.oneOk ? "✅ хватает одного роутера" : "❌ одного роутера мало"}</td></tr>
      <tr><td>Рекомендуемая архитектура</td><td><b>${r.arch}</b></td></tr>
      <tr><td>Число узлов (оценка)</td><td>${r.nodes}</td></tr>
      <tr><td>Требуемая скорость</td><td>${f1(r.breq)} Мбит/с</td></tr>
      <tr><td>Целевые KPI сегмента «${r.seg.name}»</td><td>покрытие ≥ ${r.seg.cover} %, RSSI ≥ ${r.seg.rssi} дБм, TCP в худшей зоне ≥ ${r.seg.tcp} Мбит/с</td></tr>
      </tbody></table>${r.plcNote ? `<p>${r.plcNote}</p>` : ""}
      <p><small>Оценка по худшему пути: учитываются потери в свободном пространстве и стенах, отражения не учитываются. Итог проверяется замерами после монтажа.</small></p>`;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
