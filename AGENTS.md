<!-- AI_Svetlio v2.1.0 -->
# AI_Svetlio - Правила за този проект

## 🧠 Памет на проекта

Проектът използва AI_Svetlio. Паметта е в `.memory/` папката.

### ВИНАГИ първо прочети:
```
.memory/STATE.md    ← Къде сме сега
.memory/MODE.md     ← В какъв режим сме
```

### При нужда прочети:
```
.memory/ARCHITECTURE.md  ← Структура на проекта
.memory/TOOLS.md         ← Какви инструменти ползваме
.memory/TODO.md          ← Какво остава
.memory/DECISIONS.md     ← Защо сме избрали X
.memory/PROBLEMS.md      ← Срещнати проблеми
```

### Провери за нови заявки:
Ако `.requests/inbox/` съществува и има файлове → докладвай и чакай одобрение преди обработка.

### След работа ВИНАГИ обнови:
```
.memory/STATE.md      ← Ново състояние (ВИНАГИ)
.memory/LOG.md        ← Какво направи (ВИНАГИ)
.memory/TODO.md       ← Завършени/нови задачи (ако има промени)
.memory/PROBLEMS.md   ← Срещнати/решени проблеми (ако има промени)
.memory/DECISIONS.md  ← Взети решения (ако има промени)
```

## 🔧 Режими

Провери `.memory/MODE.md` за текущия режим:

| Режим | Поведение |
|-------|-----------|
| NORMAL | Работи + обновявай .memory/ |
| REPAIR | Backup + питай преди всяка стъпка |
| ONBOARD | Анализирай + документирай |
| ANALYZE | Дълбок анализ + план |
| EXTEND | Добавяй без да пипаш старото |
| REWRITE | Нов код, същият UX |

## 🛠️ Инструменти

Виж `.memory/TOOLS.md` за инструментите на този проект.

---

## 🔒 IRON RULES (Задължителни правила)

### ПАМЕТ И КОНТЕКСТ
1. **ПАМЕТ ПЪРВО** — Винаги започвай от .memory/STATE.md и MODE.md
2. **НЕ ГАДАЙ** — Чети ARCHITECTURE.md, не търси "на посоки" (ls -R, find /)
3. **ПРОЧЕТИ ЦЕЛИЯ КОД** — Преди редакция, прочети целия файл. Ако е >150 реда → направи summary първо
4. **CONTEXT REFRESH** — На всеки ~15 съобщения прочети .memory/ отново и потвърди с потребителя

### БЕЗОПАСНОСТ
5. **ЗАДЪЛЖИТЕЛЕН BACKUP** — Преди редакция на работещ код → копирай в .memory/backups/
6. **ЗАЩИТЕНИ ЗОНИ** — Не пипай критични папки без Backup + User Approval
7. **ВЕРИФИЦИРАЙ** — Не приемай резултат "на сляпо", провери с втори източник

### ПРОЦЕС
8. **ДОКУМЕНТИРАЙ ПЪРВО** — Запиши в DECISIONS.md преди значима промяна
9. **СТРУКТУРА** — Нови файлове на правилното място (виж ARCHITECTURE.md)
10. **ГОЛЕМИ ЗАДАЧИ = МАЛКИ СТЪПКИ** — Ако файл >150 реда или >2 файла → раздели на стъпки, покажи план, чакай одобрение
11. **ПИТАЙ ПРИ СЪМНЕНИЕ** — По-добре да питаш, отколкото да счупиш нещо

### ПАМЕТ ДИСЦИПЛИНА (Ново в v2.0)
12. **ПАМЕТ СИНХРОН** — След работа обнови ВСИЧКИТЕ засегнати: STATE + LOG задължително; TODO / DECISIONS / PROBLEMS / ARCHITECTURE при промяна. Една секция update без останалите = drift.
13. **TODO = ОТПРАВНА ТОЧКА** — TODO.md е входът и изходът на сесията. Начало: чети TODO. Край: актуализирай TODO. Ако задача не е в TODO → питай дали е легитимна.
14. **INBOX ВИНАГИ ЧИСТ** — `.requests/inbox/` не съдържа необработени файлове. В начало на сесия: провери inbox → обработи всеки в CR (по TEMPLATE.md) → премести оригиналите в archive/originals/ → обнови REGISTRY.md + LOG.md. Inbox = вход, не склад.
15. **СТРОГО СТРУКТУРА НА ПАМЕТТА** — В .memory/ root живеят САМО 8-те стандартни файла (STATE, LOG, TODO, DECISIONS, PROBLEMS, MODE, TOOLS, ARCHITECTURE). Всичко друго в subdirectory: планове → plans/, анализи → analysis/, research → architecture/research/, фази → phase_a/ phase_b/, скриптове → scripts/, backups → backups/. Ad-hoc в root = забранено.

