/**
 * AI_Svetlio - Sync Module
 *
 * Синхронизация на .memory/ между машини чрез централизирано GitHub repo (hub).
 * Използва git CLI за операции (без нови npm зависимости).
 *
 * Hub структура:
 *   ~/.ai-svetlio/hub/           ← Клонирано hub repo
 *   ~/.ai-svetlio/hub-config.json ← Глобална конфигурация
 *
 * Команди:
 *   svetlio sync init        ← Първоначална настройка
 *   svetlio sync push        ← Изпрати .memory/ към hub
 *   svetlio sync pull        ← Изтегли .memory/ от hub
 *   svetlio sync status      ← Покажи състояние
 *   svetlio sync auto        ← Вкл/изкл автоматичен sync
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// INTERFACES
// ============================================================================

export interface HubConfig {
  hubRepo: string;
  hubLocalPath: string;
  autoSync: boolean;
  lastHubUpdate: string | null;
  projects: Record<string, ProjectSyncConfig>;
}

export interface ProjectSyncConfig {
  localPath: string;
  hubFolder: string;
  lastPush: string | null;
  lastPull: string | null;
}

export interface SyncResult {
  success: boolean;
  filesChanged: string[];
  message: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Файлове от .memory/ които се синхронизират */
export const SYNCABLE_FILES = [
  'STATE.md',
  'LOG.md',
  'ARCHITECTURE.md',
  'TOOLS.md',
  'TODO.md',
  'DECISIONS.md',
  'PROBLEMS.md',
  'MODE.md',
];

/** Директории от .memory/ които НЕ се синхронизират */
const EXCLUDE_DIRS = ['backups', 'analysis', 'rewrite'];

// ============================================================================
// SYNC MANAGER
// ============================================================================

