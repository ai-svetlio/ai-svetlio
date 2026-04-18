# AI_Svetlio

```
  ███████╗██╗   ██╗███████╗████████╗██╗     ██╗ ██████╗
  ██╔════╝██║   ██║██╔════╝╚══██╔══╝██║     ██║██╔═══██╗
  ███████╗██║   ██║█████╗     ██║   ██║     ██║██║   ██║
  ╚════██║╚██╗ ██╔╝██╔══╝     ██║   ██║     ██║██║   ██║
  ███████║ ╚████╔╝ ███████╗   ██║   ███████╗██║╚██████╔╝
  ╚══════╝  ╚═══╝  ╚══════╝   ╚═╝   ╚══════╝╚═╝ ╚═════╝

  Universal AI Agent Toolkit & Project Memory v2.0.0
```

**AI_Svetlio** е система за управление на AI-assisted разработка, която решава ключови проблеми:

- 🧠 **Памет между сесии** — AI агентът "помни" къде сте спрели
- 🔄 **Смяна на IDE** — работи еднакво в Cursor, Claude Code, Antigravity
- 🌐 **Hub Sync** (Ново в v2.0) — памет синхронизирана между машини (Windows/Linux/macOS)
- 👥 **Team-ready** — колеги могат да се включат без обяснения
- 🛠️ **Инструменти** — каталог с проверени AI инструменти
- 🔒 **Iron Rules** — 11 правила за безопасна работа с AI агенти

---

## 📦 Инсталация

```bash
npm install -g ai-svetlio
```

### Версии
```bash
npm install -g ai-svetlio@latest    # Последна версия (препоръчително)
npm install -g ai-svetlio@2.0.0     # Конкретна версия
```

### Обновяване
```bash
npm update -g ai-svetlio
# След обновяване, обнови правилата в проектите:
svetlio upgrade
```

---

## 🚀 Бърз старт

```bash
# 1. Глобална настройка (веднъж)
svetlio setup

# 2. В нов проект
mkdir my-project && cd my-project
svetlio init

# 3. Отвори в любимото IDE и работи!
cursor .
# или
antigravity .
# или
claude .
```

---

## 🌐 Hub Sync — памет между машини (Ново в v2.0)

**Работиш на работа и вкъщи?** Hub Sync синхронизира `.memory/` на всичките ти проекти
през централизирано GitHub repo (hub). Push от лаптопа, pull от desktop-а — паметта е
винаги актуална.

### Как работи

```
  ┌──────────────────┐          ┌──────────────────┐
  │  💻 Лаптоп (Win) │          │  🖥️ Desktop (Lin)│
  │                  │          │                  │
  │  projectA/       │          │  projectA/       │
  │  └─ .memory/*.md │          │  └─ .memory/*.md │
  │  projectB/       │          │  projectB/       │
  │  └─ .memory/*.md │          │  └─ .memory/*.md │
  └────────┬─────────┘          └─────────┬────────┘
           │  push / pull                 │
           ▼                              ▼
           └──────────┬───────────────────┘
                      │
              ┌───────▼────────┐
              │  🌐 GitHub Hub │
              │   (private)    │
              │                │
              │  projectA/     │
              │  ├─ STATE.md   │
              │  ├─ LOG.md     │
              │  └─ ...        │
              │  projectB/     │
              │  └─ ...        │
              └────────────────┘
```

### Бърз старт (5 стъпки)

```bash
# 1. Настрой hub (веднъж за всички проекти)
svetlio sync init
# → Избери "🆕 Създай ново hub repo" (ако имаш gh CLI) или
#   "📂 Свържи със съществуващо repo" (ако си го създал ръчно в GitHub)

# 2. Изпрати .memory/ към hub
svetlio sync push

# 3. На втората машина: инсталирай ai-svetlio, свържи се със същия hub
svetlio sync init
# → "📂 Свържи със съществуващо repo" → URL на hub repo

# 4. Изтегли
svetlio sync pull

# 5. (Опционално) Включи автоматичен sync
svetlio sync auto
# → auto-push при всяка промяна в .memory/
```

### Команди

| Команда | Алиас (БГ) | Описание |
|---------|------------|----------|
| `svetlio sync init` | `настройка` | Първоначална настройка на hub |
| `svetlio sync push` | `изпрати` | Изпрати `.memory/` към hub |
| `svetlio sync pull` | `изтегли` | Изтегли `.memory/` от hub |
| `svetlio sync status` | `статус` | Покажи състояние на синхронизация |
| `svetlio sync auto` | `авто` | Вкл/изкл автоматична синхронизация |
| `svetlio sync remove` | `премахни` | Премахни проект от hub конфигурацията |

