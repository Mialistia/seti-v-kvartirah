// Планировка квартиры в форме калькулятора (блок A): выбор типового плана К1–К5 (plans.json, И2) или своя планировка с нуля;
// редактор: помещения (название, тип, деление стеной, объединение) и стены (тип, сдвиг, дверь, удаление). Общая площадь фиксирована — A2.
// Результат — своя планировка в формате plans.json: q.plan → engine.js (без масштабирования, код квартиры со «*»).
// Места узлов: типовые (И4) или по правилам размещения (Ш6): корневой узел — ближе к геометрическому центру, в жилой комнате или кухне;
// спутник — примерно посередине между корневым узлом и худшей точкой покрытия, между узлами не больше одной несущей стены.
// Подключается после plan.js, до layout-ui.js (блок формы) и calc.js. Функции проверяются в tests/calc.test.mjs.
(function (root) {
  "use strict";
  const NE = root.NetEngine, NP = root.NetPlan;
  if (!NE) throw new Error("layout.js: сначала подключите engine.js");
  const GL = root.NetGlossary, q = (id) => (GL && GL.has(id) ? GL.q(id) : "");
  const EPS = 1e-6, MIN = 0.3, SNAP = 0.05, DOOR = 0.8, CLR = 0.3, STEP = 0.25;
  const eq = (a, b) => Math.abs(a - b) < EPS;
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fm = (v, nd = 2) => NE.fmt(v, nd).replace(".", ",");
  const RT = [["ж", "жилая комната"], ["к", "кухня"], ["п", "прихожая, коридор"], ["с", "санузел, ванная"], ["х", "кладовая, гардеробная"]];
  const RNAME = { "ж": "Комната", "к": "Кухня", "п": "Коридор", "с": "Санузел", "х": "Кладовая" };
  const WTYPES = ["W1", "W7b", "W2", "W7a", "W3", "W4", "W6", "O"];
  const WALL = (NP && NP.WALL) || {}, WNAME = (NP && NP.WALL_NAME) || {};
  const RF = (NP && NP.ROOM_FILL) || { "ж": "#f5f5f5", "к": "#fff8e1", "с": "#e3f2fd", "п": "#eeeeee", "х": "#e0e0e0" };
  const wname = (t) => (t === "O" ? "проём без двери" : WNAME[t] || t);
  const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
  const big = (rs) => rs.reduce((a, r) => (area(r) > area(a) ? r : a));
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

  // ---------------------------------------------------------------- план: типовой (И2) под площадь, с нуля
  const nsatOf = (PLD, cls) => PLD.plans[NE.PLAN_OF[cls]].pos.sat.length;   // спутников — как в типовом плане класса (И4)
  function fromTemplate(PLD, cls, S) {
    const code = NE.PLAN_OF[cls], pl = PLD.plans[code], k = S ? Math.sqrt(S / pl.area) : 1, sc = (v) => r4(v * k), pt = (p) => p.map(sc);
    const W = sc(pl.W), H = sc(pl.H);
    return { v: 1, cls, base: code, title: pl.title, W, H, area: W * H, auto: false,
      rooms: pl.rooms.map(([n, t, rs]) => [n, t, rs.map((r) => r.map(sc))]), walls: pl.walls.map((w) => w.slice(0, 4).map(sc).concat(w[4])),
      pos: { entry: pt(pl.pos.entry), center: pt(pl.pos.center), sat: pl.pos.sat.map(pt) },
      door: (pl.door || []).map(pt), windows: (pl.windows || []).map((w) => w.map(pt)) };
  }
  function doorOn(W, H, side, off) {   // входная дверь DOOR м на стороне контура, off — отступ от угла
    const L = side === "лево" || side === "право" ? H : W, a = r4(Math.max(0, Math.min(+off || 0, L - DOOR))), b = r4(a + DOOR);
    return side === "верх" ? [[a, 0], [b, 0]] : side === "лево" ? [[0, a], [0, b]] : side === "право" ? [[W, a], [W, b]] : [[a, H], [b, H]];
  }
  function blank(PLD, cls, S, W, side = "низ", off = 0.4) {
    W = r4(W); const H = r4(S / W);
    const pl = { v: 1, cls, base: null, title: "Своя планировка", W, H, area: W * H, auto: true, rooms: [["Комната 1", "ж", [[0, 0, W, H]]]], walls: [],
      pos: null, door: doorOn(W, H, side, off), windows: [] };
    pl.pos = autoPos(pl, nsatOf(PLD, cls), PLD.WT);
    return pl;
  }
  function rescale(pl0, S) {   // своя планировка под новую площадь A2: пропорции сохраняются
    const pl = clone(pl0), k = Math.sqrt(S / (pl.W * pl.H)), sc = (v) => r4(v * k), pt = (p) => p.map(sc);
    pl.W = sc(pl.W); pl.H = sc(pl.H); pl.area = pl.W * pl.H;
    for (const rm of pl.rooms) rm[2] = rm[2].map((r) => r.map(sc));
    pl.walls = pl.walls.map((w) => w.slice(0, 4).map(sc).concat(w[4]));
    pl.pos = { entry: pt(pl.pos.entry), center: pt(pl.pos.center), sat: pl.pos.sat.map(pt) };
    pl.door = (pl.door || []).map(pt); pl.windows = (pl.windows || []).map((w) => w.map(pt));
    return pl;
  }
  const same = (a, b) => !!a && !!b && JSON.stringify([a.rooms, a.walls, a.pos, a.W, a.H]) === JSON.stringify([b.rooms, b.walls, b.pos, b.W, b.H]);

  // ---------------------------------------------------------------- отрезки, границы помещений, прямые
  // отрезок на прямой: o — "v" (x = c) или "h" (y = c), [a, b] — вдоль прямой
  const wseg = (w) => (eq(w[0], w[2]) && !eq(w[1], w[3]) ? { o: "v", c: w[0], a: Math.min(w[1], w[3]), b: Math.max(w[1], w[3]) }
    : eq(w[1], w[3]) && !eq(w[0], w[2]) ? { o: "h", c: w[1], a: Math.min(w[0], w[2]), b: Math.max(w[0], w[2]) } : null);
  const mkW = (o, c, a, b, t) => (o === "v" ? [c, a, c, b, t] : [a, c, b, c, t]);
  function edges(pl) {   // рёбра прямоугольников помещений; s = 1 — прямоугольник за прямой (больше c), −1 — перед ней
    const out = [];
    pl.rooms.forEach(([, , rs], ri) => rs.forEach((r) => out.push({ o: "v", c: r[0], a: r[1], b: r[3], s: 1, ri }, { o: "v", c: r[2], a: r[1], b: r[3], s: -1, ri },
      { o: "h", c: r[1], a: r[0], b: r[2], s: 1, ri }, { o: "h", c: r[3], a: r[0], b: r[2], s: -1, ri })));
    return out;
  }
  function bounds(pl) {   // границы между разными помещениями
    const E = edges(pl), out = [];
    for (const e of E) if (e.s === -1) for (const f of E) if (f.s === 1 && f.o === e.o && f.ri !== e.ri && eq(f.c, e.c)) {
      const a = Math.max(e.a, f.a), b = Math.min(e.b, f.b);
      if (b - a > EPS) out.push({ o: e.o, c: e.c, a, b, r1: e.ri, r2: f.ri });
    }
    return out;
  }
  function subtract(iv, cuts) {
    let rest = [iv];
    for (const [ca, cb] of cuts) rest = rest.flatMap(([a, b]) => (cb <= a + EPS || ca >= b - EPS ? [[a, b]] : [[a, ca], [cb, b]].filter(([x, y]) => y - x > EPS)));
    return rest;
  }
  const onLine = (s, o, c) => s && s.o === o && eq(s.c, c);
  function openB(pl) {   // границы помещений без стены (зоны, проходы)
    const S = pl.walls.map(wseg);
    return bounds(pl).flatMap((bd) => subtract([bd.a, bd.b], S.filter((s) => onLine(s, bd.o, bd.c)).map((s) => [s.a, s.b])).map(([a, b]) => ({ o: bd.o, c: bd.c, a, b })));
  }
  function junctions(pl, o, c) {   // точки прямой, где к ней примыкают перпендикулярные стены и границы
    const p = o === "v" ? "h" : "v", J = [];
    for (const s of pl.walls.map(wseg).concat(openB(pl))) if (s && s.o === p && (eq(s.a, c) || eq(s.b, c))) J.push(r4(s.c));
    return [...new Set(J)].sort((a, b) => a - b);
  }
  // участок прямой (o, c), содержащий точку t: вся линия из стен и границ или (part) — между соседними примыканиями
  function extentAt(pl, o, c, t, part) {
    const iv = pl.walls.map(wseg).filter((s) => onLine(s, o, c)).map((s) => [s.a, s.b])
      .concat(openB(pl).filter((s) => onLine(s, o, c)).map((s) => [s.a, s.b])).sort((x, y) => x[0] - y[0]);
    const m = [];
    for (const [a, b] of iv) { if (m.length && a <= m[m.length - 1][1] + EPS) m[m.length - 1][1] = Math.max(m[m.length - 1][1], b); else m.push([a, b]); }
    const comp = m.find(([a, b]) => t >= a - EPS && t <= b + EPS);
    if (!comp) return null;
    let [lo, hi] = comp;
    if (part) for (const j of junctions(pl, o, c)) { if (j > lo + EPS && j < hi - EPS) { if (j <= t) lo = j; else { hi = j; break; } } }
    return { o, c, lo, hi };
  }
  function range(pl, ext) {   // куда можно сдвинуть участок: прилегающие помещения не уже MIN
    const { o, c, lo, hi } = ext, V = o === "v";
    let mn = 0, mx = V ? pl.W : pl.H;
    for (const [, , rs] of pl.rooms) for (const r of rs) {
      const [a0, b0, a1, b1] = V ? r : [r[1], r[0], r[3], r[2]];
      if (b1 <= lo + EPS || b0 >= hi - EPS) continue;
      if (eq(a1, c)) mn = Math.max(mn, Math.min(c, a0 + MIN));
      if (eq(a0, c)) mx = Math.min(mx, Math.max(c, a1 - MIN));
    }
    return [mn, mx];
  }
  function cut(parts, pts) { for (const p of pts) parts = parts.flatMap(([x, y]) => (p > x + EPS && p < y - EPS ? [[x, p], [p, y]] : [[x, y]])); return parts; }
  function setEnd(w, P, c, c2) { if (P === "h") { if (eq(w[0], c)) w[0] = c2; else if (eq(w[2], c)) w[2] = c2; } else if (eq(w[1], c)) w[1] = c2; else if (eq(w[3], c)) w[3] = c2; }
  function shift(pl, P, y, c, c2) {   // перпендикулярная линия (P, y): концы стен в c → c2; стена впереди короче сдвига поглощается
    const d = Math.sign(c2 - c), del = new Set();
    const on = pl.walls.map((w, i) => [wseg(w), i]).filter(([s]) => onLine(s, P, y));
    for (const [s, i] of on) if ((eq(s.a, c) || eq(s.b, c)) && Math.sign((eq(s.a, c) ? s.b : s.a) - c) !== d) setEnd(pl.walls[i], P, c, c2);
    let cur = c;
    for (;;) {
      const nx = on.find(([s, i]) => !del.has(i) && (eq(s.a, cur) || eq(s.b, cur)) && Math.sign((eq(s.a, cur) ? s.b : s.a) - cur) === d);
      if (!nx) break;
      const [s, i] = nx, far = eq(s.a, cur) ? s.b : s.a;
      if ((far - c2) * d > 0.01) { setEnd(pl.walls[i], P, cur, c2); break; }
      del.add(i); cur = far;
    }
    if (del.size) pl.walls = pl.walls.filter((w, i) => !del.has(i));
  }
  function moveLine(pl0, ext, c2) {   // сдвинуть участок прямой: стены на нём, края помещений, примыкающие стены
    const pl = clone(pl0), { o, c, lo, hi } = ext, V = o === "v", P = V ? "h" : "v";
    c2 = r4(c2);
    if (eq(c, c2)) return pl;
    pl.walls = pl.walls.flatMap((w) => { const s = wseg(w); return onLine(s, o, c) ? cut([[s.a, s.b]], [lo, hi]).map(([a, b]) => mkW(o, c, a, b, w[4])) : [w]; });
    for (const rm of pl.rooms) rm[2] = rm[2].flatMap((r) => {
      const [i0, i1, j0, j1] = V ? [0, 2, 1, 3] : [1, 3, 0, 2];
      if (!eq(r[i0], c) && !eq(r[i1], c)) return [r];
      return cut([[r[j0], r[j1]]], [lo, hi]).map(([x, y]) => { const n = r.slice(); n[j0] = x; n[j1] = y; return n; });
    });
    const ys = [...new Set(pl.walls.map(wseg).filter((s) => s && s.o === P && s.c >= lo - EPS && s.c <= hi + EPS && (eq(s.a, c) || eq(s.b, c))).map((s) => s.c))];
    for (const w of pl.walls) { const s = wseg(w); if (onLine(s, o, c) && s.a >= lo - EPS && s.b <= hi + EPS) { if (V) w[0] = w[2] = c2; else w[1] = w[3] = c2; } }
    for (const y of ys) shift(pl, P, y, c, c2);
    for (const rm of pl.rooms) for (const r of rm[2]) {
      const [i0, i1, j0, j1] = V ? [0, 2, 1, 3] : [1, 3, 0, 2];
      if (r[j0] < lo - EPS || r[j1] > hi + EPS) continue;
      if (eq(r[i0], c)) r[i0] = c2;
      if (eq(r[i1], c)) r[i1] = c2;
    }
    return normalize(pl);
  }
  function normalize(pl) {   // округление, порядок концов, слияние соседних стен одного типа и прямоугольников одного помещения
    let ws = pl.walls.map((w) => w.slice(0, 4).map(r4).concat(w[4])).filter((w) => wseg(w))
      .map((w) => (w[0] > w[2] || w[1] > w[3] ? [w[2], w[3], w[0], w[1], w[4]] : w));
    for (let ch = true; ch;) {
      ch = false;
      for (let i = 0; i < ws.length && !ch; i++) for (let j = 0; j < ws.length && !ch; j++) {
        if (i === j || ws[i][4] !== ws[j][4]) continue;
        const a = wseg(ws[i]), b = wseg(ws[j]);
        if (a.o !== b.o || !eq(a.c, b.c) || b.a > a.b + EPS || b.b < a.a - EPS) continue;
        ws[i] = mkW(a.o, a.c, Math.min(a.a, b.a), Math.max(a.b, b.b), ws[i][4]); ws.splice(j, 1); ch = true;
      }
    }
    pl.walls = ws;
    for (const rm of pl.rooms) {
      const rs = rm[2].map((r) => r.map(r4)).filter((r) => r[2] - r[0] > EPS && r[3] - r[1] > EPS);
      for (let ch = true; ch;) {
        ch = false;
        for (let i = 0; i < rs.length && !ch; i++) for (let j = 0; j < rs.length && !ch; j++) {
          const A = rs[i], B = rs[j];
          if (i === j) continue;
          if (eq(A[0], B[0]) && eq(A[2], B[2]) && eq(A[3], B[1])) { rs[i] = [A[0], A[1], A[2], B[3]]; rs.splice(j, 1); ch = true; }
          else if (eq(A[1], B[1]) && eq(A[3], B[3]) && eq(A[2], B[0])) { rs[i] = [A[0], A[1], B[2], A[3]]; rs.splice(j, 1); ch = true; }
        }
      }
      rm[2] = rs;
    }
    pl.rooms = pl.rooms.filter((rm) => rm[2].length);
    pl.area = pl.W * pl.H;
    return pl;
  }

  // ---------------------------------------------------------------- действия редактора (возвращают новый план)
  const uniq = (pl, base) => { let i = 1, n; do n = `${base} ${i++}`; while (pl.rooms.some((r) => r[0] === n)); return n; };
  function splitRoom(pl0, ri, dir, t = "W2", door = true) {   // разделить наибольший прямоугольник помещения посередине; t = "" — без стены (зона)
    const pl = clone(pl0), rm = pl.rooms[ri], r = big(rm[2]), V = dir === "v", a0 = V ? r[0] : r[1], a1 = V ? r[2] : r[3];
    if (a1 - a0 < 2 * MIN + SNAP) throw new Error(`помещение слишком узкое для деления: нужно не меньше ${fm(2 * MIN + SNAP)} м`);
    const m = r4(Math.min(a1 - MIN, Math.max(a0 + MIN, Math.round((a0 + a1) / 2 / SNAP) * SNAP)));
    const k = rm[2].indexOf(r), nr = V ? [m, r[1], r[2], r[3]] : [r[0], m, r[2], r[3]];
    rm[2][k] = V ? [r[0], r[1], m, r[3]] : [r[0], r[1], r[2], m];
    pl.rooms.splice(ri + 1, 0, [uniq(pl, RNAME[rm[1]] || "Помещение"), rm[1], [nr]]);
    const b0 = V ? r[1] : r[0], b1 = V ? r[3] : r[2];
    if (t) {
      if (door && b1 - b0 >= DOOR + 0.4) {
        const d0 = r4(Math.round(((b0 + b1) / 2 - DOOR / 2) / SNAP) * SNAP), d1 = r4(d0 + DOOR);
        pl.walls.push(mkW(dir, m, b0, d0, t), mkW(dir, m, d0, d1, "W4"), mkW(dir, m, d1, b1, t));
      } else pl.walls.push(mkW(dir, m, b0, b1, t));
    }
    return finish(normalize(pl));
  }
  function neighbors(pl, ri) { return [...new Set(bounds(pl).filter((b) => b.r1 === ri || b.r2 === ri).map((b) => (b.r1 === ri ? b.r2 : b.r1)))]; }
  function mergeRooms(pl0, ri, rj) {   // объединить соседние помещения: стены на общей границе убираются
    const pl = clone(pl0), sh = bounds(pl).filter((b) => (b.r1 === ri && b.r2 === rj) || (b.r1 === rj && b.r2 === ri));
    if (!sh.length) throw new Error("помещения не соседние");
    pl.walls = pl.walls.flatMap((w) => {
      const s = wseg(w), cs = sh.filter((b) => onLine(s, b.o, b.c)).map((b) => [b.a, b.b]);
      return cs.length ? subtract([s.a, s.b], cs).map(([a, b]) => mkW(s.o, s.c, a, b, w[4])) : [w];
    });
    pl.rooms[ri][2] = pl.rooms[ri][2].concat(pl.rooms[rj][2]);
    pl.rooms.splice(rj, 1);
    return finish(normalize(pl));
  }
  function setRoom(pl0, ri, name, type) {
    const pl = clone(pl0), rm = pl.rooms[ri];
    if (name !== undefined) { const n = String(name).trim().slice(0, 40); if (!n) throw new Error("укажите название"); if (pl.rooms.some((r, i) => i !== ri && r[0] === n)) throw new Error(`помещение «${n}» уже есть`); rm[0] = n; }
    if (type !== undefined && RNAME[type]) rm[1] = type;
    return finish(pl);
  }
  function setWall(pl0, wi, t) {   // тип участка стены; "" — убрать стену
    const pl = clone(pl0);
    if (t) pl.walls[wi][4] = t; else pl.walls.splice(wi, 1);
    return finish(normalize(pl));
  }
  function addWall(pl0, seg, t) { const pl = clone(pl0); pl.walls.push(mkW(seg.o, seg.c, seg.a, seg.b, t)); return finish(normalize(pl)); }
  function insertDoor(pl0, wi, at) {   // дверь DOOR м в участке стены около точки at
    const pl = clone(pl0), w = pl.walls[wi], s = wseg(w);
    if (s.b - s.a < DOOR + 0.1) throw new Error(`участок короче ${fm(DOOR + 0.1)} м — дверь не помещается`);
    const d0 = r4(Math.min(s.b - DOOR, Math.max(s.a, Math.round(((at ?? (s.a + s.b) / 2) - DOOR / 2) / SNAP) * SNAP))), d1 = r4(d0 + DOOR);
    pl.walls.splice(wi, 1, ...[[s.a, d0, w[4]], [d0, d1, "W4"], [d1, s.b, w[4]]].filter(([a, b]) => b - a > 0.01).map(([a, b, t]) => mkW(s.o, s.c, a, b, t)));
    return finish(pl);
  }
  let PL_DATA = null;   // plans.json — для автоматической расстановки узлов (finish)
  function finish(pl) { if (pl.auto && PL_DATA) pl.pos = autoPos(pl, pl.pos ? pl.pos.sat.length : nsatOf(PL_DATA, pl.cls), PL_DATA.WT, !!pl.base); return pl; }

  // ---------------------------------------------------------------- места узлов по правилам размещения (Ш6)
  function segDist(p, w) {
    const [x1, y1, x2, y2] = w, dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / L)) : 0;
    return Math.hypot(p[0] - x1 - t * dx, p[1] - y1 - t * dy);
  }
  function cross(a, b, w) {
    const [x1, y1, x2, y2] = w;
    const d1 = (b[0] - a[0]) * (y1 - a[1]) - (b[1] - a[1]) * (x1 - a[0]), d2 = (b[0] - a[0]) * (y2 - a[1]) - (b[1] - a[1]) * (x2 - a[0]);
    const d3 = (x2 - x1) * (a[1] - y1) - (y2 - y1) * (a[0] - x1), d4 = (x2 - x1) * (b[1] - y1) - (y2 - y1) * (b[0] - x1);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }
  function roomAt(pl, p) {
    for (let i = 0; i < pl.rooms.length; i++) for (const r of pl.rooms[i][2]) if (p[0] >= r[0] - EPS && p[0] <= r[2] + EPS && p[1] >= r[1] - EPS && p[1] <= r[3] + EPS) return i;
    return -1;
  }
  function entryOf(pl) {   // ввод — у входной двери, 0,35 м внутрь квартиры
    const d = pl.door && pl.door.length === 2 ? pl.door : null;
    if (!d) return [r4(pl.W - 0.35), r4(pl.H - 0.35)];
    const m = [(d[0][0] + d[1][0]) / 2, (d[0][1] + d[1][1]) / 2], n = eq(m[1], pl.H) ? [0, -1] : eq(m[1], 0) ? [0, 1] : eq(m[0], 0) ? [1, 0] : [-1, 0];
    return [r4(m[0] + 0.35 * n[0]), r4(m[1] + 0.35 * n[1])];
  }
  function autoPos(pl, nsat, WT, keepEntry) {
    const walls = pl.walls.filter((w) => w[4] !== "O"), L5 = (t) => (WT[t] || [0, 4])[1], cap = (t) => t === "W1" || t === "W7b";
    const all = [], cand = [];
    for (const [, t, rs] of pl.rooms) for (const r of rs) for (let y = r[1] + STEP / 2; y < r[3]; y += STEP) for (let x = r[0] + STEP / 2; x < r[2]; x += STEP) {
      const c = { p: [r4(x), r4(y)], t };
      all.push(c);
      if (x >= CLR && y >= CLR && x <= pl.W - CLR && y <= pl.H - CLR && !walls.some((w) => segDist(c.p, w) < CLR)) cand.push(c);
    }
    const near = (arr, p) => arr.reduce((b, c) => (!b || d2(c.p, p) < d2(b.p, p) - EPS ? c : b), null);
    const liv = (c) => c.t === "ж" || c.t === "к", pool = cand.length ? cand : all;
    const center = (near(pool.filter(liv).length ? pool.filter(liv) : pool, [pl.W / 2, pl.H / 2]) || { p: [pl.W / 2, pl.H / 2] }).p;
    const loss = (a, v) => walls.reduce((s, w) => s + (cross(a, v, w) ? L5(w[4]) : 0), 0);
    const sig = (a, v) => -20 * Math.log10(Math.max(Math.hypot(v[0] - a[0], v[1] - a[1]), 1)) - loss(a, v);
    const caps = (a, v) => walls.filter((w) => cap(w[4]) && cross(a, v, w)).length;
    const L = all.filter(liv), sat = [];
    for (let i = 0; i < nsat; i++) {
      const nodes = [center].concat(sat);
      let dz = null, worst = Infinity;
      for (const v of L) { const s = Math.max(...nodes.map((a) => sig(a, v.p))); if (s < worst - EPS) { worst = s; dz = v.p; } }
      const mid = dz ? [(center[0] + dz[0]) / 2, (center[1] + dz[1]) / 2] : center;
      const ok = pool.filter((c) => c.t !== "с" && c.t !== "х" && caps(center, c.p) <= 1 && nodes.every((a) => d2(a, c.p) >= 1));
      sat.push((near(ok.length ? ok : pool, mid) || { p: mid }).p);
    }
    return { entry: keepEntry && pl.pos ? pl.pos.entry : entryOf(pl), center, sat };
  }

  // ---------------------------------------------------------------- проверка своей планировки
  function check(pl) {
    const err = [], warn = [];
    if (!pl || !Array.isArray(pl.rooms) || !pl.rooms.length || !(pl.W > 0) || !(pl.H > 0)) return { err: ["нет помещений или размеров контура"], warn };
    const tol = 1e-3, names = new Set(), R = [];
    let sum = 0;
    for (const [n, t, rs] of pl.rooms) {
      if (!String(n).trim()) err.push("у помещения нет названия");
      else if (names.has(n)) err.push(`два помещения «${n}» — названия должны различаться`);
      names.add(n);
      if (!RNAME[t]) err.push(`«${n}»: неизвестный тип помещения`);
      let pts = 0;
      for (const r of rs) {
        if (!(r[0] >= -tol && r[1] >= -tol && r[2] <= pl.W + tol && r[3] <= pl.H + tol && r[2] > r[0] && r[3] > r[1])) err.push(`«${n}» выходит за контур квартиры`);
        sum += area(r); R.push(r);
        if (r[0] + STEP / 2 < r[2] && r[1] + STEP / 2 < r[3]) pts++;
      }
      if (!pts) err.push(`«${n}» меньше клетки расчётной сетки 0,25 м`);
    }
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j], ov = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
      if (ov > 1e-4) { err.push("помещения перекрываются"); i = R.length; break; }
    }
    if (Math.abs(sum - pl.W * pl.H) > 0.01) err.push(`помещения занимают ${fm(sum, 1)} м² из ${fm(pl.W * pl.H, 1)} м² контура`);
    if (!pl.rooms.some((r) => r[1] === "ж" || r[1] === "к")) err.push("нужна хотя бы одна жилая комната или кухня — по ним считаются KPI");
    for (const w of pl.walls || []) if (!wseg(w) || !WTYPES.includes(w[4]) || Math.min(w[0], w[2]) < -tol || Math.min(w[1], w[3]) < -tol || Math.max(w[0], w[2]) > pl.W + tol || Math.max(w[1], w[3]) > pl.H + tol) { err.push("стена вне контура или неизвестного типа"); break; }
    const P = pl.pos || {}, nodes = [["ввод", P.entry], ["место узла в центре", P.center]].concat((P.sat || []).map((p, i) => [`место спутника ${i + 1}`, p]));
    if (!P.sat || !P.sat.length) err.push("нет мест спутников");
    for (const [lab, p] of nodes) {
      if (!Array.isArray(p) || !(p[0] >= 0 && p[0] <= pl.W && p[1] >= 0 && p[1] <= pl.H)) { err.push(`${lab} вне квартиры`); continue; }
      const ri = roomAt(pl, p);
      if (ri >= 0 && lab !== "ввод" && (pl.rooms[ri][1] === "с" || pl.rooms[ri][1] === "х")) warn.push(`${lab} — в помещении «${pl.rooms[ri][0]}» (${pl.rooms[ri][1] === "с" ? "санузел" : "кладовая"}); нажмите «Расставить узлы по правилам»`);
    }
    return { err: [...new Set(err)], warn };
  }

  // ---------------------------------------------------------------- рисунок плана (SVG, сантиметры)
  const cm = (v) => Math.round(v * 100);
  function draw(pl, o = {}) {
    const mini = !!o.mini, pad = mini ? 0.2 : 0.75, out = [], W = pl.W, H = pl.H;
    const fs = Math.round(Math.min(34, Math.max(18, Math.max(W, H) * 100 / 28)));   // шрифт подписей — по размеру плана
    out.push(`<svg class="${mini ? "nc-lay-mini" : "nc-lay-svg"}" viewBox="${cm(-pad)} ${cm(-pad)} ${cm(W + 2 * pad)} ${cm(H + 2 * pad)}" xmlns="http://www.w3.org/2000/svg"` +
      (mini ? ` aria-hidden="true" focusable="false">` : ` role="img" style="font-size:${fs}px"><title>${esc(pl.title)}: ${fm(W)} × ${fm(H)} м, ${fm(W * H, 1)} м²</title>`));
    pl.rooms.forEach(([, t, rs], i) => { for (const r of rs) out.push(`<rect x="${cm(r[0])}" y="${cm(r[1])}" width="${cm(r[2]) - cm(r[0])}" height="${cm(r[3]) - cm(r[1])}" fill="${RF[t] || "#f5f5f5"}"${o.room === i ? ' class="nc-lay-on"' : ""}/>`); });
    out.push(`<rect x="0" y="0" width="${cm(W)}" height="${cm(H)}" fill="none" stroke="#37474f" stroke-width="${mini ? 10 : 6}"/>`);
    for (const w of pl.windows || []) out.push(`<line x1="${cm(w[0][0])}" y1="${cm(w[0][1])}" x2="${cm(w[1][0])}" y2="${cm(w[1][1])}" stroke="#81d4fa" stroke-width="${mini ? 14 : 10}"/>`);
    if (!mini) for (const b of openB(pl)) { const w = mkW(b.o, b.c, b.a, b.b); out.push(`<line x1="${cm(w[0])}" y1="${cm(w[1])}" x2="${cm(w[2])}" y2="${cm(w[3])}" stroke="#9e9e9e" stroke-width="3" stroke-dasharray="10 8"/>`); }
    for (const w of pl.walls) {
      const [sw, col] = w[4] === "O" ? [4, "#bdbdbd"] : WALL[w[4]] || [8, "#546e7a"];
      if (w[4] === "O" && mini) continue;
      out.push(`<line x1="${cm(w[0])}" y1="${cm(w[1])}" x2="${cm(w[2])}" y2="${cm(w[3])}" stroke="${col}" stroke-width="${mini ? sw * 1.4 : sw}" stroke-linecap="square"${w[4] === "O" ? ' stroke-dasharray="6 6"' : ""}/>`);
    }
    if (pl.door && pl.door.length === 2) out.push(`<line x1="${cm(pl.door[0][0])}" y1="${cm(pl.door[0][1])}" x2="${cm(pl.door[1][0])}" y2="${cm(pl.door[1][1])}" stroke="#e65100" stroke-width="${mini ? 16 : 12}"/>`);
    if (mini) { out.push("</svg>"); return out.join(""); }
    if (o.ext) {
      const e = o.ext, w = mkW(e.o, e.c, e.lo, e.hi), mx = (w[0] + w[2]) / 2, my = (w[1] + w[3]) / 2;
      out.push(`<line x1="${cm(w[0])}" y1="${cm(w[1])}" x2="${cm(w[2])}" y2="${cm(w[3])}" stroke="#ff6d00" stroke-width="16" stroke-opacity=".45"/>`);
      if (o.seg) { const s = o.seg; out.push(`<line x1="${cm(s[0])}" y1="${cm(s[1])}" x2="${cm(s[2])}" y2="${cm(s[3])}" stroke="#ff6d00" stroke-width="6"/>`); }
      out.push(`<circle cx="${cm(mx)}" cy="${cm(my)}" r="22" fill="#ff6d00" stroke="#fff" stroke-width="5"/><text x="${cm(mx)}" y="${cm(my)}" class="nc-lay-h">${e.o === "v" ? "↔" : "↕"}</text>`);
    }
    pl.rooms.forEach(([n, , rs]) => {
      const r = big(rs), a = rs.reduce((s, x) => s + area(x), 0), x = cm((r[0] + r[2]) / 2), y = cm((r[1] + r[3]) / 2);
      out.push(`<text x="${x}" y="${y - fs * 0.5}" class="nc-room">${esc(n)}</text><text x="${x}" y="${y + fs * 0.6}" class="nc-lay-a">${fm(a, 1)} м²</text>`);
    });
    const P = pl.pos;
    if (P) {
      out.push(`<g class="nc-lay-pos"><rect x="${cm(P.entry[0]) - 14}" y="${cm(P.entry[1]) - 14}" width="28" height="28" fill="#fff" stroke="#e65100" stroke-width="5"/>`);
      [P.center].concat(P.sat).forEach((p, i) => out.push(`<circle cx="${cm(p[0])}" cy="${cm(p[1])}" r="17" fill="${i ? "#00897b" : "#283593"}" fill-opacity=".8" stroke="#fff" stroke-width="4"/>` +
        `<text x="${cm(p[0])}" y="${cm(p[1])}" class="nc-lay-n">${i ? "С" + i : "Ц"}</text>`));
      out.push("</g>");
    }
    out.push(`<text x="${cm(W / 2)}" y="${cm(-0.4)}" class="nc-lay-d">${fm(W)} м</text>`,
      `<text x="${cm(-0.4)}" y="${cm(H / 2)}" class="nc-lay-d" transform="rotate(-90 ${cm(-0.4)} ${cm(H / 2)})">${fm(H)} м</text>`);
    out.push("</svg>");
    return out.join("");
  }

  // ---------------------------------------------------------------- конструктор: весь план, края комнат, обводка прямоугольником, участки стен
  function mapPlan(pl0, f, W2, H2) {   // перенос всех точек плана f([x, y]) → [x', y'] (отражение, поворот, растяжение)
    const pl = clone(pl0), P = (p) => f(p).map(r4);
    const R = (r) => { const a = P([r[0], r[1]]), b = P([r[2], r[3]]); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
    pl.W = r4(W2); pl.H = r4(H2);
    for (const rm of pl.rooms) rm[2] = rm[2].map(R);
    pl.walls = pl.walls.map((w) => P([w[0], w[1]]).concat(P([w[2], w[3]]), [w[4]]));
    if (pl.pos) pl.pos = { entry: P(pl.pos.entry), center: P(pl.pos.center), sat: pl.pos.sat.map(P) };
    pl.door = (pl.door || []).map(P); pl.windows = (pl.windows || []).map((w) => w.map(P));
    return normalize(pl);
  }
  const mirror = (pl, ax) => mapPlan(pl, ax === "x" ? ([x, y]) => [pl.W - x, y] : ([x, y]) => [x, pl.H - y], pl.W, pl.H);   // ax: "x" — слева направо, "y" — сверху вниз
  const rotate = (pl) => mapPlan(pl, ([x, y]) => [pl.H - y, x], pl.H, pl.W);   // на 90° по часовой стрелке
  function stretch(pl, W2) {   // другая ширина квартиры при той же площади: длина = площадь / ширина
    W2 = r4(W2); const H2 = r4(pl.W * pl.H / W2), kx = W2 / pl.W, ky = H2 / pl.H;
    return finish(mapPlan(pl, ([x, y]) => [x * kx, y * ky], W2, H2));
  }
  function setDoor(pl0, side, off) {   // входная дверь на контуре; ввод кабеля — у двери
    const pl = clone(pl0); pl.door = doorOn(pl.W, pl.H, side, off);
    if (pl.pos) pl.pos = { ...pl.pos, entry: entryOf(pl) };
    return finish(pl);
  }
  function doorSide(pl) {   // сторона и отступ входной двери: для формы
    const d = pl.door && pl.door.length === 2 ? pl.door : null;
    if (!d) return { side: "низ", off: 0.4 };
    const side = eq(d[0][1], pl.H) && eq(d[1][1], pl.H) ? "низ" : eq(d[0][1], 0) && eq(d[1][1], 0) ? "верх" : eq(d[0][0], 0) ? "лево" : "право";
    return { side, off: r4(side === "низ" || side === "верх" ? Math.min(d[0][0], d[1][0]) : Math.min(d[0][1], d[1][1])) };
  }
  function roomEdges(pl, ri) {   // внутренние края помещения: участки, за которыми другое помещение (контур квартиры не двигается); s — наружу: +1 вправо/вниз
    const out = [], rs = pl.rooms[ri] ? pl.rooms[ri][2] : [];
    for (const r of rs) for (const [o, c, a, b, s] of [["v", r[0], r[1], r[3], -1], ["v", r[2], r[1], r[3], 1], ["h", r[1], r[0], r[2], -1], ["h", r[3], r[0], r[2], 1]]) {
      if (eq(c, 0) || eq(c, o === "v" ? pl.W : pl.H)) continue;
      const own = rs.filter((x) => x !== r).map((x) => { const [c0, c1, a0, a1] = o === "v" ? [x[0], x[2], x[1], x[3]] : [x[1], x[3], x[0], x[2]]; return (s > 0 ? eq(c0, c) : eq(c1, c)) ? [a0, a1] : null; }).filter(Boolean);
      for (const [lo, hi] of subtract([a, b], own)) if (hi - lo > 0.05) out.push({ o, c, lo: r4(lo), hi: r4(hi), s });
    }
    return out;
  }
  function moveEdge(pl, e, c2) {   // край помещения: двигается только этот участок, соседние помещения подстраиваются
    const [mn, mx] = range(pl, e), v = r4(Math.min(mx, Math.max(mn, Math.round(c2 / SNAP) * SNAP)));
    return eq(v, e.c) ? clone(pl) : moveLine(pl, e, v);
  }
  function roomSize(pl, ri, dir, v) {   // ширина (dir "v") или длина ("h") прямоугольного помещения: двигается правый (нижний) край, у контура — левый (верхний)
    const rs = pl.rooms[ri][2]; if (rs.length !== 1) throw new Error("размер числом — только у прямоугольной комнаты; тяните кружки на плане");
    const r = rs[0], V = dir === "v", [a0, a1, b0, b1] = V ? [r[0], r[2], r[1], r[3]] : [r[1], r[3], r[0], r[2]], L = V ? pl.W : pl.H;
    const far = !eq(a1, L) ? { o: dir, c: a1, lo: b0, hi: b1 } : !eq(a0, 0) ? { o: dir, c: a0, lo: b0, hi: b1 } : null;
    if (!far) throw new Error(`комната во всю ${V ? "ширину" : "длину"} квартиры — меняйте размеры квартиры`);
    return moveEdge(pl, far, far.c === a1 ? a0 + v : a1 - v);
  }
  function lineSet(pl, o) {   // прямые плана по направлению: контур и края помещений
    const s = new Set([0, o === "v" ? pl.W : pl.H]);
    for (const [, , rs] of pl.rooms) for (const r of rs) { if (o === "v") { s.add(r[0]); s.add(r[2]); } else { s.add(r[1]); s.add(r[3]); } }
    return [...s];
  }
  function snapRect(pl, r) {   // прямоугольник обводки: шаг 5 см, ближе MIN + 5 см к краю помещения или контуру — по краю (без узких полосок)
    const sn = (v, o) => { let b = null; for (const c of lineSet(pl, o)) if (Math.abs(c - v) < MIN + SNAP - EPS && (b === null || Math.abs(c - v) < Math.abs(b - v))) b = c; return b !== null ? b : Math.round(v / SNAP) * SNAP; };
    const x0 = Math.min(r[0], r[2]), x1 = Math.max(r[0], r[2]), y0 = Math.min(r[1], r[3]), y1 = Math.max(r[1], r[3]);
    return [Math.max(0, sn(x0, "v")), Math.max(0, sn(y0, "h")), Math.min(pl.W, sn(x1, "v")), Math.min(pl.H, sn(y1, "h"))].map(r4);
  }
  function rdiff(r, c) {   // прямоугольник r без прямоугольника c — до четырёх частей
    if (c[0] >= r[2] - EPS || c[2] <= r[0] + EPS || c[1] >= r[3] - EPS || c[3] <= r[1] + EPS) return [r];
    const out = [], y0 = Math.max(r[1], c[1]), y1 = Math.min(r[3], c[3]);
    if (c[1] > r[1] + EPS) out.push([r[0], r[1], r[2], c[1]]);
    if (c[3] < r[3] - EPS) out.push([r[0], c[3], r[2], r[3]]);
    if (c[0] > r[0] + EPS) out.push([r[0], y0, c[0], y1]);
    if (c[2] < r[2] - EPS) out.push([c[2], y0, r[2], y1]);
    return out;
  }
  function carve(pl0, r0, type = "ж", wt = "W2", door = true) {   // новая комната прямоугольником: забирает площадь у тех, кого накрыла; по краям — стены wt ("" — без стен)
    const pl = clone(pl0), r = snapRect(pl, r0);
    if (r[2] - r[0] < 0.5 - EPS || r[3] - r[1] < 0.5 - EPS) throw new Error("комната меньше 0,5 × 0,5 м — обведите крупнее");
    const name = uniq(pl, RNAME[type] || "Комната");
    for (const rm of pl.rooms) rm[2] = rm[2].flatMap((x) => rdiff(x, r));
    pl.walls = pl.walls.flatMap((w) => {   // стены внутри прямоугольника убираются
      const s = wseg(w); if (!s) return [];
      const inner = s.o === "v" ? s.c > r[0] + EPS && s.c < r[2] - EPS : s.c > r[1] + EPS && s.c < r[3] - EPS;
      return inner ? subtract([s.a, s.b], [s.o === "v" ? [r[1], r[3]] : [r[0], r[2]]]).filter(([x, y]) => y - x > 0.005).map(([x, y]) => mkW(s.o, s.c, x, y, w[4])) : [w];
    });
    const add = [];
    if (wt) for (const [o, c, a, b] of [["h", r[1], r[0], r[2]], ["h", r[3], r[0], r[2]], ["v", r[0], r[1], r[3]], ["v", r[2], r[1], r[3]]]) {
      if (eq(c, 0) || eq(c, o === "v" ? pl.W : pl.H)) continue;
      const has = pl.walls.map(wseg).filter((s) => onLine(s, o, c)).map((s) => [s.a, s.b]);
      for (const [x, y] of subtract([a, b], has)) if (y - x > 0.01) add.push({ o, c, a: x, b: y });
    }
    pl.rooms.push([name, type, [r]]);
    pl.walls.push(...add.map((s) => mkW(s.o, s.c, s.a, s.b, wt)));
    let out = normalize(pl);
    if (door && wt && wt !== "W4") {   // дверь — в стене к коридору, иначе в самой длинной новой стене
      const nb = (s) => { const m = s.o === "v" ? [s.c + (eq(s.c, r[0]) ? -0.05 : 0.05), (s.a + s.b) / 2] : [(s.a + s.b) / 2, s.c + (eq(s.c, r[1]) ? -0.05 : 0.05)], i = roomAt(out, m); return i >= 0 ? out.rooms[i][1] : ""; };
      const ok = add.filter((s) => s.b - s.a >= DOOR + 0.1).sort((x, y) => (nb(y) === "п") - (nb(x) === "п") || (y.b - y.a) - (x.b - x.a));
      if (ok.length) out = doorIn(out, { ...ok[0] }, (ok[0].a + ok[0].b) / 2);
    }
    return finish(out);
  }
  function pieces(pl) {   // участки стен и границ помещений для вкладки «Стены»: { o, c, a, b, t, r1, r2 }; t — тип стены, "" — без стены
    const out = [], WS = pl.walls.map((w) => [wseg(w), w[4]]).filter(([s]) => s), B = bounds(pl);
    const add = (o, c, a, b, r1, r2) => {
      const on = WS.filter(([s]) => onLine(s, o, c) && s.b > a + EPS && s.a < b - EPS), P = [a, b];
      for (const [s] of on) for (const v of [s.a, s.b]) if (v > a + EPS && v < b - EPS) P.push(v);
      const ps = [...new Set(P.map(r4))].sort((x, y) => x - y);
      for (let i = 0; i + 1 < ps.length; i++) {
        const m = (ps[i] + ps[i + 1]) / 2, w = on.find(([s]) => s.a <= m + EPS && s.b >= m - EPS);
        if (ps[i + 1] - ps[i] > 0.005) out.push({ o, c, a: ps[i], b: ps[i + 1], t: w ? w[1] : "", r1, r2 });
      }
    };
    for (const bd of B) add(bd.o, bd.c, r4(bd.a), r4(bd.b), bd.r1, bd.r2);
    for (const [s, t] of WS) {   // стены внутри одного помещения (не на границе)
      if (eq(s.c, 0) || eq(s.c, s.o === "v" ? pl.W : pl.H)) continue;
      for (const [x, y] of subtract([s.a, s.b], B.filter((b) => onLine(b, s.o, s.c)).map((b) => [b.a, b.b]))) if (y - x > 0.01) {
        const ri = roomAt(pl, s.o === "v" ? [s.c, (x + y) / 2] : [(x + y) / 2, s.c]);
        out.push({ o: s.o, c: s.c, a: r4(x), b: r4(y), t, r1: ri, r2: ri });
      }
    }
    return out;
  }
  function setPieces(pl0, list, t) {   // тип стены для участков; t = "" — убрать стену (проём, арка, граница зон)
    const pl = clone(pl0);
    for (const p of list) {
      pl.walls = pl.walls.flatMap((w) => { const s = wseg(w); return onLine(s, p.o, p.c) ? subtract([s.a, s.b], [[p.a, p.b]]).filter(([x, y]) => y - x > 0.005).map(([x, y]) => mkW(s.o, s.c, x, y, w[4])) : [w]; });
      if (t) pl.walls.push(mkW(p.o, p.c, p.a, p.b, t));
    }
    return finish(normalize(pl));
  }
  function doorIn(pl, p, at) {   // дверь DOOR м в участке стены p около точки at
    if (p.b - p.a < DOOR + 0.1 - EPS) throw new Error(`участок короче ${fm(DOOR + 0.1)} м — дверь не помещается`);
    const d0 = r4(Math.min(p.b - DOOR, Math.max(p.a, Math.round(((at ?? (p.a + p.b) / 2) - DOOR / 2) / SNAP) * SNAP)));
    return setPieces(pl, [{ ...p, a: d0, b: r4(d0 + DOOR) }], "W4");
  }
  function badRooms(pl) {   // помещения меньше клетки расчётной сетки — для подсветки на плане
    const bad = new Set();
    pl.rooms.forEach(([, , rs], i) => { if (!rs.some((r) => r[0] + STEP / 2 < r[2] && r[1] + STEP / 2 < r[3])) bad.add(i); });
    return bad;
  }

  const api = { fromTemplate, blank, rescale, same, wseg, bounds, openB, junctions, extentAt, range, moveLine, normalize, splitRoom, neighbors, mergeRooms,
    setRoom, setWall, addWall, insertDoor, autoPos, roomAt, check, draw, entryOf, nsatOf, finish, RT, WTYPES, MIN, SNAP, DOOR,
    mirror, rotate, stretch, setDoor, doorSide, doorOn, roomEdges, moveEdge, roomSize, snapRect, carve, pieces, setPieces, doorIn, badRooms, RNAME, WALL, WNAME, RF, STEP,
    init: (PLD) => { PL_DATA = PLD; },
    _: { EPS, eq, r4, clone, esc, fm, q, wname, area, big, mkW, onLine, segDist } };   // для layout-ui.js
  root.NetLayout = api;
})(typeof window !== "undefined" ? window : globalThis);
