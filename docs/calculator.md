# Калькулятор подбора

Калькулятор считает прямо в браузере, данные никуда не отправляются. Расчёт ведётся по методике И4 «Методика и алгоритм подбора оборудования»: класс квартиры и индекс сложности (Ш2), требования к скорости и KPI уровня (Ш3), покрытие и дерево архитектур (Ш4–Ш5), размещение узлов, частоты и кабель (Ш6–Ш8), подбор моделей по фильтрам, KPI, AHP и стоимости владения TCO (Ш9), паспорт сети для проверки замером (Ш12). Поля формы совпадают с пунктами [чек-листа обследования](chek-list.md) — коды A1–G3.

Квартира моделируется по типовому плану своего класса (И2), масштабированному по площади. Это прогноз: итог проверяется замерами «до» и «после» (блок H чек-листа, Ш11). Оборудование берётся из базы Notion «Оборудование К Телеком» — парк К Телеком и модели рынка (И3); сайт выгружает её каждый час. Своё оборудование можно добавить в блоке G3: оно рассчитывается наравне с каталогом.

Блок «Планировка» в форме — карточки типовых квартир К1–К5 и «С нуля». «Изменить планировку» открывает редактор: стену можно перетащить мышью или пальцем (на телефоне — сначала коснитесь стены) или сдвинуть кнопками и стрелками клавиатуры с шагом 5 см; помещение — разделить стеной (с дверью или без), объединить с соседним, переименовать, сменить тип; у участка стены — сменить тип (потери — по И2, табл. 4), вставить дверь или удалить его. «С нуля» — прямоугольный контур площадью из A2 с одной комнатой. Места узлов у изменённого типового плана остаются как в И4, кнопка «Расставить узлы по правилам» (и план «с нуля») ставит их по правилам размещения. Площадь своей планировки фиксирована: новое число в A2 пересчитывает план с сохранением пропорций. Расчёт по своей планировке — после «Рассчитать подбор» или «Пересчитать»: пока не пересчитано, над результатом показывается уведомление, что он устарел. Код квартиры — со «*» (К3-Р-П* — изменённый типовой план, К3-*-П — с нуля). Планировка сохраняется в этом браузере, её можно сохранить в файл JSON и загрузить обратно.

В таблице «Подобранное оборудование» — только модели К Телеком, по порядку: «Эконом» — наименьшая стоимость владения за 5 лет, «Оптимальный» — наибольший балл S, рекомендуем, «Премиум» — наибольшая скорость в худшей зоне; если это одна и та же модель, она показывается одной строкой с несколькими метками. Кнопка «Аналоги» под моделью раскрывает параметры подбора и 2–3 примера моделей с рынка из списка «Все подходящие варианты». Если в парке нет модели, выполняющей требования уровня (например, Wi-Fi 7 для премиального), показывается ближайший вариант К Телеком — условно.

Над планом квартиры — переключатель вариантов «Эконом», «Оптимальный», «Премиум» и «Свой выбор». «Свой выбор» — любая модель из списка «Все подходящие варианты» (кнопка «на план» или выпадающий список, в том числе своё оборудование) или новая модель, введённая в блоке G3: после «Добавить в расчёт» она пересчитывается и сразу показывается на плане. Для выбранного варианта заново строятся карта сигнала, узлы и кабель на плане, размещение, частоты, журнал кабеля, паспорт сети и строка стоимости; рекомендация при этом не меняется. Под планом — легенда: шкала сигнала, обозначения узлов и кабеля, а для стен — образец линии, тип стены и потери на 5 ГГц.