### Какво се синхронизира

✅ **Включено:** `STATE.md`, `LOG.md`, `ARCHITECTURE.md`, `TOOLS.md`, `TODO.md`, `DECISIONS.md`, `PROBLEMS.md`, `MODE.md`

❌ **Изключено:** `.memory/backups/`, `.memory/analysis/`, `.memory/rewrite/`, `node_modules/`, код, secrets

### Сигурност

- Hub repo трябва да е **PRIVATE** (Hub Sync автоматично го прави така при `sync init`)
- Препоръчва се **никога да не записваш secrets в `.memory/`** (ключове, пароли) — паметта е за контекст, не за credentials
- Auto-sync има 30s debounce за да не спами commit history
- Локален backup преди `sync pull` overwrite — намира се в `.memory/backups/sync-pull-*/`

### Изисквания

- **Задължително:** `git` CLI (Windows/Linux/macOS)
- **Опционално:** `gh` CLI — ускорява създаването на нов hub repo (ако няма, правиш repo ръчно)
- **GitHub account** с SSH ключ или HTTPS credentials конфигурирани

---

## 🔒 Iron Rules (Ново в v1.1.0)

11 задължителни правила за AI агентите, които предотвратяват типични грешки:

### Памет и контекст
1. **ПАМЕТ ПЪРВО** — Агентът винаги започва от `.memory/STATE.md`
2. **НЕ ГАДАЙ** — Чете документация, не търси "на посоки"
3. **ПРОЧЕТИ ЦЕЛИЯ КОД** — Преди редакция, чете целия файл
4. **CONTEXT REFRESH** — На всеки ~15 съобщения освежава контекста

### Безопасност
5. **ЗАДЪЛЖИТЕЛЕН BACKUP** — Преди редакция на работещ код
6. **ЗАЩИТЕНИ ЗОНИ** — Не пипа критични папки без одобрение
7. **ВЕРИФИЦИРАЙ** — Проверява резултата, не приема "на сляпо"

### Процес
8. **ДОКУМЕНТИРАЙ ПЪРВО** — Записва решение преди код
9. **СТРУКТУРА** — Файлове на правилното място
10. **ГОЛЕМИ ЗАДАЧИ = МАЛКИ СТЪПКИ** — >150 реда → план първо
11. **ПИТАЙ ПРИ СЪМНЕНИЕ** — По-добре да пита

### Чат команди
| Казваш | AI агентът прави |
|--------|------------------|
| `refresh` | Освежава контекста от `.memory/` |
| `внимавай` | Влиза в REPAIR режим |
| `backup първо` | Прави backup преди промяна |
| `обясни плана` | Показва стъпките преди да започне |

---

## 🎯 Режими на работа

### 🆕 NORMAL (по подразбиране)
Стандартна работа. AI агентът обновява `.memory/` след всяка промяна.

### 🔧 REPAIR
```bash
svetlio repair
```
За поправки на проблеми:
- ✅ Backup преди всяка промяна
- ✅ Одобрение на всяка стъпка
- ✅ Детайлно обяснение какво и защо

### 📥 ONBOARD
```bash
svetlio onboard
```
За съществуващи проекти:
- ✅ Дълбок анализ на кода
- ✅ Извличане на логика
- ✅ Автоматично създаване на `.memory/`

### 🔬 DEEP ANALYSIS
```bash
svetlio analyze
```
За legacy системи:
- ✅ Пълен анализ на всичко
- ✅ Документиране на бизнес логика
- ✅ Избор между EXTEND и REWRITE

#### 🔼 EXTEND
Добавяне на нови функции без промяна на съществуващия код.

#### 🔄 REWRITE
Пълно пренаписване със съвременни технологии, **запазвайки UX**.

---

## 📁 Структура на .memory/

```
project/
└── .memory/
    ├── STATE.md          ← Къде сме сега
    ├── MODE.md           ← Текущ режим
    ├── LOG.md            ← Хронология на работата
    ├── ARCHITECTURE.md   ← Структура на проекта
    ├── TOOLS.md          ← Използвани инструменти
    ├── TODO.md           ← Задачи
    ├── DECISIONS.md      ← Взети решения
    ├── PROBLEMS.md       ← Проблеми и решения
    │
    ├── analysis/         ← От DEEP ANALYSIS
    │   ├── FULL_SCAN.md
    │   ├── BUSINESS_LOGIC.md
    │   ├── TECH_DEBT.md
    │   └── RECOMMENDATIONS.md
    │
    ├── rewrite/          ← За REWRITE режим
    │   ├── UX_CONTRACT.md
    │   ├── USER_FLOWS.md
    │   └── MIGRATION_MAP.md
    │
    └── backups/          ← Backups от REPAIR режим
```

