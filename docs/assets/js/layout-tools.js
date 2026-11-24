// Инструменты холста: сетка, проёмы и экспорт планировки.
(function (root) {
  "use strict";
  const LA = root.NetLayout;
  if (!LA || typeof document === "undefined") return;
  const { fm, esc, r4, segDist, mkW } = LA._;

  (LA.ext = LA.ext || []).push((X) => {
    const { S, B } = X;
    S.openTool = "door";
    X.tabs.push(["openings", "Проёмы"]);
    X.tab.openings = { label: "Двери и окна" };

    const tol = () => Math.max(0.12, 18 / (S.k * 100));
    const pieceAt = (p, pt) => {
      let best = null;
      for (const x of LA.pieces(p)) {
        const d = segDist(pt, mkW(x.o, x.c, x.a, x.b)) - (x.t ? 0.01 : 0);
        if (d <= tol() && (!best || d < best.d)) best = { d, x };
      }
      return best && best.x;
    };
    X.tab.openings.hint = () => S.openTool === "window"
      ? "Нажмите на наружную стену, чтобы поставить окно. Окно можно перетаскивать."
      : "Нажмите на внутреннюю стену для двери или на наружную стену для входной двери.";
    X.tab.openings.down = (pt) => {
      const hit = LA.windowAt(S.pl, pt, tol());
      return hit ? { kind: "window", wi: hit.wi, pl: null } : null;
    };
    X.tab.openings.tap = (pt) => {
      if (S.openTool === "window") {
        const seg = LA.outerAt(S.pl, pt, tol());
        if (!seg) throw new Error("нажмите ближе к наружной стене");
        const np = LA.addWindow(X.geo(S.pl), seg, 1.2);
        X.commit(np, { k: "window", wi: np.windows.length - 1 });
        S.knote = "Окно добавлено. Его можно перетащить вдоль стены или изменить ширину в панели.";
        X.paint(); return;
      }
      const pc = pieceAt(S.pl, pt);
      if (pc && pc.t !== "W4") {
        X.commit(LA.doorIn(X.geo(S.pl), pc, pc.o === "v" ? pt[1] : pt[0]), { k: "piece", o: pc.o, c: pc.c, at: pc.o === "v" ? pt[1] : pt[0] });
        S.knote = "Дверь добавлена в выбранный участок стены."; X.paint(); return;
      }
      const seg = LA.outerAt(S.pl, pt, tol());
      if (!seg) throw new Error("нажмите на стену; для внутренней двери нужен участок длиной от 0,9 м");
      const side = seg.o === "v" ? (seg.c === 0 ? "лево" : "право") : (seg.c === 0 ? "верх" : "низ");
      X.commit(LA.setDoor(X.geo(S.pl), side, seg.at));
      S.knote = "Входная дверь перемещена. Ввод кабеля теперь находится рядом с ней.";
      X.paint();
    };
    X.drags.window = {
      move(d, pt) {
        const s = LA.winSeg(S.pl.windows[d.wi]); if (!s) return;
        d.pl = LA.moveWindow(S.pl, d.wi, s.o === "v" ? pt[1] : pt[0]); X.stage(true);
      },
      end(d) { if (d.pl) X.commit(d.pl, { k: "window", wi: d.wi }); else X.stage(); },
    };
    X.tab.openings.side = (p) => {
      const ws = p.windows || [], sel = S.sel && S.sel.k === "window" ? S.sel.wi : -1, h = [];
      h.push(`<h3>Двери и окна</h3><div class="kq-chips" role="group" aria-label="Инструмент проёма">` +
        `<button type="button" class="kq-chip" data-act="optool" data-t="door" aria-pressed="${S.openTool === "door"}">Дверь</button>` +
        `<button type="button" class="kq-chip" data-act="optool" data-t="window" aria-pressed="${S.openTool === "window"}">Окно</button></div>`);
      h.push(`<p class="kq-note">${S.openTool === "window" ? "Нажмите на наружную стену — окно шириной 1,2 м. Тяните окно вдоль стены; точную ширину можно ввести ниже." : "Внутренняя стена — дверь 0,8 м. Наружная стена — входная дверь и место ввода кабеля."}</p>`);
      h.push(`<h4>Окна на плане <small>· ${ws.length}</small></h4>`);
      if (!ws.length) h.push(`<p class="kq-note">Окон пока нет. Выберите «Окно» и нажмите на наружную стену.</p>`);
      else h.push(`<div class="kq-nlist">${ws.map((w, i) => `<button type="button" class="kq-chip" data-act="wpick" data-wi="${i}" aria-pressed="${i === sel}"><i class="kq-win-dot"></i>Окно ${i + 1} — ${fm(LA.winSeg(w).b - LA.winSeg(w).a)} м</button>`).join("")}</div>`);
      if (sel >= 0 && ws[sel]) {
        const s = LA.winSeg(ws[sel]);
        h.push(`<div class="kq-f"><label>Ширина выбранного окна, м <input type="number" class="kq-wwidth" min="0.5" max="3" step="0.05" value="${r4(s.b - s.a)}"></label></div>`);
      }
      h.push(`<p class="kq-note">Окна показаны двойной линией, внутренние двери — створкой, входная дверь — оранжевой линией.</p>`);
      return h.join("");
    };

    X.acts.optool = (b) => { S.openTool = b.dataset.t; S.sel = null; X.paint(); };
    X.acts.wpick = (b) => { S.sel = { k: "window", wi: +b.dataset.wi }; X.paint(); };
    X.acts.grid = () => { S.gridOn = !S.gridOn; X.stage(); };
    X.onChange.push((t) => {
      if (t.matches(".kq-gridstep")) { S.grid = +t.value; X.stage(); return true; }
      if (t.matches(".kq-wwidth") && S.sel && S.sel.k === "window") {
        const v = Number(t.value); if (Number.isFinite(v)) X.commit(LA.resizeWindow(S.pl, S.sel.wi, v), S.sel);
        return true;
      }
      return false;
    });

    const tr = { "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya" };
    const name = () => String(S.pl.base || S.pl.title || "planirovka").toLowerCase().replace(/[а-яё]/g, (c) => tr[c]).replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "planirovka";
    const download = (blob, ext) => {
      const u = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = u; a.download = `${name()}.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
    };
    function svgText() {
      const svg = X.$k(".kq-cv svg"); if (!svg) throw new Error("план ещё не построен");
      const c = svg.cloneNode(true), W = Math.max(800, Math.round(S.pl.W * 80)), H = Math.max(600, Math.round(S.pl.H * 80));
      c.querySelectorAll(".kq-edit-only").forEach((el) => el.remove());
      c.setAttribute("xmlns", "http://www.w3.org/2000/svg"); c.setAttribute("width", W); c.setAttribute("height", H);
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const vb = (c.getAttribute("viewBox") || "0 0 100 100").split(/\s+/).map(Number);
      bg.setAttribute("x", vb[0]); bg.setAttribute("y", vb[1]); bg.setAttribute("width", vb[2]); bg.setAttribute("height", vb[3]); bg.setAttribute("fill", "#fff");
      c.insertBefore(bg, c.firstChild);
      const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
      style.textContent = "text{font-family:Arial,sans-serif;text-anchor:middle;dominant-baseline:central}.kq-room{font-weight:700;fill:#212121;paint-order:stroke;stroke:#fff;stroke-width:5px}.kq-area{font-size:.8em;fill:#455a64;paint-order:stroke;stroke:#fff;stroke-width:4px}.kq-out,.kq-dim{font-size:.8em;fill:#546e7a}.kq-node,.kq-hd{font-weight:700;fill:#fff}.kq-device-name{font-size:.72em;font-weight:600;fill:#263238;paint-order:stroke;stroke:#fff;stroke-width:4px}.kq-tip{font-weight:700;fill:#bf360c;paint-order:stroke;stroke:#fff;stroke-width:4px}";
      c.insertBefore(style, c.firstChild);
      return new XMLSerializer().serializeToString(c);
    }
    X.acts.exsvg = () => download(new Blob([svgText()], { type: "image/svg+xml;charset=utf-8" }), "svg");
    X.acts.expng = () => {
      const svg = svgText(), u = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" })), im = new Image();
      im.onload = () => {
        const c = document.createElement("canvas"), k = Math.min(2, 3200 / Math.max(im.width, im.height));
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        c.toBlob((b) => { if (b) download(b, "png"); else { S.knote = "Не удалось подготовить PNG."; X.render(); } }, "image/png");
      };
      im.onerror = () => { URL.revokeObjectURL(u); S.knote = "Не удалось подготовить PNG."; S.note = S.knote; X.render(); };
      im.src = u;
    };
    X.acts.expdf = () => {
      const frame = document.createElement("iframe");
      frame.className = "kq-print-frame"; frame.title = "Печать планировки";
      frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name())}</title><style>@page{size:landscape;margin:10mm}body{margin:0;display:grid;place-items:center;min-height:95vh}svg{width:100%;height:auto;max-height:90vh}</style></head><body>${svgText()}</body></html>`;
      frame.onload = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { frame.remove(); throw e; } };
      frame.addEventListener("afterprint", () => frame.remove(), { once: true });
      document.body.appendChild(frame);
    };
  });
})(typeof window !== "undefined" ? window : globalThis);
