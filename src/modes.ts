/**
 * AI_Svetlio - Modes Module
 *
 * Управлява различните режими на работа:
 * - NORMAL: Стандартна работа
 * - REPAIR: Поправки с backup и одобрение
 * - ONBOARD: Вкарване на съществуващ проект
 * - ANALYZE: Дълбок анализ (EXTEND/REWRITE)
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { glob } from 'glob';
import { Memory } from './memory';

const VERSION = '2.0.1';

export class Modes {
  private projectDir: string;
  private memory: Memory;
  
  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.memory = new Memory(projectDir);
  }
  
  // ==========================================================================
  // REPAIR MODE
  // ==========================================================================
  
  async activateRepairMode(): Promise<void> {
    console.log(chalk.red(`
╔═══════════════════════════════════════════════════════════════╗
║  🔧 РЕЖИМ РЕМОНТ                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Правила в този режим:                                        ║
║  • BACKUP преди всяка промяна на файл                        ║
║  • ОДОБРЕНИЕ преди всяка стъпка                               ║
║  • ДЕТАЙЛНО обяснение какво и защо                            ║
║                                                               ║
║  За изход: напиши "exit repair" или "нормален режим"         ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `));
    
    // Провери дали има .memory/
    if (!await this.memory.exists()) {
      console.log(chalk.yellow('⚠️  Проектът не е инициализиран. Инициализирам...'));
      await this.memory.initialize(path.basename(this.projectDir));
    }
    
    // Активирай режима
    await this.memory.setMode('REPAIR', `
В режим РЕМОНТ. При всяка промяна на файл:

1. ПЪРВО покажи какво ще промениш
2. ОБЯСНИ защо
3. ИЗЧАКАЙ одобрение ("да", "не", "покажи diff")
4. При "да" - направи BACKUP, после промени
5. При "не" - предложи алтернатива или пропусни

Формат за всяка стъпка:
\`\`\`
📋 Стъпка N: [Заглавие]
📁 Файл: [път до файла]
🔍 Промяна: [какво ще се промени]
💡 Причина: [защо е нужна тази промяна]

Одобряваш ли? (да/не/покажи diff)
\`\`\`
`);
    
    console.log(chalk.green('✓ Режим РЕМОНТ е активен.'));
    console.log(chalk.gray('\nAI агентът вече ще пита за одобрение преди всяка промяна.'));
    console.log(chalk.gray('Backups ще се записват в: .memory/backups/\n'));
  }
  
  // ==========================================================================
  // ONBOARD MODE
  // ==========================================================================
  
  async onboard(): Promise<void> {
    console.log(chalk.yellow(`
╔═══════════════════════════════════════════════════════════════╗
║  📥 РЕЖИМ ONBOARD                                              ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Ще анализирам проекта в дълбочина:                          ║
║  • Файлова структура                                          ║
║  • Dependencies                                               ║
║  • Код и логика                                               ║
║  • Git история (ако има)                                      ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `));
    
    const { proceed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Да започна ли анализа?',
      default: true
    }]);
    
    if (!proceed) return;
    
    console.log(chalk.cyan('\n🔍 Сканиране на проекта...\n'));
    
    // ФАЗА 1: Сканиране
    const analysis = await this.scanProject();
    
    // ФАЗА 2: Покажи доклад
    await this.showOnboardReport(analysis);
    
    // ФАЗА 3: Потвърждение
    const { correct } = await inquirer.prompt([{
      type: 'confirm',
      name: 'correct',
      message: 'Правилен ли е анализът?',
      default: true
    }]);
    
    if (!correct) {
      const { additions } = await inquirer.prompt([{
        type: 'input',
        name: 'additions',
        message: 'Какво да добавя или коригирам?'
      }]);
      analysis.userNotes = additions;
    }
    
    // ФАЗА 4: Създаване на .memory/
    console.log(chalk.cyan('\n📁 Създаване на .memory/...\n'));
    await this.createOnboardMemory(analysis);
    
    // ФАЗА 5: Предложения
    const { wantSuggestions } = await inquirer.prompt([{
      type: 'confirm',
      name: 'wantSuggestions',
      message: 'Искаш ли да предложа подобрения?',
      default: true
    }]);
    
    if (wantSuggestions) {
      await this.showSuggestions(analysis);
    }
    
    console.log(chalk.green('\n✅ ONBOARD завършен!'));
    console.log(chalk.gray('Проектът е готов за работа с AI_Svetlio.\n'));
  }
  
  private async scanProject(): Promise<ProjectAnalysis> {
    const analysis: ProjectAnalysis = {
      name: path.basename(this.projectDir),
      type: 'unknown',
      languages: [],
      frameworks: [],
      dependencies: [],
      structure: [],
      files: { total: 0, byType: {} },
      git: null,
      issues: [],
      userNotes: ''
    };
    
    // Сканирай файлове
    const allFiles = await glob('**/*', {
      cwd: this.projectDir,
      ignore: ['node_modules/**', '.git/**', '.memory/**', 'dist/**', 'build/**', '__pycache__/**', '*.pyc'],
      nodir: true
    });
    
    analysis.files.total = allFiles.length;
    
    // Анализирай по тип
    for (const file of allFiles) {
      const ext = path.extname(file).toLowerCase();
      analysis.files.byType[ext] = (analysis.files.byType[ext] || 0) + 1;
      
      // Добави към структурата (първо ниво)
      const topLevel = file.split('/')[0];
      if (!analysis.structure.includes(topLevel)) {
        analysis.structure.push(topLevel);
      }
    }
    
    // Определи езици
    if (analysis.files.byType['.py']) analysis.languages.push('Python');
    if (analysis.files.byType['.js'] || analysis.files.byType['.ts']) analysis.languages.push('JavaScript/TypeScript');
    if (analysis.files.byType['.php']) analysis.languages.push('PHP');
    if (analysis.files.byType['.rb']) analysis.languages.push('Ruby');
    if (analysis.files.byType['.go']) analysis.languages.push('Go');
    if (analysis.files.byType['.rs']) analysis.languages.push('Rust');
    if (analysis.files.byType['.java']) analysis.languages.push('Java');
    
    // Провери за package.json
    if (await fs.pathExists(path.join(this.projectDir, 'package.json'))) {
      try {
        const pkg = await fs.readJson(path.join(this.projectDir, 'package.json'));
        analysis.name = pkg.name || analysis.name;
        
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        analysis.dependencies = Object.keys(deps);
        
        // Определи frameworks
        if (deps['react']) analysis.frameworks.push('React');
        if (deps['vue']) analysis.frameworks.push('Vue');
        if (deps['angular'] || deps['@angular/core']) analysis.frameworks.push('Angular');
        if (deps['next']) analysis.frameworks.push('Next.js');
        if (deps['express']) analysis.frameworks.push('Express');
        if (deps['fastify']) analysis.frameworks.push('Fastify');
        if (deps['nest'] || deps['@nestjs/core']) analysis.frameworks.push('NestJS');
      } catch (e) {}
    }
    
    // Провери за requirements.txt
    if (await fs.pathExists(path.join(this.projectDir, 'requirements.txt'))) {
      try {
        const reqs = await fs.readFile(path.join(this.projectDir, 'requirements.txt'), 'utf-8');
        const deps = reqs.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split('==')[0].split('>=')[0]);
        analysis.dependencies.push(...deps);
        
        if (deps.includes('flask') || deps.includes('Flask')) analysis.frameworks.push('Flask');
        if (deps.includes('django') || deps.includes('Django')) analysis.frameworks.push('Django');
        if (deps.includes('fastapi') || deps.includes('FastAPI')) analysis.frameworks.push('FastAPI');
      } catch (e) {}
    }
    
    // Провери за Git
    if (await fs.pathExists(path.join(this.projectDir, '.git'))) {
      analysis.git = {
        exists: true,
        // Можем да добавим повече git анализ тук
      };
    }
    
    // Определи тип на проекта
    if (analysis.frameworks.includes('React') || analysis.frameworks.includes('Vue') || analysis.frameworks.includes('Angular')) {
      analysis.type = 'frontend';
    } else if (analysis.frameworks.includes('Express') || analysis.frameworks.includes('FastAPI') || analysis.frameworks.includes('Django')) {
      analysis.type = 'backend';
    } else if (analysis.frameworks.includes('Next.js')) {
      analysis.type = 'fullstack';
    } else if (analysis.languages.includes('Python')) {
      analysis.type = 'python-app';
    } else if (analysis.languages.includes('JavaScript/TypeScript')) {
      analysis.type = 'node-app';
    }
    
    // Открий проблеми
    if (!await fs.pathExists(path.join(this.projectDir, 'README.md'))) {
      analysis.issues.push('Липсва README.md');
    }
    if (!await fs.pathExists(path.join(this.projectDir, '.gitignore'))) {
      analysis.issues.push('Липсва .gitignore');
    }
    if (!await fs.pathExists(path.join(this.projectDir, '.env.example')) && 
        (await fs.pathExists(path.join(this.projectDir, '.env')))) {
      analysis.issues.push('Има .env но липсва .env.example');
    }
    
    return analysis;
  }
  
  private async showOnboardReport(analysis: ProjectAnalysis): Promise<void> {
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.cyan('                    📊 ДОКЛАД'));
    console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    
    console.log(`\n${chalk.bold('Име:')} ${analysis.name}`);
    console.log(`${chalk.bold('Тип:')} ${analysis.type}`);
    console.log(`${chalk.bold('Езици:')} ${analysis.languages.join(', ') || 'Неопределени'}`);
    console.log(`${chalk.bold('Frameworks:')} ${analysis.frameworks.join(', ') || 'Няма'}`);
    console.log(`${chalk.bold('Файлове:')} ${analysis.files.total}`);
    
    console.log(`\n${chalk.bold('Структура:')}`);
    analysis.structure.forEach(item => {
      console.log(`  ├── ${item}`);
    });
    
    if (analysis.dependencies.length > 0) {
      console.log(`\n${chalk.bold('Dependencies:')} ${analysis.dependencies.length} пакета`);
      console.log(chalk.gray(`  ${analysis.dependencies.slice(0, 10).join(', ')}${analysis.dependencies.length > 10 ? '...' : ''}`));
    }
    
    console.log(`\n${chalk.bold('Git:')} ${analysis.git ? 'Да' : 'Не'}`);
    
    if (analysis.issues.length > 0) {
      console.log(`\n${chalk.yellow('⚠️ Открити проблеми:')}`);
      analysis.issues.forEach(issue => {
        console.log(chalk.yellow(`  • ${issue}`));
      });
    }
    
    console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  }
  
  private async createOnboardMemory(analysis: ProjectAnalysis): Promise<void> {
    // Инициализирай .memory/ ако няма
    await this.memory.initialize(analysis.name);
    
    // Обнови ARCHITECTURE.md
    const architecture = `# Архитектура на проекта

## Проект: ${analysis.name}

## Общ преглед
- **Тип:** ${analysis.type}
- **Езици:** ${analysis.languages.join(', ') || 'Неопределени'}
- **Frameworks:** ${analysis.frameworks.join(', ') || 'Няма'}

## Структура
\`\`\`
${analysis.name}/
${analysis.structure.map(s => `├── ${s}`).join('\n')}
\`\`\`

## Dependencies
${analysis.dependencies.length > 0 ? analysis.dependencies.map(d => `- ${d}`).join('\n') : 'Няма открити'}

## Бележки от потребителя
${analysis.userNotes || 'Няма'}

`;
    await this.memory.writeFile('ARCHITECTURE.md', architecture);
    
    // Обнови TOOLS.md
    const tools = `# Инструменти на проекта

## Проект: ${analysis.name}

## Текущи технологии
${analysis.frameworks.map(f => `- ${f}`).join('\n') || '- Няма frameworks'}

## Езици
${analysis.languages.map(l => `- ${l}`).join('\n') || '- Неопределени'}

## AI_Svetlio инструменти
- [ ] Добави препоръчани инструменти

`;
    await this.memory.writeFile('TOOLS.md', tools);
    
    // Обнови TODO.md с откритите проблеми
    if (analysis.issues.length > 0) {
      const todo = `# Задачи

## Проект: ${analysis.name}

## 🔴 Приоритетни (от ONBOARD анализ)
${analysis.issues.map(i => `- [ ] ${i}`).join('\n')}

## 🟡 В процес
- (нищо засега)

## 🟢 Готови
- [x] ONBOARD анализ
- [x] Създаване на .memory/

## 📋 Backlog
- (добави задачи тук)

`;
      await this.memory.writeFile('TODO.md', todo);
    }
    
    // Обнови STATE.md
    await this.memory.updateState({
      status: 'Onboarded',
      currentTask: 'Готов за работа',
      context: `Проектът е анализиран и вкаран в AI_Svetlio системата. Тип: ${analysis.type}. Frameworks: ${analysis.frameworks.join(', ') || 'няма'}.`,
      nextStep: 'Опиши какво искаш да направиш с проекта.'
    });
    
    // Добави в лога
    await this.memory.addLog(`ONBOARD завършен. Проект тип: ${analysis.type}`, 'success');
    
    // Създай rules файлове
    await this.createProjectRules();
  }
  
  private async showSuggestions(analysis: ProjectAnalysis): Promise<void> {
    console.log(chalk.cyan('\n💡 Предложения за подобрение:\n'));
    
    const suggestions: string[] = [];
    
    // Базирани на анализа
    if (analysis.issues.includes('Липсва README.md')) {
      suggestions.push('Създай README.md с описание на проекта');
    }
    
    if (analysis.issues.includes('Липсва .gitignore')) {
      suggestions.push('Добави .gitignore файл');
    }
    
    // AI_Svetlio инструменти
    if (analysis.type === 'backend' || analysis.type === 'fullstack') {
      suggestions.push('Разгледай FastMCP за създаване на MCP сървър към този проект');
    }
    
    if (!analysis.git) {
      suggestions.push('Инициализирай Git repo за версионен контрол');
    }
    
    suggestions.forEach((s, i) => {
      console.log(chalk.yellow(`  ${i + 1}. ${s}`));
    });
    
    console.log();
  }
  
  private async createProjectRules(): Promise<void> {
    const rules = `<!-- AI_Svetlio v${VERSION} -->
# AI_Svetlio - Правила за този проект

## 🧠 Памет на проекта

Проектът използва AI_Svetlio. Паметта е в \`.memory/\` папката.

### ВИНАГИ първо прочети:
\`\`\`
.memory/STATE.md    ← Къде сме сега
.memory/MODE.md     ← В какъв режим сме
\`\`\`

### При нужда прочети:
\`\`\`
.memory/ARCHITECTURE.md  ← Структура на проекта
.memory/TOOLS.md         ← Какви инструменти ползваме
.memory/TODO.md          ← Какво остава
.memory/DECISIONS.md     ← Защо сме избрали X
.memory/PROBLEMS.md      ← Срещнати проблеми
\`\`\`

### Провери за нови заявки:
Ако \`.requests/inbox/\` съществува и има файлове → докладвай и чакай одобрение преди обработка.

### След работа ВИНАГИ обнови:
\`\`\`
.memory/STATE.md      ← Ново състояние (ВИНАГИ)
.memory/LOG.md        ← Какво направи (ВИНАГИ)
.memory/TODO.md       ← Завършени/нови задачи (ако има промени)
.memory/PROBLEMS.md   ← Срещнати/решени проблеми (ако има промени)
.memory/DECISIONS.md  ← Взети решения (ако има промени)
\`\`\`

## 🔧 Режими

Провери \`.memory/MODE.md\` за текущия режим:

| Режим | Поведение |
|-------|-----------|
| NORMAL | Работи + обновявай .memory/ |
| REPAIR | Backup + питай преди всяка стъпка |
| ONBOARD | Анализирай + документирай |
| ANALYZE | Дълбок анализ + план |
| EXTEND | Добавяй без да пипаш старото |
| REWRITE | Нов код, същият UX |

## 🛠️ Инструменти

Виж \`.memory/TOOLS.md\` за инструментите на този проект.

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
14. **INBOX ВИНАГИ ЧИСТ** — \`.requests/inbox/\` не съдържа необработени файлове. В начало на сесия: провери inbox → обработи всеки в CR (по TEMPLATE.md) → премести оригиналите в archive/originals/ → обнови REGISTRY.md + LOG.md. Inbox = вход, не склад.
15. **СТРОГО СТРУКТУРА НА ПАМЕТТА** — В .memory/ root живеят САМО 8-те стандартни файла (STATE, LOG, TODO, DECISIONS, PROBLEMS, MODE, TOOLS, ARCHITECTURE). Всичко друго в subdirectory: планове → plans/, анализи → analysis/, research → architecture/research/, фази → phase_a/ phase_b/, скриптове → scripts/, backups → backups/. Ad-hoc в root = забранено.

### РЕЛИЙС И ПУБЛИКАЦИЯ (Ново в v2.0)
16. **AUDIT ПРЕДИ PUBLISH** — Преди git push към публичен repo или npm publish: задължителен code audit (URLs, README, changelog, критични files). Не публикувай "работещо локално" без audit.
17. **SMOKE TEST ПРЕДИ COMMIT** — Build + мин 3 basic CLI проверки (version, help, no-op) преди git commit. Ако tsc не минава → не commit-вай.
18. **ПАМЕТТА = РЕАЛНОСТ, НЕ НАМЕРЕНИЕ** — LOG.md описва какво СЕ Е СЛУЧИЛО, не планирано. ⏸️ отложено / ❌ неуспешно / ⏳ предстои / ✅ завършено.
19. **НЕ БЪРЗАЙ** — Малки проблеми сега (typo, wrong URL, липсващ bullet) = emergency patches после. Ако не си сигурен → спри, провери.

### ПРАВИЛА И АРХИТЕКТУРА (Ново в v2.0)
20. **ПРАВИЛАТА ПЪРВО** — Преди STATE/TODO/каквото и да е — прочети CLAUDE.md (IRON RULES). Правилата са контекст за всяка друга стъпка. Това е ПЪРВАТА стъпка на session start.
21. **ЕДИН ИЗВОР НА ПРАВИЛАТА** — Пълните правила живеят в project CLAUDE.md. User global (~/.claude/CLAUDE.md) е само pointer + лични preferences. Другите IDE файлове (.cursorrules, .antigravity/rules.md) са IDENTICAL mirrors, поддържани от \`svetlio upgrade\`. Не редактирай ръчно IDE-specific файлове — промените се правят в template-а и се регенерират.
22. **ПРОДУКТОВ REPO ≠ DEV MEMORY** — Продуктовите repos (Office, Docs, 30doc, Education, Personal, ai-svetlio tool) НИКОГА не комитват \`.memory/\` в public git. Dev memory живее в **private Hub** (през \`svetlio sync\`). Публичен repo = код + docs + README. Точка.
    **Why:** Business decisions, client names, revenue numbers, incident history, strategy — никое не принадлежи в public git. Веднъж leaked = forever indexed.
    **How to apply:** \`.memory/\` в \`.gitignore\` от ден 1 на всеки нов публичен repo. Hub Sync = единствен път за споделяне. Pre-push audit: ако \`.memory/\` е tracked в public repo → BLOCK.

---

### 📍 SESSION START PROTOCOL
При всяка нова сесия — стриктен ред:
\`\`\`
1. Прочети CLAUDE.md (IRON RULES 1-22) ← ПЪРВО (rule 20)
2. Прочети .memory/MODE.md + STATE.md (rule 1)
3. Провери .requests/inbox/ — обработи всичко ново (rule 14)
4. Прочети .memory/TODO.md — разбери къде си (rule 13)
5. Докладвай Context Refresh на потребителя
\`\`\`

### ⚡ CONTEXT REFRESH ПРОТОКОЛ
При refresh кажи:
\`\`\`
⚡ Context Refresh:
- Работим по: [от STATE.md]
- Режим: [от MODE.md]
- Следваща задача: [от TODO.md]
- Проблеми: [от PROBLEMS.md]
- Последни решения: [от DECISIONS.md]
Продължавам ли?
\`\`\`

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

### ▶ \`старт\` — Първа сесия
\`\`\`
Здравей! Започваме работа по проекта.
🚨 ИНИЦИАЛИЗАЦИЯ (Session Start Protocol):
1. Прочети CLAUDE.md (IRON RULES 1-22) ← първо
2. Прочети .memory/MODE.md, STATE.md, ARCHITECTURE.md, TOOLS.md
3. Провери .requests/inbox/ — обработи ако има
Докладвай какво виждаш и очаквай инструкции.
\`\`\`

### ▶ \`продължаваме\` — Следваща сесия
\`\`\`
Здравей! Продължаваме работа по проекта.
🚨 ИНИЦИАЛИЗАЦИЯ (Session Start Protocol):
1. Прочети CLAUDE.md (IRON RULES 1-22) ← първо
2. Прочети .memory/MODE.md, STATE.md, TODO.md, PROBLEMS.md, DECISIONS.md
3. Провери .requests/inbox/ — обработи ако има
⚠️ Спазвай Iron Rules. Докладвай състоянието.
\`\`\`
`;

    await fs.writeFile(path.join(this.projectDir, '.cursorrules'), rules);
    await fs.writeFile(path.join(this.projectDir, 'CLAUDE.md'), rules);

    const antigravityDir = path.join(this.projectDir, '.antigravity');
    await fs.ensureDir(antigravityDir);
    await fs.writeFile(path.join(antigravityDir, 'rules.md'), rules);
  }
  
  // ==========================================================================
  // DEEP ANALYSIS MODE
  // ==========================================================================
  
  async deepAnalysis(): Promise<void> {
    console.log(chalk.magenta(`
╔═══════════════════════════════════════════════════════════════╗
║  🔬 РЕЖИМ DEEP ANALYSIS                                        ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Ще направя ПЪЛЕН анализ на проекта:                         ║
║  • Всеки файл                                                 ║
║  • Всяка функция/клас                                        ║
║  • Бизнес логика                                              ║
║  • Workflows                                                   ║
║  • Git история                                                ║
║                                                               ║
║  След анализа ще избереш:                                     ║
║  🔼 EXTEND  — Добави нови функции                            ║
║  🔄 REWRITE — Пренапиши с модерни технологии                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `));
    
    // Провери дали има .memory/
    if (!await this.memory.exists()) {
      console.log(chalk.yellow('⚠️  Проектът не е инициализиран. Първо ще направя ONBOARD...\n'));
      await this.onboard();
    }
    
    await this.memory.setMode('ANALYZE', `
В режим DEEP ANALYSIS. AI агентът трябва да:

1. АНАЛИЗИРА всеки файл в проекта
2. ИЗВЛИЧА бизнес логика и правила
3. ДОКУМЕНТИРА workflows (какво прави потребителят)
4. ОТКРИВА технически дълг и проблеми
5. ПРЕДЛАГА подобрения

Записвай в:
- .memory/analysis/FULL_SCAN.md — пълен анализ
- .memory/analysis/BUSINESS_LOGIC.md — бизнес правила
- .memory/analysis/TECH_DEBT.md — технически дълг
- .memory/analysis/RECOMMENDATIONS.md — предложения

След анализа, питай потребителя:
"Какво искаш да направим?"
🔼 EXTEND — Добави нови функции
🔄 REWRITE — Пренапиши с модерни технологии
`);
    
    // Създай analysis папката
    const analysisDir = path.join(this.projectDir, '.memory', 'analysis');
    await fs.ensureDir(analysisDir);
    
    // Създай шаблони за analysis файлове
    await this.createAnalysisTemplates();
    
    console.log(chalk.green('✓ Режим DEEP ANALYSIS е активен.'));
    console.log(chalk.gray('\nAI агентът ще анализира проекта в дълбочина.'));
    console.log(chalk.gray('Резултатите ще са в: .memory/analysis/\n'));
    
    // Покажи следващи стъпки
    console.log(chalk.cyan('📋 Следващи стъпки:'));
    console.log(chalk.gray('1. Отвори проекта в Cursor/Claude Code/Antigravity'));
    console.log(chalk.gray('2. Кажи на AI: "Направи deep analysis на проекта"'));
    console.log(chalk.gray('3. AI ще анализира и ще те попита какво да прави после\n'));
  }
  
  private async createAnalysisTemplates(): Promise<void> {
    const analysisDir = path.join(this.projectDir, '.memory', 'analysis');
    
    // FULL_SCAN.md
    await fs.writeFile(path.join(analysisDir, 'FULL_SCAN.md'), `# Пълен анализ на проекта

## Инструкции за AI

Анализирай ВСЕКИ файл в проекта и документирай:

### За всеки файл:
- Път
- Цел (какво прави)
- Ключови функции/класове
- Зависимости
- Проблеми (ако има)

### Формат:
\`\`\`
## [път/до/файл]
**Цел:** ...
**Ключови елементи:**
- функция1() — описание
- функция2() — описание
**Зависимости:** ...
**Проблеми:** ...
\`\`\`

---

## Анализ

(AI ще попълни тази секция)

`);

    // BUSINESS_LOGIC.md
    await fs.writeFile(path.join(analysisDir, 'BUSINESS_LOGIC.md'), `# Бизнес логика

## Инструкции за AI

Извлечи и документирай ВСИЧКИ бизнес правила от кода:

### Какво да търсиш:
- Валидации (if условия за данни)
- Бизнес правила ("ако X, тогава Y")
- Workflows (последователност от действия)
- Ограничения (какво НЕ може да се прави)
- Специални случаи (edge cases)

### Формат:
\`\`\`
### [Име на правилото]
**Описание:** ...
**Код локация:** файл:ред
**Логика:** Ако [условие], тогава [действие]
**Пример:** ...
\`\`\`

---

## Бизнес правила

(AI ще попълни тази секция)

`);

    // TECH_DEBT.md
    await fs.writeFile(path.join(analysisDir, 'TECH_DEBT.md'), `# Технически дълг

## Инструкции за AI

Открий и документирай технически проблеми:

### Категории:
- 🔴 Критични (security, data loss риск)
- 🟠 Важни (performance, maintainability)
- 🟡 Подобрения (code style, best practices)

### Формат:
\`\`\`
### 🔴/🟠/🟡 [Проблем]
**Локация:** файл:ред
**Описание:** ...
**Риск:** ...
**Препоръка:** ...
\`\`\`

---

## Открит технически дълг

(AI ще попълни тази секция)

`);

    // RECOMMENDATIONS.md
    await fs.writeFile(path.join(analysisDir, 'RECOMMENDATIONS.md'), `# Препоръки

## Инструкции за AI

След анализа, предложи:

### Структура:
1. **Резюме** — общо състояние на проекта
2. **Силни страни** — какво е добре направено
3. **Слаби страни** — какво трябва да се подобри
4. **Препоръки за EXTEND** — ако искат да добавят функции
5. **Препоръки за REWRITE** — ако искат да пренапишат

---

## Препоръки

(AI ще попълни тази секция)

`);

    // UX_CONTRACT.md (за REWRITE)
    const rewriteDir = path.join(this.projectDir, '.memory', 'rewrite');
    await fs.ensureDir(rewriteDir);
    
    await fs.writeFile(path.join(rewriteDir, 'UX_CONTRACT.md'), `# UX Contract

## ⚠️ КРИТИЧНО

Този файл описва какво ПОТРЕБИТЕЛЯТ вижда и прави.
При REWRITE, ВСИЧКО в този файл ТРЯБВА да остане СЪЩОТО.

## Инструкции за AI

Документирай ВСИЧКО което потребителят вижда/прави:

### Менюта и навигация
(Опиши всички менюта, бутони, линкове)

### Екрани/Страници
(Опиши всеки екран)

### Действия
(Опиши какво може да прави потребителят)

### Workflows
(Опиши стъпка-по-стъпка процеси)

### Съобщения
(Всички съобщения към потребителя)

### Валидации
(Какво се проверява при въвеждане)

---

## UX Contract

(AI ще попълни тази секция)

`);
  }
}

// ==========================================================================
// TYPES
// ==========================================================================

interface ProjectAnalysis {
  name: string;
  type: string;
  languages: string[];
  frameworks: string[];
  dependencies: string[];
  structure: string[];
  files: {
    total: number;
    byType: Record<string, number>;
  };
  git: { exists: boolean } | null;
  issues: string[];
  userNotes: string;
}