---

## 📋 Структура на .requests/ (Ново в v1.5.0)

```
project/
└── .requests/
    ├── README.md          ← Инструкции за AI агента
    ├── TEMPLATE.md        ← Шаблон за нова заявка
    ├── REGISTRY.md        ← Регистър на всички заявки
    ├── config.json        ← Конфигурация
    ├── inbox/             ← Входящи файлове за обработка
    ├── processed/         ← Структурирани заявки (CR-YYYY-NNN.md)
    ├── archive/           ← Завършени заявки
    └── python/            ← Python инструменти за обработка
```

Поддържани формати: TXT, MD (винаги), EML, MSG, DOCX, XLSX, PDF (с Python).

---

## 📋 Команди

| Команда | Описание |
|---------|----------|
| `svetlio setup` | Глобална настройка (веднъж) |
| `svetlio init` | Инициализирай проект |
| `svetlio onboard` | Вкарай съществуващ проект |
| `svetlio repair` | Режим ремонт |
| `svetlio analyze` | Дълбок анализ |
| `svetlio status` | Покажи състояние |
| `svetlio web` | Web преглед на .memory/ в браузъра |
| `svetlio upgrade` | Обнови правилата на проекта до текущата версия |
| `svetlio requests` | Списък на клиентски заявки |
| `svetlio requests check` | Провери inbox за нови файлове |
| `svetlio requests process` | Обработи файлове от inbox |
| `svetlio requests archive` | Покажи завършени заявки за архивиране |
| `svetlio shortcut` | Създай desktop shortcut за Web Viewer |
| `svetlio mcp-wizard` | Wizard за MCP сървъри |
| `svetlio log "съобщение"` | Добави ръчен запис |

### 🔌 Управление на инструменти (v1.2.0)

| Команда | Описание |
|---------|----------|
| `svetlio tools` | Покажи каталога с инструменти |
| `svetlio tools add <id>` | Добави инструмент към проекта |
| `svetlio tools remove <id>` | Премахни инструмент |
| `svetlio tools info <id>` | Покажи детайли за инструмент |
| `svetlio registry <query>` | Търси в MCP Registry (16,000+ сървъра) |

**Пример:**
```bash
# Търси MCP сървър за Airtable
svetlio registry airtable

# Добави към проекта
svetlio tools add mcp-airtable

# Виж как да го инсталираш
svetlio tools info mcp-airtable
```

---

## 🏭 MCP Server Creators

AI_Svetlio включва wizard за създаване на MCP сървъри:

```bash
svetlio mcp-wizard
```

### Препоръчани инструменти:

| Инструмент | Език | За кого |
|------------|------|---------|
| **FastMCP** ⭐ | Python | Production, custom логика |
| **generator-mcp** | Node.js | Бърз старт, VS Code |
| **openapi-to-mcpserver** | Node.js | Съществуващи APIs (⚠️ внимание) |

---

## 🔄 Workflow примери

### Нов проект
```bash
mkdir email-collector && cd email-collector
svetlio init --name "Email Collector"
cursor .
# Кажи: "Искам MCP сървър за събиране на имейли"
```

### Съществуващ проект
```bash
cd my-old-project
svetlio onboard
# AI анализира и създава .memory/
cursor .
# Продължи работа нормално
```

### Поправка на бъг
```bash
svetlio repair
# AI ще пита за одобрение преди всяка промяна
# Кажи: "Има бъг в search функцията"
```

### Legacy система за модернизация
```bash
cd old-php-app
svetlio analyze
# AI анализира всичко, после питаш:
# "Искам да пренапиша с FastAPI и React"
# AI прави REWRITE като запазва UX
```

### Дълъг чат (Context Refresh)
```
# След ~15 съобщения, кажи:
"refresh"

# AI агентът ще отговори:
⚡ Context Refresh:
- Работим по: [от STATE.md]
- Режим: [от MODE.md]
- Следваща задача: [от TODO.md]
- Проблеми: [от PROBLEMS.md]
- Последни решения: [от DECISIONS.md]
Продължавам ли?
```

### 🚀 Готови шаблони за стартиране на сесия

При **първа сесия** (▶ `старт`) — залепи в чата:
```
Здравей! Започваме работа по проекта.
🚨 ИНИЦИАЛИЗАЦИЯ: Прочети .memory/MODE.md, STATE.md, ARCHITECTURE.md, TOOLS.md
Докладвай какво виждаш и очаквай инструкции.
```

