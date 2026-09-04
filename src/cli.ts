#!/usr/bin/env node
/**
 *  ███████╗██╗   ██╗███████╗████████╗██╗     ██╗ ██████╗
 *  ██╔════╝██║   ██║██╔════╝╚══██╔══╝██║     ██║██╔═══██╗
 *  ███████╗██║   ██║█████╗     ██║   ██║     ██║██║   ██║
 *  ╚════██║╚██╗ ██╔╝██╔══╝     ██║   ██║     ██║██║   ██║
 *  ███████║ ╚████╔╝ ███████╗   ██║   ███████╗██║╚██████╔╝
 *  ╚══════╝  ╚═══╝  ╚══════╝   ╚═╝   ╚══════╝╚═╝ ╚═════╝
 *
 * AI_Svetlio - Universal AI Agent Toolkit & Project Memory
 * 
 * Режими:
 *   NORMAL      - Текуща работа
 *   REPAIR      - Поправки с backup и одобрение
 *   ONBOARD     - Вкарване на съществуващ проект
 *   ANALYZE     - Дълбок анализ (EXTEND/REWRITE)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Memory } from './memory';
import { Modes } from './modes';
import { Tools } from './tools';
import { MCPWizard } from './mcp-wizard';
import { WebViewer } from './web';
import { RequestsManager } from './requests';
import { SyncManager } from './sync';

import { VERSION, RULE_FILES, projectRules } from './rules';

// ============================================================================
// BANNER
// ============================================================================

function showBanner() {
  console.log(chalk.cyan(`
  ███████╗██╗   ██╗███████╗████████╗██╗     ██╗ ██████╗
  ██╔════╝██║   ██║██╔════╝╚══██╔══╝██║     ██║██╔═══██╗
  ███████╗██║   ██║█████╗     ██║   ██║     ██║██║   ██║
  ╚════██║╚██╗ ██╔╝██╔══╝     ██║   ██║     ██║██║   ██║
  ███████║ ╚████╔╝ ███████╗   ██║   ███████╗██║╚██████╔╝
  ╚══════╝  ╚═══╝  ╚══════╝   ╚═╝   ╚══════╝╚═╝ ╚═════╝
  `));
  console.log(chalk.gray(`  Universal AI Agent Toolkit & Project Memory v${VERSION}\n`));
}

// ============================================================================
// CLI SETUP
// ============================================================================

const program = new Command();

program
  .name('svetlio')
  .description('AI_Svetlio - Universal AI Agent Toolkit & Project Memory')
  .version(VERSION);

// ----------------------------------------------------------------------------
// svetlio setup - Глобална настройка (веднъж)
// ----------------------------------------------------------------------------
program
  .command('setup')
  .description('Глобална настройка на AI_Svetlio (веднъж на машината)')
  .option('--ide <ide>', 'Специфично IDE (cursor, claude-code, antigravity, all)', 'all')
  .action(async (options) => {
    showBanner();
    console.log(chalk.yellow('🔧 Глобална настройка на AI_Svetlio\n'));

    const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
    const svetDir = path.join(homeDir, '.ai-svetlio');
    
    // Създай глобална директория
    await fs.ensureDir(svetDir);
    
    // Копирай registry
    const registrySource = path.join(__dirname, '../registry.yaml');
    const registryDest = path.join(svetDir, 'registry.yaml');
    if (await fs.pathExists(registrySource)) {
      await fs.copy(registrySource, registryDest);
    }
    
    // Създай глобални rules за IDE-тата
    if (options.ide === 'all' || options.ide === 'cursor') {
      const cursorRules = path.join(homeDir, '.cursorrules');
      await fs.writeFile(cursorRules, generateGlobalRules('cursor'));
      console.log(chalk.green(`  ✓ Cursor rules: ${cursorRules}`));
    }
    
    if (options.ide === 'all' || options.ide === 'claude-code') {
      const claudeDir = path.join(homeDir, '.claude');
      await fs.ensureDir(claudeDir);
      await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), generateGlobalRules('claude-code'));
      console.log(chalk.green(`  ✓ Claude Code rules: ${claudeDir}/CLAUDE.md`));
    }
    
    if (options.ide === 'all' || options.ide === 'antigravity') {
      const antigravityDir = path.join(homeDir, '.antigravity');
      await fs.ensureDir(antigravityDir);
      await fs.writeFile(path.join(antigravityDir, 'rules.md'), generateGlobalRules('antigravity'));
      console.log(chalk.green(`  ✓ Antigravity rules: ${antigravityDir}/rules.md`));
    }
    
    console.log(chalk.green('\n✅ AI_Svetlio е настроен глобално!'));
    console.log(chalk.gray('\nСега можеш да използваш `svetlio init` във всеки проект.'));
  });

// ----------------------------------------------------------------------------
// svetlio init - Инициализирай нов проект
// ----------------------------------------------------------------------------
program
  .command('init')
  .description('Инициализирай AI_Svetlio в текущия проект')
  .option('--name <name>', 'Име на проекта')
  .action(async (options) => {
    showBanner();
    console.log(chalk.yellow('📁 Инициализиране на проект\n'));
    
    const memory = new Memory(process.cwd());
    
    // Провери дали вече е инициализиран
    if (await memory.exists()) {
      console.log(chalk.yellow('⚠️  Проектът вече има .memory/ папка.'));
      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Искаш ли да презапишеш?',
        default: false
      }]);
      if (!proceed) return;
    }
    
    // Вземи име на проекта
    let projectName = options.name;
    if (!projectName) {
      const { name } = await inquirer.prompt([{
        type: 'input',
        name: 'name',
        message: 'Име на проекта:',
        default: path.basename(process.cwd())
      }]);
      projectName = name;
    }
    
    // Създай .memory/
    await memory.initialize(projectName);

    // Създай .requests/
    const requests = new RequestsManager(process.cwd());
    await requests.initialize(projectName);

    // Създай IDE rules
    await createProjectRules(process.cwd());

    // Enforcement на IRON RULE 22: .memory/ в .gitignore by default
    const gitignoreUpdated = await ensureGitignoreProtectsMemory(process.cwd());

    // Създай launcher файл за "един клик" отваряне
    const launcherFile = await WebViewer.createLauncher(process.cwd());

    console.log(chalk.green('\n✅ Проектът е инициализиран!'));
    console.log(chalk.gray('\nСъздадени файлове:'));
    console.log(chalk.gray('  .memory/STATE.md'));
    console.log(chalk.gray('  .memory/LOG.md'));
    console.log(chalk.gray('  .memory/ARCHITECTURE.md'));
    console.log(chalk.gray('  .memory/TOOLS.md'));
    console.log(chalk.gray('  .memory/TODO.md'));
    console.log(chalk.gray('  .memory/DECISIONS.md'));
    console.log(chalk.gray('  .memory/PROBLEMS.md'));
    console.log(chalk.gray('  .memory/MODE.md'));
    console.log(chalk.gray('  .requests/README.md'));
    console.log(chalk.gray('  .requests/TEMPLATE.md'));
    console.log(chalk.gray('  .requests/REGISTRY.md'));
    console.log(chalk.gray('  .requests/config.json'));
    // Списъкът идва от единствения източник — не се преписва тук (IRON RULE 21).
    for (const file of RULE_FILES) {
      console.log(chalk.gray(`  ${file}`));
    }
    if (gitignoreUpdated === 'created') {
      console.log(chalk.gray('  .gitignore (с .memory/ защита — IRON RULE 22)'));
    } else if (gitignoreUpdated === 'appended') {
      console.log(chalk.gray('  .gitignore (добавена .memory/ защита — IRON RULE 22)'));
    }
    console.log(chalk.gray(`  ${launcherFile}`));
    console.log(chalk.gray('\n💡 Кликни два пъти на ' + launcherFile + ' за да отвориш Web Viewer.'));
    console.log(chalk.gray('   Или използвай: svetlio web'));
  });

// ----------------------------------------------------------------------------
// svetlio onboard - Вкарай съществуващ проект
// ----------------------------------------------------------------------------
program
  .command('onboard')
  .description('Вкарай съществуващ проект в AI_Svetlio (дълбок анализ)')
  .action(async () => {
    showBanner();
    console.log(chalk.yellow('📥 РЕЖИМ ONBOARD\n'));
    console.log(chalk.cyan('Този режим ще анализира проекта в дълбочина и ще създаде .memory/\n'));
    
    const modes = new Modes(process.cwd());
    await modes.onboard();
  });

// ----------------------------------------------------------------------------
// svetlio repair - Режим ремонт
// ----------------------------------------------------------------------------
program
  .command('repair')
  .description('Влез в режим ремонт (backup + одобрение на всяка стъпка)')
  .action(async () => {
    showBanner();
    console.log(chalk.red('🔧 РЕЖИМ РЕМОНТ АКТИВЕН\n'));
    
    const modes = new Modes(process.cwd());
    await modes.activateRepairMode();
  });

// ----------------------------------------------------------------------------
// svetlio analyze - Дълбок анализ (за legacy системи)
// ----------------------------------------------------------------------------
program
  .command('analyze')
  .description('Дълбок анализ на проекта (за EXTEND или REWRITE)')
  .action(async () => {
    showBanner();
    console.log(chalk.magenta('🔬 РЕЖИМ DEEP ANALYSIS\n'));
    
    const modes = new Modes(process.cwd());
    await modes.deepAnalysis();
  });

// ----------------------------------------------------------------------------
// svetlio status - Покажи текущото състояние
// ----------------------------------------------------------------------------
program
  .command('status')
  .description('Покажи текущото състояние на проекта')
  .action(async () => {
    showBanner();

    const memory = new Memory(process.cwd());

    if (!await memory.exists()) {
      console.log(chalk.red('❌ Този проект не е инициализиран.'));
      console.log(chalk.gray('   Използвай: svetlio init'));
      return;
    }
    
    await memory.showStatus();
  });

// ----------------------------------------------------------------------------
// svetlio tools - Управление на инструменти
// ----------------------------------------------------------------------------
const toolsCommand = program
  .command('tools')
  .description('Управление на инструменти (MCP сървъри, агенти, skills)');

// svetlio tools (без подкоманда) - показва каталога
toolsCommand
  .action(async () => {
    showBanner();
    const tools = new Tools();
    await tools.list();
  });

// svetlio tools list
toolsCommand
  .command('list')
  .description('Покажи каталога с налични инструменти')
  .option('--category <cat>', 'Филтрирай по категория')
  .action(async (options) => {
    showBanner();
    const tools = new Tools();
    await tools.list(options.category);
  });

// svetlio tools add <id>
toolsCommand
  .command('add <toolId>')
  .description('Добави инструмент към проекта')
  .action(async (toolId) => {
    showBanner();
    const tools = new Tools();
    await tools.add(toolId);
  });

// svetlio tools remove <id>
toolsCommand
  .command('remove <toolId>')
  .description('Премахни инструмент от проекта')
  .action(async (toolId) => {
    showBanner();
    const tools = new Tools();
    await tools.remove(toolId);
  });

// svetlio tools info <id>
toolsCommand
  .command('info <toolId>')
  .description('Покажи детайли за инструмент')
  .action(async (toolId) => {
    showBanner();
    const tools = new Tools();
    await tools.info(toolId);
  });

// ----------------------------------------------------------------------------
// svetlio registry - Търсене в MCP Registry
// ----------------------------------------------------------------------------
program
  .command('registry <query>')
  .description('Търси в официалния MCP Registry (16,000+ сървъра)')
  .action(async (query) => {
    showBanner();
    const tools = new Tools();
    await tools.searchRegistry(query);
  });

// ----------------------------------------------------------------------------
// svetlio mcp-wizard - Wizard за създаване на MCP сървър
// ----------------------------------------------------------------------------
program
  .command('mcp-wizard')
  .description('Интерактивен wizard за създаване на MCP сървър')
  .action(async () => {
    showBanner();
    
    const wizard = new MCPWizard();
    await wizard.run();
  });

// ----------------------------------------------------------------------------
// svetlio web - Web преглед на .memory/
// ----------------------------------------------------------------------------
program
  .command('web')
  .alias('уеб')
  .description('Отвори визуален преглед на .memory/ в браузъра (read-only)')
  .option('--port <port>', 'Порт за HTTP сървъра', '3847')
  .option('--host <host>', 'Host адрес (0.0.0.0 за мрежов достъп)', 'localhost')
  .action(async (options) => {
    showBanner();

    const memory = new Memory(process.cwd());
    if (!await memory.exists()) {
      console.log(chalk.red('❌ Този проект не е инициализиран.'));
      console.log(chalk.gray('   Използвай: svetlio init'));
      return;
    }

    const port = parseInt(options.port, 10);
    const host = options.host;
    const viewer = new WebViewer(process.cwd());

    try {
      await viewer.start(port, host);
      const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
      console.log(chalk.green(`\n🌐 AI_Svetlio Web Viewer`));
      console.log(chalk.cyan(`   ${url}\n`));
      if (host === '0.0.0.0') {
        console.log(chalk.yellow('   ⚠️  Достъпен от мрежата (read-only)'));
        console.log(chalk.gray('   Колегите могат да отворят: http://<твоето-IP>:' + port));
      }
      console.log(chalk.gray('   Auto-refresh: 5 секунди'));
      console.log(chalk.gray('   Натисни Ctrl+C за спиране\n'));
      viewer.openBrowser(url);

      // Wait for Ctrl+C
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\n👋 Сървърът е спрян.'));
        viewer.stop();
        process.exit(0);
      });
    } catch (err: any) {
      console.log(chalk.red(`❌ ${err.message}`));
    }
  });

// ----------------------------------------------------------------------------
// svetlio shortcut - Създай desktop shortcut
// ----------------------------------------------------------------------------
program
  .command('shortcut')
  .description('Създай desktop shortcut за бързо отваряне на Web Viewer')
  .action(async () => {
    showBanner();

    const memory = new Memory(process.cwd());
    if (!await memory.exists()) {
      console.log(chalk.red('❌ Този проект не е инициализиран.'));
      console.log(chalk.gray('   Използвай: svetlio init'));
      return;
    }

    try {
      const shortcutPath = await WebViewer.createDesktopShortcut(process.cwd());
      console.log(chalk.green(`\n✅ Desktop shortcut е създаден!`));
      console.log(chalk.cyan(`   ${shortcutPath}`));
      console.log(chalk.gray('\n   Кликни два пъти за да отвориш Web Viewer.'));
    } catch (err: any) {
      console.log(chalk.red(`❌ Грешка: ${err.message}`));
    }
  });

// ----------------------------------------------------------------------------
// svetlio log - Добави запис в лога
// ----------------------------------------------------------------------------
program
  .command('log <message>')
  .description('Добави ръчен запис в LOG.md')
  .action(async (message) => {
    const memory = new Memory(process.cwd());
    
    if (!await memory.exists()) {
      console.log(chalk.red('❌ Този проект не е инициализиран.'));
      return;
    }
    
    await memory.addLog(message, 'manual');
    console.log(chalk.green('✓ Записът е добавен в LOG.md'));
  });

// ----------------------------------------------------------------------------
// svetlio upgrade - Обнови правилата на проекта
// ----------------------------------------------------------------------------
program
  .command('upgrade')
  .alias('обнови')
  .description('Обнови правилата на проекта до текущата версия')
  .action(async () => {
    showBanner();

    const memory = new Memory(process.cwd());
    if (!await memory.exists()) {
      console.log(chalk.red('❌ Този проект не е инициализиран.'));
      console.log(chalk.gray('   Използвай: svetlio init'));
      return;
    }

    const projectDir = process.cwd();
    const claudeMdPath = path.join(projectDir, 'CLAUDE.md');

    // 1. Определи текущата версия на генерираните правила
    let currentVersion = 'unknown';
    if (await fs.pathExists(claudeMdPath)) {
      const content = await fs.readFile(claudeMdPath, 'utf-8');
      const versionMatch = content.match(/<!-- AI_Svetlio v([\d.]+) -->/);
      if (versionMatch) {
        currentVersion = versionMatch[1];
      } else {
        currentVersion = 'pre-1.5.0';
      }
    } else {
      console.log(chalk.yellow('⚠️  CLAUDE.md не е намерен. Ще бъде създаден.'));
      currentVersion = 'none';
    }

    // 2. Провери дали има нужда от upgrade
    if (currentVersion === VERSION) {
      console.log(chalk.green(`✅ Правилата вече са на версия v${VERSION}`));
      console.log(chalk.gray('   Няма нужда от обновяване.'));
      return;
    }

    console.log(chalk.cyan(`📋 Текуща версия на правилата: v${currentVersion}`));
    console.log(chalk.cyan(`📋 Нова версия: v${VERSION}`));
    console.log();

    // 3. Backup на старите файлове
    const filesToBackup = RULE_FILES;
    const existingFiles = [];
    for (const file of filesToBackup) {
      if (await fs.pathExists(path.join(projectDir, file))) {
        existingFiles.push(file);
      }
    }

    if (existingFiles.length > 0) {
      console.log(chalk.yellow('📦 Backup на стари файлове...'));
      const backupDir = await memory.createBackup(existingFiles, `Upgrade от v${currentVersion} към v${VERSION}`);
      console.log(chalk.gray(`   Backup: ${path.relative(projectDir, backupDir)}`));
      console.log();

      // 4. Запази старото съдържание за diff
      const oldContents: Record<string, string> = {};
      for (const file of existingFiles) {
        oldContents[file] = await fs.readFile(path.join(projectDir, file), 'utf-8');
      }

      // 5. Генерирай нови правила
      console.log(chalk.cyan('🔄 Генериране на нови правила...'));
      await createProjectRules(projectDir);

      // 6. Покажи diff
      console.log(chalk.cyan('\n📊 Промени:\n'));
      for (const file of existingFiles) {
        const newContent = await fs.readFile(path.join(projectDir, file), 'utf-8');
        const oldLines = oldContents[file].split('\n');
        const newLines = newContent.split('\n');

        const added = newLines.filter(l => !oldLines.includes(l));
        const removed = oldLines.filter(l => !newLines.includes(l));

        if (added.length === 0 && removed.length === 0) {
          console.log(chalk.gray(`   ${file}: без промени`));
        } else {
          console.log(chalk.white(`   ${file}:`));
          if (removed.length > 0) {
            console.log(chalk.red(`     - ${removed.length} реда премахнати`));
            removed.slice(0, 5).forEach(l => {
              if (l.trim()) console.log(chalk.red(`       - ${l.trim().substring(0, 80)}`));
            });
            if (removed.length > 5) console.log(chalk.gray(`       ... и още ${removed.length - 5}`));
          }
          if (added.length > 0) {
            console.log(chalk.green(`     + ${added.length} реда добавени`));
            added.slice(0, 5).forEach(l => {
              if (l.trim()) console.log(chalk.green(`       + ${l.trim().substring(0, 80)}`));
            });
            if (added.length > 5) console.log(chalk.gray(`       ... и още ${added.length - 5}`));
          }
        }
      }
    } else {
      // Няма стари файлове, просто генерирай нови
      console.log(chalk.cyan('🔄 Генериране на нови правила...'));
      await createProjectRules(projectDir);
    }

    // 7. Обнови глобалните правила ако има .claude/CLAUDE.md
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const globalClaudeMd = path.join(homeDir, '.claude', 'CLAUDE.md');
    if (await fs.pathExists(globalClaudeMd)) {
      const globalContent = await fs.readFile(globalClaudeMd, 'utf-8');
      if (globalContent.includes('AI_Svetlio')) {
        const newGlobal = generateGlobalRules('claude-code');
        if (globalContent.trim() === newGlobal.trim()) {
          // Нищо за правене — не пипаме файл без причина.
        } else {
          // IRON RULE 5 + 21: глобалният файл е „pointer + ЛИЧНИ preferences".
          // Не го презаписваме без backup — иначе тихо трием чужда работа.
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupDir = path.join(homeDir, '.ai-svetlio', 'backups');
          await fs.ensureDir(backupDir);
          const backupFile = path.join(backupDir, 'CLAUDE.md.' + stamp);
          await fs.writeFile(backupFile, globalContent);
          await fs.writeFile(globalClaudeMd, newGlobal);
          console.log(chalk.green('\n   ✅ Глобални правила обновени: ~/.claude/CLAUDE.md'));
          console.log(chalk.yellow('   ⚠️  Файлът беше презаписан. Ако си имал лични бележки, те са запазени тук:'));
          console.log(chalk.yellow('      ' + backupFile));
        }
      }
    }

    // 8. Създай .requests/ ако липсва (добавено във v1.5.0+)
    const requests = new RequestsManager(projectDir);
    if (!await requests.exists()) {
      const projectName = path.basename(projectDir);
      await requests.initialize(projectName);
      console.log(chalk.green(`\n   📋 Създадена .requests/ папка (нова във v1.5.0)`));
    }

    // 9. Enforcement на IRON RULE 22: .memory/ в .gitignore (добавено във v2.0.1+)
    const gitignoreResult = await ensureGitignoreProtectsMemory(projectDir);
    if (gitignoreResult === 'created') {
      console.log(chalk.green(`\n   🔒 Създаден .gitignore с .memory/ защита (IRON RULE 22)`));
    } else if (gitignoreResult === 'appended') {
      console.log(chalk.green(`\n   🔒 Добавена .memory/ защита в .gitignore (IRON RULE 22)`));
    }

    console.log(chalk.green(`\n✅ Обновено от v${currentVersion} → v${VERSION}`));
    console.log(chalk.gray('   .memory/ НЕ е пипната.'));
  });

// ----------------------------------------------------------------------------
// svetlio requests - Управление на клиентски заявки
// ----------------------------------------------------------------------------
program
  .command('requests [action]')
  .alias('заявки')
  .description('Управление на клиентски заявки (list, check, process, archive)')
  .action(async (action?: string) => {
    const requests = new RequestsManager(process.cwd());

    if (!await requests.exists()) {
      console.log(chalk.red('❌ Този проект няма .requests/ папка.'));
      console.log(chalk.gray('   Използвай: svetlio init'));
      return;
    }

    if (!action || action === 'list') {
      // Покажи списък на заявки
      const allRequests = await requests.listRequests();
      const stats = await requests.getStats();

      console.log(chalk.cyan(`\n📋 Клиентски заявки: ${stats.total} общо`));
      console.log(chalk.gray(`   Активни: ${stats.active} | Завършени: ${stats.completed} | Отказани: ${stats.rejected}\n`));

      if (allRequests.length === 0) {
        console.log(chalk.gray('   Няма заявки все още.'));
        console.log(chalk.gray('   Сложи файл в .requests/inbox/ за да започнеш.'));
      } else {
        for (const req of allRequests) {
          const icon = req.priority === 'Критичен' || req.priority === 'критичен' ? '🔴' :
                       req.priority === 'Висок' || req.priority === 'висок' ? '⚠️' :
                       req.priority === 'Нисък' || req.priority === 'нисък' ? '🔵' : '⬜';
          console.log(chalk.white(`   ${icon} ${req.id} — ${req.subject}`));
          console.log(chalk.gray(`      ${req.status} | ${req.client} | ${req.date}`));
        }
      }

      // Провери inbox
      const inboxFiles = await requests.checkInbox();
      if (inboxFiles.length > 0) {
        console.log(chalk.yellow(`\n📥 Inbox: ${inboxFiles.length} файла чакат обработка:`));
        inboxFiles.forEach(f => console.log(chalk.yellow(`   • ${f}`)));
      }

    } else if (action === 'check') {
      // Провери inbox
      const inboxFiles = await requests.checkInbox();
      if (inboxFiles.length === 0) {
        console.log(chalk.green('✅ Inbox е празен — няма нови заявки.'));
      } else {
        console.log(chalk.yellow(`📥 Намерени ${inboxFiles.length} файла в inbox:`));
        inboxFiles.forEach(f => console.log(chalk.yellow(`   • ${f}`)));
        console.log(chalk.gray('\n   За обработка, кажи на AI агента: "обработи заявките от inbox"'));
      }

    } else if (action === 'archive') {
      // Покажи завършени заявки за архивиране
      const allRequests = await requests.listRequests();
      const completed = allRequests.filter(r =>
        ['Завършена', 'завършена', 'Отказана', 'отказана'].includes(r.status)
      );

      if (completed.length === 0) {
        console.log(chalk.gray('Няма завършени заявки за архивиране.'));
      } else {
        console.log(chalk.cyan(`📦 ${completed.length} заявки готови за архивиране:`));
        for (const req of completed) {
          console.log(chalk.gray(`   • ${req.id} — ${req.subject} (${req.status})`));
        }
        console.log(chalk.gray('\n   Използвай AI агента за архивиране на конкретна заявка.'));
      }

    } else if (action === 'process') {
      // Обработи файлове от inbox
      const inboxFiles = await requests.checkInbox();
      if (inboxFiles.length === 0) {
        console.log(chalk.green('✅ Inbox е празен — няма какво да се обработи.'));
        return;
      }

      console.log(chalk.cyan(`📥 Обработка на ${inboxFiles.length} файла от inbox...`));
      const result = await requests.processInbox();

      if (result.processed.length > 0) {
        console.log(chalk.green(`\n✅ Обработени: ${result.processed.length}`));
        result.processed.forEach(f => console.log(chalk.green(`   ✓ ${f}`)));
      }

      if (result.errors.length > 0) {
        console.log(chalk.red(`\n❌ Грешки: ${result.errors.length}`));
        result.errors.forEach(e => console.log(chalk.red(`   ✗ ${e}`)));
      }

    } else {
      console.log(chalk.red(`❌ Неизвестно действие: ${action}`));
      console.log(chalk.gray('   Налични: list, check, process, archive'));
    }
  });

// ----------------------------------------------------------------------------
// svetlio sync - Синхронизация на .memory/ между машини
// ----------------------------------------------------------------------------
const syncCommand = program
  .command('sync')
  .alias('синк')
  .description('Синхронизация на .memory/ между машини чрез GitHub hub');

// svetlio sync (без подкоманда) → покажи статус
syncCommand
  .action(async () => {
    showBanner();
    const sync = new SyncManager(process.cwd());
    await sync.status();
  });

// svetlio sync init
syncCommand
  .command('init')
  .alias('настройка')
  .description('Настрой sync hub (първоначална конфигурация)')
  .action(async () => {
    showBanner();
    const sync = new SyncManager(process.cwd());
    await sync.initHub();
  });

// svetlio sync push
syncCommand
  .command('push')
  .alias('изпрати')
  .description('Изпрати .memory/ към hub')
  .action(async () => {
    showBanner();
    const sync = new SyncManager(process.cwd());
    const memory = new Memory(process.cwd());

    if (!await memory.exists()) {
      console.log(chalk.red('❌ Проектът не е инициализиран. Стартирай: svetlio init'));
      return;
    }

    console.log(chalk.yellow('\n🔄 Sync Push\n'));
    const result = await sync.push();
    if (result.success) {
      if (result.filesChanged.length > 0) {
        console.log(chalk.green(`\n✅ Push завършен: ${result.filesChanged.length} файла изпратени.`));
      } else {
        console.log(chalk.green('\n✅ Всичко е актуално, няма промени.'));
      }
    } else {
      console.log(chalk.red(`\n❌ ${result.message}`));
    }
  });

// svetlio sync pull
syncCommand
  .command('pull')
  .alias('изтегли')
  .description('Изтегли .memory/ от hub')
  .action(async () => {
    showBanner();
    const sync = new SyncManager(process.cwd());

    console.log(chalk.yellow('\n🔄 Sync Pull\n'));
    const result = await sync.pull();
    if (result.success) {
      if (result.filesChanged.length > 0) {
        console.log(chalk.green(`\n✅ Pull завършен: ${result.filesChanged.length} файла обновени.`));
      } else {
        console.log(chalk.green('\n✅ Всичко е актуално, няма промени.'));
      }
    } else {
      console.log(chalk.red(`\n❌ ${result.message}`));
    }
  });

// svetlio sync status
syncCommand
  .command('status')
  .alias('статус')
  .description('Покажи състоянието на синхронизацията')
  .action(async () => {
    showBanner();
    const sync = new SyncManager(process.cwd());
    await sync.status();
  });

// svetlio sync auto
syncCommand
  .command('auto')
  .alias('авто')
  .description('Включи/изключи автоматична синхронизация')
  .action(async () => {
    showBanner();
    const sync = new SyncManager(process.cwd());
    await sync.toggleAutoSync();
  });

// svetlio sync remove
syncCommand
  .command('remove')
  .alias('премахни')
  .description('Премахни проект от hub конфигурацията')
  .action(async () => {
    showBanner();
    const sync = new SyncManager(process.cwd());
    await sync.removeProject();
  });

// ----------------------------------------------------------------------------
// Интерактивен режим (без команда)
// ----------------------------------------------------------------------------
program
  .action(async () => {
    showBanner();
    
    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Какво искаш да направиш?',
      choices: [
        { name: '📁 Инициализирай нов проект (init)', value: 'init' },
        { name: '📥 Вкарай съществуващ проект (onboard)', value: 'onboard' },
        { name: '🔧 Режим ремонт (repair)', value: 'repair' },
        { name: '🔬 Дълбок анализ (analyze)', value: 'analyze' },
        { name: '📊 Покажи статус (status)', value: 'status' },
        { name: '🌐 Web Viewer (web)', value: 'web' },
        { name: '⬆️  Обнови правилата (upgrade)', value: 'upgrade' },
        { name: '📋 Клиентски заявки (requests)', value: 'requests' },
        { name: '🔄 Hub Sync (sync)', value: 'sync' },
        { name: '📝 Добави запис в лога (log)', value: 'log-prompt' },
        new inquirer.Separator('─── Инструменти ───'),
        { name: '🛠️  Каталог инструменти (tools)', value: 'tools' },
        { name: '🔍 Търси в MCP Registry (registry)', value: 'registry-search' },
        { name: '🏭 MCP Wizard (mcp-wizard)', value: 'mcp-wizard' },
        new inquirer.Separator(),
        { name: '⚙️  Глобална настройка (setup)', value: 'setup' },
        { name: '🖥️  Desktop shortcut (shortcut)', value: 'shortcut' },
        { name: '❌ Изход', value: 'exit' }
      ]
    }]);
    
    if (action === 'exit') {
      console.log(chalk.gray('Довиждане! 👋'));
      return;
    }

    // Специален случай за log (изисква input)
    if (action === 'log-prompt') {
      const { message } = await inquirer.prompt([{
        type: 'input',
        name: 'message',
        message: 'Запис в лога:',
      }]);
      if (message.trim()) {
        await program.parseAsync(['node', 'svetlio', 'log', message]);
      }
      return;
    }

    // Специален случай за registry search
    if (action === 'registry-search') {
      const { query } = await inquirer.prompt([{
        type: 'input',
        name: 'query',
        message: 'Търси в MCP Registry:',
        default: 'database'
      }]);
      const tools = new Tools();
      await tools.searchRegistry(query);
      return;
    }

    // Изпълни избраната команда
    await program.parseAsync(['node', 'svetlio', action]);
  });

// ============================================================================
// HELPERS
// ============================================================================

async function ensureGitignoreProtectsMemory(projectDir: string): Promise<'created' | 'appended' | 'unchanged'> {
  const gitignorePath = path.join(projectDir, '.gitignore');
  const block = `\n# AI_Svetlio — IRON RULE 22: dev memory не в public git (използвай svetlio sync)\n.memory/\n`;

  if (!await fs.pathExists(gitignorePath)) {
    const header = `# AI_Svetlio project — generated by \`svetlio init\`\n`;
    await fs.writeFile(gitignorePath, header + block.trimStart());
    return 'created';
  }

  const current = await fs.readFile(gitignorePath, 'utf-8');
  const hasMemoryEntry = /^\s*\.memory\/?\s*$/m.test(current);
  if (hasMemoryEntry) return 'unchanged';

  const needsNewline = current.length > 0 && !current.endsWith('\n');
  await fs.writeFile(gitignorePath, current + (needsNewline ? '\n' : '') + block.trimStart());
  return 'appended';
}

function generateGlobalRules(ide: string): string {
  return `<!-- AI_Svetlio v${VERSION} -->
# AI_Svetlio — Глобален указател за ${ide}

**ВАЖНО:** Това е **само указател**. Пълните правила за всеки проект живеят в **project CLAUDE.md**. Не дублирай правила тук — това води до context bloat (същите правила зареждани два пъти в чата).

---

## 🧠 Система за памет

Моите проекти използват **AI_Svetlio** за управление на памет и контекст.
- Паметта на всеки проект е в \`<project>/.memory/\` папката.
- Правилата на всеки проект са в \`<project>/CLAUDE.md\` — **чети първо тях, преди всичко друго**.
- Заявки и идеи се captured в \`<project>/.requests/inbox/\`.

## 📍 Session Start Ritual (стъпки)

Когато отваряш проект:

1. **Прочети \`<project>/CLAUDE.md\`** — там са IRON RULES и project-specific контекст.
2. Следвай Session Start Protocol който е дефиниран в този CLAUDE.md.

Това е всичко от този глобален файл. Пълните правила не се повтарят тук.

---

## 🛠️ Налични CLI команди (бърза справка)

\`\`\`
svetlio init        — Инициализирай нов проект (създава .memory/, CLAUDE.md, .cursorrules, .antigravity/)
svetlio upgrade     — Обнови правилата в съществуващ проект (не пипа .memory/)
svetlio sync init   — Настрой Hub Sync за споделяне на .memory/ между машини
svetlio web         — Отвори Web Viewer за .memory/
svetlio tools       — Каталог с AI инструменти
svetlio requests    — Управление на Captured Records (.requests/)
\`\`\`

Пълна документация: \`svetlio --help\` или https://github.com/ai-svetlio/ai-svetlio
`;
}

async function createProjectRules(projectDir: string): Promise<void> {
  // Съдържанието идва от единствения източник (src/rules.ts) — не се преписва тук.
  const rulesContent = projectRules(VERSION);

  for (const file of RULE_FILES) {
    const target = path.join(projectDir, file);
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(target, rulesContent);
  }
}

// ============================================================================
// RUN
// ============================================================================

program.parse();
