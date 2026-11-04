/* Конструктор квартиры: «По картинке» — фото, скан или скриншот плана как подложка.
   Шаг «Рамка по наружным стенам» (углы и середины сторон), масштаб по площади A2 или по ширине рамки,
   затем прямоугольный контур с подложкой и обводка комнат. Картинка остаётся в браузере (localStorage),
   в файл планировки и в расчёт не попадает; в плане хранится только привязка pl.bg (layout.js: bgFit).
   Подключается после layout-ui.js и до calc.js. */
(function (root) {
  "use strict";
  const LA = root.NetLayout;
  if (!LA || typeof document === "undefined") return;
  const { fm, esc, clone } = LA._, IMG = "netcalc.plan.img.v1";
  const frH = (f) => [[f[0], f[1]], [f[2], f[1]], [f[2], f[3]], [f[0], f[3]], [(f[0] + f[2]) / 2, f[1]], [f[2], (f[1] + f[3]) / 2], [(f[0] + f[2]) / 2, f[3]], [f[0], (f[1] + f[3]) / 2]];

  (LA.ext = LA.ext || []).push((X) => {
    const { S, F, PLD, B, SIDES, num, r2, cm, $k, $h, areaNow, typ, curCls } = X;
    S.fr = null; S.sc = "A"; S.L = null;
    if (S.pl && S.pl.bg) { try { S.img = JSON.parse(localStorage.getItem(IMG) || "null"); } catch (e) { S.img = null; } }   // картинка прошлого сеанса
    X.host.insertAdjacentHTML("beforeend", `<input type="file" class="nc-lay-img" accept="image/*" hidden>`);
    X.host.addEventListener("change", (ev) => { const t = ev.target; if (!t.matches(".nc-lay-img") || !t.files || !t.files[0]) return; const f = t.files[0]; t.value = ""; X.tryDo(() => loadImg(f)); });

    function loadImg(f) {   // картинка уменьшается до 1600 пикселей по большей стороне и хранится как JPEG
      if (!/^image\//.test(f.type || "")) throw new Error("нужен файл картинки: JPG, PNG, WebP");
      const u = URL.createObjectURL(f), im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); X.tryDo(() => {
        const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
        const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
        S.img = { src: c.toDataURL("image/jpeg", 0.85), iw: w, ih: h, name: f.name }; S.fr = [w * 0.05, h * 0.05, w * 0.95, h * 0.95].map(Math.round);
        S.view = "img"; S.z = 1; S.knote = ""; S.sel = null; S.draw = false; X.paint(); }); };
      im.onerror = () => { URL.revokeObjectURL(u); S.knote = "Картинку не удалось открыть — попробуйте JPG или PNG."; X.paint(); };
      im.src = u;
    }
    const dims = () => LA.frameSize(S.fr, areaNow() || typ(curCls()).area, S.sc === "L" && S.L > 0 ? S.L : null);
    const szText = () => { const d = dims(); return `Получится: <b>${fm(d.W)} × ${fm(d.H)} м</b>, ${fm(d.W * d.H, 1)} м²${S.sc === "L" ? " — станет общей площадью A2" : ""}.`; };
    const upd = () => { const z = $k(".kq-imgsz"); if (z) z.innerHTML = szText(); };

    // вид «img»: картинка, затемнение вне рамки, рамка с кружками
    X.views.img = {
      label: "Картинка плана и рамка по наружным стенам",
      box: () => ({ W: S.img.iw / 100, H: S.img.ih / 100 }),   // картинка как «план»: 1 пиксель — 1 единица рисунка
      stat: () => `Подгонка по картинке «${esc(S.img.name || "план")}» · ${S.img.iw} × ${S.img.ih} пикс.`,
      hint: () => "Тяните оранжевые кружки к наружным углам квартиры на картинке.",
      stage(light) {
        const cv = $k(".kq-cv"); if (!cv || !S.img) return;
        const [x0, y0, w, h] = X.vb(this.box()), cw = cv.clientWidth || 600, ch = cv.clientHeight || 400; S.k = Math.min(cw / (w * 100), ch / (h * 100));
        const px = (n) => n / S.k, f = S.fr, iw = S.img.iw, ih = S.img.ih, d = S.drag, on = d && d.kind === "fr" ? d.i : -1, dm = dims();
        const out = [`<svg class="kq-svg" viewBox="${cm(x0)} ${cm(y0)} ${cm(w)} ${cm(h)}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="font-size:${Math.round(px(14))}px">`,
          `<image href="${S.img.src}" x="0" y="0" width="${iw}" height="${ih}" preserveAspectRatio="none"/>`,
          `<path d="M0 0H${iw}V${ih}H0Z M${f[0]} ${f[1]}H${f[2]}V${f[3]}H${f[0]}Z" fill="#263238" fill-opacity=".45" fill-rule="evenodd"/>`,
          `<rect x="${f[0]}" y="${f[1]}" width="${f[2] - f[0]}" height="${f[3] - f[1]}" fill="none" stroke="#ff6d00" stroke-width="${px(2.5)}"/>`,
          `<text x="${(f[0] + f[2]) / 2}" y="${f[1] + px(22)}" class="kq-tip">${fm(dm.W)} м</text>`,
          `<text x="${f[0] + px(22)}" y="${(f[1] + f[3]) / 2}" class="kq-tip" transform="rotate(-90 ${f[0] + px(22)} ${(f[1] + f[3]) / 2})">${fm(dm.H)} м</text>`];
        frH(f).forEach(([x, y], i) => out.push(`<circle cx="${x}" cy="${y}" r="${px(i < 4 ? 13 : 10)}" fill="${i === on ? "#e65100" : "#ff6d00"}" stroke="#fff" stroke-width="${px(3)}"/>`));
        out.push("</svg>");
        cv.innerHTML = out.join("");
        if (!light) $k(".kq-hint").textContent = this.hint();
        upd();
      },
      side() {
        const A = areaNow(), Ab = A || typ(curCls()).area, ds = LA.doorSide({ door: null });
        return `<h3>Рамка по наружным стенам</h3><p class="kq-note">Совместите углы рамки с наружными углами квартиры. Фото под углом искажает размеры — лучше скан, скриншот из объявления или план из документов.</p>` +
          `<h4>Масштаб</h4><div class="kq-f"><label class="kq-chk"><input type="radio" name="kq-sc" class="kq-sc" value="A"${S.sc === "A" ? " checked" : ""}> по площади ${A ? `A2 — ${fm(A, 1)} м²` : `типового плана — ${fm(Ab, 1)} м²`}</label></div>` +
          `<div class="kq-f"><label class="kq-chk"><input type="radio" name="kq-sc" class="kq-sc" value="L"${S.sc === "L" ? " checked" : ""}> по длине стены: ширина рамки</label>` +
          `<label><input type="number" class="kq-L" min="2" max="30" step="0.05" value="${S.L || ""}" aria-label="Ширина рамки, м"> м</label></div><p class="kq-imgsz">${szText()}</p>` +
          `<div class="kq-f"><label>Входная дверь <select class="kq-nside">${SIDES.map(([v, t]) => `<option value="${v}"${v === ds.side ? " selected" : ""}>${t}</option>`).join("")}</select></label>` +
          `<label>отступ от угла, м <input type="number" class="kq-noff" min="0" step="0.05" value="${ds.off}"></label></div><p class="kq-err kq-nerr"></p>` +
          `<p>${B("imgok", "Создать план", ' data-main="1"')}${B("restart", "Назад")}</p>` +
          `<p class="kq-note">Дальше — «＋ Нарисовать комнату»: обведите комнаты по картинке. Картинка хранится только в этом браузере и в файл планировки не попадает.</p>`;
      },
      down(pt) {   // кружок рамки под пальцем или курсором
        let best = -1, bd = 1e9;
        frH(S.fr).forEach(([x, y], i) => { const d = Math.hypot(x - pt[0] * 100, y - pt[1] * 100) * S.k; if (d <= 26 && d < bd) { bd = d; best = i; } });
        return best >= 0 ? { kind: "fr", i: best } : null;
      },
    };
    X.drags.fr = {
      move(d, pt) {
        const f = S.fr.slice(), M = 20, i = d.i, u = Math.min(S.img.iw, Math.max(0, pt[0] * 100)), v = Math.min(S.img.ih, Math.max(0, pt[1] * 100));
        if ([0, 3, 7].includes(i)) f[0] = Math.min(u, f[2] - M);
        if ([1, 2, 5].includes(i)) f[2] = Math.max(u, f[0] + M);
        if ([0, 1, 4].includes(i)) f[1] = Math.min(v, f[3] - M);
        if ([2, 3, 6].includes(i)) f[3] = Math.max(v, f[1] + M);
        S.fr = f.map((x) => Math.round(x * 10) / 10); X.stage(true);
      },
      end() { X.stage(); },
    };

    // старт: карточка; действия; поля
    X.cards.push(() => `<section class="kq-card"><h3>По картинке <span class="kq-badge kq-pc">удобнее на ПК</span></h3><p>Фото, скан или скриншот плана из объявления станет подложкой: совместите рамку с наружными стенами, задайте масштаб и обведите комнаты.</p>` +
      `${B("img", "Выбрать картинку")}<p class="kq-note">Картинка остаётся в этом браузере — никуда не отправляется.</p></section>`);
    X.acts.img = () => $h(".nc-lay-img").click();
    X.acts.imgok = () => {
      if (!S.img) return;
      const er = $k(".kq-nerr");
      if (S.sc === "L" && !(S.L > 0)) { er.textContent = "укажите ширину рамки в метрах"; return; }
      const d = dims(), A = d.W * d.H;
      if (d.W < 2 || d.W > 30 || d.H < 2 || d.H > 30) { er.textContent = `получается ${fm(d.W)} × ${fm(d.H)} м — ширина и длина должны быть от 2 до 30 м`; return; }
      if (A < 15 || A > 300) { er.textContent = `получается ${fm(A, 1)} м² — общая площадь должна быть от 15 до 300 м²`; return; }
      X.drop("Своя планировка заменена планом по картинке.");
      if (S.sc === "L" || !areaNow()) F("area").value = String(r2(A));
      const c = curCls(), pl = LA.blank(PLD, c, A, d.W, $k(".kq-nside").value, num($k(".kq-noff").value) || 0);
      pl.bg = LA.bgFit(S.fr, S.img.iw, S.img.ih, pl.W, pl.H);
      let kept = true; try { localStorage.setItem(IMG, JSON.stringify(S.img)); } catch (e) { kept = false; }
      S.hist = []; S.fut = []; S.pl = pl; S.base = null; S.view = "edit"; S.tab = "rooms"; S.sel = null; S.draw = true; S.z = 1; S.bgOn = true; F("cls").value = c;
      S.knote = `План по картинке: ${fm(pl.W)} × ${fm(pl.H)} м, ${fm(pl.W * pl.H, 1)} м²${S.sc === "L" ? " — эта площадь теперь в A2" : ""}. Обведите комнаты прямоугольником; остаток — «Комната 1»: переименуйте или смените тип.` +
        (kept ? "" : " Картинка слишком большая для хранения в браузере — после перезагрузки страницы её не будет.");
      X.changed();
    };
    X.acts.bgdel = (b, p) => { const np = clone(p); delete np.bg; S.img = null; try { localStorage.removeItem(IMG); } catch (e) { /* хранилище недоступно */ } X.commit(np); };
    X.planSide.push((p) => (!p.bg ? "" : `<h4>Картинка-подложка</h4>` + (S.img
      ? `<div class="kq-f"><label>Яркость <input type="range" class="kq-bgop" min="0.2" max="1" step="0.05" value="${S.bgOp}"></label>` +
        `<label class="kq-chk"><input type="checkbox" class="kq-bgon"${S.bgOn ? " checked" : ""}> показывать</label></div><p>${B("bgdel", "Убрать картинку")}</p>`
      : `<p class="kq-note">Картинки нет в этом браузере — план остался.</p><p>${B("bgdel", "Убрать привязку картинки")}</p>`)));
    X.onChange.push((t) => {
      if (t.matches(".kq-sc")) { S.sc = t.value; X.stage(); return true; }
      if (t.matches(".kq-bgon")) { S.bgOn = t.checked; X.stage(); return true; }
      return false;
    });
    X.onInput.push((t) => {
      if (t.matches(".kq-bgop")) { S.bgOp = +t.value; X.stage(true); return true; }
      if (t.matches(".kq-L")) { S.L = num(t.value); if (S.L > 0 && S.sc !== "L") { S.sc = "L"; const r = $k('.kq-sc[value="L"]'); if (r) r.checked = true; } X.stage(true); return true; }
      return false;
    });
  });
})(typeof window !== "undefined" ? window : globalThis);
