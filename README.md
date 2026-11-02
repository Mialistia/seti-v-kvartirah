# Сайт проекта «Сети в квартирах»

Тексты сайта пишутся в Notion (база «Страницы сайта»). Раз в час GitHub Actions выгружает отмеченные страницы в `docs/*.md`, собирает сайт MkDocs Material и публикует его на GitHub Pages.

## Что где лежит

| Путь | Что это |
|---|---|
| `.github/workflows/site.yml` | автоматизация: синхронизация, сборка, публикация |
| `scripts/sync.mjs` | выгрузка страниц из Notion и сборка меню |
| `mkdocs.base.yml` | настройки сайта (правьте его; `mkdocs.yml` создаётся автоматически) |
| `docs/calculator.md`, `docs/assets/js/calc.js` | калькулятор подбора (не из Notion) |
| `docs/*.md` с меткой `generated-from-notion` | страницы из Notion — не править вручную |

## Настройка

1. Notion → https://www.notion.so/profile/integrations → New integration → Internal → скопировать токен.
2. В Notion открыть страницу «Сайт проекта «Сети в квартирах»» → ••• → Connections → добавить интеграцию.
3. GitHub → Settings → Secrets and variables → Actions → New repository secret:
   - `NOTION_TOKEN` — токен интеграции;
   - `NOTION_DB` — `cd117d20433441e79eedfee7d44bae59` (ID базы «Страницы сайта»).
4. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
5. Actions → «Сайт из Notion» → Run workflow. Через 1–2 минуты сайт откроется по адресу `https://<логин>.github.io/<репозиторий>/`.

## Правила для страниц в Notion

- На сайт попадают только страницы с галочкой «Опубликовано».
- «Адрес» — латиница, цифры, дефис; главная — `index`.
- «Порядок» — место в меню; «Раздел» — группа меню.
- Формулы — блоками формул, картинки — загружать файлом.

## Проверка на своём компьютере (необязательно)

```
npm install
NOTION_TOKEN=... NOTION_DB=... node scripts/sync.mjs
pip install mkdocs-material
mkdocs serve
```
