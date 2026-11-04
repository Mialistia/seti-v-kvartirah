# Калькулятор подбора

Калькулятор считает прямо в браузере, данные никуда не отправляются. Расчёт ведётся по методике И4 «Методика и алгоритм подбора оборудования»: класс квартиры и индекс сложности (Ш2), требования к скорости и KPI уровня (Ш3), покрытие и дерево архитектур (Ш4–Ш5), размещение узлов, частоты и кабель (Ш6–Ш8), подбор моделей по фильтрам, KPI, AHP и стоимости владения TCO (Ш9), паспорт сети для проверки замером (Ш12). Поля формы совпадают с пунктами [чек-листа обследования](chek-list.md) — коды A1–G3.

Квартира моделируется по типовому плану своего класса (И2), масштабированному по площади. Это прогноз: итог проверяется замерами «до» и «после» (блок H чек-листа, Ш11). Оборудование берётся из базы Notion «Оборудование К Телеком» — парк К Телеком и модели рынка (И3); сайт выгружает её каждый час. Своё оборудование можно добавить в блоке G3: оно рассчитывается наравне с каталогом.

<div id="netcalc" class="netcalc" markdown="0"><p>Для работы калькулятора нужен JavaScript.</p></div>

<style>
.netcalc fieldset{border:1px solid var(--md-default-fg-color--lightest);border-radius:6px;margin:0 0 1rem;padding:.3rem .9rem .6rem}
.netcalc legend{font-weight:700;padding:0 .3rem}
.netcalc .nc-row{display:flex;justify-content:space-between;align-items:center;gap:.3rem 1rem;margin:.3rem 0;flex-wrap:wrap}
.netcalc .nc-row>span{flex:1 1 14rem}
.netcalc .nc-code{display:inline-block;min-width:2.2em;font-size:.8em;color:var(--md-accent-fg-color)}
.netcalc .nc-code:empty{display:none}
.netcalc input[type=number],.netcalc input[type=text],.netcalc select{width:13rem;max-width:100%;padding:.25rem;border:1px solid var(--md-default-fg-color--lighter);border-radius:4px;background:var(--md-default-bg-color);color:var(--md-default-fg-color)}
.netcalc input.nc-s{width:4.8rem}
.netcalc .nc-chk{white-space:nowrap;margin-left:.6rem}
.netcalc .nc-sub{margin:.5rem 0 .1rem}
.netcalc .nc-own{padding:.2rem 0 0 .6rem}
.netcalc .nc-err{color:#c62828}
.netcalc .nc-del{border:0;background:none;color:#c62828;cursor:pointer}
.netcalc .nc-tw{overflow-x:auto}
.netcalc .nc-var table{font-size:.85em}
.netcalc .nc-var td{vertical-align:top}
.netcalc .nc-note{color:var(--md-default-fg-color--light)}
.netcalc #nc-res{scroll-margin-top:3.5rem}
.netcalc .nc-planbox{overflow-x:auto}
.netcalc .nc-plan{width:100%;max-width:680px;height:auto;border:1px solid var(--md-default-fg-color--lightest);border-radius:4px}
.netcalc .nc-plan text{text-anchor:middle;dominant-baseline:central;font-family:sans-serif}
.netcalc .nc-plan .nc-room{font-size:30px;fill:#212121;paint-order:stroke;stroke:#fff;stroke-width:6px}
.netcalc .nc-plan .nc-lab{font-size:24px;fill:#e65100;paint-order:stroke;stroke:#fff;stroke-width:5px}
.netcalc .nc-plan .nc-ap{font-size:28px;font-weight:700;fill:#fff}
.netcalc .nc-legend span{display:inline-flex;align-items:center;gap:.25rem;margin-right:.8rem;font-size:.8em;white-space:nowrap}
.netcalc .nc-legend i{display:inline-block;width:.9rem;height:.9rem;border-radius:2px}
.netcalc .nc-legend i.nc-sq{border:2px solid #e65100;background:#fff}
.netcalc .nc-legend i.nc-dot{border-radius:50%}
.netcalc .nc-legend i.nc-ln{height:0;border-top:3px dashed #e65100;border-radius:0}
</style>
<script src="../assets/js/engine.js"></script>
<script src="../assets/js/calc.js"></script>
