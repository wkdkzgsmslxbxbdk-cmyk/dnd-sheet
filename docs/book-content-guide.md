# Контент из книг: как извлекать

Цель — добавить в приложение всё, что есть в книгах сверх SRD 5.1 (редакция 2014), так, чтобы
движок сам считал числа. Источник — тексты русских книг в `sources/books-text/<книга>.txt`
(страницы отмечены строками `=== PAGE n ===`, это номер страницы PDF).

Коды книг: `phb` Книга игрока, `xge` Руководство Занатара, `tce` Котёл Таши, `scag` Путеводитель
по Побережью Мечей, `eepc` Стихийное зло (Elemental Evil Player's Companion), `vgm` Путеводитель Воло,
`mtf` Том врагов Морденкайнена, `dmg` Руководство мастера.

## Главные правила

1. **Ничего не выдумывать.** Каждое число, куб, уровень, дистанция, длительность, число использований —
   ровно как в книге. Если в книге не написано — не добавляй. Если сомневаешься в правиле — опиши его
   текстом и не кодируй эффектом.
2. **Не копировать текст книги.** Репозиторий и сайт публичные, книги под авторским правом.
   `desc` — краткий пересказ правил СВОИМИ словами: все механики и числа, без художественного
   описания и лора. Ни одного предложения дословно. Обычно 1–4 коротких абзаца на умение.
   Валидатор ищет совпадения 10+ слов подряд с текстом книги и падает на них.
3. **Названия** — официальные русские из книги (в обычном регистре, не ЗАГЛАВНЫМИ).
   `en` — официальное английское название (ты его знаешь), оно нужно для поиска и id.
4. **id** — kebab-case от английского названия: `battle-master`, `battle-master-combat-superiority`.
   id умений подкласса начинаются с id подкласса. id не должны совпадать с SRD
   (см. `src/data/gen/*.json`) и между книгами — валидатор проверит.
5. `page` — номер страницы PDF (`=== PAGE n ===` над заголовком).
6. Термины — как в `docs/translation-guide.md` (Сл, КД, к6, «уровень» заклинания, СИЛ/ЛОВ/ТЕЛ/ИНТ/МДР/ХАР).
   В тексте `desc` кубы пиши по-русски: `2к6`. В структурных полях (`dmg`, `heal`, `die`) — по-английски: `2d6`.
7. После каждого файла: `python -I tools/check_book_data.py data/books/<книга>/<файл>.json`
   и исправить ВСЕ ошибки. Предупреждения о числах «не найдено на страницах» проверь глазами:
   либо число в книге на другой странице (поправь `page`), либо ты ошибся.

## Файлы

`data/books/<код книги>/<тема>.json` — один JSON-объект с любыми из массивов:
`subclasses`, `features`, `spells`, `races`, `subraces`, `traits`, `backgrounds`, `feats`, `classSpells`.

### Подкласс

```json
{
  "subclasses": [{
    "id": "valor", "class": "bard", "name": "Коллегия доблести", "en": "College of Valor",
    "flavor": "Коллегия бардов", "page": 55,
    "desc": ["Скальды, воспевающие героев. Получают доспехи и оружие и сражаются наравне с воинами."],
    "spells": [], "spellMode": "always",
    "features": [
      { "id": "valor-bonus-proficiencies", "level": 3, "name": "Дополнительные владения", "en": "Bonus Proficiencies", "page": 55,
        "desc": ["Вы владеете средними доспехами, щитами и воинским оружием."],
        "effects": [{ "k": "prof", "ids": ["medium-armor", "shields", "martial-weapons"] }] },
      { "id": "valor-combat-inspiration", "level": 3, "name": "Боевое вдохновение", "en": "Combat Inspiration", "page": 55,
        "desc": ["Существо с вашей костью вдохновения может добавить её к броску урона оружием. Либо, когда его атакуют, оно реакцией бросает кость и прибавляет результат к КД против этой атаки — после броска атаки, но до того, как станет известно, попала ли она."] },
      { "id": "valor-extra-attack", "level": 6, "name": "Дополнительная атака", "en": "Extra Attack", "page": 55,
        "desc": ["Действием «Атака» вы совершаете две атаки вместо одной."] },
      { "id": "valor-battle-magic", "level": 14, "name": "Боевая магия", "en": "Battle Magic", "page": 55,
        "desc": ["Когда вы действием накладываете заклинание барда, вы можете бонусным действием совершить одну атаку оружием."] }
    ]
  }]
}
```

- `class`: `barbarian bard cleric druid fighter monk paladin ranger rogue sorcerer warlock wizard`.
- `flavor`: название типа подкласса (Путь дикости, Божественный домен, Воинский архетип...).
- `spells`: заклинания домена/клятвы/круга/покровителя: `{"spell": "<id>", "level": <уровень КЛАССА, с которого доступно>}`.
  `spellMode`: `"always"` — всегда подготовлены (домены, клятвы, круги); `"expanded"` — добавляются в список
  класса (расширенный список покровителя колдуна). id заклинания — из SRD (`src/data/gen/spells.json`)
  или из книжных файлов. Если заклинания ещё нет нигде — его нужно добавить в `spells` своей книги.
- В `features` — все умения подкласса по уровням, включая «повышение» умений на высоких уровнях.
- Подкласс-заклинатель (Мистический рыцарь, Мистический ловкач) добавляет поле `casting` с таблицей из книги
  по уровню КЛАССА (только уровни, где значение меняется, не нужны все 20):
  ```json
  "casting": { "ability": "int", "list": "wizard",
    "cantrips": {"3": 2, "10": 3},
    "known": {"3": 3, "4": 4, "7": 5},
    "slots": {"3": [2], "4": [3], "7": [4, 2], "10": [4, 3], "13": [4, 3, 2]} }
  ```
  `slots` — количество ячеек 1, 2, 3... уровней. Ограничения по школам опиши текстом в умении.

### Умения-опции (приёмы, воззвания, боевые стили, метамагия)

```json
{ "features": [
  { "id": "maneuver-trip-attack", "class": "fighter", "subclass": "battle-master", "level": 3,
    "name": "Атака с опрокидыванием", "en": "Trip Attack", "page": 74,
    "desc": ["..."], "addTo": ["battle-master-maneuvers"] }
]}
```

`addTo` — id умения, в выбор которого добавить этот вариант. Существующие в SRD: `eldritch-invocations`
(воззвания), `fighter-fighting-style`, `paladin-fighting-style`, `ranger-fighting-style`,
`additional-fighting-style`, `metamagic-1`/`metamagic-2`/`metamagic-3`, `pact-boon`.
Умение, у которого есть выбор, объявляет его так:
`"choice": {"kind": "feature", "n": {"3": 3, "7": 5, "10": 7, "15": 9}, "options": []}` —
`n` число или таблица «уровень класса → сколько выбрано всего».

### Заклинание

```json
{ "spells": [{
  "id": "hex", "name": "Сглаз", "en": "Hex", "page": 271, "level": 1, "school": "enchantment",
  "cast": "1 бонусное действие", "range": "90 футов", "dur": "вплоть до 1 часа", "conc": true, "ritual": false,
  "comp": ["В", "С", "М"], "mat": "окаменевший глаз тритона",
  "classes": ["warlock"], "attack": null, "save": null,
  "dmg": [{ "type": "necrotic", "slot": null, "char": null }],
  "desc": ["..."], "higher": ["..."]
}]}
```

- `school`: abjuration conjuration divination enchantment evocation illusion necromancy transmutation.
- `cast`: «1 действие», «1 бонусное действие», «1 реакция, ...», «1 минута» ...; `range`: «60 футов», «На себя», «Касание»,
  «На себя (конус 15 футов)»; `dur`: «Мгновенная», «1 минута», «вплоть до 1 минуты» (если концентрация — `conc: true`).
- `attack`: `"melee"` | `"ranged"` | null. `save`: `{"ability": "dex", "success": "half" | "none" | "other"}` | null.
- `dmg`: список видов урона. `slot` — таблица «уровень ячейки → кубы» для ВСЕХ ячеек от уровня заклинания до 9
  (`{"1": "1d6", "2": "2d6", ...}`), `char` — для заговоров «уровень персонажа → кубы» (`{"1": "1d8", "5": "2d8", "11": "3d8", "17": "4d8"}`).
  Если урон добавляется к атаке оружием (Сглаз, клинки-заговоры) — всё равно укажи кубы; модификатор характеристики,
  если он прибавляется, пиши `"1d8 + MOD"`. Если урон описан только словами — `dmg: null`, правило в тексте.
- `heal`: `{"1": "1d4 + MOD", ...}` по ячейкам, или null.
- `aoe`: `{"type": "sphere|cube|cone|line|cylinder", "size": <футы, радиус/сторона/длина>}` или null.

### Раса, подраса, особенности

```json
{
  "races": [{ "id": "aasimar", "name": "Аасимар", "en": "Aasimar", "page": 104, "speed": 30, "size": "Средний",
              "bonuses": {"cha": 2}, "languages": ["common", "celestial"], "traits": ["aasimar-darkvision", "healing-hands"],
              "desc": ["кратко своими словами"] }],
  "subraces": [{ "id": "wood-elf", "race": "elf", "name": "Лесной эльф", "en": "Wood Elf", "page": 24,
                 "bonuses": {"wis": 1}, "speed": 35, "traits": ["mask-of-the-wild", "elf-weapon-training"] }],
  "traits": [{ "id": "healing-hands", "name": "Исцеляющие руки", "en": "Healing Hands", "page": 105,
               "desc": ["..."], "effects": [{"k": "resource", "id": "healing-hands", "name": "Исцеляющие руки", "max": 1, "reset": "long", "note": "хиты = ваш уровень"}] }]
}
```

Подраса может относиться к расе из SRD (`elf`, `dwarf`, `halfling`, `gnome`, `human`...). Особенности,
которые уже есть в SRD (`darkvision`, `fey-ancestry`, `trance`, `elf-weapon-training`...), — используй их id, не дублируй.
`languages` — id языков из `src/data/gen/ref.json` (`common`, `elvish`, `celestial`...); выбор языка — эффектом `languageChoice`.

### Предыстория

```json
{ "backgrounds": [{ "id": "criminal", "name": "Преступник", "en": "Criminal", "page": 130,
   "profs": ["skill-deception", "skill-stealth", "thieves-tools"],
   "effects": [{"k": "toolChoice", "n": 1, "from": ["dice-set", "playing-card-set"]}],
   "equipment": [{"id": "crowbar", "qty": 1}], "gold": 15,
   "feature": {"name": "Криминальные связи", "desc": ["..."]}, "desc": ["кратко"] }]}
```

### Черта

```json
{ "feats": [{ "id": "resilient", "name": "Устойчивый", "en": "Resilient", "page": 170, "prereqText": null,
   "desc": ["..."],
   "effects": [{"k": "abilityChoice", "n": 1, "value": 1, "saveProf": true}] }]}
```

`prereq` — `[{"ability": "str", "min": 13}]` если требование по характеристике, иначе `prereqText` строкой.

## Эффекты (`effects`)

Кодируй эффект, только если правило полностью и однозначно ложится на один из типов ниже.
Всё остальное — текстом. `when` — эффект действует, только пока включён переключатель (`toggle`).

Выражения: числа или строки над `prof`, `level` (уровень персонажа), `clevel` (уровень класса, которому
принадлежит умение), `mod.str` … `mod.cha`, `score.str` …, `slot` (уровень ячейки, только для заклинаний);
операторы `+ - * /`, сравнения `>= > <= <` (дают 1 или 0), функции `max min floor ceil`.
Пример: `"max(1, mod.cha)"`, `"floor(clevel / 2)"`, `"2 + (clevel >= 7) + (clevel >= 15)"`.

| k | поля | что делает |
|---|---|---|
| `prof` | `ids` | владения: `light-armor medium-armor heavy-armor shields simple-weapons martial-weapons`, конкретное оружие (`longswords`), инструменты (`thieves-tools`, `herbalism-kit`...), навыки `skill-<id>`, спасброски `saving-throw-<str..cha>`. id — из `src/data/gen/ref.json` → `proficiencies` |
| `skillChoice` | `n`, `from?` | выбрать навыки (id навыков без `skill-`: `stealth`) |
| `expertiseChoice` | `n`, `from?` | компетентность в навыках |
| `toolChoice` | `n`, `from?` | владение инструментами на выбор |
| `languageChoice` | `n` | языки на выбор |
| `ability` | `ability`, `value`, `max?` | +к характеристике (max по умолчанию 20) |
| `abilityChoice` | `n`, `value`, `from?`, `saveProf?` | +value к n характеристикам на выбор |
| `saveProf` | `abilities` | владение спасбросками |
| `ac` | `value`, `armor?` (`any` / `none` / `armored`) | бонус к КД |
| `acBase` | `base`, `abilities`, `shield`, `label` | формула КД без доспеха: base + модификаторы `abilities`; `shield` — можно ли со щитом |
| `speed` | `value`, `mode?` (`walk` `fly` `swim` `climb` `burrow`), `set?`, `armor?` (`any` `none` `notHeavy`) | +к скорости или задать скорость (`set: true`) |
| `hp` | `perLevel?`, `flat?` | хиты: perLevel × уровень (уровень класса для умений класса) + flat |
| `save` | `value`, `abilities?` | бонус к спасброскам |
| `check` | `value`, `abilities?`, `skills?` | бонус к проверкам |
| `initiative` | `value` | бонус к инициативе |
| `spellDc` / `spellAttack` | `value`, `classId?` | бонус к Сл / атаке заклинаниями |
| `cantripDamage` | `value`, `classId?` | + к урону заговоров (Мощное колдовство) |
| `spellDamage` | `value`, `classId?`, `school?`, `spells?`, `damageType?`, `note?` | + к одному броску урона подходящих заклинаний |
| `healBonus` | `value`, `minLevel?` | + к лечению заклинаниями (можно `slot`) |
| `weaponAttack` / `weaponDamage` | `value`, `range?` | + к атаке / урону оружием |
| `weaponExtra` | `dice`, `type`, `note`, `range?` | доп. кубы урона оружием (описание условия в note) |
| `attackAbility` | `ability`, `note` | атаки оружием могут использовать эту характеристику |
| `critFrom` | `value` | крит на `value`–20 |
| `resource` | `id`, `name`, `max`, `reset` (`short`/`long`), `die?`, `note?` | счётчик (кости превосходства, использования умения). `die`: `"d8"` или `{"3": "d8", "10": "d10"}` по уровню класса |
| `toggle` | `id`, `name` | переключатель состояния (Песнь клинка и т.п.) |
| `featChoice` | `n` | выбрать черту (вариант человека) |
| `dc` | `name`, `value` | Сл умения, например `{"k": "dc", "name": "Приёмы", "value": "8 + prof + max(mod.str, mod.dex)"}` |
| `resist` | `types` | сопротивление типам урона (`fire`...) |
| `sense` | `name`, `range` | тёмное зрение и т.п. |
| `spells` | `spells: [{spell, level?}]`, `ability?`, `note?`, `uses?` | заклинания от расы/черты/умения: `level` — уровень персонажа, с которого доступно; `uses` для заклинаний 1+ уровня: `"longRest"` (раз в продолжительный отдых без ячейки, по умолчанию), `"ritual"` (только как ритуал), `"slots"` (обычно, тратя ячейки) |

Переключатель ярости варвара уже есть в приложении: эффекты, работающие только в ярости, помечай `"when": "rage"`.

## Проверка

`python -I tools/check_book_data.py data/books/<книга>/<файл>.json` проверяет: формат и обязательные поля,
уникальность id, ссылки (классы, заклинания, особенности, владения, навыки, языки, типы урона, школы),
выражения эффектов, что все числа из записи есть в тексте книги на её странице (±2), и что нет копирования
текста (10+ слов подряд из книги).
