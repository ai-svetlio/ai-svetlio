/**
 * AI_Svetlio - Requests Module
 *
 * Управлява .requests/ папката — система за клиентски заявки.
 * Работи заедно с .memory/ но е отделна защитена зона.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface RequestSummary {
  id: string;
  date: string;
  client: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assignee: string;
  file: string;
}

export class RequestsManager {
  private projectDir: string;
  private requestsDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.requestsDir = path.join(projectDir, '.requests');
  }

  // ==========================================================================
  // ОСНОВНИ ОПЕРАЦИИ
  // ==========================================================================

  async exists(): Promise<boolean> {
    return fs.pathExists(this.requestsDir);
  }

  async initialize(projectName: string): Promise<void> {
    const templatesDir = path.join(__dirname, '..', 'templates', 'requests');
    const dateStr = new Date().toISOString().split('T')[0];

    // Създай директории
    await fs.ensureDir(this.requestsDir);
    await fs.ensureDir(path.join(this.requestsDir, 'inbox'));
    await fs.ensureDir(path.join(this.requestsDir, 'processed'));
    await fs.ensureDir(path.join(this.requestsDir, 'archive'));
    await fs.ensureDir(path.join(this.requestsDir, 'python'));

    // Копирай и адаптирай шаблони
    const filesToCopy = [
      'README.md',
      'TEMPLATE.md',
      'REGISTRY.md',
      'config.json',
      'inbox/README.md',
      'archive/README.md',
    ];

    for (const file of filesToCopy) {
      const srcPath = path.join(templatesDir, file);
      const destPath = path.join(this.requestsDir, file);

      if (await fs.pathExists(srcPath)) {
        let content = await fs.readFile(srcPath, 'utf-8');
        // Замени placeholders
        content = content.replace(/\{project_name\}/g, projectName);
        content = content.replace(/\{date\}/g, dateStr);
        await fs.ensureDir(path.dirname(destPath));
        await fs.writeFile(destPath, content);
      }
    }

    // Копирай Python инструменти
    const pythonFiles = [
      'python/process_inbox.py',
      'python/office_extractor.py',
      'python/pdf_extractor.py',
      'python/requirements.txt',
    ];

    for (const file of pythonFiles) {
      const srcPath = path.join(templatesDir, file);
      const destPath = path.join(this.requestsDir, file);

      if (await fs.pathExists(srcPath)) {
        await fs.copy(srcPath, destPath);
      }
    }
  }

  // ==========================================================================
  // INBOX ОПЕРАЦИИ
  // ==========================================================================

  async checkInbox(): Promise<string[]> {
    const inboxDir = path.join(this.requestsDir, 'inbox');

    if (!await fs.pathExists(inboxDir)) {
      return [];
    }

    const entries = await fs.readdir(inboxDir);
    // Филтрирай README.md и скрити файлове
    return entries.filter(e =>
      !e.startsWith('.') &&
      e !== 'README.md' &&
      !e.startsWith('_')
    );
  }

  async processInbox(): Promise<{ processed: string[]; errors: string[] }> {
    const inboxFiles = await this.checkInbox();
    const processed: string[] = [];
    const errors: string[] = [];

    if (inboxFiles.length === 0) {
      return { processed, errors };
    }

    // Опитай с Python първо
    const pythonAvailable = await this.checkPython();

    for (const file of inboxFiles) {
      const filePath = path.join(this.requestsDir, 'inbox', file);
      const ext = path.extname(file).toLowerCase();

      try {
        if (['.txt', '.md'].includes(ext)) {
          // TXT и MD винаги работят — четем директно
          processed.push(file);
        } else if (pythonAvailable && ['.eml', '.msg', '.docx', '.xlsx', '.pdf', '.rtf', '.doc', '.xls', '.odt'].includes(ext)) {
          // Python форматите
          await this.runPythonProcessor(filePath);
          processed.push(file);
        } else if (!pythonAvailable && !['.txt', '.md'].includes(ext)) {
          errors.push(`${file}: Python не е наличен. Инсталирай: pip install -r .requests/python/requirements.txt`);
        } else {
          errors.push(`${file}: Неподдържан формат (${ext})`);
        }
      } catch (err: any) {
        errors.push(`${file}: ${err.message}`);
      }
    }

    return { processed, errors };
  }

  // ==========================================================================
  // PYTHON BRIDGE
  // ==========================================================================

  private async checkPython(): Promise<boolean> {
    try {
      await execAsync('python --version');
      return true;
    } catch {
      try {
        await execAsync('python3 --version');
        return true;
      } catch {
        return false;
      }
    }
  }

  private async runPythonProcessor(filePath: string): Promise<string> {
    const pythonScript = path.join(this.requestsDir, 'python', 'process_inbox.py');

    if (!await fs.pathExists(pythonScript)) {
      throw new Error('process_inbox.py не е намерен в .requests/python/');
    }

    // Определи python команда
    let pythonCmd = 'python';
    try {
      await execAsync('python --version');
    } catch {
      pythonCmd = 'python3';
    }

    try {
      const { stdout, stderr } = await execAsync(
        `${pythonCmd} "${pythonScript}" --base-dir "${this.requestsDir}" --file "${filePath}"`,
        { timeout: 60000 }
      );
      return stdout;
    } catch (err: any) {
      throw new Error(`Python грешка: ${err.stderr || err.message}`);
    }
  }

  // ==========================================================================
  // REGISTRY ОПЕРАЦИИ
  // ==========================================================================

  async listRequests(): Promise<RequestSummary[]> {
    const registryPath = path.join(this.requestsDir, 'REGISTRY.md');

    if (!await fs.pathExists(registryPath)) {
      return [];
    }

    const content = await fs.readFile(registryPath, 'utf-8');
    const requests: RequestSummary[] = [];

    // Парсва таблицата "Всички заявки"
    const lines = content.split('\n');
    let inTable = false;
    let headerPassed = false;

    for (const line of lines) {
      if (line.includes('| ID | Дата |')) {
        inTable = true;
        continue;
      }

      if (inTable && line.startsWith('|---')) {
        headerPassed = true;
        continue;
      }

      if (inTable && headerPassed && line.startsWith('| CR-')) {
        const cols = line.split('|').map(c => c.trim()).filter(c => c);
        if (cols.length >= 8) {
          requests.push({
            id: cols[0],
            date: cols[1],
            client: cols[2],
            subject: cols[3],
            category: cols[4],
            priority: cols[5],
            status: cols[6],
            assignee: cols[7],
            file: cols[8] || '',
          });
        }
      }

      // Край на таблицата
      if (inTable && headerPassed && line.startsWith('---')) {
        break;
      }
    }

    return requests;
  }

  async getStats(): Promise<{ total: number; active: number; completed: number; rejected: number }> {
    const requests = await this.listRequests();
    return {
      total: requests.length,
      active: requests.filter(r =>
        ['Нова', 'Анализирана', 'В изпълнение', 'Отложена', 'нова', 'в_изпълнение', 'изчаква'].includes(r.status)
      ).length,
      completed: requests.filter(r =>
        ['Завършена', 'завършена'].includes(r.status)
      ).length,
      rejected: requests.filter(r =>
        ['Отказана', 'отказана'].includes(r.status)
      ).length,
    };
  }

  // ==========================================================================
  // FILE OPERATIONS
  // ==========================================================================

  async readFile(filename: string): Promise<string | null> {
    const filePath = path.join(this.requestsDir, filename);
    if (await fs.pathExists(filePath)) {
      return fs.readFile(filePath, 'utf-8');
    }
    return null;
  }

  async getProcessedFiles(): Promise<string[]> {
    const processedDir = path.join(this.requestsDir, 'processed');
    if (!await fs.pathExists(processedDir)) {
      return [];
    }
    const entries = await fs.readdir(processedDir);
    return entries.filter(e => e.endsWith('.md') && e.startsWith('CR-'));
  }

  async getArchivedFiles(): Promise<string[]> {
    const archiveDir = path.join(this.requestsDir, 'archive');
    if (!await fs.pathExists(archiveDir)) {
      return [];
    }
    const entries = await fs.readdir(archiveDir);
    return entries.filter(e => e.endsWith('.md') && e.startsWith('CR-'));
  }

  async archiveRequest(crId: string): Promise<void> {
    const srcPath = path.join(this.requestsDir, 'processed', `${crId}.md`);
    const destPath = path.join(this.requestsDir, 'archive', `${crId}.md`);

    if (!await fs.pathExists(srcPath)) {
      throw new Error(`Заявка ${crId} не е намерена в processed/`);
    }

    await fs.move(srcPath, destPath);
  }
}
