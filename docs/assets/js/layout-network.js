// Сетевой слой планировщика: роутеры, коммутаторы, точки доступа, кабели и покрытие.
(function (root) {
  "use strict";
  const LA = root.NetLayout;
  if (!LA || typeof document === "undefined") return;
  const { fm, esc, clone, r4, wname } = LA._, fd = (v, nd = 0) => fm(v, nd).replace("-", "−");

  (LA.ext = LA.ext || []).push((X) => {
    const { S, F, B, num, cm, opts } = X, eng = opts.eng;
    if (!eng || !eng.preview) return;
    X.tabs.push(["net", "Сеть"]);
    S.net = { deviceType: "switch", coverage: false, mode: "all", why: null };
    let cache = null;
    const on = () => S.tab === "net" && !X.views[S.view];
    const tol = () => Math.max(0.18, 20 / (S.k * 100));
    const types = [["router", "Роутер", "R"], ["switch", "Коммутатор", "SW"], ["ap", "Точка доступа", "AP"]];
    const mainRouter = (p) => (p.network || []).find((d) => d.id === "R1") || (p.network || []).find((d) => d.type === "router");
    const aps = (p) => S.net.mode === "entry" ? [p.pos.entry] : S.net.mode === "center" ? [p.pos.center] : [p.pos.center].concat(p.pos.sat);
    const apName = (p, a) => a === p.pos.entry ? "роутера у ввода" : a === p.pos.center ? "узла Ц" : `спутника С${p.pos.sat.indexOf(a) + 1}`;
    function q(p) {
      const lw = F("L_W1") ? num(F("L_W1").value) : null;
      return { plan: p, cls: p.cls || X.curCls(), constr: F("constr") ? F("constr").value : "", L_W1: lw !== null && lw >= 1 && lw <= 40 ? lw : null };
    }
    function pv(p) {
      const Q = q(p), a = aps(p), key = JSON.stringify([p.W, p.H, p.rooms, p.walls, a, Q.cls, Q.constr, Q.L_W1]);
      if (cache && cache.key === key) return cache.v;
      let v = null; try { v = eng.preview(Q, a); } catch (e) { v = null; }
      cache = { key, v }; return v;
    }
    function explain(p, pt) {
      const v = pv(p); if (!v) return null;
      let best = null;
      for (const a of aps(p)) { const w = eng.why(v.g, a, pt); if (!best || w.P > best.P) best = w; }
      return best;
    }
    const col = (P) => root.NetPlan ? root.NetPlan.rssiColor(P) : P >= -67 ? "#66bd63" : "#fc8d59";

    X.layers.under.push((p, out) => {
      if (!on() || !S.net.coverage) return;
      const v = pv(p); if (!v) return;
      const st = cm(v.step);
      out.push(`<g class="kq-heat" opacity=".58">`);
      for (const [x, y, P] of v.pts) out.push(`<rect x="${cm(x - v.step / 2)}" y="${cm(y - v.step / 2)}" width="${st + 1}" height="${st + 1}" fill="${col(P)}"/>`);
      out.push("</g>");
    });

    X.layers.over.push((p, out, px) => {
      if (!on()) return;
      const rr = Math.max(13, px(6));
      for (const d of p.network || []) if (d.uplink && d.uplink !== "entry") {
        const up = (p.network || []).find((x) => x.id === d.uplink); if (!up) continue;
        out.push(`<line x1="${cm(up.pos[0])}" y1="${cm(up.pos[1])}" x2="${cm(d.pos[0])}" y2="${cm(d.pos[1])}" stroke="${d.type === "ap" ? "#00897b" : "#546e7a"}" stroke-width="${px(2)}" stroke-dasharray="${px(5)} ${px(3)}"/>`);
      }
      for (const d of p.network || []) {
        const selected = S.sel && S.sel.k === "device" && S.sel.id === d.id;
        const fill = d.type === "router" ? "#283593" : d.type === "switch" ? "#455a64" : "#00897b";
        const label = d.type === "router" ? "R" : d.type === "switch" ? "SW" : "AP";
        const w = d.type === "switch" ? rr * 2.5 : rr * 1.8, h = rr * 1.8;
        out.push(`<g class="kq-device" data-device="${esc(d.id)}">`,
          `<rect x="${cm(d.pos[0]) - w / 2}" y="${cm(d.pos[1]) - h / 2}" width="${w}" height="${h}" rx="${rr * 0.35}" fill="${fill}" stroke="${selected ? "#ff6d00" : "#fff"}" stroke-width="${selected ? px(3) : px(1.5)}"/>`,
          `<text x="${cm(d.pos[0])}" y="${cm(d.pos[1])}" class="kq-node" style="font-size:${rr * (d.type === "switch" ? 0.9 : 1.05)}px">${label}</text>`,
          `<text x="${cm(d.pos[0])}" y="${cm(d.pos[1]) + h / 2 + px(9)}" class="kq-device-name">${esc(d.name)}</text></g>`);
      }
      const w = S.net.why && explain(p, S.net.why);
      if (!w) return;
      for (const x of w.walls) out.push(`<line x1="${cm(x.w[0])}" y1="${cm(x.w[1])}" x2="${cm(x.w[2])}" y2="${cm(x.w[3])}" stroke="#ff6d00" stroke-width="${px(6)}" stroke-opacity=".7" stroke-linecap="round"/>`);
      out.push(`<line x1="${cm(w.ap[0])}" y1="${cm(w.ap[1])}" x2="${cm(w.pt[0])}" y2="${cm(w.pt[1])}" stroke="#212121" stroke-width="${px(2)}" stroke-dasharray="${px(6)} ${px(4)}"/>`,
        `<circle cx="${cm(w.pt[0])}" cy="${cm(w.pt[1])}" r="${px(6)}" fill="${col(w.P)}" stroke="#212121" stroke-width="${px(2)}"/>`,
        `<text x="${cm(w.pt[0])}" y="${cm(w.pt[1]) - px(16)}" class="kq-tip">${fd(w.P)} дБм</text>`);
    });

    function nodeAt(p, pt) {
      const P = p.pos, pxm = S.k * 100; let best = null;
      [["e", P.entry], ["c", P.center]].concat(P.sat.map((c, i) => [i, c])).forEach(([h, c]) => {
        const d = Math.hypot(c[0] - pt[0], c[1] - pt[1]) * pxm;
        if (d <= 24 && (!best || d < best.d)) best = { d, h };
      });
      return best ? best.h : null;
    }
    X.tab.net = {
      label: "Сеть и покрытие",
      hint: () => S.net.coverage ? "Тяните R, Ц, спутники или ввод — карта обновится. Нажмите на план для объяснения сигнала." : "Выберите тип устройства и нажмите на план. Устройства и узлы можно перетаскивать.",
      down: (pt) => {
        const hit = LA.deviceAt(S.pl, pt, tol());
        if (hit) { S.sel = { k: "device", id: hit.id }; return { kind: "device", deviceId: hit.id, pl: null }; }
        const h = nodeAt(S.pl, pt); return h === null ? null : { kind: "node", h, pl: null };
      },
      tap: (pt) => {
        if (S.net.coverage) { S.net.why = LA.roomAt(S.pl, pt) >= 0 ? [r4(pt[0]), r4(pt[1])] : null; X.paint(); return; }
        if (LA.roomAt(S.pl, pt) < 0) throw new Error("устройство можно поставить только внутри квартиры");
        const np = LA.addDevice(X.geo(S.pl), S.net.deviceType, pt);
        const d = np.network[np.network.length - 1];
        X.commit(np, { k: "device", id: d.id });
        S.knote = `${d.name} добавлен. Настройте порты, PoE и uplink в панели.`;
        X.paint();
      },
      side: (p) => side(p),
    };
    X.drags.node = {
      move(d, pt) {
        const np = clone(S.pl), sn = (v, hi) => r4(Math.min(hi - 0.1, Math.max(0.1, Math.round(v / LA.SNAP) * LA.SNAP))), c = [sn(pt[0], np.W), sn(pt[1], np.H)];
        if (d.h === "e") np.pos.entry = c; else if (d.h === "c") np.pos.center = c; else np.pos.sat[d.h] = c;
        const main = (np.network || []).find((x) => x.id === "R1"); if (main && d.h === "c") main.pos = c.slice();
        np.auto = false; np.manual = true; d.pl = np; X.stage(true);
      },
      end(d) { if (d.pl) X.commit(d.pl); else X.paint(); },
    };
    X.drags.device = {
      move(d, pt) {
        const np = clone(S.pl), dev = (np.network || []).find((x) => x.id === d.deviceId); if (!dev) return;
        dev.pos = [r4(Math.min(np.W - 0.1, Math.max(0.1, Math.round(pt[0] / LA.SNAP) * LA.SNAP))), r4(Math.min(np.H - 0.1, Math.max(0.1, Math.round(pt[1] / LA.SNAP) * LA.SNAP)))];
        if (dev.id === "R1") { np.pos.center = dev.pos.slice(); np.auto = false; np.manual = true; }
        d.pl = np; X.stage(true);
      },
      end(d) { if (d.pl) X.commit(d.pl, { k: "device", id: d.deviceId }); else X.paint(); },
    };

    function side(p) {
      const h = [], v = S.net.coverage ? pv(p) : null;
      h.push(`<h3>Сетевое оборудование</h3><div class="kq-chips" role="group" aria-label="Тип устройства">${types.map(([k, n]) => `<button type="button" class="kq-chip" data-act="devtype" data-t="${k}" aria-pressed="${S.net.deviceType === k}">${n}</button>`).join("")}</div>`);
      h.push(`<p class="kq-note">Нажмите на план, чтобы добавить устройство. R — основной роутер, SW — коммутатор, AP — точка доступа. Линии показывают uplink.</p><p>${B("devadd", "Добавить в центр комнаты")}</p>`);
      h.push(`<h4>Покрытие 5 ГГц</h4><label class="kq-chk"><input type="checkbox" class="kq-coverage"${S.net.coverage ? " checked" : ""}> показать поле покрытия</label>`);
      h.push(`<div class="kq-chips" role="group" aria-label="Активные узлы">${[["all", "Все узлы"], ["center", "Только Ц"], ["entry", "У ввода"]].map(([k, n]) => `<button type="button" class="kq-chip" data-act="netmode" data-t="${k}" aria-pressed="${S.net.mode === k}">${n}</button>`).join("")}</div>`);
      if (v) {
        h.push(`<p>Уровень ≥ ${fd(v.thr)} дБм: <b>${fm(v.K, 0)} %</b> площади, в жилых комнатах и на кухне — <b>${fm(v.Kliv, 0)} %</b>.</p>`);
        const rs = v.rooms.slice().sort((a, b) => a.P - b.P);
        if (rs.length) h.push(`<h4>Самая слабая точка комнаты</h4><div class="kq-nlist">${rs.map((r, i) => `<button type="button" class="kq-chip" data-act="netwhy" data-ri="${i}"><i style="background:${col(r.P)}"></i>${esc(r.room)} — <span class="${r.P < v.thr ? "kq-bad" : ""}">${fd(r.P)} дБм</span></button>`).join("")}</div>`);
        const w = S.net.why && explain(p, S.net.why);
        if (w) {
          const ws = w.walls.slice().sort((a, b) => b.L - a.L), gr = [];
          for (const x of ws) { const o = gr.find((y) => y.t === x.t); if (o) { o.n++; o.L += x.L; } else gr.push({ t: x.t, n: 1, L: x.L }); }
          h.push(`<div class="kq-why"><h4>Почему здесь ${fd(w.P)} дБм</h4><ul><li>${fm(w.E, 0)} дБм — ЭИИМ ${esc(apName(p, w.ap))}</li><li>−${fm(w.fspl, 1)} дБ — расстояние ${fm(w.d, 1)} м</li>` +
            (gr.length ? gr.map((x) => `<li>−${fm(x.L, 1)} дБ — ${esc(wname(x.t))}${x.n > 1 ? ` × ${x.n}` : ""}</li>`).join("") : "<li>стен на пути нет</li>") + `</ul><p>${B("netx", "Убрать разбор")}</p></div>`);
        }
        const RS = root.NetPlan ? root.NetPlan.RSSI : [];
        h.push(`<p class="kq-note"><b>Уровень сигнала:</b> ${RS.map(([, c, t]) => `<span class="kq-lg"><i style="background:${c}"></i>${t}</span>`).join(" ")}</p>`);
      }
      h.push(`<h4>Устройства <small>· ${(p.network || []).length}</small></h4><div class="kq-nlist">${(p.network || []).map((d) => `<button type="button" class="kq-chip" data-act="devpick" data-id="${esc(d.id)}" aria-pressed="${S.sel && S.sel.k === "device" && S.sel.id === d.id}"><i style="background:${d.type === "router" ? "#283593" : d.type === "switch" ? "#455a64" : "#00897b"}"></i>${esc(d.name)}</button>`).join("")}</div>`);
      const sel = S.sel && S.sel.k === "device" ? (p.network || []).find((d) => d.id === S.sel.id) : null;
      if (sel) {
        const links = (p.network || []).filter((d) => d.uplink === sel.id).length;
        h.push(`<h4>Свойства: ${esc(sel.name)}</h4>`,
          `<div class="kq-f"><label>Название <input type="text" class="kq-devname" maxlength="40" value="${esc(sel.name)}"></label></div>`,
          `<div class="kq-f"><label>Порты <input type="number" class="kq-devports" min="1" max="64" step="1" value="${esc(sel.ports)}"></label><label>PoE, Вт <input type="number" class="kq-devpoe" min="0" max="1000" step="5" value="${esc(sel.poe)}"></label></div>`,
          `<div class="kq-f"><label>Uplink <select class="kq-devuplink"><option value="entry"${sel.uplink === "entry" ? " selected" : ""}>ввод провайдера</option>${(p.network || []).filter((d) => d.id !== sel.id).map((d) => `<option value="${esc(d.id)}"${sel.uplink === d.id ? " selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label></div>`,
          `<p class="kq-note">Занято портов uplink: ${links}. Доступно: ${Math.max(0, sel.ports - links)}.</p>`,
          `<p>${B("devremove", "Убрать устройство")} ${B("unsel", "Снять выделение")}</p>`);
      }
      h.push(`<p>${B("auto", "Расставить узлы по правилам")} ${opts.run ? B("netrun", opts.hasResult && opts.hasResult() ? "Готово и пересчитать" : "Готово и рассчитать", ' data-main="1"') : ""}</p>`);
      return h.join("");
    }

    X.acts.devtype = (b) => { S.net.deviceType = b.dataset.t; X.paint(); };
    X.acts.devadd = () => {
      let ri = S.sel && S.sel.k === "room" ? S.sel.ri : LA.roomAt(S.pl, [S.pl.W / 2, S.pl.H / 2]);
      if (ri < 0 || !S.pl.rooms[ri]) ri = 0;
      const r = S.pl.rooms[ri][2][0], pt = [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2], np = LA.addDevice(X.geo(S.pl), S.net.deviceType, pt), d = np.network[np.network.length - 1];
      X.commit(np, { k: "device", id: d.id }); S.knote = `${d.name} добавлен в центр комнаты.`; X.paint();
    };
    X.acts.devpick = (b) => { S.sel = { k: "device", id: b.dataset.id }; X.paint(); };
    X.acts.devremove = () => { const sel = S.sel; if (sel && sel.k === "device") { X.commit(LA.removeDevice(S.pl, sel.id)); S.sel = null; S.knote = "Устройство убрано, соединения перепривязаны к вводу."; X.paint(); } };
    X.acts.netmode = (b) => { S.net.mode = b.dataset.t; X.paint(); };
    X.acts.netx = () => { S.net.why = null; X.paint(); };
    X.acts.netwhy = (b) => { const v = pv(S.pl); if (!v) return; const r = v.rooms.slice().sort((a, c) => a.P - c.P)[+b.dataset.ri]; if (r) { S.net.why = [r.x, r.y]; X.paint(); } };
    X.acts.netrun = () => { const d = X.$k('[data-act="done"]'); if (d) d.click(); if (opts.run) opts.run(); };
    X.onChange.push((t) => {
      if (t.matches(".kq-coverage")) { S.net.coverage = t.checked; X.paint(); return true; }
      if (!S.sel || S.sel.k !== "device") return false;
      if (t.matches(".kq-devname")) { X.commit(LA.updateDevice(S.pl, S.sel.id, { name: t.value }), S.sel); return true; }
      if (t.matches(".kq-devports")) { X.commit(LA.updateDevice(S.pl, S.sel.id, { ports: num(t.value) }), S.sel); return true; }
      if (t.matches(".kq-devpoe")) { X.commit(LA.updateDevice(S.pl, S.sel.id, { poe: num(t.value) }), S.sel); return true; }
      if (t.matches(".kq-devuplink")) { X.commit(LA.updateDevice(S.pl, S.sel.id, { uplink: t.value }), S.sel); return true; }
      return false;
    });
  });
})(typeof window !== "undefined" ? window : globalThis);
