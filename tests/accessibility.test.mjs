import assert from "node:assert/strict";
import fs from "node:fs";
await import("../docs/assets/js/engine.js");
await import("../docs/assets/js/glossary.js");
await import("../docs/assets/js/plan.js");
await import("../docs/assets/js/layout.js");
await import("../docs/assets/js/calc.js");

const UI = globalThis.NetCalcUI;
const PLD = JSON.parse(fs.readFileSync(new URL("../docs/assets/data/plans.json", import.meta.url), "utf8"));
const html = UI.formHtml(PLD);
const tags = (re) => [...html.matchAll(re)].map((m) => m[0]);

for (const band of ["2,4", "5", "6"]) {
  const input = tags(/<input\b[^>]*>/g).find((s) => s.includes(`name="u_band"`) && s.includes(`value="${band}"`));
  assert.ok(input && input.includes("aria-label="), `у чекбокса ${band} ГГц есть доступное имя`);
  const eirp = tags(/<input\b[^>]*>/g).find((s) => s.includes(`name="u_e${band}"`));
  assert.ok(eirp && eirp.includes("aria-label="), `у поля ЭИИМ ${band} ГГц есть доступное имя`);
}

assert.match(html, /id="nc-err"[^>]*role="alert"[^>]*aria-live="assertive"[^>]*tabindex="-1"/);
assert.match(html, /id="nc-umsg"[^>]*role="status"/);
assert.match(html, /<form[^>]*aria-describedby="nc-err"/);

const list = UI.userListHtml([{ name: "Мой роутер", type: "Роутер", std: "6", bands: ["2,4", "5"], wan: "1000", owned: true }]);
assert.match(list, /<button[^>]*aria-label="Убрать Мой роутер"[^>]*>✕<\/button>/);

const closed = { open: false }, alreadyOpen = { open: true };
const doc = { querySelectorAll: () => [closed, alreadyOpen] };
const printState = UI.openPrintDetails(doc);
assert.equal(closed.open, true);
assert.equal(alreadyOpen.open, true);
UI.restorePrintDetails(printState);
assert.equal(closed.open, false);
assert.equal(alreadyOpen.open, true);

console.log("Доступность: подписи полей, сообщения, удаление и печать проверены");
