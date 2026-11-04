// Расчёт по методике И4 «Методика и алгоритм подбора оборудования» — перенос эталона engine_i4.py 1.0 (отчёт И4).
// Шаги: Ш2 классификация и I_сл → Ш3 требования (B_треб, KPI) → Ш4 покрытие (4.5), K_пок (4.12), запас (4.9) →
// Ш5 дерево архитектур → Ш6 размещение → Ш7 частотный план → Ш8 кабельный журнал → Ш9 подбор моделей
// (фильтры, KPI, AHP, TCO 4.19) → Ш12 паспорт сети (прогноз для проверки Ш11).
// Данные: docs/assets/data/plans.json (типовые планы И2), docs/assets/data/equipment.json (база Notion «Оборудование К Телеком»).
// Совпадение с эталоном на Python — 31 контрольный пример (tests/fixtures/cases_i4_base.json, cases_i4_spec.json; tests/engine.test.mjs).
(function (root) {
  "use strict";
  const VERSION = "engine_i4 1.0 (04.11.2026)";
  // ---------------------------------------------------------------- константы (источники — отчёт И4, табл. 2)
  const BANDS = { "2,4": 2437.0, "5": 5500.0, "6": 6200.0 };      // центральные частоты расчёта, МГц
  const BI = { "2,4": 0, "5": 1, "6": 2 };                         // индекс диапазона в таблице потерь стен
  const EIRP_DEF = { "2,4": 20.0, "5": 23.0, "6": 23.0 };          // ЭИИМ по умолчанию, дБм (Notion «Радиопараметры по умолчанию (И4)»)
  const EIRP_MAX = { "2,4": 20.0, "5": 23.0, "6": 23.0 };          // нормы РФ (решения ГКРЧ), дБм
  const SIG = 5.01;                                                // СКО затенения, дБ (И2)
  const Z = { K90: 1.28, K95: 1.645 };
  const P_THR = -67.0;                                             // порог покрытия, дБм
  const N20 = -174 + 10 * Math.log10(20e6) + 7;                    // шум канала 20 МГц, NF 7 дБ: −94,0 дБм
  const ETA = 0.6;                                                 // TCP / R_PHY (И1, И2)
  const ETH = 0.94;                                                // TCP / скорость порта Ethernet
  const P_BH = -46.0;                                              // минимальный уровень радио-backhaul, дБм (И2)
  const STEP = 0.25;                                               // шаг сетки, м
  const LEVELS = {
    1: { name: "бюджетный", kkey: "K90", K: 80, Pz: -72, SNR: 20, TCP: 100, std: 6, wan: 1000, ahp: "Б" },
    2: { name: "оптимальный", kkey: "K90", K: 90, Pz: -67, SNR: 25, TCP: 300, std: 6, wan: 1000, ahp: "С" },
    3: { name: "премиальный", kkey: "K95", K: 95, Pz: -65, SNR: 30, TCP: 600, std: 7, wan: 2500, ahp: "П" },
  };
  const AHP = { "Б": [0.164, 0.095, 0.059, 0.164, 0.519], "С": [0.298, 0.158, 0.089, 0.158, 0.298], "П": [0.375, 0.215, 0.215, 0.121, 0.073] };
  const CAB = 34.0, DUCT = 50.0, LAY = 80.0, RJ = 150.0, SET1 = 1500.0, SET2 = 2500.0;   // руб./м, руб./м, руб./м, руб., руб., руб. (И3)
  const TARIFF = 7.15, R_ = 0.14, T_ = 5;
  let ANN = 0;
  for (let t = 1; t <= T_; t++) ANN += 1 / (1 + R_) ** t;      // 3,4331
  const DEV = { tv: ["Smart TV 4K", 100.0, 0.60], console: ["Игровая консоль", 50.0, 0.40], laptop: ["Ноутбук", 150.0, 0.275],
    phone: ["Смартфон", 100.0, 0.275], tablet: ["Планшет", 60.0, 0.275], iot: ["IoT", 0.1, 0.075] };   // И1, формула (4.13)
  const B_CONST = 6.0, K_ZAP = 0.25;
  const Q_SEG = [4899.0, 9029.5, 15144.5];                        // квартили цен рынка И3, руб.
  const SEG_CAP = { 1: Q_SEG[1], 2: Q_SEG[2], 3: null };          // бюджет — I–II, оптимальный — I–III, премиум — I–IV
  const CLASS_AREA = { "К1": [20, 35], "К2": [30, 45], "К3": [45, 65], "К4": [60, 90], "К5": [90, 200] };
  const PLAN_OF = { "К1": "К1-С-М", "К2": "К2-Л-П", "К3": "К3-Р-П", "К4": "К4-У-М", "К5": "К5-Е-М" };
  // пользовательское оборудование: R_PHY 5 ГГц, ширина канала, NSS, Вт (Notion «Радиопараметры по умолчанию (И4)»)
  const CLASS_DEF = { N300: [300, 40, 2, 4], AC750: [433, 80, 1, 5], AC1200: [867, 80, 2, 6], AC1300: [867, 80, 2, 6],
    AX1500: [1201, 80, 2, 6], AX1800: [1201, 80, 2, 6], AX3000: [2402, 160, 2, 7], AX5400: [2402, 160, 2, 10],
    AX6000: [2402, 160, 2, 10], BE3600: [2882, 160, 2, 8], BE5000: [2882, 160, 2, 9], BE6500: [2882, 160, 2, 12],
    BE7200: [2882, 160, 2, 13], BE9300: [5765, 320, 2, 15] };
  const STD_CLASS = { 4: "N300", 5: "AC1200", 6: "AX1500", 7: "BE3600" };
  const ORDER = ["А", "Б", "В-радио", "В-кабель", "В-PL", "Г-радио", "Г-кабель"];
  const ARCH_NAME = { "А": "один узел у ввода", "Б": "один узел в центре, кабель от ввода", "В-радио": "два узла, беспроводной backhaul",
    "В-кабель": "два узла, кабельный backhaul", "В-PL": "два узла, backhaul Powerline (после теста)",
    "Г-радио": "три узла, беспроводной backhaul", "Г-кабель": "три узла, кабельный backhaul" };
  const ROOT_TYPES = ["Роутер", "Интернет-центр", "Mesh-система"];
  const DEFAULTS = { cls: null, rooms: null, area: null, constr: null, L_W1: null, entry_at: "прихожая", cable_ok: true, tariff: 500,
    dev: { tv: 1, console: 1, laptop: 2, phone: 3, tablet: 1, iot: 8 }, iptv: false, vpn: false, level: 2, need6: false,
    budget: null, user: [], pl_mbps: null, catalog: true, d_eirp: 0.0, air160: true, robust: true };
  // ---------------------------------------------------------------- скорость PHY (IEEE 802.11-2024)
  const MOD = [[1, 1 / 2], [2, 1 / 2], [2, 3 / 4], [4, 1 / 2], [4, 3 / 4], [6, 2 / 3], [6, 3 / 4], [6, 5 / 6], [8, 3 / 4], [8, 5 / 6], [10, 3 / 4], [10, 5 / 6]];
  const SENS20 = [-82, -79, -77, -74, -70, -66, -65, -64, -59, -57, -54, -52];
  const PHY = { HE: { nsd: { 20: 234, 40: 468, 80: 980, 160: 1960 }, ts: 13.6, mcs: 12 },
    VHT: { nsd: { 20: 52, 40: 108, 80: 234, 160: 468 }, ts: 3.6, mcs: 10 },
    HT: { nsd: { 20: 52, 40: 108 }, ts: 3.6, mcs: 8 } };

  // ---------------------------------------------------------------- округление и формат как в Python (round, '%.nf')
  function pyRound(x, nd = 0) {
    if (typeof x !== "number" || !Number.isFinite(x) || x === 0) return x;
    const neg = x < 0, s = Math.abs(x).toFixed(100), dot = s.indexOf(".");
    const ip = s.slice(0, dot), fp = s.slice(dot + 1);
    let digits = ip + fp.slice(0, nd);
    const r0 = fp.charCodeAt(nd) - 48, tail = /[1-9]/.test(fp.slice(nd + 1));
    const up = r0 > 5 || (r0 === 5 && (tail || (digits.charCodeAt(digits.length - 1) - 48) % 2 === 1));
    if (up) digits = (BigInt(digits) + 1n).toString().padStart(digits.length, "0");
    const str = nd > 0 ? digits.slice(0, digits.length - nd) + "." + digits.slice(digits.length - nd) : digits;
    const v = Number(str);
    return neg ? -v : v;
  }
  const fmt = (x, nd) => pyRound(x, nd).toFixed(nd);
  const isNone = (v) => v === null || v === undefined;
  const sumArr = (a) => a.reduce((s, v) => s + v, 0);
  function cmpKey(a, b) {   // сравнение кортежей, как в Python (False < True)
    for (let i = 0; i < a.length; i++) { const x = +a[i], y = +b[i]; if (x < y) return -1; if (x > y) return 1; }
    return 0;
  }
  const minBy = (arr, key) => arr.reduce((m, c) => (m === undefined || cmpKey(key(c), key(m)) < 0 ? c : m), undefined);
  const maxBy = (arr, key) => arr.reduce((m, c) => (m === undefined || cmpKey(key(c), key(m)) > 0 ? c : m), undefined);
  function pairwiseSum(a, lo, n) {   // как numpy.sum (попарное суммирование)
    if (n < 8) { let r = 0; for (let i = 0; i < n; i++) r += a[lo + i]; return r; }
    if (n <= 128) {
      const r = [a[lo], a[lo + 1], a[lo + 2], a[lo + 3], a[lo + 4], a[lo + 5], a[lo + 6], a[lo + 7]];
      let i = 8;
      for (; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] += a[lo + i + j];
      let res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
      for (; i < n; i++) res += a[lo + i];
      return res;
    }
    let n2 = Math.floor(n / 2);
    n2 -= n2 % 8;
    return pairwiseSum(a, lo, n2) + pairwiseSum(a, lo + n2, n - n2);
  }
  function pct10(vals) {             // numpy.percentile(·, 10), метод linear
    const a = Float64Array.from(vals).sort(), n = a.length, vi = (n - 1) * 0.1;
    if (vi >= n - 1) return a[n - 1];
    const lo = Math.floor(vi), g = vi - lo, A = a[lo], B = a[lo + 1], d = B - A;
    return g >= 0.5 ? B - d * (1 - g) : A + d * g;
  }
  function arange(start, stop, step) {   // numpy.arange
    const len = Math.ceil((stop - start) / step);
    if (!(len > 0)) return [];
    const out = [start];
    if (len > 1) out.push(start + step);
    const delta = out[1] - start;
    for (let i = 2; i < len; i++) out.push(start + i * delta);
    return out;
  }
  // ---------------------------------------------------------------- скорость PHY и потери
  const RT = new Map();
  function rateTable(phy, nss, w) {   // пороги чувствительности (дБм) и R_PHY (Мбит/с) для MCS 0…max: R = N_SS·N_SD·b·R_c / T_s
    const key = phy + "|" + nss + "|" + w;
    let t = RT.get(key);
    if (!t) {
      const p = PHY[phy], th = [], r = [];
      for (let m = 0; m < p.mcs; m++) {
        th.push(SENS20[m] + 3 * Math.log2(w / 20));
        r.push(nss * p.nsd[w] * MOD[m][0] * MOD[m][1] / p.ts);
      }
      t = { th, r };
      RT.set(key, t);
    }
    return t;
  }
  function rphy1(P, t) { let i = 0; while (i < t.th.length && t.th[i] <= P) i++; return i > 0 ? t.r[i - 1] : 0.0; }
  const fspl = (d, f) => 20 * Math.log10(Math.max(d, 1.0)) + 20 * Math.log10(f) - 27.55;   // (4.2), d ≥ 1 м

  function create(data) {
    const PLD = data.plans, CAT = data.catalog.items || data.catalog;
    let D_EIRP = 0.0, AIR160 = true;
    // ---------------------------------------------------------------- Ш2. геометрия плана
    function wallTable(constr, L_W1) {   // потери стен (2,4 / 5 / 6 ГГц); К — несущие кирпичные; L_W1 — потери несущей стены на 5 ГГц
      const WT = {};
      for (const [k, v] of Object.entries(PLD.WT)) WT[k] = v.slice();
      if (constr === "К") { WT.W1 = WT.W1k.slice(); WT.W7b = WT.W1k.map((x) => x + 3); }
      if (!isNone(L_W1) && L_W1 !== "") {
        const base = WT.W1, k = L_W1 / base[1];
        WT.W1 = [base[0] * k, +L_W1, base[2] * k];
        WT.W7b = WT.W1.map((x) => x + 3);
      }
      return WT;
    }
    function geometry(cls, area, constr, L_W1) {
      const code = PLAN_OF[cls], pl = PLD.plans[code];
      const S0 = pl.area, S = area ? +area : S0, k = Math.sqrt(S / S0);
      const sc = (p) => [pyRound(p[0] * k, 3), pyRound(p[1] * k, 3)];
      const g = { cls, plan: code, title: pl.title, area: S, area_plan: S0, k, W: pl.W * k, H: pl.H * k, constr: constr || code.slice(-1),
        rooms: pl.rooms.map(([n, t, rs]) => [n, t, rs.map((r) => r.map((c) => c * k))]),
        walls: pl.walls.map(([a, b, c, d, t]) => [a * k, b * k, c * k, d * k, t]),
        pos: { entry: sc(pl.pos.entry), center: sc(pl.pos.center), sat: pl.pos.sat.map(sc) } };
      g.WT = wallTable(g.constr, L_W1);
      const X = [], Y = [], Zt = [], N = [];
      for (const [name, t, rs] of g.rooms) {
        for (const [x0, y0, x1, y1] of rs) {
          const xs = arange(x0 + STEP / 2, x1 - 1e-9, STEP), ys = arange(y0 + STEP / 2, y1 - 1e-9, STEP);
          for (const y of ys) for (const x of xs) { X.push(x); Y.push(y); Zt.push(t); N.push(name); }
        }
      }
      g.X = Float64Array.from(X); g.Y = Float64Array.from(Y); g.Z = Zt; g.N = N;
      g.liv = Zt.map((t) => t === "ж" || t === "к");
      g.livIdx = []; g.lrooms = []; g.roomIdx = {};
      g.liv.forEach((v, i) => { if (v) { g.livIdx.push(i); if (!g.lrooms.includes(N[i])) g.lrooms.push(N[i]); } });
      for (const nm of g.lrooms) g.roomIdx[nm] = [];
      N.forEach((nm, i) => { if (g.roomIdx[nm]) g.roomIdx[nm].push(i); });
      g.cache = new Map();
      return g;
    }
    function wallLoss(g, ap, X, Y, band) {
      const n = X.length, L = new Float64Array(n), bi = BI[band], ax = ap[0], ay = ap[1];
      for (const [x1, y1, x2, y2, t] of g.walls) {
        if (t === "O") continue;
        const val = g.WT[t][bi], s3 = Math.sign((x2 - x1) * (ay - y1) - (y2 - y1) * (ax - x1));
        for (let i = 0; i < n; i++) {
          const vx = X[i], vy = Y[i];
          const s1 = Math.sign((vx - ax) * (y1 - ay) - (vy - ay) * (x1 - ax));
          const s2 = Math.sign((vx - ax) * (y2 - ay) - (vy - ay) * (x2 - ax));
          if (s1 !== s2 && s3 !== Math.sign((x2 - x1) * (vy - y1) - (y2 - y1) * (vx - x1))) L[i] += val;
        }
      }
      return L;
    }
    function calcP(g, ap, band, E, X, Y) {
      const wl = wallLoss(g, ap, X, Y, band), n = X.length, P = new Float64Array(n), lf = 20 * Math.log10(BANDS[band]);
      for (let i = 0; i < n; i++) P[i] = E - (20 * Math.log10(Math.max(Math.hypot(X[i] - ap[0], Y[i] - ap[1]), 1.0)) + lf - 27.55) - wl[i];
      return P;
    }
    function rssi(g, ap, band = "5", eirp = null, X = null, Y = null) {   // многостеновая модель (4.5)
      const E = isNone(eirp) ? EIRP_DEF[band] : eirp;
      if (X === null) {
        const key = ap[0] + "," + ap[1] + "|" + band + "|" + E;
        let v = g.cache.get(key);
        if (!v) { v = calcP(g, ap, band, E, g.X, g.Y); g.cache.set(key, v); }
        return v;
      }
      return calcP(g, ap, band, E, X, Y);
    }
    const cable = (a, b) => (a[0] !== b[0] || a[1] !== b[1] ? Math.ceil(1.1 * (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])) + 1.0) : 0);
    function roomCenters(g) {
      const out = [];
      for (const [name, t, rs] of g.rooms) {
        if (t !== "ж" && t !== "к") continue;
        const r = maxBy(rs, (q) => [(q[2] - q[0]) * (q[3] - q[1])]);
        out.push([name, (r[0] + r[2]) / 2, (r[1] + r[3]) / 2]);
      }
      return out;
    }
    function Ic(g, ap) {   // индекс сложности: максимум потерь в стенах (5 ГГц) до центров жилых помещений и кухни
      const C = roomCenters(g), L = wallLoss(g, ap, C.map((c) => c[1]), C.map((c) => c[2]), "5");
      let j = 0;
      for (let i = 1; i < L.length; i++) if (L[i] > L[j]) j = i;
      return [L[j], C[j][0]];
    }
    const Ldop = (d, Pthr, band = "5", z = Z.K90, eirp = null) => (isNone(eirp) ? EIRP_DEF[band] : eirp) - fspl(d, BANDS[band]) - Pthr - z * SIG;
    function classify(rooms, area) {   // класс по числу комнат (0 — студия); проверка площади по ориентирам п. 4.7
      const r = isNone(rooms) || rooms === "" ? null : +rooms, a = area ? +area : 0;
      let cls = (r === 0 || r === null) && a <= 35 ? "К1" : "К" + Math.min(5, Math.max(1, (r || 0) + 1));
      if (a > 90 && cls !== "К5" && (r || 0) >= 3) cls = "К5";
      const [lo, hi] = CLASS_AREA[cls];
      let warn = null;
      if (area && !(lo <= area && area <= hi)) warn = `площадь ${fmt(+area, 1)} м² вне ориентира класса ${cls} (${lo}–${hi} м²): план масштабируется, проверить замером`;
      return [cls, warn];
    }
    // ---------------------------------------------------------------- Ш3. требования
    function breq(dev) {
      const rows = Object.entries(dev).filter(([, n]) => n).map(([k, n]) => [DEV[k][0], n, DEV[k][1], DEV[k][2], n * DEV[k][1] * DEV[k][2]]);
      const B = (sumArr(rows.map((r) => r[4])) + B_CONST) * (1 + K_ZAP);
      return { rows, B, N: sumArr(Object.values(dev).map(Number)) };
    }
    // ---------------------------------------------------------------- узлы сети
    function nodeParams(e, lv, band) {   // PHY клиента 2×2 Wi-Fi 6 (KPI), 80 МГц; премиум — 160 МГц, если модель поддерживает
      const std = e.std;
      let phy, w;
      if (band === "2,4") { phy = std >= 6 ? "HE" : "HT"; w = 20; }
      else {
        phy = std >= 6 ? "HE" : std === 5 ? "VHT" : "HT";
        const wmax = Math.min(e.ch || 80, phy !== "HT" ? 160 : 40);
        w = Math.min(wmax, lv === 3 && AIR160 ? 160 : 80);
        if (phy === "HT") w = Math.min(w, 40);
      }
      let E = e.eirp && Object.keys(e.eirp).length ? e.eirp[band] : null;
      const est = isNone(E);
      E = (est ? EIRP_DEF[band] : Math.min(+E, EIRP_MAX[band])) + D_EIRP;
      const wan = e.wan || 0;
      let port = e.lan25 || wan >= 2500 ? 2500 : wan >= 1000 ? 1000 : 100;
      const lanp = e.lan25 ? 2500 : wan >= 1000 ? 1000 : 100;
      if (e.sat_port) port = Math.min(port, e.sat_port);
      return { phy, w, nss_c: Math.min(e.nss || 2, 2), nss: e.nss || 2, E, est, port, lanp };
    }
    function archAps(g, arch, entryAt) {
      const pos = g.pos, rt = entryAt === "центр" ? pos.center : pos.entry, s = pos.sat;
      if (arch === "А") return [[rt], [0]];
      if (arch === "Б") return [[pos.center], [cable(pos.entry, pos.center)]];
      if (arch.startsWith("В")) return [[rt, s[0]], [0, arch === "В-радио" ? 0 : cable(rt, s[0])]];
      return [[rt, s[0], s[1]], [0].concat(arch === "Г-радио" ? [0, 0] : [cable(rt, s[0]), cable(rt, s[1])])];
    }
    function archAllowed(g, arch, q) {
      if (arch === "Б" && (!q.cable_ok || q.entry_at === "центр")) return false;
      if ((arch === "В-кабель" || arch === "Г-кабель") && !q.cable_ok) return false;
      if (arch === "В-PL" && q.cable_ok) return false;   // Powerline — только если кабель проложить нельзя
      if (arch.startsWith("Г") && g.pos.sat.length < 2) return false;
      return true;
    }
    const nodesOf = (arch) => (arch === "А" || arch === "Б" ? 1 : arch.startsWith("В") ? 2 : 3);
    function meets(o, l) {
      const L = LEVELS[l];
      if (l === 3 && o.Kliv < 100) return false;
      return o[L.kkey] >= L.K && o.Pz >= L.Pz && o.SNRz >= L.SNR && o.TCPz >= L.TCP && !(o.bh.length && Math.min(...o.bh.map((b) => b.P)) < P_BH);
    }
    function evaluate(g, arch, nodes, lv, entryAt = "прихожая", plMbps = null, band = "5") {   // Ш4 + KPI (табл. 4.6)
      const [aps, cab] = archAps(g, arch, entryAt), L = LEVELS[lv];
      const Ps = aps.map((a, i) => rssi(g, a, band, nodes[i].E));
      const n = g.X.length, P = new Float64Array(n), srv = new Int8Array(n);
      for (let j = 0; j < n; j++) {
        let b = 0, v = Ps[0][j];
        for (let i = 1; i < Ps.length; i++) if (Ps[i][j] > v) { v = Ps[i][j]; b = i; }
        P[j] = v; srv[j] = b;
      }
      const out = { arch, aps, cable: cab, L: sumArr(cab), band };
      const share = (thr) => { let c = 0; for (let j = 0; j < n; j++) if (P[j] >= thr) c++; return c / n * 100; };
      out.K = share(P_THR); out.K90 = share(P_THR + Z.K90 * SIG); out.K95 = share(P_THR + Z.K95 * SIG);
      out.rooms = {};
      for (const nm of g.lrooms) out.rooms[nm] = pyRound(pct10(g.roomIdx[nm].map((j) => P[j])), 2);
      out.Pz = Math.min(...Object.values(out.rooms));
      out.Pz_room = g.lrooms.find((nm) => out.rooms[nm] === out.Pz);
      out.SNRz = out.Pz - N20;
      let pmin = Infinity, cl = 0;
      for (const j of g.livIdx) { if (P[j] < pmin) pmin = P[j]; if (P[j] >= P_THR) cl++; }
      out.Pmin = pmin; out.Kliv = cl / g.livIdx.length * 100;
      const tcp = new Float64Array(n), bh = [];
      let cond = false;
      const rootN = nodes[0];
      out.pl = null;
      for (let k = 0; k < aps.length; k++) {
        const nd = nodes[k], tab = rateTable(nd.phy, nd.nss_c, nd.w), a = aps[k];
        let f;
        if (k === 0) f = (R) => ETA * R;
        else if (arch.endsWith("радио")) {
          const b6 = !!nd.b6, bb = b6 ? "6" : band;   // трёхдиапазонный узел с 6 ГГц — выделенный backhaul
          const Pbh = rssi(g, aps[0], bb, bb === band ? rootN.E : EIRP_DEF["6"], [a[0]], [a[1]])[0];
          const Rbh = rphy1(Pbh, rateTable(nd.phy, nd.nss, nd.w));
          bh.push({ P: pyRound(Pbh, 2), R: pyRound(Rbh, 1), ded: b6 });
          f = b6 ? (R) => ETA * Math.min(Rbh, R) : (R) => ETA * (R > 0 ? Rbh * R / (Rbh + R + 1e-9) : 0.0);
        } else if (arch.endsWith("кабель")) {
          const cap = ETH * Math.min(rootN.lanp, nd.port);
          f = (R) => Math.min(ETA * R, cap);
        } else {   // Powerline: пропускная способность — по тесту на объекте
          f = isNone(plMbps) ? (R) => ETA * R : (R) => Math.min(ETA * R, plMbps);
          cond = isNone(plMbps); out.pl = isNone(plMbps) ? null : plMbps;
        }
        for (let j = 0; j < n; j++) if (srv[j] === k) tcp[j] = f(rphy1(P[j], tab));
      }
      const lanCap = ETH * rootN.lanp;   // сервер iperf3 подключён к LAN корневого узла
      for (let j = 0; j < n; j++) if (tcp[j] > lanCap) tcp[j] = lanCap;
      out.rooms_tcp = {};
      for (const nm of g.lrooms) out.rooms_tcp[nm] = pyRound(pct10(g.roomIdx[nm].map((j) => tcp[j])), 1);
      out.TCPz = Math.min(...Object.values(out.rooms_tcp));
      const tl = g.livIdx.map((j) => tcp[j]);
      out.C = Math.min(...tl) > 0 ? tl.length / pairwiseSum(tl.map((v) => 1 / Math.max(v, 1e-6)), 0, tl.length) : 0.0;   // гармоническое среднее
      out.bh = bh; out.conditional = cond;
      const f = [];
      if (out[L.kkey] < L.K) f.push(`K_пок(${L.kkey === "K90" ? "z=1,28" : "z=1,645"}) ${fmt(out[L.kkey], 1)} % < ${L.K} %`);
      if (out.Pz < L.Pz) f.push(`P_z ${fmt(out.Pz, 1)} < ${L.Pz} дБм`);
      if (out.SNRz < L.SNR) f.push(`SNR_z ${fmt(out.SNRz, 1)} < ${L.SNR} дБ`);
      if (out.TCPz < L.TCP) f.push(`TCP_z ${fmt(out.TCPz, 0)} < ${L.TCP} Мбит/с`);
      if (lv === 3 && out.Kliv < 100) f.push(`жилые зоны с P ≥ −67 дБм ${fmt(out.Kliv, 1)} % < 100 %`);
      if (bh.length && Math.min(...bh.map((b) => b.P)) < P_BH) f.push(`P_bh ${fmt(Math.min(...bh.map((b) => b.P)), 1)} < −46 дБм`);
      out.fails = f; out.ok = !f.length;
      out.level = Math.max(0, ...[1, 2, 3].filter((l) => meets(out, l)));
      return out;
    }
    // ---------------------------------------------------------------- Ш9. модели: нормализация показателей
    function k1raw(e) {
      const r2 = e.r2 || (CLASS_DEF[e.cls] || [867])[0];
      return 0.5 * r2 / 5765 + 0.25 * (e.nss || 2) / 4 + 0.15 * (e.std === 7) + 0.10 * e.bands.includes("6");
    }
    const K1MAX = Math.max(...CAT.map(k1raw));
    const k3raw = (e) => 0.4 * ((e.wan || 0) >= 2500) + 0.3 * Math.min(e.lan || 0, 4) / 4 + 0.3 * !!e.lan25;
    function k4raw(e) {
      const v = (x) => (isNone(x) ? 0.5 : +x);
      return (1 + v(e.iptv) + v(e.vpn) + 0.5 * v(e.usb) + v(e.fw)) / 4.5;
    }
    function medianPrice(cls) {
      const num = (a, b) => a - b;
      let ps = CAT.filter((e) => e.src === "Рынок" && e.cls === cls && e.type === "Роутер").map((e) => e.price).sort(num);
      if (ps.length < 3) {
        const std = cls.startsWith("BE") ? 7 : cls.startsWith("AX") ? 6 : cls.startsWith("AC") ? 5 : 4;
        ps = CAT.filter((e) => e.src === "Рынок" && e.std === std && e.type === "Роутер").map((e) => e.price).sort(num);
        if (!ps.length) ps = CAT.filter((e) => e.type === "Роутер").map((e) => e.price).sort(num);
      }
      const n = ps.length;
      return n % 2 ? +ps[(n - 1) / 2] : (ps[n / 2 - 1] + ps[n / 2]) / 2;
    }
    const empty = (v) => isNone(v) || v === "" || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
    function userItem(u, idx = 0) {   // обязательные поля — name, type, std, bands, wan, lan; остальное — по умолчанию (оценка)
      const miss = ["name", "type", "std", "bands", "wan", "lan"].filter((k) => isNone(u[k]) || u[k] === "" || (Array.isArray(u[k]) && !u[k].length));
      if (miss.length) throw new Error("не заполнены обязательные поля: " + miss.join(", "));
      const warn = [], std = parseInt(String(u.std).replace("Wi-Fi ", "").replace("6E", "6"), 10);
      if (![4, 5, 6, 7].includes(std)) throw new Error("стандарт Wi-Fi: 4, 5, 6, 6E или 7");
      if (![100, 1000, 2500, 5000, 10000].includes(+u.wan)) throw new Error("скорость WAN: 100, 1000, 2500, 5000 или 10000 Мбит/с");
      const cls = u.cls || STD_CLASS[std], d = CLASS_DEF[cls] || CLASS_DEF[STD_CLASS[std]];
      const eirp = {};
      for (const b of ["2,4", "5", "6"]) eirp[b] = u.eirp && !isNone(u.eirp[b]) && u.eirp[b] !== "" ? +u.eirp[b] : null;
      for (const b of ["2,4", "5", "6"]) {   // порядок диапазонов как в эталоне (ключи «5», «6» объект JS ставит первыми)
        const E = eirp[b];
        if (E === null) continue;
        if (!(E >= 0 && E <= 36)) throw new Error(`ЭИИМ ${b} ГГц: допустимо 0–36 дБм`);
        if (E > EIRP_MAX[b]) warn.push(`ЭИИМ ${b} ГГц ${fmt(E, 0)} дБм выше нормы РФ (${fmt(EIRP_MAX[b], 0)} дБм): в расчёте принято ${fmt(EIRP_MAX[b], 0)} дБм, мощность в настройках снизить`);
      }
      const est = ["eirp", "cls", "nss", "ch", "pw"].filter((k) => empty(u[k]));
      return { id: "U" + (idx + 1), name: u.name, brand: u.brand || "", type: u.type, std, wifi: "Wi-Fi " + u.std, cls, bands: [...u.bands],
        nss: u.nss || d[2], ch: u.ch || d[1], r2: u.r2 || d[0], wan: +u.wan, lan: +u.lan, lan25: !!u.lan25, u: u.u === undefined ? 1 : u.u,
        mesh: u.mesh || "не указан", src: "Пользователь", price: +(u.price || medianPrice(cls)), price_est: !u.price, owned: !!u.owned, eirp,
        tariff_max: isNone(u.tariff_max) ? null : u.tariff_max, dev_max: isNone(u.dev_max) ? null : u.dev_max, pw: u.pw || d[3],
        vpn: isNone(u.vpn) ? null : u.vpn, iptv: isNone(u.iptv) ? null : u.iptv, usb: isNone(u.usb) ? null : u.usb, fw: isNone(u.fw) ? null : u.fw,
        sale_off: false, nocat: false, sat_port: isNone(u.sat_port) ? null : u.sat_port, url: null, estimate: !!est.length, est_fields: est, warn };
    }
    // ---------------------------------------------------------------- Ш9. фильтры
    function filters(e, q, lv) {   // причины исключения модели (пустой список — модель допускается)
      const L = LEVELS[lv], r = [];
      if (e.sale_off) r.push("распродажа остатков (заказ партии не планируется)");
      if (!ROOT_TYPES.includes(e.type)) r.push(`тип «${e.type}» — не корневой узел`);
      if (e.std < L.std) r.push(`стандарт ${e.wifi ?? e.std} ниже требования уровня (Wi-Fi ${L.std})`);
      if (!e.bands.includes("5")) r.push("нет диапазона 5 ГГц");
      if (q.need6 && !e.bands.includes("6")) r.push("нет диапазона 6 ГГц");
      if (!q.need6 && e.bands.includes("6") && e.src !== "Пользователь") r.push("диапазон 6 ГГц — пакет П4-6G только по запросу абонента (И3)");
      const wmin = Math.max(q.tariff, L.wan);
      if ((e.wan || 0) < wmin) r.push(`WAN ${isNone(e.wan) ? "None" : e.wan} Мбит/с < ${wmin} Мбит/с`);
      if (e.tariff_max && e.tariff_max < q.tariff) r.push(`«тариф до» ${e.tariff_max} < ${q.tariff} Мбит/с`);
      if (e.dev_max && e.dev_max < 1.25 * q._N) r.push(`клиентов до ${e.dev_max} < 1,25 × ${q._N}`);
      for (const [k, lab] of [["iptv", "IPTV"], ["vpn", "VPN"]]) if (q[k] && !isNone(e[k]) && +e[k] === 0) r.push("нет " + lab);
      return r;
    }
    function notesOf(e, q) {
      const n = [];
      for (const [k, lab] of [["iptv", "IPTV"], ["vpn", "VPN"]]) {
        if (q[k] && isNone(e[k])) n.push(lab + " — уточнить");
        if (q[k] && e[k] === 0.5) n.push(lab + " — частично");
      }
      if (e.nocat) n.push("нет карточки в каталоге сайта К Телеком");
      if (e.sat_port) n.push(`порты спутника ${e.sat_port} Мбит/с`);
      if (Object.values(e.eirp || {}).every(isNone)) n.push("ЭИИМ по умолчанию (оценка)");
      if (e.pw_default) n.push("мощность по классу (оценка)");
      return n;
    }
    function configs(e) {   // 1 узел или n одинаковых узлов одной Mesh-экосистемы; комплект — n ≤ u узлов
      const meshok = !(isNone(e.mesh) || ["нет", "не подтверждён", "не указан"].includes(e.mesh));
      if (e.type === "Mesh-система") return [2, 3].map((n) => [n, Math.ceil(n / e.u)]);
      return [[1, 1]].concat(meshok ? [[2, 2], [3, 3]] : []);
    }
    function tco(priceEq, L, runs, nodesN, pw) {   // (4.19)
      const cab = L * (CAB + DUCT), lay = L * LAY + 2 * RJ * runs, st = nodesN === 1 ? SET1 : SET2;
      const capex = priceEq + cab + lay + st, opex = pw * nodesN * 8760 / 1000 * TARIFF * ANN;
      return { eq: priceEq, cab, lay, set: st, capex, opex, tco: capex + opex };
    }
    function runModel(g, e, q, lv) {   // архитектуры по порядку дерева до первой, где выполнены KPI уровня
      const nodes1 = nodeParams(e, lv, "5");
      nodes1.b6 = e.bands.includes("6");
      let bestFail = null;
      for (const [n, kits] of configs(e)) {
        for (const arch of ORDER) {
          if (nodesOf(arch) !== n || !archAllowed(g, arch, q)) continue;
          const o = evaluate(g, arch, Array(n).fill(nodes1), lv, q.entry_at, q.pl_mbps);
          if (o.ok && !o.conditional) {
            const runs = o.cable.filter((c) => c).length, buy = kits - (e.owned ? 1 : 0);   // своё оборудование: первый узел уже есть
            Object.assign(o, { n, kits, buy, cost: tco(buy * e.price, o.L, runs, n, e.pw) });
            return [o, null];
          }
          if (o.ok && o.conditional && bestFail === null) bestFail = { ...o, n, kits };
          if (bestFail === null || cmpKey([o.level, o.TCPz], [bestFail.level, bestFail.TCPz]) > 0) bestFail = { ...o, n, kits };
        }
      }
      return [null, bestFail];
    }
    const capacityOk = (o, q) => o.C >= q._Beff && (isNone(o.pl) || o.pl >= q._Beff);   // дерево: Powerline-тест ≥ B_эфф
    function refTree(g, q, lv) {   // Ш5: эталонный узел (AX3000 80 МГц; премиум — BE3600 160 МГц, LAN 2,5 Гбит/с)
      const ref = { std: lv === 3 ? 7 : 6, nss: 2, ch: 160, wan: lv === 3 ? 2500 : 1000, lan25: lv === 3, eirp: {}, bands: ["2,4", "5"] };
      const nref = nodeParams(ref, lv, "5"), tree = [];
      let archRef = null;
      for (const arch of ORDER) {
        if (!archAllowed(g, arch, q)) { tree.push({ arch, skip: true }); continue; }
        const n = nodesOf(arch), o = evaluate(g, arch, Array(n).fill(nref), lv, q.entry_at, q.pl_mbps), cok = capacityOk(o, q);
        tree.push({ arch, skip: false, ok: o.ok && cok, cond: o.conditional, fails: o.fails.concat(cok ? [] : [`C ${fmt(o.C, 0)} < B_эфф ${fmt(q._Beff, 0)}`]),
          K90: pyRound(o.K90, 1), K95: pyRound(o.K95, 1), Pz: pyRound(o.Pz, 1), TCPz: pyRound(o.TCPz), C: pyRound(o.C), L: o.L, level: o.level, bh: o.bh });
        if (archRef === null && tree[tree.length - 1].ok && !o.conditional) archRef = { ...o, n };
      }
      return [tree, archRef];
    }
    function freqPlan(o, lv) {
      const w = lv === 3 && o.TCPz > 720 ? 160 : 80;
      const p = ["2,4 ГГц: 20 МГц, каналы 1 / 6 / 11 (наименее загруженный по обзору эфира), ЭИИМ ≤ 20 дБм",
        `5 ГГц: ${w} МГц; ${w === 160 ? "каналы 36–64 (160 МГц — только при свободном эфире)" : "блоки 36–48, 52–64, 132–144 или 149–161"}; ЭИИМ ≤ 23 дБм; полоса 5470–5650 МГц (каналы 100–128) в РФ не выделена`];
      if (o.n > 1) p.push("Mesh: один SSID, 802.11k/v; " + (o.arch.endsWith("радио") ? "один канал 5 ГГц для всех узлов (беспроводной backhaul)" : "узлы на разных непересекающихся каналах 5 ГГц (кабельный backhaul)"));
      p.push("WPA3 (или WPA2/WPA3 Transitional), WPS выключен, пароль администратора сменён, прошивка обновлена", "отдельный SSID/VLAN для гостей и IoT" + (lv === 3 ? " (обязательно для премиума)" : ""));
      return p;
    }
    function cableJournal(g, o, q) {
      const j = [];
      o.aps.forEach((a, i) => {
        const L = o.cable[i];
        if (L) j.push({ n: j.length + 1, frm: o.arch === "Б" || q.entry_at !== "центр" ? "ввод (прихожая)" : "центр", to: o.arch === "Б" ? "корневой узел" : "спутник " + i,
          L, cat: "U/UTP кат. 5e (2,5GBASE-T до 100 м, IEEE 802.3bz)", route: "плинтус-канал / кабель-канал" });
      });
      return j;
    }
    function passport(g, o, lv) {   // прогноз для проверки (Ш11): уровень в центрах жилых помещений, TCP в худшей зоне
      const out = roomCenters(g).map(([room, x, y]) => ({ room, x: pyRound(x, 2), y: pyRound(y, 2),
        P: pyRound(Math.max(...o.aps.map((a) => rssi(g, a, "5", null, [x], [y])[0])), 1) }));
      return { points: out, Pz: o.Pz, TCPz: o.TCPz, kpi: LEVELS[lv].name };
    }
    function coverage(g, aps, E) {   // карта RSSI 5 ГГц рекомендованного варианта (для рисунка на сайте)
      const Ps = aps.map((a) => rssi(g, a, "5", E));
      const pts = [];
      for (let j = 0; j < g.X.length; j++) pts.push([pyRound(g.X[j], 3), pyRound(g.Y[j], 3), pyRound(Math.max(...Ps.map((p) => p[j])), 1)]);
      return { step: STEP, pts };
    }
    // ---------------------------------------------------------------- главный расчёт
    function calc(params) {
      const q = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...(params || {}) };
      const lv = parseInt(q.level, 10), L = LEVELS[lv];
      const R = { version: VERSION, input: JSON.parse(JSON.stringify(q)) };
      D_EIRP = +(q.d_eirp || 0.0); AIR160 = q.air160 === undefined ? true : !!q.air160;
      // Ш2
      let cls, warn;
      if (q.cls) { cls = q.cls; warn = null; } else [cls, warn] = classify(q.rooms, q.area);
      if (q.cls && q.area) {
        const [lo, hi] = CLASS_AREA[cls];
        if (!(lo <= q.area && q.area <= hi)) warn = `площадь ${fmt(+q.area, 1)} м² вне ориентира класса ${cls} (${lo}–${hi} м²)`;
      }
      const g = geometry(cls, q.area, q.constr, q.L_W1);
      const code = `${cls}-${g.plan.split("-")[1]}-${g.constr}`;
      const rt = q.entry_at === "центр" ? g.pos.center : g.pos.entry;
      const sh2 = { cls, code, plan: g.plan, area: pyRound(g.area, 1), k: pyRound(g.k, 3), warn, constr: g.constr, W1: g.WT.W1.map((x) => pyRound(x, 1)) };
      for (const [key, ap] of [["ic_A", rt], ["ic_B", g.pos.center]]) {
        const [ic, room] = Ic(g, ap);
        let dmax = -Infinity;
        for (const j of g.livIdx) dmax = Math.max(dmax, Math.hypot(g.X[j] - ap[0], g.Y[j] - ap[1]));
        const ld = Ldop(dmax, L.Pz);
        sh2[key] = { Ic: ic, room, dmax: pyRound(dmax, 2), Ldop: pyRound(ld, 1), one_node: ic <= ld };
      }
      R.sh2 = sh2;
      // Ш3
      const b = breq(q.dev);
      q._N = b.N; q._Beff = Math.min(b.B, q.tariff);
      R.sh3 = { B: pyRound(b.B, 2), Beff: pyRound(q._Beff, 1), N: b.N, rows: b.rows, level: lv, kpi: L,
        note: "B_эфф = min(B_треб, тариф) сравнивается с ёмкостью сети C (гармоническое среднее TCP по жилой площади)" };
      // Ш4–Ш5: эталонный узел
      const [tree, archRef] = refTree(g, q, lv);
      // устойчивость решения Ш5: площадь ±5 %, потери несущей стены ±2 дБ
      const rob = [], W15 = g.WT.W1[1];
      const variants = q.robust === false ? [] : [["S −5 %", { area: g.area * 0.95 }], ["S +5 %", { area: g.area * 1.05 }], ["W1 −2 дБ", { L_W1: W15 - 2 }], ["W1 +2 дБ", { L_W1: W15 + 2 }]];
      for (const [lab, kw] of variants) {
        const gg = geometry(cls, "area" in kw ? kw.area : g.area, g.constr, "L_W1" in kw ? kw.L_W1 : q.L_W1);
        const ar = refTree(gg, q, lv)[1];
        rob.push([lab, ar ? ar.arch : null]);
      }
      R.robust = { variants: rob, stable: rob.every(([, a]) => a === (archRef ? archRef.arch : null)) };
      if (!R.robust.stable) R.robust.note = "решение на границе: при малом изменении площади или потерь стены архитектура меняется; выполнить замер «до» (блок H чек-листа) и при сомнении принять более надёжный вариант";
      R.tree = tree;
      R.arch_ref = archRef === null ? null : Object.fromEntries(["arch", "aps", "cable", "L", "K90", "K95", "Pz", "SNRz", "TCPz", "C", "rooms", "bh", "n"].map((k) => [k, archRef[k]]));
      R.flag = archRef ? null : "типовые архитектуры не обеспечивают KPI уровня — нужен индивидуальный проект (Ш6) с замерами; см. условные варианты (Powerline после теста)";
      // Ш9: каталог + пользовательское оборудование
      const items = (q.catalog === false ? [] : CAT.slice()).concat((q.user || []).map((u, i) => userItem(u, i)));
      const excl = [];
      let cand = [];
      for (const e of items) {
        const rs = filters(e, q, lv);
        if (rs.length && e.src !== "Пользователь") { excl.push({ id: e.id, name: e.name, src: e.src, why: rs }); continue; }
        let [o, bf] = runModel(g, e, q, lv);
        if (o !== null && !capacityOk(o, q)) { bf = { ...o, fails: o.fails.concat([`C ${fmt(o.C, 0)} < B_эфф ${fmt(q._Beff, 0)}`]) }; o = null; }
        if (o !== null && q.budget && o.cost.capex > q.budget) { bf = { ...o, fails: [`CAPEX ${fmt(o.cost.capex, 0)} > бюджета ${fmt(+q.budget, 0)}`] }; o = null; }
        if (o === null || rs.length) {
          let why = rs.concat(bf && !rs.length ? [`KPI не выполнены ни в одной архитектуре: лучший уровень ${bf.level} (${bf.arch})`].concat(bf.fails.slice(0, 2)) : []);
          if (o !== null && rs.length) why = rs;
          if (e.src === "Пользователь" && configs(e).length === 1) why = why.concat(["Mesh-экосистема не указана — варианты из 2–3 узлов не рассчитывались"]);
          excl.push({ id: e.id, name: e.name, src: e.src, why, best: !bf ? null : { arch: bf.arch, level: bf.level, TCPz: pyRound(bf.TCPz), Pz: pyRound(bf.Pz, 1), cond: !!bf.conditional },
            user: e.src === "Пользователь", warn: e.warn || [], estimate: e.estimate || false });
          continue;
        }
        cand.push({ e, o });
      }
      // ценовой сегмент уровня (И3): в ранжирование входят варианты с ценой оборудования не выше границы сегмента
      const cap = SEG_CAP[lv];
      let above = [];
      if (cap !== null) {
        above = cand.filter((c) => c.o.cost.eq > cap && c.e.src === "Рынок");
        const pool = cand.filter((c) => !above.includes(c));
        if (pool.length || !cand.length) cand = pool;
        else { above = []; R.seg_note = `нет вариантов в ценовом сегменте уровня — показаны варианты дороже ${fmt(cap, 0)} руб.`; }
      }
      for (const c of above) excl.push({ id: c.e.id, name: c.e.name, src: c.e.src, why: [`оборудование ${fmt(c.o.cost.eq, 0)} руб. выше границы сегмента уровня ${fmt(cap, 0)} руб.`], seg: true });
      // ранжирование: S = Σ w_j·k_j (веса AHP уровня)
      const w = AHP[L.ahp];
      if (cand.length) {
        const tmax = Math.max(...cand.map((c) => c.o.TCPz));
        const own = cand.filter((c) => !c.e.owned).map((c) => c.o.cost.tco);
        const tminTco = Math.min(...(own.length ? own : cand.map((c) => c.o.cost.tco)));
        for (const c of cand) {
          const { e, o } = c;
          const k1 = 0.5 * o.TCPz / tmax + 0.5 * Math.min(1.0, k1raw(e) / K1MAX);
          const k2 = 0.5 * o[L.kkey] / 100 + 0.5 * Math.min(1.0, Math.max(0.0, (o.Pz - L.Pz) / 10));
          c.k = [k1, k2, k3raw(e), k4raw(e), Math.min(1.0, tminTco / o.cost.tco)];
          c.S = w.reduce((s, a, i) => s + a * c.k[i], 0);
        }
        cand.sort((a, b) => cmpKey([-pyRound(a.S, 6), a.e.src !== "К Телеком", a.o.cost.tco], [-pyRound(b.S, 6), b.e.src !== "К Телеком", b.o.cost.tco]));
      }
      function card(c, role) {
        const { e, o } = c, cs = o.cost;
        const buy = o.buy === undefined ? o.kits : o.buy;
        const notes = notesOf(e, q)
          .concat(SEG_CAP[lv] && cs.eq > SEG_CAP[lv] ? [`выше ценового сегмента уровня (${fmt(SEG_CAP[lv], 0)} руб.)`] : [])
          .concat(e.src === "Пользователь" ? ["пользовательское" + (e.owned ? ": первый узел уже есть" : "") + (e.price_est && (o.buy === undefined ? 1 : o.buy) ? `; цена узла ${fmt(e.price, 0)} руб. — медиана рынка (оценка)` : "")] : [])
          .concat(o.pl ? [`Powerline: пропускная способность ${Math.trunc(o.pl)} Мбит/с по тесту; стоимость адаптеров не учтена`] : [])
          .concat(e.estimate ? ["оценка: " + e.est_fields.join(", ")] : [])
          .concat(e.warn || []);
        return { role, id: e.id, name: e.name, src: e.src, type: e.type, wifi: e.wifi, cls: e.cls, n: o.n, kits: o.kits,
          arch: o.arch, arch_name: ARCH_NAME[o.arch], aps: o.aps, cable: o.cable, L: o.L, K90: pyRound(o.K90, 1), K95: pyRound(o.K95, 1),
          Pz: pyRound(o.Pz, 1), Pz_room: o.Pz_room, SNRz: pyRound(o.SNRz, 1), TCPz: pyRound(o.TCPz), C: pyRound(o.C), bh: o.bh, rooms: o.rooms,
          margin: { Pz: pyRound(o.Pz - L.Pz, 1), TCP: pyRound(o.TCPz / L.TCP, 2), C: pyRound(o.C / Math.max(q._Beff, 1e-9), 2) },
          price: e.price, buy, eq: cs.eq, capex: pyRound(cs.capex), opex: pyRound(cs.opex), tco: pyRound(cs.tco),
          rub_m2: pyRound(cs.tco / g.area), rub_mbps: pyRound(cs.tco / o.TCPz, 1), k: c.k.map((x) => pyRound(x, 3)), S: pyRound(c.S, 3),
          notes, url: e.url === undefined ? null : e.url };
      }
      const rec = {};
      const kt = cand.filter((c) => c.e.src === "К Телеком");
      let optCand = null;
      if (cand.length) {
        optCand = kt.length ? kt[0] : cand[0];
        rec.opt = card(optCand, "оптимум");
        if (!kt.length) rec.opt.notes.unshift("нет в каталоге К Телеком: ни одна модель парка не проходит фильтры и KPI");
        const rest = cand.filter((c) => c !== optCand);
        if (rest.length) {
          const eco = minBy(rest, (c) => [pyRound(c.o.cost.tco), c.e.src !== "К Телеком", -c.S]);
          rec.eco = card(eco, "эконом");
          const rest2 = rest.filter((c) => c !== eco);
          if (rest2.length) rec.res = card(maxBy(rest2, (c) => [pyRound(c.o.TCPz), c.S]), "запас");
        }
        const mk = cand.filter((c) => c.e.src === "Рынок");
        if (mk.length) rec.best_market = card(mk[0], "лучший рынка");
        const us = cand.filter((c) => c.e.src === "Пользователь");
        if (us.length) rec.user = us.map((c) => card(c, "пользовательское"));
      }
      if (!kt.length && q.catalog !== false) {   // в парке нет подходящей модели: ближайший вариант парка без требования к стандарту
        const fb = [];
        for (const e of CAT) {
          if (e.src !== "К Телеком" || filters(e, q, lv).some((x) => !x.startsWith("стандарт"))) continue;
          const [o, bf] = runModel(g, e, q, lv), x = o || bf;
          if (x) fb.push([e, x, o !== null]);
        }
        if (fb.length) {
          const [e, x, ok] = maxBy(fb, (t) => [t[2], t[1].level, t[1].TCPz, -t[0].price]);
          const stdOnly = ok && e.std < L.std;
          const why = stdOnly ? `в парке К Телеком нет модели стандарта Wi-Fi ${L.std} (требование уровня «${L.name}»); ближайший вариант парка выполняет остальные KPI`
            : `модели парка К Телеком не выполняют KPI уровня «${L.name}» в допустимых архитектурах; лучший вариант парка — уровень ${x.level}${x.conditional ? " (условно: Powerline после теста)" : ""}`;
          rec.kt_fallback = { id: e.id, name: e.name, wifi: e.wifi, n: x.n, arch: x.arch, TCPz: pyRound(x.TCPz), Pz: pyRound(x.Pz, 1), level: x.level, kpi_ok: ok,
            conditional: !!x.conditional, why };
        }
      }
      R.rec = rec;
      if (!cand.length) {   // нет ни одного варианта: максимально достижимый уровень
        const be = excl.filter((x) => x.best);
        if (be.length) {
          const x = maxBy(be, (t) => [t.best.level, t.best.TCPz]), cnd = x.best.cond;
          R.best_effort = { name: x.name, src: x.src, ...x.best, why: `ни один вариант не выполняет KPI уровня «${L.name}»; ` +
            (cnd ? `условный вариант — ${ARCH_NAME[x.best.arch]}: нужен тест Powerline ≥ ${fmt(q._Beff, 0)} Мбит/с (B_эфф)` : `максимально достижимый уровень — ${x.best.level}`) };
        }
      }
      R.rank = cand.map((c) => ({ id: c.e.id, name: c.e.name, src: c.e.src, n: c.o.n, arch: c.o.arch, TCPz: pyRound(c.o.TCPz), Pz: pyRound(c.o.Pz, 1),
        tco: pyRound(c.o.cost.tco), S: pyRound(c.S, 3), k: c.k.map((x) => pyRound(x, 3)) }));
      R.excluded = excl;
      R.counts = { total: items.length, passed: cand.length, passed_kt: kt.length, excluded: excl.length };
      // Ш6–Ш8, Ш12 для рекомендованного варианта
      if (rec.opt) {
        const o = rec.opt;
        R.sh6 = { aps: o.aps, roles: ["корневой узел"].concat(Array.from({ length: o.n - 1 }, (_, i) => "спутник " + (i + 1))), cable: o.cable };
        R.sh7 = freqPlan(o, lv); R.sh8 = cableJournal(g, o, q); R.sh12 = passport(g, o, lv);
        R.map = coverage(g, o.aps, nodeParams(optCand.e, lv, "5").E);
      }
      R.geom = { W: pyRound(g.W, 2), H: pyRound(g.H, 2), pos: g.pos, rooms: g.rooms, walls: g.walls, title: g.title };
      return R;
    }
    return { calc, K1MAX, catalog: CAT, plans: PLD, medianPrice, userItem, classify, breq, Ldop };
  }
  root.NetEngine = { VERSION, create, pyRound, fmt, pct10, arange, rateTable, rphy1, fspl, LEVELS, DEV, ARCH_NAME, ORDER, CLASS_DEF, STD_CLASS,
    CLASS_AREA, PLAN_OF, EIRP_DEF, EIRP_MAX, DEFAULTS, AHP, ANN, N20 };
  if (typeof module !== "undefined" && module.exports) module.exports = root.NetEngine;
})(typeof globalThis !== "undefined" ? globalThis : this);