Серый значок **?** рядом с термином показывает краткое пояснение: что это, на что влияет и как считается; щелчок по нему открывает термин в разделе [«Термины и обозначения»](#terms) внизу страницы. Таблицы результата прокручиваются отдельно от страницы, шапка таблицы остаётся на месте, у широкой таблицы закреплён первый столбец (у списка вариантов — «№» и «Модель»). «Все подходящие варианты» и дерево архитектур сортируются кнопками ↕ в заголовках столбцов. Кнопка «На весь экран» открывает таблицу во весь экран.

<div id="netcalc" class="netcalc" markdown="0"><p>Для работы калькулятора нужен JavaScript.</p></div>

## Термины и обозначения {#terms}

Кратко о терминах, сокращениях и обозначениях калькулятора. Источники — отчёты итераций И1, И2, И4 и движок расчёта.

<div id="nc-gloss" class="gl-sec" markdown="0"><p>Для показа терминов нужен JavaScript.</p></div>

<style>
.netcalc fieldset{border:1px solid var(--md-default-fg-color--lightest);border-radius:6px;margin:0 0 1rem;padding:.3rem .9rem .6rem;min-width:0}
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
.netcalc .nc-var table{font-size:.85em}
.netcalc .nc-var td{vertical-align:top}
.netcalc .nc-note{color:var(--md-default-fg-color--light)}
.netcalc table[data-st] tr.nc-rec>td{background-color:var(--md-accent-fg-color--transparent)}
.netcalc table[data-st] tr.nc-rec>td[data-st-pin]{background:linear-gradient(var(--md-accent-fg-color--transparent),var(--md-accent-fg-color--transparent)) var(--md-default-bg-color)}
.netcalc .nc-badge{display:inline-block;margin-top:.2rem;padding:0 .4em;border-radius:.2rem;background:var(--md-accent-fg-color);color:var(--md-accent-bg-color);font-size:.8em;font-weight:700;white-space:nowrap}
.netcalc .nc-badge.nc-cond{background:#ef6c00;color:#fff}
.netcalc .nc-an-b{margin-top:.25rem;padding:.05rem .45rem;border:.05rem solid var(--md-default-fg-color--lighter);border-radius:.2rem;background:none;color:var(--md-typeset-a-color);font:inherit;font-size:.9em;cursor:pointer;white-space:nowrap}
.netcalc .nc-an-b:hover,.netcalc .nc-an-b:focus-visible{border-color:var(--md-accent-fg-color);color:var(--md-accent-fg-color)}
.netcalc .nc-nw{white-space:nowrap}
.netcalc .nc-an-b svg{vertical-align:-.15em;transition:transform .15s}
.netcalc .nc-an-b[aria-expanded=true] svg{transform:rotate(180deg)}
.netcalc tr.nc-an-row>td{background-color:var(--md-code-bg-color)}
.netcalc .nc-an{position:sticky;left:0;max-width:calc(var(--st-w,100%) - 2.5em);box-sizing:border-box}
.netcalc .nc-an p{margin:.3rem 0}
.netcalc .nc-an ul{margin:.2rem 0 .4rem}
.netcalc .nc-best{padding:.4rem .6rem;border-left:.2rem solid var(--md-accent-fg-color);background:var(--md-accent-fg-color--transparent)}
@media print{.netcalc .nc-an-b{display:none}}
.netcalc #nc-res{scroll-margin-top:3.5rem}
.netcalc .nc-planbox{overflow-x:auto}
.netcalc .nc-plan{width:100%;max-width:680px;height:auto;border:1px solid var(--md-default-fg-color--lightest);border-radius:4px}
.netcalc .nc-plan text{text-anchor:middle;dominant-baseline:central;font-family:sans-serif}
.netcalc .nc-plan .nc-room{font-size:30px;fill:#212121;paint-order:stroke;stroke:#fff;stroke-width:6px}
.netcalc .nc-plan .nc-lab{font-size:24px;fill:#e65100;paint-order:stroke;stroke:#fff;stroke-width:5px}
.netcalc .nc-plan .nc-ap{font-size:28px;font-weight:700;fill:#fff}
.netcalc .nc-legend span{display:inline-flex;align-items:center;gap:.25rem;margin-right:.8rem;font-size:.8em;max-width:100%}
.netcalc .nc-legend i{display:inline-block;width:.9rem;height:.9rem;border-radius:2px}
.netcalc .nc-legend i.nc-sq{border:2px solid #e65100;background:#fff}
.netcalc .nc-legend i.nc-dot{border-radius:50%}
.netcalc .nc-legend i.nc-ln{height:0;border-top:3px dashed #e65100;border-radius:0}
.netcalc .nc-pvh{scroll-margin-top:3.5rem}
.netcalc .nc-pvs{display:flex;flex-wrap:wrap;gap:.4rem;margin:.2rem 0 .5rem}
.netcalc .nc-pv-b{display:flex;flex-direction:column;align-items:flex-start;flex:1 1 7rem;min-width:0;max-width:15rem;padding:.3rem .55rem;border:.05rem solid var(--md-default-fg-color--lighter);border-radius:.3rem;background:var(--md-default-bg-color);color:var(--md-default-fg-color);font:inherit;font-size:.75rem;line-height:1.3;text-align:left;cursor:pointer}
.netcalc .nc-pv-b small{color:var(--md-default-fg-color--light);font-size:.9em;overflow-wrap:anywhere}
.netcalc .nc-pv-b:hover,.netcalc .nc-pv-b:focus-visible{border-color:var(--md-accent-fg-color)}
.netcalc .nc-pv-b[aria-pressed=true]{border-color:var(--md-accent-fg-color);background:var(--md-accent-fg-color--transparent);box-shadow:inset 0 0 0 .05rem var(--md-accent-fg-color)}
.netcalc .nc-pv-b[aria-pressed=true] b::before{content:"✓ "}
.netcalc .nc-pvsel{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .6rem;margin:0 0 .5rem;font-size:.75rem}
.netcalc .nc-pvsel select{width:auto;max-width:100%;min-width:0}
.netcalc .nc-own-r select{width:auto;max-width:17rem;min-width:0;font-size:inherit}
.netcalc .nc-own-x{margin-top:.25rem}
.netcalc .nc-pv-pick{margin-left:.3rem;padding:0 .35rem;border:.05rem solid var(--md-default-fg-color--lighter);border-radius:.2rem;background:none;color:var(--md-typeset-a-color);font:inherit;font-size:.85em;cursor:pointer;white-space:nowrap}
.netcalc .nc-pv-pick:hover,.netcalc .nc-pv-pick:focus-visible{border-color:var(--md-accent-fg-color);color:var(--md-accent-fg-color)}
.netcalc .nc-ok{color:#2e7d32}
[data-md-color-scheme=slate] .netcalc .nc-ok{color:#81c784}
.netcalc .nc-walls p{margin:.2rem 0}
.netcalc .nc-walls ul.nc-wlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));gap:.2rem 1rem;margin:.2rem 0 .3rem;padding:0;list-style:none;font-size:.8em}
.netcalc .nc-walls ul.nc-wlist>li{display:flex;align-items:center;gap:.4rem;margin:0;line-height:1.3}
.netcalc .nc-wl{flex:none;background:#fff;border:1px solid var(--md-default-fg-color--lightest);border-radius:2px}
.netcalc .nc-legend i.nc-ln.nc-pl{border-top:3px dotted #6a1b9a}
@media print{.netcalc .nc-pvs,.netcalc .nc-pvsel,.netcalc .nc-pv-pick,.netcalc .nc-own-r select,.netcalc .nc-pv-go{display:none}}
</style>
<link rel="stylesheet" href="../assets/css/constructor.css">
<script src="../assets/js/engine.js"></script>
<script src="../assets/js/glossary.js"></script>
<script src="../assets/js/plan.js"></script>
<script src="../assets/js/layout.js"></script>
<script src="../assets/js/layout-ui.js"></script>
<script src="../assets/js/layout-img.js"></script>
<script src="../assets/js/layout-net.js"></script>
<script src="../assets/js/calc.js"></script>
