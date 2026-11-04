// План квартиры для калькулятора (calc.js): SVG типового плана — помещения, стены, ввод, узлы, кабель, карта RSSI 5 ГГц —
// и легенда: шкала сигнала, обозначения узлов и кабеля, образцы стен (цвет и толщина линии, потери на 2,4 / 5 / 6 ГГц).
// Данные — результат движка engine.js (R.geom, R.map, R.sh6); потери стен — R.geom.wt (И2, табл. 4, с учётом типа дома и замера B1).
// Подключается после engine.js и glossary.js, до calc.js. Функции без DOM — проверяются в tests/calc.test.mjs.
(function (root) {
  "use strict";
  const NE = root.NetEngine;
  if (!NE) throw new Error("plan.js: сначала подключите engine.js");
  const GL = root.NetGlossary;
  const q = (id) => (GL ? GL.q(id) : "");   // маркер «?» — подсказка из glossary.js
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const db = (v) => (Number.isInteger(v) ? String(v) : f(v, 1));   // потери, дБ: 13 или 13,5
  const f = (v, nd = 0) => (isNum(v) ? (nd ? NE.fmt(v, nd).replace(".", ",") : Math.round(NE.pyRound(v)).toLocaleString("ru-RU")) : "—");

  // ---------------------------------------------------------------- план (SVG): помещения, стены, узлы, кабель, карта RSSI 5 ГГц
  const RSSI = [[-40, "#006837", "≥ −40"], [-50, "#1a9850", "−50…−40"], [-60, "#66bd63", "−60…−50"], [-67, "#a6d96a", "−67…−60"],
    [-72, "#fee08b", "−72…−67"], [-80, "#fc8d59", "−80…−72"], [-Infinity, "#d73027", "< −80"]];
  const rssiColor = (P) => RSSI.find(([t]) => P >= t)[1];
  const ROOM_FILL = { "ж": "#f5f5f5", "к": "#fff8e1", "с": "#e3f2fd", "п": "#eeeeee", "х": "#e0e0e0" };
  // стены на плане: тип (plans.json, И2, табл. 4) → [толщина линии, см плана; цвет]. Чем больше затухание — тем толще и темнее линия;
  // стены санузла (кафель, трубы: +3 дБ) — бирюзовые, дверь — коричневая, металл — синий; проём без двери (O) не рисуется
  const WALL = { W1: [16, "#263238"], W2: [10, "#546e7a"], W3: [6, "#90a4ae"], W4: [5, "#8d6e63"], W6: [10, "#1565c0"], W7a: [10, "#00838f"], W7b: [16, "#004d55"] };
  const WALL_NAME = { W1: "несущая ж/б", W2: "перегородка кирпич / газобетон", W3: "перегородка ГКЛ", W4: "дверь", W6: "металл",
    W7a: "стена санузла: перегородка", W7b: "стена санузла: несущая" };
  const WALL_ORDER = ["W1", "W7b", "W2", "W7a", "W3", "W4", "W6"];
  const WALL_LOOK = { W1: "толстая тёмно-серая", W7b: "толстая тёмно-бирюзовая", W2: "средняя серая", W7a: "средняя бирюзовая", W3: "тонкая светло-серая",
    W4: "тонкая коричневая", W6: "средняя синяя" };
  const c = (v) => Math.round(v * 100);   // метры → сантиметры: в SVG целые координаты и шрифт обычного размера
  function crossings(g, a, b) {   // сколько стен пересекает отрезок a–b (дверь — половина)
    let n = 0;
    for (const [x1, y1, x2, y2, t] of g.walls) {
      if (t === "O") continue;
      const d1 = (b[0] - a[0]) * (y1 - a[1]) - (b[1] - a[1]) * (x1 - a[0]), d2 = (b[0] - a[0]) * (y2 - a[1]) - (b[1] - a[1]) * (x2 - a[0]);
      const d3 = (x2 - x1) * (a[1] - y1) - (y2 - y1) * (a[0] - x1), d4 = (x2 - x1) * (b[1] - y1) - (y2 - y1) * (b[0] - x1);
      if (d1 * d2 < 0 && d3 * d4 < 0) n += t === "W4" ? 0.5 : 1;
    }
    return n;
  }
  function planSvg(R, o) {
    const g = R.geom, pad = 0.6, out = [];
    out.push(`<svg class="nc-plan" viewBox="${c(-pad)} ${c(-pad)} ${c(g.W + 2 * pad)} ${c(g.H + 2 * pad)}" xmlns="http://www.w3.org/2000/svg" role="img">`,
      `<title>${esc(g.title)}: ${o ? "уровень сигнала 5 ГГц для варианта «" + esc(o.name) + "»" : "типовой план"}</title>`,
      `<rect x="${c(-pad)}" y="${c(-pad)}" width="${c(g.W + 2 * pad)}" height="${c(g.H + 2 * pad)}" fill="#fff"/>`);
    for (const [, t, rs] of g.rooms) for (const [x0, y0, x1, y1] of rs)
      out.push(`<rect x="${c(x0)}" y="${c(y0)}" width="${c(x1) - c(x0)}" height="${c(y1) - c(y0)}" fill="${ROOM_FILL[t] || "#f5f5f5"}"/>`);
    if (o && R.map) {
      const st = c(R.map.step);
      out.push(`<g shape-rendering="crispEdges">`);
      for (const [x, y, P] of R.map.pts) out.push(`<rect x="${c(x) - st / 2}" y="${c(y) - st / 2}" width="${st + 1}" height="${st + 1}" fill="${rssiColor(P)}"/>`);
      out.push(`</g>`);
    }
    for (const [x1, y1, x2, y2, t] of g.walls) {
      if (t === "O") continue;
      const [w, col] = WALL[t] || [8, "#546e7a"];
      out.push(`<line x1="${c(x1)}" y1="${c(y1)}" x2="${c(x2)}" y2="${c(y2)}" stroke="${col}" stroke-width="${w}" stroke-linecap="square"/>`);
    }
    for (const [name, , rs] of g.rooms) {
      const [x0, y0, x1, y1] = rs.reduce((a, r) => ((r[2] - r[0]) * (r[3] - r[1]) > (a[2] - a[0]) * (a[3] - a[1]) ? r : a));
      out.push(`<text x="${c((x0 + x1) / 2)}" y="${c((y0 + y1) / 2)}" class="nc-room">${esc(name)}</text>`);
    }
    const e = g.pos.entry;
    out.push(`<rect x="${c(e[0]) - 17}" y="${c(e[1]) - 17}" width="34" height="34" fill="#fff" stroke="#e65100" stroke-width="6"/>`,
      `<text x="${c(e[0])}" y="${c(e[1]) + 48}" class="nc-lab">ввод</text>`);
    if (o) {
      o.aps.forEach((a, i) => {
        if (!o.cable[i]) return;
        const s = o.arch === "Б" ? e : o.aps[0], pl = o.arch === "В-PL", k1 = [a[0], s[1]], k2 = [s[0], a[1]];   // трасса из двух отрезков: меньше стен
        const k = crossings(g, s, k1) + crossings(g, k1, a) <= crossings(g, s, k2) + crossings(g, k2, a) ? k1 : k2;
        out.push(`<polyline points="${c(s[0])},${c(s[1])} ${c(k[0])},${c(k[1])} ${c(a[0])},${c(a[1])}" fill="none" stroke="${pl ? "#6a1b9a" : "#e65100"}" stroke-width="7" stroke-dasharray="${pl ? "5 12" : "25 12"}"/>`);
      });
      o.aps.forEach((a, i) => out.push(`<circle cx="${c(a[0])}" cy="${c(a[1])}" r="26" fill="${i ? "#00897b" : "#283593"}" stroke="#fff" stroke-width="6"/>`,
        `<text x="${c(a[0])}" y="${c(a[1])}" class="nc-ap">${i + 1}</text>`));
    }
    out.push("</svg>");
    return out.join("");
  }
  function wallLegend(R) {   // образцы линий стен плана: цвет и толщина как на плане, потери на 5 ГГц (R.geom.wt — с учётом типа дома и B1)
    const g = R.geom, wt = g.wt || {}, ts = [...new Set(g.walls.map((w) => w[4]).filter((t) => t !== "O"))];
    const ix = (t) => (WALL_ORDER.includes(t) ? WALL_ORDER.indexOf(t) : 99);
    ts.sort((a, b) => ix(a) - ix(b));
    const b1 = isNum(R.input.L_W1), brick = g.constr === "К" && !b1;
    const items = ts.map((t) => {
      const [w, col] = WALL[t] || [8, "#546e7a"], L = wt[t];
      const name = t === "W1" ? (b1 ? "несущая (по замеру B1)" : brick ? "несущая кирпич" : WALL_NAME.W1) : WALL_NAME[t] || t;
      const sw = `<svg class="nc-wl" viewBox="0 0 36 14" width="36" height="14" aria-hidden="true" focusable="false"><line x1="3" y1="7" x2="33" y2="7" stroke="${col}" stroke-width="${w / 2}" stroke-linecap="square"/></svg>`;
      return `<li${L ? ` title="${esc(name)}: потери 2,4 / 5 / 6 ГГц — ${L.map(db).join(" / ")} дБ"` : ""}>${sw}<div>${esc(name)}${L ? ` — <b>${db(L[1])} дБ</b>` : ""}` +
        `${WALL_LOOK[t] ? ` <small>· ${WALL_LOOK[t]} линия</small>` : ""}</div></li>`;
    });
    const op = g.walls.some((w) => w[4] === "O");
    return `<div class="nc-legend nc-walls"><p><b>Стены на плане</b>${q("wall")} — линия, тип стены и потери сигнала 5 ГГц:</p><ul class="nc-wlist">${items.join("")}</ul>` +
      `<p><small>Чем толще и темнее линия, тем сильнее стена ослабляет сигнал. Бирюзовые — стены санузла: кафель и трубы, +3 дБ к основе. Толщина условная, не в масштабе.` +
      `${op ? " Проём без двери не рисуется." : ""} Потери на 2,4 / 5 / 6 ГГц — в пояснении «?»; потери несущей стены${q("lw1")} уточняются замером «до» (поле B1).</small></p></div>`;
  }
  function legend(R, o) {
    const kpi = R.sh3.kpi, pl = o && o.arch === "В-PL";
    return (o ? `<p class="nc-legend"><b>Уровень сигнала 5 ГГц, дБм</b>${q("rssi")} (медиана): ${RSSI.map(([, col, t]) => `<span><i style="background:${col}"></i>${t}</span>`).join("")}<br>` +
      `<small>KPI уровня «${esc(kpi.name)}»${q("kpi")} — P<sub>z</sub>${q("pz")} ≥ ${f(kpi.Pz)} дБм в худшей зоне с запасом на замирания z·σ, поэтому медиана на карте должна быть выше порога.</small></p>` : "") +
      `<p class="nc-legend"><span><i class="nc-sq"></i>ввод кабеля</span><span><i class="nc-dot" style="background:#283593"></i>1 — корневой узел${q("node")}</span>` +
      `<span><i class="nc-dot" style="background:#00897b"></i>2, 3 — спутники</span><span><i class="nc-ln"></i>кабель (схема трассы)${q("cable")}</span>` +
      (pl ? `<span><i class="nc-ln nc-pl"></i>Powerline${q("pl")}</span>` : "") + `</p>` + wallLegend(R);
  }

  root.NetPlan = { planSvg, legend, wallLegend, rssiColor, crossings, RSSI, WALL, WALL_NAME, ROOM_FILL };
})(typeof window !== "undefined" ? window : globalThis);
