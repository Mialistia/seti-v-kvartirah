// Выгрузка страниц из базы Notion «Страницы сайта» в docs/*.md и сборка меню mkdocs.yml.
// Переменные окружения: NOTION_TOKEN (токен интеграции), NOTION_DB (ID базы).
import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import fs from "node:fs/promises";
import path from "node:path";

const { NOTION_TOKEN, NOTION_DB } = process.env;
if (!NOTION_TOKEN || !NOTION_DB) { console.error("Нет NOTION_TOKEN или NOTION_DB"); process.exit(1); }

const DOCS = "docs";
const IMG = path.join(DOCS, "assets", "img");
const MARK = "<!-- generated-from-notion -->";
// Статические страницы из репозитория: [заголовок, файл, место в меню]
const STATIC = [["Калькулятор подбора", "calculator.md", 5.5]];

const notion = new Client({ auth: NOTION_TOKEN, baseUrl: process.env.NOTION_BASE_URL || undefined }); // NOTION_BASE_URL — только для тестов
const n2m = new NotionToMarkdown({ notionClient: notion });

const text = (p) => (p?.title ?? p?.rich_text ?? []).map((t) => t.plain_text).join("").trim();

// Картинки Notion живут по временной ссылке ~1 час, поэтому скачиваем их в репозиторий.
n2m.setCustomTransformer("image", async (block) => {
  const img = block.image;
  const url = img.type === "file" ? img.file.url : img.external.url;
  const caption = (img.caption ?? []).map((t) => t.plain_text).join("");
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const ext = (path.extname(new URL(url).pathname) || ".png").toLowerCase();
    const name = block.id.replace(/-/g, "") + ext;
    await fs.writeFile(path.join(IMG, name), Buffer.from(await res.arrayBuffer()));
    return `![${caption}](assets/img/${name})` + (caption ? `\n\n*${caption}*` : "");
  } catch (e) {
    console.warn("Не скачана картинка", url, e.message);
    return img.type === "external" ? `![${caption}](${url})` : "";
  }
});

async function queryAll() {
  const out = [];
  let cursor;
  do {
    const r = await notion.databases.query({
      database_id: NOTION_DB,
      start_cursor: cursor,
      filter: { property: "Опубликовано", checkbox: { equals: true } },
      sorts: [{ property: "Порядок", direction: "ascending" }],
    });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

const yq = (s) => JSON.stringify(s); // безопасные кавычки для YAML

async function main() {
  await fs.mkdir(IMG, { recursive: true });
  // удаляем страницы, созданные прошлой синхронизацией
  for (const f of await fs.readdir(DOCS)) {
    if (!f.endsWith(".md")) continue;
    const s = await fs.readFile(path.join(DOCS, f), "utf8");
    if (s.startsWith(MARK)) await fs.unlink(path.join(DOCS, f));
  }
  for (const f of await fs.readdir(IMG)) await fs.unlink(path.join(IMG, f));

  const items = [];
  for (const page of await queryAll()) {
    const pr = page.properties;
    const title = text(pr["Название"]);
    const slug = (text(pr["Адрес"]) || page.id.replace(/-/g, "")).toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const order = pr["Порядок"]?.number ?? 999;
    const section = pr["Раздел"]?.select?.name ?? null;
    const md = n2m.toMarkdownString(await n2m.pageToMarkdown(page.id)).parent ?? "";
    const date = new Date(page.last_edited_time).toLocaleDateString("ru-RU", { timeZone: "Asia/Yekaterinburg" });
    const body = `${MARK}\n# ${title}\n\n${md.trim()}\n\n---\n*Обновлено: ${date}*\n`;
    await fs.writeFile(path.join(DOCS, `${slug}.md`), body);
    items.push({ title, file: `${slug}.md`, order, section });
    console.log("OK", slug, "—", title);
  }
  for (const [title, file, order] of STATIC) items.push({ title, file, order, section: null });
  items.sort((a, b) => a.order - b.order);

  // Меню: страницы без раздела — верхний уровень; страницы одного раздела — группа на месте первой из них.
  const nav = [];
  const groups = new Map();
  for (const it of items) {
    if (!it.section) { nav.push(`  - ${yq(it.title)}: ${it.file}`); continue; }
    if (!groups.has(it.section)) { groups.set(it.section, []); nav.push({ section: it.section }); }
    groups.get(it.section).push(`      - ${yq(it.title)}: ${it.file}`);
  }
  const navYaml = nav.map((n) => typeof n === "string" ? n : `  - ${yq(n.section)}:\n${groups.get(n.section).join("\n")}`).join("\n");
  const base = await fs.readFile("mkdocs.base.yml", "utf8");
  await fs.writeFile("mkdocs.yml", `# Создаётся автоматически из mkdocs.base.yml и Notion. Не править вручную.\n${base.trimEnd()}\nnav:\n${navYaml}\n`);
  if (!items.some((i) => i.file === "index.md")) console.warn("Внимание: нет страницы с адресом index (главная)");
  console.log(`Готово: ${items.length} страниц`);
}

main().catch((e) => { console.error(e); process.exit(1); });
