# Climora

Статическая копия [airmix.by](https://airmix.by) с подставляемым именем бренда.

- Сайт: https://bookercool.github.io/climora/
- Репозиторий: https://github.com/bookercool/climora
- English: https://bookercool.github.io/climora/en/

<!-- keep-readme -->

## Имя бренда

Имя задаётся одной переменной в `brand.config.json`:

```json
{
  "name": "Climora"
}
```

После правки конфига:

```bash
npm run brand
```

Скрипт берёт оригинальные HTML из `source/` (там ещё AirMixBel) и подставляет текущее имя во все текстовые вхождения: AirMixBel, AirMix, airmix.by, airmix.

В рантайме то же значение доступно как `window.BRAND.name` (`js/brand.js`).

## Локальный запуск

```bash
npm run dev
```

Откройте http://localhost:4173

## Обновить копию с оригинального сайта

```bash
npm run clone
```

## Деплой

Репозиторий готов и к GitHub Pages, и к Vercel: это обычный статический сайт.

- GitHub Pages: workflow `.github/workflows/pages.yml`
- Vercel: импортируйте репозиторий, framework preset — Other
