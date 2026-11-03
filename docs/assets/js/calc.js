// Калькулятор подбора (черновик методики, развивается в И4).
// Формулы: (4.2) FSPL, (4.5) многостеновая модель на худшем пути, (4.9) запас, (4.13) требуемая скорость.
// Все коэффициенты — ориентиры из промта проекта; калибруются по замерам (И5).
// Подбор оборудования — по парку К Телеком (docs/assets/data/equipment.json, выгружается из Notion).
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
  // ---------- подбор оборудования из парка К Телеком (черновик методики, И4) ----------
  // Предварительные веса критериев; заменятся весами AHP из И3.
  const WEIGHTS = { price: 0.35, speed: 0.20, wifi: 0.20, area: 0.15, clients: 0.10 };
  const MAIN_TYPES = ["Роутер", "Интернет-центр", "Mesh-система"];
  const MAX_NODES = 4;
  const NOTE = {
    halo: "«100 / 500 Мбит/с» по таблице К Телеком принято как 100 Мбит/с при радиосвязи модулей и 500 Мбит/с при кабеле между ними — трактовка уточняется в И3",
    any: "Mesh «с любой моделью» — по таблице К Телеком; совместимость узлов проверяется в И3",
    half: "узлы связаны по радио на тех же двух диапазонах — в дальней зоне принята половина скорости (оценка)",
    buddy: "Buddy 5 не подключается к интернету сам, расширяет сеть роутера Netcraze; скорость в дальней зоне — до 100 Мбит/с",
  };
  const REASONS = {
    sale: "снят с заказа (распродажа остатков)",
    wifi4: "Wi-Fi 4 — только для бюджетного сегмента",
    nomesh: "нет Mesh — узлы не объединяются в одну сеть",
    tariff: "не тянет тариф",
    far: "мала скорость в дальней зоне",
    clients: "мало одновременных устройств",
    vpn: "нет VPN",
    budget: "дороже бюджета",
  };

  // Все возможные комплекты из парка под нужное число узлов и площадь.
  function buildKits(eq, need) {
    const kits = [];
    const buddy = eq.find((m) => m.type === "Mesh-ретранслятор" && m.mesh === "netcraze");
    const add = (parts, o) => {
      const items = parts.map(([m, qty]) => ({ m, qty }));
      const main = items[0].m;
      kits.push({ items, main, price: items.reduce((s, i) => s + i.m.price * i.qty, 0),
        wifi: Math.min(...items.map((i) => i.m.wifi || 4)), notes: [], ...o });
    };
    for (const m of eq) {
      if (!MAIN_TYPES.includes(m.type) || !m.area) continue;
      const per = m.area / (m.nodes || 1);
      const k = Math.max(need.nodes, Math.ceil(need.area / per), 1);
      if (m.nodes > 1) { // готовый Mesh-комплект
        if (k < 2) continue; // хватает одного узла — комплект не предлагаем
        const packs = Math.ceil(k / m.nodes);
        if (packs > 2) continue;
        const sp = m.mesh === "halo" ? (need.wired ? m.tariff : Math.min(100, m.tariff)) : need.wired ? m.tariff : m.tariff / 2;
        add([[m, packs]], { nodes: packs * m.nodes, tariff: sp, far: sp, clients: m.clients * packs, area: m.area * packs,
          mesh: true, notes: m.mesh === "halo" ? [NOTE.halo] : [] });
        continue;
      }
      if (k === 1) { add([[m, 1]], { nodes: 1, tariff: m.tariff, far: m.tariff, clients: m.clients, area: m.area, mesh: true }); continue; }
      if (k > MAX_NODES) continue;
      // несколько одинаковых узлов одной экосистемы
      const notes = [];
      if (m.mesh === "any") notes.push(NOTE.any);
      if (!need.wired) notes.push(NOTE.half);
      add([[m, k]], { nodes: k, tariff: m.tariff, far: need.wired ? m.tariff : m.tariff / 2, clients: m.clients * k,
        area: m.area * k, mesh: m.mesh !== "none" && m.mesh !== "halo", notes });
      // роутер Netcraze + ретрансляторы Buddy 5
      if (m.mesh === "netcraze" && buddy) {
        const b = Math.max(need.nodes - 1, Math.ceil((need.area - m.area) / buddy.area), 1);
        if (b + 1 > MAX_NODES) continue;
        add([[m, 1], [buddy, b]], { nodes: b + 1, tariff: m.tariff, far: Math.min(m.tariff, buddy.tariff),
          clients: m.clients + buddy.clients * b, area: m.area + buddy.area * b, mesh: true, notes: [NOTE.buddy] });
      }
    }
    return kits;
  }

  // need: { nodes, area, segment, devices, breq, tariff, vpn, budget, wired }
  function pickEquipment(eq, need) {
    const seg = SEG[need.segment] || SEG.optimum;
    const needFar = Math.min(need.tariff, seg.tcp);
    const kits = buildKits(eq, need);
    const excluded = {};
    const ok = [], bad = [];
    for (const k of kits) {
      const v = [];
      if (k.items.some((i) => !i.m.order)) v.push("sale");
      if (k.wifi < 5 && need.segment !== "budget") v.push("wifi4");
      if (k.nodes > 1 && !k.mesh) v.push("nomesh");
      if (k.tariff < need.tariff) v.push("tariff");
      if (k.far < needFar) v.push("far");
      if (need.devices > k.clients) v.push("clients");
      if (need.vpn && !k.main.vpn) v.push("vpn");
      if (need.budget > 0 && k.price > need.budget) v.push("budget");
      k.violations = v.map((c) => REASONS[c]);
      for (const c of v) excluded[REASONS[c]] = (excluded[REASONS[c]] || 0) + 1;
      (v.length ? bad : ok).push(k);
    }
    // Оценки критериев 0…1 (больше — лучше). Цена — относительно прошедших комплектов;
    // запас скорости, площади и устройств сверх разумного (×2, ×1,5, ×2) не добавляет баллов.
    const prices = ok.map((k) => k.price), lo = Math.min(...prices), hi = Math.max(...prices);
    const margin = (r, cap) => Math.max(0, Math.min(r, cap) - 1) / (cap - 1);
    for (const k of ok) {
      k.parts = { price: hi > lo ? (hi - k.price) / (hi - lo) : 1, speed: margin(k.far / needFar, 2), wifi: ((k.wifi || 4) - 4) / 2,
        area: margin(k.area / Math.max(need.area, 1), 1.5), clients: margin(k.clients / Math.max(need.devices, 1), 2) };
      k.score = Object.keys(WEIGHTS).reduce((s, c) => s + WEIGHTS[c] * k.parts[c], 0);
      k.reserve = (k.score - WEIGHTS.price * k.parts.price) / (1 - WEIGHTS.price);
    }
    const best = (cmp) => [...ok].sort(cmp)[0];
    const variants = [];
    const put = (label, k) => { if (!k) return; const v = variants.find((x) => x.kit === k); if (v) v.labels.push(label); else variants.push({ labels: [label], kit: k }); };
    put("эконом", best((a, b) => a.price - b.price || b.score - a.score));
    put("оптимум", best((a, b) => b.score - a.score || a.price - b.price));
    put("запас", best((a, b) => b.reserve - a.reserve || a.price - b.price));
    const nearest = ok.length ? [] : [...bad].sort((a, b) => a.violations.length - b.violations.length || a.price - b.price).slice(0, 3);
    const outdoor = need.outdoor ? eq.find((m) => m.type === "Уличная точка доступа" && m.order) || null : null;
    return { variants, passed: ok.length, total: kits.length, excluded, nearest, needFar, outdoor };
  }

  root.NetCalc = { MATERIALS, DEVICES, SEG, WEIGHTS, compute, fspl, buildKits, pickEquipment };
  if (typeof module !== "undefined") module.exports = root.NetCalc;

  // ---------- интерфейс ----------
  if (typeof document === "undefined") return;
  const f1 = (v) => v.toFixed(1).replace(".", ",");
  const w = (v) => v.toFixed(2).replace(".", ",");
  const rub = (v) => Math.round(v).toLocaleString("ru-RU") + " ₽";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SRC = document.currentScript && document.currentScript.src; // адрес calc.js — от него ищем data/equipment.json
  let eqLoad = null;
  const loadEq = () => (eqLoad ||= fetch(new URL("../data/equipment.json", SRC || location.href))
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .catch((e) => { eqLoad = null; throw e; }));
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
    const devices = Object.values(dev).reduce((a, b) => a + b, 0);
    const need = { nodes: r.nodes, area: +v("#nc-area") || 0, segment: v("#nc-seg"), devices, breq: r.breq, tariff: +v("#nc-tariff"),
      vpn: v("#nc-vpn") === "yes", budget: +v("#nc-budget") || 0, wired: v("#nc-cable") === "yes" || v("#nc-plc") === "yes", outdoor: v("#nc-outdoor") === "yes" };
    renderEq(need);
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
  function kitName(k) {
    return k.items.map((i) => `${i.qty > 1 ? i.qty + " × " : ""}${esc(i.m.model)}${i.m.alias ? ` <small>(${esc(i.m.alias)})</small>` : ""}`).join(" + ");
  }
  function kitNotes(k) {
    const n = [...k.notes];
    for (const i of k.items) {
      if (i.m.notOnSite) n.push(`${i.m.model}: нет в каталоге сайта k-telecom.org`);
      if (i.m.diff) n.push(`${i.m.model}: ${i.m.diff}`);
    }
    return n.length ? `<br><small>${n.map(esc).join("; ")}</small>` : "";
  }
  async function renderEq(need) {
    const out = document.getElementById("nc-eq"); if (!out) return;
    out.innerHTML = "<p>Подбор оборудования…</p>";
    let data;
    try { data = await loadEq(); } catch (e) { out.innerHTML = "<p>Не удалось загрузить данные об оборудовании К Телеком. Обновите страницу.</p>"; return; }
    const res = pickEquipment(data.items || [], need);
    const date = data.updated ? data.updated.split("-").reverse().join(".") : "—";
    const reasons = Object.entries(res.excluded).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${esc(t)} — ${c}`).join("; ");
    const row = (k, label) => `<tr><td><b>${label}</b></td><td>${kitName(k)}${kitNotes(k)}</td><td>${rub(k.price)}</td><td>Wi-Fi ${k.wifi}</td>
      <td>${k.nodes}</td><td>до ${Math.round(k.far)} Мбит/с</td><td>${k.area} м² · ${k.clients} устр.</td></tr>`;
    let html = "<h3>Оборудование из парка К Телеком</h3>";
    if (res.variants.length) {
      html += `<table><thead><tr><th>Вариант</th><th>Комплект</th><th>Цена</th><th>Wi-Fi</th><th>Узлов</th><th>Дальняя зона</th><th>Площадь · устройства</th></tr></thead><tbody>
        ${res.variants.map((v) => row(v.kit, v.labels.join(", "))).join("")}</tbody></table>`;
    } else {
      html += `<p><b>В парке К Телеком нет подходящего комплекта — нужна альтернатива с рынка (подбор в И3).</b></p>`;
      if (res.nearest.length) html += `<p>Ближайшие варианты и что не так:</p><ul>${res.nearest.map((k) =>
        `<li>${kitName(k)} — ${rub(k.price)}: ${k.violations.map(esc).join(", ")}</li>`).join("")}</ul>`;
    }
    if (res.outdoor) html += `<p>Для улицы: <b>${esc(res.outdoor.model)}</b> — ${rub(res.outdoor.price)}. В одну Mesh-сеть объединяется только с Netcraze; с другими — отдельной точкой доступа по кабелю.</p>`;
    else if (need.outdoor) html += "<p>Уличной точки доступа с заказом партии в парке нет — нужна альтернатива с рынка (И3).</p>";
    html += `<p><small>Требования: тариф ${need.tariff} Мбит/с, в дальней зоне ≥ ${res.needFar} Мбит/с, устройств: ${need.devices || "не указаны"}, узлов: ${need.nodes}, площадь: ${need.area} м²${need.vpn ? ", VPN" : ""}${need.budget ? `, бюджет до ${rub(need.budget)}` : ""}.
      Проверено комплектов: ${res.total}, подошло: ${res.passed}${reasons ? `; исключено по причинам: ${reasons}` : ""}.</small></p>
      <p><small>Оценка по данным парка К Телеком на ${date} (база «Оборудование К Телеком»): площадь, число устройств и тариф — по таблице оператора, радиопараметры моделей уточняются в И3.
      Варианты: «эконом» — самый дешёвый из подходящих; «оптимум» — лучший по сумме критериев; «запас» — лучший без учёта цены.
      Веса критериев предварительные (цена ${w(WEIGHTS.price)}, скорость ${w(WEIGHTS.speed)}, поколение Wi-Fi ${w(WEIGHTS.wifi)}, площадь ${w(WEIGHTS.area)}, устройства ${w(WEIGHTS.clients)}) и заменятся весами AHP из И3.
      Модели, снятые с заказа (распродажа остатков), не предлагаются.</small></p>`;
    out.innerHTML = html;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(typeof window !== "undefined" ? window : globalThis);