### РЕЛИЙС И ПУБЛИКАЦИЯ (Ново в v2.0)
16. **AUDIT ПРЕДИ PUBLISH** — Преди git push към публичен repo или npm publish: задължителен code audit (URLs, README, changelog, критични files). Не публикувай "работещо локално" без audit.
17. **SMOKE TEST ПРЕДИ COMMIT** — Build + мин 3 basic CLI проверки (version, help, no-op) преди git commit. Ако tsc не минава → не commit-вай.
18. **ПАМЕТТА = РЕАЛНОСТ, НЕ НАМЕРЕНИЕ** — LOG.md описва какво СЕ Е СЛУЧИЛО, не планирано. ⏸️ отложено / ❌ неуспешно / ⏳ предстои / ✅ завършено.
19. **НЕ БЪРЗАЙ** — Малки проблеми сега (typo, wrong URL, липсващ bullet) = emergency patches после. Ако не си сигурен → спри, провери.

### ПРАВИЛА И АРХИТЕКТУРА (Ново в v2.0)
20. **ПРАВИЛАТА ПЪРВО** — Преди STATE/TODO/каквото и да е — прочети CLAUDE.md (IRON RULES). Правилата са контекст за всяка друга стъпка. Това е ПЪРВАТА стъпка на session start.
21. **ЕДИН ИЗВОР НА ПРАВИЛАТА** — Пълните правила живеят в project CLAUDE.md. User global (~/.claude/CLAUDE.md) е само pointer + лични preferences. Другите IDE файлове (.cursorrules, .antigravity/rules.md) са IDENTICAL mirrors, поддържани от `svetlio upgrade`. Не редактирай ръчно IDE-specific файлове — промените се правят в template-а и се регенерират.
22. **ПРОДУКТОВ REPO ≠ DEV MEMORY** — Продуктовите repos (Office, Docs, 30doc, Education, Personal, ai-svetlio tool) НИКОГА не комитват `.memory/` в public git. Dev memory живее в **private Hub** (през `svetlio sync`). Публичен repo = код + docs + README. Точка.
    **Why:** Business decisions, client names, revenue numbers, incident history, strategy — никое не принадлежи в public git. Веднъж leaked = forever indexed.
    **How to apply:** `.memory/` в `.gitignore` от ден 1 на всеки нов публичен repo. Hub Sync = единствен път за споделяне. Pre-push audit: ако `.memory/` е tracked в public repo → BLOCK.

---

### 📍 SESSION START PROTOCOL
При всяка нова сесия — стриктен ред:
```
1. Прочети CLAUDE.md (IRON RULES 1-22) ← ПЪРВО (rule 20)
2. Прочети .memory/MODE.md + STATE.md (rule 1)
3. Провери .requests/inbox/ — обработи всичко ново (rule 14)
4. Прочети .memory/TODO.md — разбери къде си (rule 13)
5. Докладвай Context Refresh на потребителя
```

### ⚡ CONTEXT REFRESH ПРОТОКОЛ
При refresh кажи:
```
⚡ Context Refresh:
- Работим по: [от STATE.md]
- Режим: [от MODE.md]
- Следваща задача: [от TODO.md]
- Проблеми: [от PROBLEMS.md]
- Последни решения: [от DECISIONS.md]
Продължавам ли?
```

### ТРИГЕРИ
| Потребителят казва | Действие |
|-------------------|----------|
| "refresh" / "провери контекста" | Context Refresh |
| "внимавай" / "важно е" | REPAIR режим |
| "backup първо" | Задължителен backup |
| "обясни плана" | Покажи стъпките преди да започнеш |
| "старт" | Session Start Protocol (първа сесия) |
| "продължаваме" | Session Start Protocol (следваща сесия) |

## ⚠️ Споделена отговорност

Паметта е споделена отговорност между потребителя и AI агента.
Винаги изчакай потвърждение, че .memory/ е обновен, преди да затвориш сесията.
Ако сесията бъде затворена преди записа — паметта остава неактуална.

## 🚀 Готови шаблони за стартиране

### ▶ `старт` — Първа сесия
```
Здравей! Започваме работа по проекта.
🚨 ИНИЦИАЛИЗАЦИЯ (Session Start Protocol):
1. Прочети CLAUDE.md (IRON RULES 1-22) ← първо
2. Прочети .memory/MODE.md, STATE.md, ARCHITECTURE.md, TOOLS.md
3. Провери .requests/inbox/ — обработи ако има
Докладвай какво виждаш и очаквай инструкции.
```

### ▶ `продължаваме` — Следваща сесия
```
Здравей! Продължаваме работа по проекта.
🚨 ИНИЦИАЛИЗАЦИЯ (Session Start Protocol):
1. Прочети CLAUDE.md (IRON RULES 1-22) ← първо
2. Прочети .memory/MODE.md, STATE.md, TODO.md, PROBLEMS.md, DECISIONS.md
3. Провери .requests/inbox/ — обработи ако има
⚠️ Спазвай Iron Rules. Докладвай състоянието.
```