При **продължаване** (▶ `продължаваме`) — залепи в чата:
```
Здравей! Продължаваме работа по проекта.
🚨 ИНИЦИАЛИЗАЦИЯ: Прочети .memory/MODE.md, STATE.md, PROBLEMS.md, DECISIONS.md
⚠️ Спазвай Iron Rules. Докладвай състоянието.
```

> 📖 Пълни шаблони: [documents/USER_GUIDE.md](documents/USER_GUIDE.md#-как-да-започнеш-чат-сесия)

---

## 🤝 Работа с екип

```bash
# Колега клонира проекта
git clone ...
cd project

# Вижда състоянието
svetlio status

# Чете какво е направено
cat .memory/STATE.md
cat .memory/LOG.md

# Продължава от там
cursor .
```

---

## 🔌 IDE поддръжка

| IDE | Rules файл | Статус |
|-----|------------|--------|
| Cursor | `.cursorrules` | ✅ Пълна |
| Claude Code | `CLAUDE.md` | ✅ Пълна |
| Antigravity | `.antigravity/rules.md` | ✅ Пълна |
| Windsurf | `.windsurfrules` | 🟡 Частична |
| VS Code + Copilot | - | 🟡 Частична |

---

## 📊 Инструменти в каталога

### 🏭 MCP Creators
- FastMCP (Python) ⭐
- generator-mcp (Node.js)
- openapi-to-mcpserver

### 🔌 MCP Servers
- mcp-github
- mcp-postgres
- mcp-notion
- mcp-firecrawl

### 🤖 Agent Frameworks
- CrewAI
- LangChain
- AutoGen

### 🎯 Skills & Rules
- antigravity-awesome-skills
- awesome-cursorrules

### ⌨️ CLI Tools
- vibe-tools
- ralph-loop

---

## 🧠 Философия

Базирана на Ralph концепцията:

> "State lives in FILES and GIT, not in LLM's memory"

- `.memory/` е **единственият източник на истина**
- AI агентът **чете**, не **помни**
- Git commit = **snapshot на паметта**
- Всяко IDE **чете същата памет**

---

## ⚠️ Споделена отговорност

Паметта на Светльо е **споделена отговорност** между теб и AI агента.

AI агентът обновява `.memory/` в края на всяка сесия, но **само ако му дадеш време да завърши**. Това не е бъг — това е технологично ограничение на всички AI агенти. Те нямат контрол над момента на затваряне.

**Твоята част от сделката:**
- ✅ Изчакай агентът да потвърди, че е записал промените
- ✅ Виж "✓ Записано в .memory/" преди да затвориш
- ❌ Не затваряй чата/IDE-то по средата на запис

> 💡 Ако затвориш преди записа — паметта остава неактуална и следващата сесия започва с грешен контекст. Няма как да бъде иначе.

---

## 📖 Документация

- [USER_GUIDE.md](./documents/USER_GUIDE.md) — Пълен наръчник за потребителя
- [IRON_RULES.md](./documents/IRON_RULES.md) — Детайлни правила за AI агентите

---

## 📝 Changelog

### v2.0.0 (2026-04-18) — 🚀 Hub Sync

**Major release** — добавена възможност за синхронизиране на `.memory/` между машини.

- 🌐 **Hub Sync** — нов модул (`src/sync.ts`, 907 реда) — централизирана `.memory/` синхронизация чрез GitHub private repo
  - 7 команди: `svetlio sync init/push/pull/status/auto/remove` + БГ aliases (настройка, изпрати, изтегли, статус, авто, премахни)
  - Multi-project support — един hub repo за всички проекти
  - Auto-sync с 30s debounce (fire-and-forget, не блокира writes)
  - Автоматичен backup преди `pull` overwrite
- 🌐 **Web Viewer** — sync status live в sidebar (auto / last push / last pull / total projects)
- 🏗️ **Zero нови npm deps** — ползва `git` CLI (и `gh` CLI optional за auto-create на hub repo)
- ✅ **Backwards compatible** — без `sync init`, v1.5.7 поведение е напълно непроменено
- 📦 **Нов home** — repo мигрира към `github.com/ai-svetlio/ai-svetlio` (legacy `SPartenev/Ai-Svetlio` остава като archive за v1.x)
- 🧬 **svetlio-pro merge** — опитите за Hub Sync от svetlio-pro (форкнат v1.5.7 експеримент) са обединени в основния пакет; отделна "pro" версия не се поддържа

**Migration за existing v1.x users:** не е нужна ръчна миграция — `npm update -g ai-svetlio` + `svetlio upgrade` в проектите.

### v1.5.7 (2026-02-14)
- 🧹 **Repo cleanup** — премахнати дублирани файлове (root .ts, PDF-и, client-specific скриптове)
- 📂 **documents/archive/** — остарели документи преместени в архив (впоследствие премахнати в v2.0 — виж IRON RULE 22)
- 🔄 **Version sync** — всички файлове синхронизирани с v1.5.7 (CLAUDE.md, .cursorrules, .antigravity/, IRON_RULES, USER_GUIDE, src/)
- 📦 **npm cleanup** — излишни файлове премахнати от npm пакета
- 📐 **ARCHITECTURE.md** — обновен с реалната структура на проекта

### v1.5.0 (2026-02-13)
- ⬆️ **`svetlio upgrade`** — обновява правилата (CLAUDE.md, .cursorrules) без да пипа .memory/ и .requests/
- 📋 **ClientRequests система** — `.requests/` папка за управление на клиентски заявки (inbox, processed, archive)
- 🐍 **Python Bridge** — автоматична обработка на EML, DOCX, PDF, MSG файлове чрез Python
- 🧠 **Пълно .memory/ обновяване** — шаблоните вече инструктират AI агента да обновява 5 файла (STATE, LOG, TODO, PROBLEMS, DECISIONS)
- ⚡ **Разширен Context Refresh** — включва PROBLEMS.md и DECISIONS.md
- 🌐 **Web Viewer** — нова секция "Заявки" за преглед на .requests/

### v1.4.0 (2026-02-09)
- 🌐 **`svetlio web`** — визуален Web Viewer за .memory/ файловете (read-only, auto-refresh на 5 сек)
- 🖥️ **`svetlio shortcut`** — създава desktop shortcut за бързо отваряне на Web Viewer
- 📄 **`open-memory.bat/.sh`** — генерира се при `svetlio init` за двоен клик стартиране
- 🎨 **Автоматична тема** — следва системната настройка (тъмна/светла)
- 📱 **Responsive дизайн** — работи на всички размери екрани

### v1.3.3 (2026-02-06)
- 📖 **Context Refresh** — намален от ~20 на ~15 съобщения
- 📦 **USER_GUIDE.md** — подробно инсталиране/деинсталиране, запазване на паметта при ъпдейт
- 🚀 **Шаблони** — готови "старт"/"продължаваме" за бърз старт на сесия
- 🐛 **Fix** — ~30 поправени команди от ребрандирането

### v1.3.2 (2026-02-04)
- 🐛 **Фикс** — коригиран version display в CLI

### v1.3.0 (2026-02-04)
- 🔄 **Ребрандиране** — от svet-ai към ai-svetlio
- ✨ **Нова CLI команда** — `svetlio` вместо `svet`
- 📦 **Нов npm пакет** — `ai-svetlio`
- ⚠️ **`svet-ai` deprecated** — потребителите се насочват към `ai-svetlio`

### v1.2.1 (2026-02-03)
- 📖 **Документация за безопасно обновяване** — процедура в USER_GUIDE.md
- ❓ **Нови FAQ въпроси** — "Как да обновя без да загубя работата си?"

### v1.2.0 (2026-02-03)
- 🔌 **MCP Registry интеграция** — достъп до 16,000+ MCP сървъра
- ✨ **`svetlio tools add <id>`** — добавяне на инструменти към проект
- ✨ **`svetlio tools remove <id>`** — премахване на инструменти
- ✨ **`svetlio tools info <id>`** — детайли и инсталация
- ✨ **`svetlio registry <query>`** — търсене в официалния MCP Registry
- 📦 **Нови MCP сървъри** — Airtable, Supabase, Slack, Google Drive, Brave Search

### v1.1.0 (2026-02-03)
- ✨ **Iron Rules** — 11 задължителни правила за AI агенти
- ✨ **Context Refresh** — автоматично освежаване на контекста
- ✨ **Big Task Protocol** — план първо за сложни задачи
- ✨ **Backup First** — задължителен backup преди редакция

### v1.0.0
- 🎉 Първа версия
- 📁 `.memory/` система
- 🎯 Режими: NORMAL, REPAIR, ONBOARD, ANALYZE

---

## 📝 License

MIT

---

## 🙏 Credits

Създаден от общността за общността.

Вдъхновен от:
- Ralph Loop философията
- Antigravity Kit
- Awesome Cursorrules
- MCP екосистемата
