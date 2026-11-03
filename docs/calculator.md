# Калькулятор подбора

Калькулятор считает прямо в браузере, данные никуда не отправляются. Расчёт ведётся по формулам методики; коэффициенты — ориентиры, уточняемые по замерам. Оборудование подбирается из парка ООО «К ТЕЛЕКОМ» (модели, которые заказываются в офис).

<div id="netcalc" class="netcalc" markdown="0">
<h2>1. Квартира</h2>
<label class="nc-row"><span>Площадь, м²</span><input id="nc-area" type="number" min="10" max="400" value="55"></label>
<label class="nc-row"><span>Комнат</span><select id="nc-rooms"><option value="0">студия</option><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option><option value="4">4 и больше / двухуровневая</option></select></label>
<label class="nc-row"><span>Планировка</span><select id="nc-layout"><option value="С">С — студия</option><option value="Л">Л — линейная</option><option value="Р" selected>Р — «распашонка»</option><option value="У">У — угловая</option><option value="Е">Е — евро-формат</option><option value="Д">Д — двухуровневая</option></select></label>
<label class="nc-row"><span>Дом</span><select id="nc-build"><option value="П" selected>П — панельный</option><option value="М">М — монолитный</option><option value="К">К — кирпичный</option><option value="С">С — смешанный</option></select></label>
<label class="nc-row"><span>Расстояние от роутера до самой дальней жилой зоны, м</span><input id="nc-dist" type="number" min="1" max="50" value="9"></label>
<h2>2. Стены на пути к самой дальней зоне (сколько штук)</h2>
<div id="nc-walls"></div>
<h2>3. Устройства (одновременно активные)</h2>
<div id="nc-devs"></div>
<h2>4. Условия</h2>
<label class="nc-row"><span>Можно провести кабель к дальним зонам?</span><select id="nc-cable"><option value="no">нет</option><option value="yes">да</option></select></label>
<label class="nc-row"><span>Powerline-тест между точками даёт нужную скорость?</span><select id="nc-plc"><option value="unknown">не проверялся</option><option value="yes">да</option><option value="no">нет</option></select></label>
<label class="nc-row"><span>Сегмент</span><select id="nc-seg"><option value="budget">бюджетный</option><option value="optimum" selected>оптимальный</option><option value="premium">премиальный</option></select></label>
<label class="nc-row"><span>ЭИИМ роутера на 5 ГГц, дБм</span><input id="nc-eirp" type="number" value="20"></label>
<label class="nc-row"><span>Разброс модели σ, дБ</span><input id="nc-sigma" type="number" value="6" step="0.5"></label>
<h2>5. Подбор оборудования К Телеком</h2>
<label class="nc-row"><span>Тариф абонента, Мбит/с</span><select id="nc-tariff"><option value="60">60</option><option value="100">100</option><option value="300" selected>300</option><option value="500">500</option><option value="1000">1000</option><option value="2500">2500</option></select></label>
<label class="nc-row"><span>Нужен VPN на роутере?</span><select id="nc-vpn"><option value="no">нет</option><option value="yes">да</option></select></label>
<label class="nc-row"><span>Бюджет на оборудование, ₽</span><input id="nc-budget" type="number" min="0" step="100" placeholder="без ограничения"></label>
<label class="nc-row"><span>Нужен Wi-Fi на улице (двор, терраса)?</span><select id="nc-outdoor"><option value="no">нет</option><option value="yes">да</option></select></label>
<p><button id="nc-run" class="md-button md-button--primary" type="button">Рассчитать</button></p>
<div id="nc-out"></div>
<div id="nc-eq"></div>
</div>

<style>
.netcalc .nc-row{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin:.35rem 0;flex-wrap:wrap}
.netcalc .nc-row span{flex:1 1 16rem}
.netcalc #nc-eq table{font-size:.85em}
.netcalc #nc-eq td:nth-child(3){white-space:nowrap}
.netcalc input,.netcalc select{width:12rem;padding:.25rem;border:1px solid var(--md-default-fg-color--lighter);border-radius:4px;background:var(--md-default-bg-color);color:var(--md-default-fg-color)}
</style>
<script src="../assets/js/calc.js"></script>
