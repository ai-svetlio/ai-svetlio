# 🧰 AI_Svetlio Quick Reference

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🚀 Команди

```bash
svetlio setup              # Глобална настройка (веднъж)
svetlio init               # Инициализирай проект
svetlio onboard            # Вкарай съществуващ проект
svetlio repair             # Режим ремонт
svetlio analyze            # Дълбок анализ
svetlio status             # Покажи състояние
svetlio web                # Web преглед на .memory/ в браузъра
svetlio upgrade            # Обнови правилата до текущата версия
svetlio requests           # Управление на клиентски заявки
svetlio requests process   # Обработи файлове от inbox
svetlio log "съобщение"    # Добави ръчен запис в LOG.md
svetlio shortcut           # Desktop shortcut за Web Viewer
svetlio tools              # Покажи инструменти
svetlio registry <query>   # Търси в MCP Registry
svetlio mcp-wizard         # Wizard за MCP сървъри
```

### Hub Sync — памет между машини

```bash
svetlio sync init          # Настрой hub repo (веднъж за всички проекти)
svetlio sync push          # Изпрати .memory/ към hub
svetlio sync pull          # Изтегли .memory/ от hub
svetlio sync status        # Състояние на синхронизацията
svetlio sync auto          # Авто-push при промяна
svetlio sync remove        # Премахни връзката с hub
```

### На български

```bash
svetlio уеб · обнови · заявки
svetlio синк настройка · изпрати · изтегли · статус · авто · премахни
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🎯 Режими

| Режим | Команда | Кога |
|-------|---------|------|
| **NORMAL** | (default) | Текуща работа |
| **REPAIR** | `svetlio repair` | Поправки (backup + одобрение) |
| **ONBOARD** | `svetlio onboard` | Съществуващ проект |
| **ANALYZE** | `svetlio analyze` | Legacy система |
| → EXTEND | (след analyze) | Добави функции |
| → REWRITE | (след analyze) | Пренапиши (същият UX) |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📁 .memory/ структура

```
.memory/
├── STATE.md          ← Къде сме
├── MODE.md           ← Режим
├── LOG.md            ← История
├── ARCHITECTURE.md   ← Структура
├── TOOLS.md          ← Инструменти
├── TODO.md           ← Задачи
├── DECISIONS.md      ← Решения
├── PROBLEMS.md       ← Проблеми
├── analysis/         ← От ANALYZE
├── rewrite/          ← За REWRITE
└── backups/          ← Backups
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🏭 MCP Creators

| Tool | Език | Install |
|------|------|---------|
| **FastMCP** ⭐ | Python | `pip install fastmcp` |
| generator-mcp | Node.js | `npm i -g yo generator-mcp` |
| openapi-to-mcpserver | Node.js | `npm i -g openapi-to-mcpserver` |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🔄 Бърз workflow

```bash
# Нов проект
mkdir project && cd project
svetlio init
cursor .

# Съществуващ проект
cd old-project
svetlio onboard
cursor .

# Поправка
svetlio repair
# AI ще пита за одобрение

# Legacy модернизация
svetlio analyze
# После: EXTEND или REWRITE
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 💡 AI команди (кажи на агента)

```
"Прочети .memory/STATE.md"       ← Къде сме
"Влез в режим ремонт"            ← REPAIR mode
"Направи deep analysis"          ← ANALYZE mode
"Искам да добавя X функция"      ← EXTEND
"Пренапиши с React и FastAPI"    ← REWRITE
"Покажи какво остава"            ← TODO
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ⚠️ Преди да затвориш сесията

```
1. Кажи: "Приключваме, запиши промените"
2. Изчакай: "✓ Записано в .memory/"
3. Тогава затвори чата/IDE-то
```

> Ако затвориш преди записа → паметта е неактуална → следващата сесия започва с грешен контекст.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
