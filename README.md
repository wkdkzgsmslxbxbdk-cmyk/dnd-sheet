# Лист персонажа D&D 5e (2014)

PWA-приложение: ставится на Android как обычное приложение (Chrome → «Установить приложение»),
работает офлайн, персонажи хранятся на устройстве, перенос — экспорт/импорт JSON.

## Запуск

```powershell
npm install
npm run data    # собрать каталог из SRD + русского перевода
npm test        # тесты движка правил
npm run dev     # разработка, http://localhost:5173
npm run build   # сборка в dist/ (статические файлы, можно выложить на любой хостинг)
```

## Откуда данные

- `sources/srd/en` — SRD 5.1 (2014) из [5e-bits/5e-database](https://github.com/5e-bits/5e-database), коммит в `sources/srd/COMMIT.txt`.
- `data/ru/parts/*.json` — русский перевод, термины и названия по русской Книге игрока и Руководству мастера
  (`docs/translation-guide.md`). У каждой записи `_src` — книга и страница PDF, где найдено название.
- `data/srd-errata.json` — опечатки базы; `data/srd-patches.json` — исправления структурных данных,
  найденные сверкой с Книгой игрока (`data/verify/*.json` — отчёты сверки).
- `sources/books-*` — локальные PDF и их текст, только для сверки; в git не попадают.

Проверка перевода: `python -I tools/check_translation.py --all` — сверяет, что все числа и кубы
в переводе совпадают с оригиналом (кроме полей, помеченных `_book_fix` — исправленных по книге).

## Как устроен расчёт

- `src/rules/derive.ts` — все числа листа; каждое число — сумма подписанных слагаемых.
- `src/rules/spellcalc.ts` — урон и лечение заклинаний по ячейке/уровню + умения
  (Мучительный взрыв, Последователь жизни, Усиленное воплощение...). Где данных SRD не хватает,
  правило закодировано в `SPELL_OVERRIDES` с цитатой текста SRD.
- `src/rules/itemEffects.ts` — числовые эффекты магических предметов, тоже с цитатами.
- `src/rules/rules.test.ts` — тесты на персонажах, посчитанных вручную по Книге игрока.

## Лицензия контента

This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of
the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1
is licensed under the Creative Commons Attribution 4.0 International License available at
https://creativecommons.org/licenses/by/4.0/legalcode.
