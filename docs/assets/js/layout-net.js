/* Конструктор квартиры: вкладка «Роутер» — живая карта сигнала 5 ГГц на плане (медиана, многостеновая модель И4,
   ЭИИМ по умолчанию), перетаскивание узлов Ц, С1, С2 и ввода □, разбор «почему здесь слабо»: расстояние и стены на пути.
   Предпросмотр считает engine.js (preview, why); подбор оборудования и KPI — обычный расчёт по кнопке «Рассчитать».
   Подключается после layout-ui.js и до calc.js. */
(function (root) {
  "use strict";
  const LA = root.NetLayout;
  if (!LA || typeof document === "undefined") return;
  const { fm, esc, clone, r4, wname } = LA._, fd = (v, nd = 0) => fm(v, nd).replace("-", "−");   // со знаком «−»

  (LA.ext = LA.ext || []).push((X) => {
    const { S, F, B, num, cm, opts } = X, eng = opts.eng;
    if (!eng || !eng.preview) return;
    X.tabs.push(["net", "Роутер"]);
    S.net = { m: "c", why: null };   // m: e — один роутер у ввода, c — Ц, 1 — Ц+С1, 2 — Ц+С1+С2; why — точка разбора
    let cache = null;
    const on = () => S.tab === "net" && !X.views[S.view];
    const nsat = (p) => (p.pos && p.pos.sat ? p.pos.sat.length : 0);
    const mode = (p) => (S.net.m === "e" || S.net.m === "c" ? S.net.m : String(Math.min(+S.net.m, nsat(p))));
    const modes = (p) => [["e", "Роутер у ввода □"], ["c", "Ц"]].concat(p.pos.sat.map((_, i) => [String(i + 1), ["Ц"].concat(p.pos.sat.slice(0, i + 1).map((__, j) => "С" + (j + 1))).join(" + ")]));
    const aps = (p) => { const P = p.pos, m = mode(p); return m === "e" ? [P.entry] : [P.center].concat(P.sat.slice(0, m === "c" ? 0 : +m)); };
    const apName = (p, a) => { const P = p.pos; if (a === P.entry && mode(p) === "e") return "роутера у ввода"; if (a === P.center) return "узла Ц"; const i = P.sat.indexOf(a); return i >= 0 ? "спутника С" + (i + 1) : "узла"; };
    function q(p) {
      const lw = F("L_W1") ? num(F("L_W1").value) : null;
      return { plan: p, cls: p.cls || X.curCls(), constr: F("constr") ? F("constr").value : "", L_W1: lw !== null && lw >= 1 && lw <= 40 ? lw : null };
    }
    function pv(p) {   // карта сигнала для плана p (кэш — пока не изменились план, узлы и стены)
      const Q = q(p), a = aps(p), key = JSON.stringify([p.W, p.H, p.rooms, p.walls, a, Q.cls, Q.constr, Q.L_W1]);
      if (cache && cache.key === key) return cache.v;
      let v = null; try { v = eng.preview(Q, a); } catch (e) { v = null; }
      cache = { key, v }; return v;
    }
    function explain(p, pt) {   // разбор от узла с самым сильным сигналом в точке
      const v = pv(p); if (!v) return null;
      let best = null;
      for (const a of aps(p)) { const w = eng.why(v.g, a, pt); if (!best || w.P > best.P) best = w; }
      return best;
    }
    const col = (P) => (root.NetPlan ? root.NetPlan.rssiColor(P) : P >= -67 ? "#66bd63" : "#fc8d59");

    X.layers.under.push((p, out) => {   // карта сигнала — под стенами и подписями
      if (!on() || !p.pos) return;
      const v = pv(p); if (!v) return;
      const st = cm(v.step);
      out.push(`<g class="kq-heat" opacity=".62">`);
      for (const [x, y, P] of v.pts) out.push(`<rect x="${cm(x - v.step / 2)}" y="${cm(y - v.step / 2)}" width="${st + 1}" height="${st + 1}" fill="${col(P)}"/>`);
      out.push("</g>");
    });
    X.layers.over.push((p, out, px) => {   // узлы не в работе — бледнее; путь сигнала до точки разбора и стены на нём
      if (!on() || !p.pos) return;
      const P = p.pos, rr = Math.max(14, px(7)), act = aps(p), off = [P.center].concat(P.sat).filter((c) => !act.includes(c));
      for (const c of off) out.push(`<circle cx="${cm(c[0])}" cy="${cm(c[1])}" r="${rr * 1.15}" fill="#fff" fill-opacity=".6"/>`);
      if (mode(p) === "e") out.push(`<circle cx="${cm(P.entry[0])}" cy="${cm(P.entry[1])}" r="${rr * 1.5}" fill="none" stroke="#283593" stroke-width="${rr / 3}"/>`);
      const w = S.net.why && explain(p, S.net.why); if (!w) return;
      for (const x of w.walls) out.push(`<line x1="${cm(x.w[0])}" y1="${cm(x.w[1])}" x2="${cm(x.w[2])}" y2="${cm(x.w[3])}" stroke="#ff6d00" stroke-width="${px(7)}" stroke-opacity=".75" stroke-linecap="round"/>`);
      out.push(`<line x1="${cm(w.ap[0])}" y1="${cm(w.ap[1])}" x2="${cm(w.pt[0])}" y2="${cm(w.pt[1])}" stroke="#212121" stroke-width="${px(2.5)}" stroke-dasharray="${px(7)} ${px(5)}"/>`,
        `<circle cx="${cm(w.pt[0])}" cy="${cm(w.pt[1])}" r="${px(7)}" fill="${col(w.P)}" stroke="#212121" stroke-width="${px(2.5)}"/>`,
        `<text x="${cm(w.pt[0])}" y="${cm(w.pt[1]) - px(18)}" class="kq-tip">${fd(w.P)} дБм</text>`);
    });

    function nodeAt(p, pt) {   // значок узла или ввода под пальцем (до 24 пикселей)
      const P = p.pos, pxm = S.k * 100; if (!P) return null;
      let best = null;
      [["e", P.entry], ["c", P.center]].concat(P.sat.map((c, i) => [i, c])).forEach(([h, c]) => { const d = Math.hypot(c[0] - pt[0], c[1] - pt[1]) * pxm; if (d <= 24 && (!best || d < best.d)) best = { d, h }; });
      return best ? best.h : null;
    }
    X.tab.net = {
      hint: () => (S.net.why ? "Тяните узлы — разбор и карта обновятся. Нажмите в другом месте плана — новый разбор." :
        `Тяните ${["Ц"].concat(S.pl && S.pl.pos ? S.pl.pos.sat.map((_, i) => "С" + (i + 1)) : []).join(", ")} или □ ввода — карта сигнала обновится. Нажмите на план — почему там такой сигнал.`),
      down: (pt) => { const h = S.pl ? nodeAt(S.pl, pt) : null; return h === null ? null : { kind: "node", h, pl: null }; },
      tap: (pt) => { S.net.why = LA.roomAt(S.pl, pt) >= 0 ? [r4(pt[0]), r4(pt[1])] : null; },
      side: (p) => side(p),
    };
    X.drags.node = {
      move: (d, pt) => {
        const p = S.pl, sn = (v, hi) => r4(Math.min(hi - 0.1, Math.max(0.1, Math.round(v / LA.SNAP) * LA.SNAP))), c = [sn(pt[0], p.W), sn(pt[1], p.H)];
        const np = clone(p);
        if (d.h === "e") np.pos.entry = c; else if (d.h === "c") np.pos.center = c; else np.pos.sat[d.h] = c;
        d.pl = np; X.stage(true);
      },
      end: (d) => { if (!d.pl) { X.stage(); return; } const np = d.pl; np.auto = false; np.manual = true; X.commit(np); },
    };

    function side(p) {
      if (!p.pos) return "";
      const v = pv(p), m = mode(p), h = [];
      h.push(`<h4>Какие узлы работают</h4><div class="kq-chips" role="group" aria-label="Какие узлы работают">${modes(p).map(([k, t]) => `<button type="button" class="kq-chip" data-act="netm" data-t="${k}" aria-pressed="${m === k}">${t}</button>`).join("")}</div>`);
      h.push(`<p class="kq-note">Ц — корневой узел (роутер), ${p.pos.sat.map((_, i) => "С" + (i + 1)).join(", ")} — ${p.pos.sat.length > 1 ? "спутники" : "спутник"}, □ — ввод кабеля. Тяните значки по плану. Места: ${p.manual ? "заданы вручную" : p.auto ? "по правилам размещения (Ш6)" : "типовые (И4)"}.</p>`);
      if (!v) return h.join("") + `<p class="kq-bad">Карту сигнала не удалось построить — проверьте план во вкладке «Комнаты».</p>`;
      h.push(`<p>Уровень ≥ ${fd(v.thr)} дБм: <b>${fm(v.K, 0)} %</b> площади, в жилых комнатах и на кухне — <b>${fm(v.Kliv, 0)} %</b>.</p>`);
      const w = S.net.why && explain(p, S.net.why);
      if (w) {
        const ws = w.walls.slice().sort((a, b) => b.L - a.L), gr = [];   // стены одного типа — одной строкой
        for (const x of ws) { const o = gr.find((y) => y.t === x.t); if (o) { o.n++; o.L += x.L; } else gr.push({ t: x.t, n: 1, L: x.L }); }
        h.push(`<div class="kq-why"><h4>Почему здесь ${fd(w.P)} дБм</h4><ul>` +
          `<li>${fm(w.E, 0)} дБм — ЭИИМ ${esc(apName(p, w.ap))}</li>` +
          `<li>−${fm(w.fspl, 1)} дБ — расстояние ${fm(w.d, 1)} м</li>` +
          (gr.length ? gr.map((x) => `<li>−${fm(x.L, 1)} дБ — ${esc(wname(x.t))}${x.n > 1 ? ` × ${x.n}` : ""}</li>`).join("") : "<li>стен на пути нет</li>") +
          `</ul><p>${fm(w.E, 0)} − ${fm(w.fspl, 1)}${w.L ? ` − ${fm(w.L, 1)}` : ""} = <b class="${w.P < w.thr ? "kq-bad" : ""}">${fd(w.P, 1)} дБм</b> — ${w.P >= w.thr ? `не слабее порога ${fd(w.thr)} дБм` : `слабее порога ${fd(w.thr)} дБм`}.` +
          (w.P < w.thr && gr.length ? ` Больше всего забирает ${esc(wname(gr.sort((a, b) => b.L - a.L)[0].t))}${gr[0].n > 1 ? ` (${gr[0].n} шт.)` : ""} — −${fm(gr[0].L, 1)} дБ.` : "") + `</p><p>${B("netx", "Убрать разбор")}</p></div>`);
      }
      const rs = v.rooms.slice().sort((a, b) => a.P - b.P);
      if (rs.length) h.push(`<h4>Самая слабая точка комнаты</h4><div class="kq-nlist">${rs.map((r, i) => `<button type="button" class="kq-chip" data-act="netwhy" data-ri="${i}"><i style="background:${col(r.P)}"></i>${esc(r.room)} — <span class="${r.P < v.thr ? "kq-bad" : ""}">${fd(r.P)} дБм</span></button>`).join("")}</div>`);
      h.push(`<p>${B("auto", "Расставить узлы по правилам")} ${opts.run ? B("netrun", opts.hasResult && opts.hasResult() ? "Готово и пересчитать" : "Готово и рассчитать", ' data-main="1"') : ""}</p>`);
      const RS = root.NetPlan ? root.NetPlan.RSSI : [];
      h.push(`<p class="kq-note"><b>Уровень сигнала 5 ГГц, дБм:</b> ${RS.map(([, c, t]) => `<span class="kq-lg"><i style="background:${c}"></i>${t}</span>`).join(" ")}</p>`);
      h.push(`<p class="kq-note">Это предпросмотр: медиана уровня по многостеновой модели (И4), ЭИИМ узла — ${fm(v.E, 0)} дБм по умолчанию, тип дома и потери несущей стены — из формы. Подбор оборудования и KPI — в расчёте.</p>`);
      return h.join("");
    }
    X.acts.netm = (b) => { S.net.m = b.dataset.t; X.paint(); };
    X.acts.netx = () => { S.net.why = null; X.paint(); };
    X.acts.netwhy = (b) => { const v = pv(S.pl); if (!v) return; const r = v.rooms.slice().sort((a, c) => a.P - c.P)[+b.dataset.ri]; if (r) { S.net.why = [r.x, r.y]; X.paint(); } };
    X.acts.netrun = () => { const d = X.$k('[data-act="done"]'); if (d) d.click(); if (opts.run) opts.run(); };
  });
})(typeof window !== "undefined" ? window : globalThis);