export class SyncManager {
  private projectDir: string;
  private homeDir: string;
  private globalConfigDir: string;
  private hubConfigPath: string;
  private hubLocalPath: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.homeDir = process.env.HOME || process.env.USERPROFILE || '~';
    this.globalConfigDir = path.join(this.homeDir, '.ai-svetlio');
    this.hubConfigPath = path.join(this.globalConfigDir, 'hub-config.json');
    this.hubLocalPath = path.join(this.globalConfigDir, 'hub');
  }

  // --------------------------------------------------------------------------
  // CONFIG MANAGEMENT
  // --------------------------------------------------------------------------

  /** Зареди hub конфигурацията */
  async loadConfig(): Promise<HubConfig | null> {
    try {
      if (await fs.pathExists(this.hubConfigPath)) {
        const content = await fs.readFile(this.hubConfigPath, 'utf-8');
        return JSON.parse(content) as HubConfig;
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  /** Запиши hub конфигурацията */
  async saveConfig(config: HubConfig): Promise<void> {
    await fs.ensureDir(this.globalConfigDir);
    await fs.writeFile(this.hubConfigPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /** Получи името на текущия проект */
  private getProjectName(): string {
    return path.basename(this.projectDir);
  }

  /** Получи конфигурацията за текущия проект */
  private getProjectConfig(config: HubConfig): ProjectSyncConfig | null {
    const name = this.getProjectName();
    return config.projects[name] || null;
  }

  // --------------------------------------------------------------------------
  // GIT HELPERS
  // --------------------------------------------------------------------------

  /** Изпълни git команда в дадена директория */
  private async execGit(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
    const workDir = cwd || this.hubLocalPath;
    try {
      const result = await execAsync(`git ${command}`, {
        cwd: workDir,
        timeout: 30000,
      });
      return result;
    } catch (err: any) {
      throw new Error(`Git грешка: ${err.message || err}`);
    }
  }

  /** Провери дали git е наличен */
  async isGitAvailable(): Promise<boolean> {
    try {
      await execAsync('git --version', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /** Провери дали gh CLI е наличен */
  async isGhAvailable(): Promise<boolean> {
    try {
      await execAsync('gh --version', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /** Провери дали hub repo е клонирано и валидно */
  private async isHubCloned(): Promise<boolean> {
    try {
      if (!await fs.pathExists(this.hubLocalPath)) return false;
      const gitDir = path.join(this.hubLocalPath, '.git');
      return fs.pathExists(gitDir);
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // INIT HUB
  // --------------------------------------------------------------------------

  /** Първоначална настройка на hub sync */
  async initHub(): Promise<void> {
    console.log(chalk.yellow('\n🔄 Hub Sync — Първоначална настройка\n'));

    // 1. Провери git
    if (!await this.isGitAvailable()) {
      console.log(chalk.red('❌ Git не е намерен! Инсталирай git и опитай отново.'));
      console.log(chalk.gray('   Windows: https://git-scm.com/download/win'));
      console.log(chalk.gray('   Linux:   sudo apt install git'));
      console.log(chalk.gray('   macOS:   xcode-select --install'));
      return;
    }

    // 2. Провери за съществуваща конфигурация
    const existingConfig = await this.loadConfig();
    if (existingConfig) {
      const projectName = this.getProjectName();
      if (existingConfig.projects[projectName]) {
        console.log(chalk.yellow(`⚠️  Проектът "${projectName}" вече е регистриран в hub.`));
        const { action } = await inquirer.prompt([{
          type: 'list',
          name: 'action',
          message: 'Какво да направя?',
          choices: [
            { name: '🔄 Преконфигурирай проекта', value: 'reconfig' },
            { name: '📋 Покажи текущия статус', value: 'status' },
            { name: '❌ Откажи', value: 'cancel' },
          ],
        }]);

        if (action === 'cancel') return;
        if (action === 'status') {
          await this.status();
          return;
        }
        // reconfig → продължаваме напред
      } else {
        // Hub съществува, но проектът не е регистриран
        console.log(chalk.green(`✅ Hub е настроен. Добавям проект "${projectName}"...`));
        await this.registerProject(existingConfig);
        return;
      }
    }

    // 3. Избери: нов hub или съществуващ
    const { hubChoice } = await inquirer.prompt([{
      type: 'list',
      name: 'hubChoice',
      message: 'Как да настроя Hub repo?',
      choices: [
        { name: '🆕 Създай ново hub repo в GitHub', value: 'new' },
        { name: '📂 Свържи със съществуващо repo', value: 'existing' },
      ],
    }]);

    let hubRepoUrl: string;

    if (hubChoice === 'new') {
      hubRepoUrl = await this.createNewHub();
      if (!hubRepoUrl) return; // Грешка или отказ
    } else {
      // Съществуващо repo
      const { repoUrl } = await inquirer.prompt([{
        type: 'input',
        name: 'repoUrl',
        message: 'Въведи URL на hub repo (SSH или HTTPS):',
        validate: (input: string) => {
          if (!input.trim()) return 'URL е задължителен';
          if (input.includes('github.com') || input.includes('gitlab.com') || input.includes('bitbucket.org') || input.startsWith('git@') || input.startsWith('https://')) {
            return true;
          }
          return 'Въведи валиден git URL (SSH или HTTPS)';
        },
      }]);
      hubRepoUrl = repoUrl.trim();

      // Clone repo
      console.log(chalk.gray('\n  Клониране на hub repo...'));
      try {
        await fs.ensureDir(this.globalConfigDir);
        if (await fs.pathExists(this.hubLocalPath)) {
          await fs.remove(this.hubLocalPath);
        }
        await execAsync(`git clone "${hubRepoUrl}" "${this.hubLocalPath}"`, { timeout: 60000 });
        console.log(chalk.green('  ✅ Hub repo клонирано успешно!'));
      } catch (err: any) {
        console.log(chalk.red(`  ❌ Грешка при клониране: ${err.message}`));
        console.log(chalk.gray('  Провери URL и git authentication.'));
        return;
      }
    }

    // 4. Създай конфигурация
    const config: HubConfig = {
      hubRepo: hubRepoUrl,
      hubLocalPath: this.hubLocalPath,
      autoSync: false,
      lastHubUpdate: new Date().toISOString(),
      projects: {},
    };

    await this.saveConfig(config);

    // 5. Регистрирай текущия проект
    await this.registerProject(config);

    console.log(chalk.green('\n✅ Hub Sync е настроен успешно!'));
    console.log(chalk.gray(`   Hub repo: ${hubRepoUrl}`));
    console.log(chalk.gray(`   Локален path: ${this.hubLocalPath}`));
    console.log(chalk.cyan('\n  Следващи стъпки:'));
    console.log(chalk.gray('   svetlio sync push    — изпрати .memory/ към hub'));
    console.log(chalk.gray('   svetlio sync pull    — изтегли .memory/ от hub'));
    console.log(chalk.gray('   svetlio sync auto    — включи автоматичен sync'));
  }

  /** Създай ново hub repo чрез gh CLI */
  private async createNewHub(): Promise<string> {
    const hasGh = await this.isGhAvailable();

    if (!hasGh) {
      console.log(chalk.yellow('\n⚠️  GitHub CLI (gh) не е намерен.'));
      console.log(chalk.gray('  Можеш да го инсталираш: https://cli.github.com/\n'));
      console.log(chalk.cyan('  Или създай repo ръчно:'));
      console.log(chalk.gray('  1. Отвори https://github.com/new'));
      console.log(chalk.gray('  2. Създай PRIVATE repo с име "svetlio-hub"'));
      console.log(chalk.gray('  3. Копирай URL-а и стартирай: svetlio sync init\n'));

      const { manualUrl } = await inquirer.prompt([{
        type: 'input',
        name: 'manualUrl',
        message: 'Въведи URL на новосъздаденото repo (или Enter за отказ):',
      }]);

      if (!manualUrl.trim()) return '';

      // Clone the manually created repo
      console.log(chalk.gray('\n  Клониране на hub repo...'));
      try {
        await fs.ensureDir(this.globalConfigDir);
        if (await fs.pathExists(this.hubLocalPath)) {
          await fs.remove(this.hubLocalPath);
        }
        await execAsync(`git clone "${manualUrl.trim()}" "${this.hubLocalPath}"`, { timeout: 60000 });
        console.log(chalk.green('  ✅ Hub repo клонирано успешно!'));
      } catch (err: any) {
        console.log(chalk.red(`  ❌ Грешка при клониране: ${err.message}`));
        return '';
      }

      return manualUrl.trim();
    }

    // gh е наличен — създай автоматично
    const { repoName } = await inquirer.prompt([{
      type: 'input',
      name: 'repoName',
      message: 'Име на hub repo:',
      default: 'svetlio-hub',
    }]);

    console.log(chalk.gray(`\n  Създаване на private repo "${repoName}"...`));
    try {
      await fs.ensureDir(this.globalConfigDir);
      if (await fs.pathExists(this.hubLocalPath)) {
        await fs.remove(this.hubLocalPath);
      }

      // Създай repo и клонирай
      const { stdout } = await execAsync(
        `gh repo create "${repoName}" --private --clone --description "AI_Svetlio Hub - Memory sync across machines"`,
        { cwd: this.globalConfigDir, timeout: 30000 }
      );

      // Ако gh clone-ва с името на repo, преименувай
      const clonedDir = path.join(this.globalConfigDir, repoName);
      if (await fs.pathExists(clonedDir) && clonedDir !== this.hubLocalPath) {
        await fs.move(clonedDir, this.hubLocalPath);
      }

      // Създай .gitattributes за consistent line endings
      const gitattributes = '# Ensure consistent line endings for .memory/ files\n*.md text eol=lf\n*.json text eol=lf\n';
      await fs.writeFile(path.join(this.hubLocalPath, '.gitattributes'), gitattributes);

      // Създай .hub-meta.json
      const hubMeta = {
        created: new Date().toISOString(),
        tool: 'ai-svetlio',
        version: '1.0.0',
        description: 'Централизирана памет за AI проекти',
      };
      await fs.writeFile(
        path.join(this.hubLocalPath, '.hub-meta.json'),
        JSON.stringify(hubMeta, null, 2)
      );

      // Създай README
      const readme = `# 🧠 Svetlio Hub\n\nЦентрализирана памет за AI проекти, управлявана от [ai-svetlio](https://www.npmjs.com/package/ai-svetlio).\n\n## Структура\n\nВсяка папка е .memory/ на отделен проект:\n\n\`\`\`\nsvetlio-hub/\n├── project-1/     ← STATE.md, LOG.md, ...\n├── project-2/\n└── ...\n\`\`\`\n\n## Използване\n\n\`\`\`bash\nsvetlio sync push    # Изпрати промени\nsvetlio sync pull    # Изтегли промени\nsvetlio sync status  # Покажи състояние\n\`\`\`\n\n---\n*Генерирано от ai-svetlio*\n`;
      await fs.writeFile(path.join(this.hubLocalPath, 'README.md'), readme);

      // Initial commit
      await this.execGit('add -A');
      await this.execGit('commit -m "Initial hub setup by ai-svetlio"');
      await this.execGit('push -u origin main').catch(async () => {
        // Опитай с master ако main не работи
        await this.execGit('push -u origin master').catch(() => {});
      });

      // Получи URL на repo
      const { stdout: remoteUrl } = await this.execGit('remote get-url origin');
      console.log(chalk.green(`  ✅ Hub repo създадено: ${remoteUrl.trim()}`));
      return remoteUrl.trim();

    } catch (err: any) {
      console.log(chalk.red(`  ❌ Грешка при създаване: ${err.message}`));
      return '';
    }
  }

  /** Регистрирай текущия проект в hub */
  async registerProject(config?: HubConfig | null): Promise<void> {
    if (!config) {
      config = await this.loadConfig();
      if (!config) {
        console.log(chalk.red('❌ Hub не е настроен. Стартирай: svetlio sync init'));
        return;
      }
    }

    const projectName = this.getProjectName();

    // Провери дали .memory/ съществува
    const memoryDir = path.join(this.projectDir, '.memory');
    if (!await fs.pathExists(memoryDir)) {
      console.log(chalk.red(`❌ Няма .memory/ в ${this.projectDir}. Стартирай: svetlio init`));
      return;
    }

    // Попитай за hub folder име
    const { folderName } = await inquirer.prompt([{
      type: 'input',
      name: 'folderName',
      message: `Име на папката в hub за "${projectName}":`,
      default: projectName,
      validate: (input: string) => {
        if (!input.trim()) return 'Името е задължително';
        if (/[<>:"|?*]/.test(input)) return 'Невалидни символи в името';
        return true;
      },
    }]);

    // Създай папката в hub
    const hubProjectDir = path.join(this.hubLocalPath, folderName.trim());
    await fs.ensureDir(hubProjectDir);

    // Регистрирай в конфигурацията
    config.projects[projectName] = {
      localPath: this.projectDir,
      hubFolder: folderName.trim(),
      lastPush: null,
      lastPull: null,
    };

    await this.saveConfig(config);
    console.log(chalk.green(`  ✅ Проект "${projectName}" регистриран в hub (→ ${folderName.trim()}/)`));
  }

  // --------------------------------------------------------------------------
  // PUSH
  // --------------------------------------------------------------------------

  /** Изпрати .memory/ към hub */
  async push(): Promise<SyncResult> {
    const config = await this.loadConfig();
    if (!config) {
      return { success: false, filesChanged: [], message: 'Hub не е настроен. Стартирай: svetlio sync init' };
    }

    const projectName = this.getProjectName();
    const projectConfig = config.projects[projectName];
    if (!projectConfig) {
      return { success: false, filesChanged: [], message: `Проектът "${projectName}" не е регистриран. Стартирай: svetlio sync init` };
    }

    if (!await this.isHubCloned()) {
      return { success: false, filesChanged: [], message: 'Hub repo не е клонирано. Стартирай: svetlio sync init' };
    }

    const memoryDir = path.join(this.projectDir, '.memory');
    const hubProjectDir = path.join(this.hubLocalPath, projectConfig.hubFolder);

    try {
      // 1. Pull first (за да избегнем конфликти)
      console.log(chalk.gray('  ↓ Проверка за промени в hub...'));
      try {
        await this.execGit('pull --rebase');
      } catch {
        // Ако няма remote промени или repo е празно — продължаваме
      }

      // 2. Създай hub project dir ако не съществува
      await fs.ensureDir(hubProjectDir);

      // 3. Копирай syncable файлове
      const changedFiles: string[] = [];
      for (const filename of SYNCABLE_FILES) {
        const localFile = path.join(memoryDir, filename);
        const hubFile = path.join(hubProjectDir, filename);

        if (await fs.pathExists(localFile)) {
          const localContent = await fs.readFile(localFile, 'utf-8');
          let hubContent = '';
          if (await fs.pathExists(hubFile)) {
            hubContent = await fs.readFile(hubFile, 'utf-8');
          }

          if (localContent !== hubContent) {
            await fs.copy(localFile, hubFile);
            changedFiles.push(filename);
          }
        }
      }

      // 4. Ако няма промени
      if (changedFiles.length === 0) {
        return { success: true, filesChanged: [], message: 'Няма промени за изпращане.' };
      }

      // 5. Git add + commit + push
      console.log(chalk.gray(`  ↑ Изпращане на ${changedFiles.length} файла...`));
      await this.execGit('add -A');

      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const commitMsg = `sync: ${projectConfig.hubFolder} @ ${timestamp} (${changedFiles.length} files)`;
      await this.execGit(`commit -m "${commitMsg}"`);

      await this.execGit('push');

      // 6. Обнови конфигурацията
      projectConfig.lastPush = new Date().toISOString();
      config.lastHubUpdate = new Date().toISOString();
      await this.saveConfig(config);

      console.log(chalk.green(`  ✅ Push завършен: ${changedFiles.join(', ')}`));
      return { success: true, filesChanged: changedFiles, message: 'Push завършен успешно.' };

    } catch (err: any) {
      return { success: false, filesChanged: [], message: `Push грешка: ${err.message}` };
    }
  }

  // --------------------------------------------------------------------------
  // PULL
  // --------------------------------------------------------------------------

  /** Изтегли .memory/ от hub */
  async pull(): Promise<SyncResult> {
    const config = await this.loadConfig();
    if (!config) {
      return { success: false, filesChanged: [], message: 'Hub не е настроен. Стартирай: svetlio sync init' };
    }

    const projectName = this.getProjectName();
    const projectConfig = config.projects[projectName];
    if (!projectConfig) {
      return { success: false, filesChanged: [], message: `Проектът "${projectName}" не е регистриран. Стартирай: svetlio sync init` };
    }

    if (!await this.isHubCloned()) {
      return { success: false, filesChanged: [], message: 'Hub repo не е клонирано. Стартирай: svetlio sync init' };
    }

    const memoryDir = path.join(this.projectDir, '.memory');
    const hubProjectDir = path.join(this.hubLocalPath, projectConfig.hubFolder);

    try {
      // 1. Git pull
      console.log(chalk.gray('  ↓ Изтегляне от hub...'));
      await this.execGit('pull');

      // 2. Провери дали hub папката съществува
      if (!await fs.pathExists(hubProjectDir)) {
        return { success: true, filesChanged: [], message: 'Няма данни за този проект в hub (папката е празна).' };
      }

      // 3. Backup на текущи .memory/ файлове преди overwrite
      const backupDir = path.join(memoryDir, 'backups', `sync-pull-${Date.now()}`);

      // 4. Копирай файлове от hub → local
      const changedFiles: string[] = [];
      let needsBackup = false;

      for (const filename of SYNCABLE_FILES) {
        const hubFile = path.join(hubProjectDir, filename);
        const localFile = path.join(memoryDir, filename);

        if (await fs.pathExists(hubFile)) {
          const hubContent = await fs.readFile(hubFile, 'utf-8');
          let localContent = '';
          if (await fs.pathExists(localFile)) {
            localContent = await fs.readFile(localFile, 'utf-8');
          }

          if (hubContent !== localContent) {
            // Backup преди overwrite (първия файл създава backup dir)
            if (!needsBackup) {
              await fs.ensureDir(backupDir);
              needsBackup = true;
            }
            if (await fs.pathExists(localFile)) {
              await fs.copy(localFile, path.join(backupDir, filename));
            }

            await fs.writeFile(localFile, hubContent, 'utf-8');
            changedFiles.push(filename);
          }
        }
      }

      // 5. Обнови конфигурацията
      projectConfig.lastPull = new Date().toISOString();
      config.lastHubUpdate = new Date().toISOString();
      await this.saveConfig(config);

      if (changedFiles.length === 0) {
        // Изтрий празен backup dir
        if (needsBackup) {
          await fs.remove(backupDir).catch(() => {});
        }
        return { success: true, filesChanged: [], message: 'Всичко е актуално, няма промени.' };
      }

      console.log(chalk.green(`  ✅ Pull завършен: ${changedFiles.join(', ')}`));
      if (needsBackup) {
        console.log(chalk.gray(`  📦 Backup: ${path.relative(this.projectDir, backupDir)}`));
      }
      return { success: true, filesChanged: changedFiles, message: 'Pull завършен успешно.' };

    } catch (err: any) {
      return { success: false, filesChanged: [], message: `Pull грешка: ${err.message}` };
    }
  }

  // --------------------------------------------------------------------------
  // STATUS
  // --------------------------------------------------------------------------

  /** Покажи състоянието на sync */
  async status(): Promise<void> {
    const config = await this.loadConfig();

    if (!config) {
      console.log(chalk.yellow('\n⚠️  Hub Sync не е настроен.'));
      console.log(chalk.gray('   Стартирай: svetlio sync init\n'));
      return;
    }

    console.log(chalk.cyan('\n🔄 Hub Sync Статус\n'));
    console.log(chalk.gray(`  Hub repo:     ${config.hubRepo}`));
    console.log(chalk.gray(`  Локален path: ${config.hubLocalPath}`));
    console.log(chalk.gray(`  Auto-sync:    ${config.autoSync ? chalk.green('✅ Включен') : chalk.yellow('⚠️  Изключен')}`));
    console.log(chalk.gray(`  Последна промяна: ${config.lastHubUpdate || 'никога'}`));

    const projectNames = Object.keys(config.projects);
    if (projectNames.length === 0) {
      console.log(chalk.yellow('\n  Няма регистрирани проекти.'));
      return;
    }

    console.log(chalk.cyan(`\n  📂 Проекти (${projectNames.length}):\n`));

    const currentProject = this.getProjectName();

    for (const name of projectNames) {
      const proj = config.projects[name];
      const isCurrent = name === currentProject;
      const marker = isCurrent ? chalk.green(' ← текущ') : '';

      console.log(chalk.white(`  ${isCurrent ? '▶' : '○'} ${name}${marker}`));
      console.log(chalk.gray(`    Hub папка: ${proj.hubFolder}/`));
      console.log(chalk.gray(`    Път:       ${proj.localPath}`));
      console.log(chalk.gray(`    Push:      ${proj.lastPush ? this.formatTimestamp(proj.lastPush) : 'никога'}`));
      console.log(chalk.gray(`    Pull:      ${proj.lastPull ? this.formatTimestamp(proj.lastPull) : 'никога'}`));

      // Провери за локални промени
      if (isCurrent) {
        const changes = await this.getLocalChanges(config);
        if (changes.length > 0) {
          console.log(chalk.yellow(`    Непуснати промени: ${changes.join(', ')}`));
        } else {
          console.log(chalk.green(`    ✅ Синхронизиран`));
        }
      }
      console.log('');
    }
  }

  /** Форматирай timestamp за display */
  private formatTimestamp(iso: string): string {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMin < 1) return 'току-що';
      if (diffMin < 60) return `преди ${diffMin} мин`;
      if (diffHours < 24) return `преди ${diffHours} часа`;
      if (diffDays < 7) return `преди ${diffDays} дни`;

      return d.toLocaleDateString('bg-BG') + ' ' + d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }

  /** Получи списък с локални промени спрямо hub */
  private async getLocalChanges(config: HubConfig): Promise<string[]> {
    const projectName = this.getProjectName();
    const projectConfig = config.projects[projectName];
    if (!projectConfig) return [];

    const memoryDir = path.join(this.projectDir, '.memory');
    const hubProjectDir = path.join(this.hubLocalPath, projectConfig.hubFolder);
    const changes: string[] = [];

    for (const filename of SYNCABLE_FILES) {
      const localFile = path.join(memoryDir, filename);
      const hubFile = path.join(hubProjectDir, filename);

      try {
        const localExists = await fs.pathExists(localFile);
        const hubExists = await fs.pathExists(hubFile);

        if (localExists && !hubExists) {
          changes.push(`${filename} (нов)`);
        } else if (localExists && hubExists) {
          const localContent = await fs.readFile(localFile, 'utf-8');
          const hubContent = await fs.readFile(hubFile, 'utf-8');
          if (localContent !== hubContent) {
            changes.push(filename);
          }
        }
      } catch {
        // Пропусни при грешка
      }
    }

    return changes;
  }

  // --------------------------------------------------------------------------
  // AUTO-SYNC
  // --------------------------------------------------------------------------

  /** Включи/изключи автоматичен sync */
  async toggleAutoSync(): Promise<void> {
    const config = await this.loadConfig();
    if (!config) {
      console.log(chalk.red('❌ Hub не е настроен. Стартирай: svetlio sync init'));
      return;
    }

    config.autoSync = !config.autoSync;
    await this.saveConfig(config);

    if (config.autoSync) {
      console.log(chalk.green('\n✅ Auto-sync ВКЛЮЧЕН'));
      console.log(chalk.gray('   .memory/ ще се синхронизира автоматично при промени.'));
      console.log(chalk.gray('   (debounce: 30 секунди между sync операции)\n'));
    } else {
      console.log(chalk.yellow('\n⚠️  Auto-sync ИЗКЛЮЧЕН'));
      console.log(chalk.gray('   Използвай ръчно: svetlio sync push / pull\n'));
    }
  }

  // --------------------------------------------------------------------------
  // AUTO-SYNC TRIGGERS (called by Memory class)
  // --------------------------------------------------------------------------

  /** Тих auto-push (извиква се от Memory при промяна на файл) */
  async triggerAutoSyncPush(): Promise<void> {
    try {
      const config = await this.loadConfig();
      if (!config || !config.autoSync) return;

      const projectName = this.getProjectName();
      if (!config.projects[projectName]) return;

      // Тих push без console output
      const result = await this.pushSilent(config);
      if (!result.success && result.message) {
        // Запиши грешката тихо (не прекъсвай потребителя)
        // В бъдеще: log в .memory/sync-errors.log
      }
    } catch {
      // Тихо пропускане — sync не трябва да спира работата
    }
  }

  /** Тих auto-pull (извиква се при старт на сесия) */
  async triggerAutoSyncPull(): Promise<void> {
    try {
      const config = await this.loadConfig();
      if (!config || !config.autoSync) return;

      const projectName = this.getProjectName();
      if (!config.projects[projectName]) return;

      // Тих pull
      const hubProjectDir = path.join(this.hubLocalPath, config.projects[projectName].hubFolder);
      if (!await fs.pathExists(hubProjectDir)) return;

      await this.execGit('pull').catch(() => {});

      // Копирай ако има промени (тихо)
      const memoryDir = path.join(this.projectDir, '.memory');
      for (const filename of SYNCABLE_FILES) {
        const hubFile = path.join(hubProjectDir, filename);
        const localFile = path.join(memoryDir, filename);

        if (await fs.pathExists(hubFile)) {
          const hubContent = await fs.readFile(hubFile, 'utf-8');
          let localContent = '';
          if (await fs.pathExists(localFile)) {
            localContent = await fs.readFile(localFile, 'utf-8');
          }
          if (hubContent !== localContent) {
            await fs.writeFile(localFile, hubContent, 'utf-8');
          }
        }
      }

      // Обнови lastPull
      config.projects[projectName].lastPull = new Date().toISOString();
      await this.saveConfig(config);

    } catch {
      // Тихо пропускане
    }
  }

  /** Push без console output (за auto-sync) */
  private async pushSilent(config: HubConfig): Promise<SyncResult> {
    const projectName = this.getProjectName();
    const projectConfig = config.projects[projectName];
    if (!projectConfig) return { success: false, filesChanged: [], message: 'Не е регистриран' };

    const memoryDir = path.join(this.projectDir, '.memory');
    const hubProjectDir = path.join(this.hubLocalPath, projectConfig.hubFolder);

    try {
      // Pull first
      await this.execGit('pull --rebase').catch(() => {});

      await fs.ensureDir(hubProjectDir);

      // Копирай changed files
      const changedFiles: string[] = [];
      for (const filename of SYNCABLE_FILES) {
        const localFile = path.join(memoryDir, filename);
        const hubFile = path.join(hubProjectDir, filename);

        if (await fs.pathExists(localFile)) {
          const localContent = await fs.readFile(localFile, 'utf-8');
          let hubContent = '';
          if (await fs.pathExists(hubFile)) {
            hubContent = await fs.readFile(hubFile, 'utf-8');
          }
          if (localContent !== hubContent) {
            await fs.copy(localFile, hubFile);
            changedFiles.push(filename);
          }
        }
      }

      if (changedFiles.length === 0) {
        return { success: true, filesChanged: [], message: 'Няма промени' };
      }

      // Git commit + push
      await this.execGit('add -A');
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      await this.execGit(`commit -m "auto-sync: ${projectConfig.hubFolder} @ ${timestamp}"`);
      await this.execGit('push');

      projectConfig.lastPush = new Date().toISOString();
      config.lastHubUpdate = new Date().toISOString();
      await this.saveConfig(config);

      return { success: true, filesChanged: changedFiles, message: 'Auto-push завършен' };

    } catch (err: any) {
      return { success: false, filesChanged: [], message: err.message };
    }
  }

  // --------------------------------------------------------------------------
  // REMOVE PROJECT
  // --------------------------------------------------------------------------

  /** Премахни проект от hub конфигурацията */
  async removeProject(projectName?: string): Promise<void> {
    const config = await this.loadConfig();
    if (!config) {
      console.log(chalk.red('❌ Hub не е настроен.'));
      return;
    }

    const name = projectName || this.getProjectName();
    if (!config.projects[name]) {
      console.log(chalk.yellow(`⚠️  Проектът "${name}" не е регистриран в hub.`));
      return;
    }

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Премахни проект "${name}" от hub конфигурацията? (файловете в hub остават)`,
      default: false,
    }]);

    if (!confirm) return;

    delete config.projects[name];
    await this.saveConfig(config);
    console.log(chalk.green(`  ✅ Проект "${name}" премахнат от конфигурацията.`));
  }
}
