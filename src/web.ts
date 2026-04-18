/**
 * AI_Svetlio — Web Viewer
 *
 * Локален HTTP сървър за read-only преглед на .memory/ файлове.
 * Без external зависимости — използва вградения http модул на Node.js.
 */

import * as http from 'http';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';

interface MemoryFile {
  name: string;
  filename: string;
  content: string;
  icon: string;
}

const MEMORY_FILES: Array<{ filename: string; name: string; icon: string }> = [
  { filename: 'STATE.md', name: 'State', icon: '📊' },
  { filename: 'MODE.md', name: 'Mode', icon: '🔧' },
  { filename: 'TODO.md', name: 'TODO', icon: '📋' },
  { filename: 'LOG.md', name: 'Log', icon: '📝' },
  { filename: 'DECISIONS.md', name: 'Decisions', icon: '⚖️' },
  { filename: 'PROBLEMS.md', name: 'Problems', icon: '⚠️' },
  { filename: 'ARCHITECTURE.md', name: 'Architecture', icon: '🏗️' },
  { filename: 'TOOLS.md', name: 'Tools', icon: '🛠️' },
];

const REQUESTS_STATIC_FILES: Array<{ filename: string; name: string; icon: string }> = [
  { filename: 'REGISTRY.md', name: 'Registry', icon: '📑' },
];

export class WebViewer {
  private projectDir: string;
  private server: http.Server | null = null;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  async readMemoryFiles(): Promise<MemoryFile[]> {
    const memoryDir = path.join(this.projectDir, '.memory');
    const files: MemoryFile[] = [];

    for (const fileDef of MEMORY_FILES) {
      const filePath = path.join(memoryDir, fileDef.filename);
      let content = '';
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch {
        content = '*Файлът не е намерен.*';
      }
      files.push({
        name: fileDef.name,
        filename: fileDef.filename,
        content,
        icon: fileDef.icon,
      });
    }

    return files;
  }

  async readRequestsFiles(): Promise<MemoryFile[]> {
    const requestsDir = path.join(this.projectDir, '.requests');
    const files: MemoryFile[] = [];

    if (!await fs.pathExists(requestsDir)) {
      return files;
    }

    // Static files (REGISTRY.md)
    for (const fileDef of REQUESTS_STATIC_FILES) {
      const filePath = path.join(requestsDir, fileDef.filename);
      let content = '';
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch {
        content = '*Файлът не е намерен.*';
      }
      files.push({
        name: fileDef.name,
        filename: fileDef.filename,
        content,
        icon: fileDef.icon,
      });
    }

    // Dynamic: processed/*.md files
    const processedDir = path.join(requestsDir, 'processed');
    if (await fs.pathExists(processedDir)) {
      const entries = await fs.readdir(processedDir);
      const crFiles = entries.filter(e => e.endsWith('.md') && e.startsWith('CR-')).sort();
      for (const crFile of crFiles) {
        const filePath = path.join(processedDir, crFile);
        let content = '';
        try {
          content = await fs.readFile(filePath, 'utf-8');
        } catch {
          content = '*Файлът не е намерен.*';
        }
        const crId = crFile.replace('.md', '');
        files.push({
          name: crId,
          filename: `processed/${crFile}`,
          content,
          icon: '📄',
        });
      }
    }

    return files;
  }

  /** Прочети sync status от hub-config.json */
  async readSyncStatus(): Promise<any> {
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
      const configPath = path.join(homeDir, '.ai-svetlio', 'hub-config.json');

      if (!await fs.pathExists(configPath)) {
        return { configured: false };
      }

      const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      const projectName = path.basename(this.projectDir);
      const projectConfig = config.projects?.[projectName];

      return {
        configured: true,
        hubRepo: config.hubRepo || 'unknown',
        autoSync: config.autoSync || false,
        lastHubUpdate: config.lastHubUpdate || null,
        project: projectConfig ? {
          name: projectName,
          hubFolder: projectConfig.hubFolder,
          lastPush: projectConfig.lastPush || null,
          lastPull: projectConfig.lastPull || null,
        } : null,
        totalProjects: Object.keys(config.projects || {}).length,
      };
    } catch {
      return { configured: false, error: true };
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private markdownToHtml(md: string): string {
    let html = this.escapeHtml(md);
    const lines = html.split('\n');
    const result: string[] = [];
    let inCodeBlock = false;
    let inTable = false;
    let inList = false;
    let listType: 'ul' | 'ol' = 'ul';

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Code blocks
      if (line.match(/^```/)) {
        if (inCodeBlock) {
          result.push('</code></pre>');
          inCodeBlock = false;
        } else {
          if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
          if (inTable) { result.push('</table>'); inTable = false; }
          result.push('<pre><code>');
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        result.push(line);
        continue;
      }

      // Empty line — close lists/tables
      if (line.trim() === '') {
        if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        if (inTable) { result.push('</table>'); inTable = false; }
        result.push('');
        continue;
      }

      // Tables
      if (line.includes('|') && line.trim().startsWith('|')) {
        // Skip separator rows
        if (line.match(/^\|[\s\-:|]+\|$/)) continue;

        const cells = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        if (!inTable) {
          result.push('<table>');
          inTable = true;
          // First row is header
          result.push('<tr>' + cells.map(c => `<th>${this.inlineMarkdown(c.trim())}</th>`).join('') + '</tr>');
        } else {
          result.push('<tr>' + cells.map(c => `<td>${this.inlineMarkdown(c.trim())}</td>`).join('') + '</tr>');
        }
        continue;
      }

      // Close table if line doesn't contain |
      if (inTable) { result.push('</table>'); inTable = false; }

      // Headers
      const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (headerMatch) {
        if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        const level = headerMatch[1].length;
        result.push(`<h${level}>${this.inlineMarkdown(headerMatch[2])}</h${level}>`);
        continue;
      }

      // Horizontal rule
      if (line.match(/^---+$/)) {
        if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        result.push('<hr>');
        continue;
      }

      // Unordered list
      const ulMatch = line.match(/^(\s*)[-*]\s+(.*)/);
      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
          result.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        result.push(`<li>${this.inlineMarkdown(ulMatch[2])}</li>`);
        continue;
      }

      // Ordered list
      const olMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
      if (olMatch) {
        if (!inList || listType !== 'ol') {
          if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
          result.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        result.push(`<li>${this.inlineMarkdown(olMatch[2])}</li>`);
        continue;
      }

      // Close list if not a list item
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }

      // Blockquote
      if (line.startsWith('&gt; ')) {
        result.push(`<blockquote>${this.inlineMarkdown(line.substring(5))}</blockquote>`);
        continue;
      }

      // Paragraph
      result.push(`<p>${this.inlineMarkdown(line)}</p>`);
    }

    // Close open blocks
    if (inCodeBlock) result.push('</code></pre>');
    if (inList) result.push(listType === 'ul' ? '</ul>' : '</ol>');
    if (inTable) result.push('</table>');

    return result.join('\n');
  }

  private inlineMarkdown(text: string): string {
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    text = text.replace(/`(.+?)`/g, '<code class="inline">$1</code>');
    // Links
    text = text.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
    // Strikethrough
    text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Checkbox checked
    text = text.replace(/\[x\]/gi, '<span class="checkbox checked">&#9745;</span>');
    // Checkbox unchecked
    text = text.replace(/\[ \]/g, '<span class="checkbox">&#9744;</span>');
    return text;
  }

  generateHTML(files: MemoryFile[], projectName: string, requestsFiles?: MemoryFile[]): string {
    const filesJson = JSON.stringify(files.map(f => ({
      name: f.name,
      filename: f.filename,
      icon: f.icon,
    })));

    const requestsFilesJson = requestsFiles ? JSON.stringify(requestsFiles.map(f => ({
      name: f.name,
      filename: f.filename,
      icon: f.icon,
    }))) : '[]';

    const hasRequests = requestsFiles && requestsFiles.length > 0;

    const sectionsHtml = files.map((f, idx) => {
      const rendered = this.markdownToHtml(f.content);
      return `<section id="section-${idx}" class="memory-section${idx === 0 ? ' active' : ''}">${rendered}</section>`;
    }).join('\n');

    const requestsSectionsHtml = requestsFiles ? requestsFiles.map((f, idx) => {
      const rendered = this.markdownToHtml(f.content);
      return `<section id="req-section-${idx}" class="memory-section">${rendered}</section>`;
    }).join('\n') : '';

    return `<!DOCTYPE html>
<html lang="bg">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI_Svetlio — ${this.escapeHtml(projectName)}</title>
<style>
:root {
  --bg: #1a1b26;
  --bg-sidebar: #16171f;
  --bg-card: #1f2030;
  --text: #c0caf5;
  --text-dim: #565f89;
  --accent: #7aa2f7;
  --accent-hover: #89b4fa;
  --border: #292e42;
  --green: #9ece6a;
  --yellow: #e0af68;
  --red: #f7768e;
  --orange: #ff9e64;
  --purple: #bb9af7;
  --cyan: #7dcfff;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f0f0f5;
    --bg-sidebar: #e8e8ef;
    --bg-card: #ffffff;
    --text: #1a1b26;
    --text-dim: #6b7280;
    --accent: #2563eb;
    --accent-hover: #1d4ed8;
    --border: #d1d5db;
    --green: #16a34a;
    --yellow: #ca8a04;
    --red: #dc2626;
    --orange: #ea580c;
    --purple: #7c3aed;
    --cyan: #0891b2;
  }
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  background: var(--bg);
  color: var(--text);
  display: flex;
  height: 100vh;
  overflow: hidden;
}
.sidebar {
  width: 260px;
  min-width: 260px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid var(--border);
}
.sidebar-header h1 {
  font-size: 18px;
  color: var(--accent);
  margin-bottom: 4px;
}
.sidebar-header .project-name {
  font-size: 13px;
  color: var(--text-dim);
}
.sidebar-header .status {
  display: inline-block;
  margin-top: 8px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--green);
  color: #000;
  font-weight: 600;
}
.nav { padding: 12px 0; flex: 1; }
.nav-item {
  display: flex;
  align-items: center;
  padding: 10px 20px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  color: var(--text-dim);
  font-size: 14px;
  border-left: 3px solid transparent;
}
.nav-item:hover {
  background: var(--bg-card);
  color: var(--text);
}
.nav-item.active {
  background: var(--bg-card);
  color: var(--accent);
  border-left-color: var(--accent);
  font-weight: 600;
}
.nav-item .icon { margin-right: 10px; font-size: 16px; }
.nav-item .filename {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-dim);
  opacity: 0.6;
}
.sidebar-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-dim);
  text-align: center;
}
.sidebar-footer .refresh-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  margin-right: 4px;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.main {
  flex: 1;
  overflow-y: auto;
  padding: 32px 48px;
}
.memory-section { display: none; }
.memory-section.active { display: block; }
h1 { font-size: 28px; margin: 24px 0 16px; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 8px; }
h2 { font-size: 22px; margin: 20px 0 12px; color: var(--purple); }
h3 { font-size: 18px; margin: 16px 0 8px; color: var(--cyan); }
h4 { font-size: 15px; margin: 12px 0 6px; color: var(--text); }
h5, h6 { font-size: 14px; margin: 10px 0 4px; color: var(--text-dim); }
p { margin: 8px 0; line-height: 1.7; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
strong { color: var(--yellow); }
em { color: var(--text-dim); font-style: italic; }
del { color: var(--text-dim); text-decoration: line-through; }
hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
ul, ol { margin: 8px 0 8px 24px; line-height: 1.8; }
li { margin: 2px 0; }
blockquote {
  border-left: 3px solid var(--accent);
  padding: 8px 16px;
  margin: 12px 0;
  background: var(--bg-card);
  border-radius: 0 6px 6px 0;
  color: var(--text-dim);
}
pre {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
  margin: 12px 0;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.5;
}
code { font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace; }
code.inline {
  background: var(--bg-card);
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  color: var(--orange);
}
table {
  border-collapse: collapse;
  margin: 12px 0;
  width: 100%;
  font-size: 14px;
}
th, td {
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
}
th {
  background: var(--bg-card);
  font-weight: 600;
  color: var(--accent);
}
tr:nth-child(even) td { background: var(--bg-card); }
.checkbox { font-size: 16px; margin-right: 4px; }
.checkbox.checked { color: var(--green); }
@media (max-width: 768px) {
  body { flex-direction: column; }
  .sidebar {
    width: 100%;
    min-width: 100%;
    height: auto;
    max-height: 40vh;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
  .main { padding: 16px; }
}
</style>
</head>
<body>
<div class="sidebar">
  <div class="sidebar-header">
    <h1>AI_Svetlio</h1>
    <div class="project-name">${this.escapeHtml(projectName)}</div>
    <span class="status">LIVE</span>
  </div>
  <nav class="nav" id="nav"></nav>
  <div id="sync-status" class="sync-status" style="padding: 8px 16px; font-size: 11px; color: var(--text-dim); border-top: 1px solid var(--border); display: none;">
    <div style="font-weight: 600; margin-bottom: 4px;">🔄 Hub Sync</div>
    <div id="sync-info"></div>
  </div>
  <div class="sidebar-footer">
    <span class="refresh-dot"></span> Auto-refresh: 5s
  </div>
</div>
<div class="main" id="main">
${sectionsHtml}
${requestsSectionsHtml}
</div>
<script>
const FILES = ${filesJson};
const REQ_FILES = ${requestsFilesJson};
const HAS_REQUESTS = ${hasRequests ? 'true' : 'false'};
const nav = document.getElementById('nav');
let activeIdx = 0;
let activeType = 'memory'; // 'memory' or 'requests'

function buildNav() {
  nav.innerHTML = '';

  // Memory section header
  const memHeader = document.createElement('div');
  memHeader.className = 'nav-header';
  memHeader.innerHTML = '🧠 Memory';
  memHeader.style.cssText = 'padding: 8px 20px; font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; font-weight: 600;';
  nav.appendChild(memHeader);

  FILES.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'nav-item' + (activeType === 'memory' && i === activeIdx ? ' active' : '');
    item.innerHTML = '<span class="icon">' + f.icon + '</span>' + f.name + '<span class="filename">' + f.filename + '</span>';
    item.onclick = () => switchSection('memory', i);
    nav.appendChild(item);
  });

  if (HAS_REQUESTS && REQ_FILES.length > 0) {
    // Separator
    const sep = document.createElement('div');
    sep.style.cssText = 'border-top: 1px solid var(--border); margin: 8px 0;';
    nav.appendChild(sep);

    // Requests section header
    const reqHeader = document.createElement('div');
    reqHeader.className = 'nav-header';
    reqHeader.innerHTML = '📋 Заявки (' + REQ_FILES.length + ')';
    reqHeader.style.cssText = 'padding: 8px 20px; font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; font-weight: 600;';
    nav.appendChild(reqHeader);

    REQ_FILES.forEach((f, i) => {
      const item = document.createElement('div');
      item.className = 'nav-item' + (activeType === 'requests' && i === activeIdx ? ' active' : '');
      item.innerHTML = '<span class="icon">' + f.icon + '</span>' + f.name + '<span class="filename">' + f.filename + '</span>';
      item.onclick = () => switchSection('requests', i);
      nav.appendChild(item);
    });
  }
}

function switchSection(type, idx) {
  // Hide all
  document.querySelectorAll('.memory-section').forEach(s => s.classList.remove('active'));
  // Show selected
  if (type === 'memory') {
    const section = document.getElementById('section-' + idx);
    if (section) section.classList.add('active');
  } else {
    const section = document.getElementById('req-section-' + idx);
    if (section) section.classList.add('active');
  }
  activeIdx = idx;
  activeType = type;
  buildNav();
}

buildNav();

// Initial sync status load
(async () => {
  try {
    const syncRes = await fetch('/api/sync');
    if (syncRes.ok) {
      const syncData = await syncRes.json();
      const syncEl = document.getElementById('sync-status');
      const syncInfo = document.getElementById('sync-info');
      if (syncEl && syncInfo && syncData.configured) {
        syncEl.style.display = 'block';
        const autoLabel = syncData.autoSync ? '<span style="color:#4ade80">ON</span>' : '<span style="color:#fbbf24">OFF</span>';
        const lastPush = syncData.project?.lastPush ? new Date(syncData.project.lastPush).toLocaleString('bg-BG') : 'никога';
        const lastPull = syncData.project?.lastPull ? new Date(syncData.project.lastPull).toLocaleString('bg-BG') : 'никога';
        syncInfo.innerHTML = 'Auto: ' + autoLabel + '<br>Push: ' + lastPush + '<br>Pull: ' + lastPull + '<br>Проекти: ' + syncData.totalProjects;
      }
    }
  } catch {}
})();

// Auto-refresh
setInterval(async () => {
  try {
    const res = await fetch('/api/memory');
    if (!res.ok) return;
    const data = await res.json();
    data.forEach((file, i) => {
      const section = document.getElementById('section-' + i);
      if (section) section.innerHTML = file.html;
    });

    if (HAS_REQUESTS) {
      const reqRes = await fetch('/api/requests');
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        reqData.forEach((file, i) => {
          const section = document.getElementById('req-section-' + i);
          if (section) section.innerHTML = file.html;
        });
      }
    }

    // Sync status refresh
    const syncRes = await fetch('/api/sync');
    if (syncRes.ok) {
      const syncData = await syncRes.json();
      const syncEl = document.getElementById('sync-status');
      const syncInfo = document.getElementById('sync-info');
      if (syncEl && syncInfo && syncData.configured) {
        syncEl.style.display = 'block';
        const autoLabel = syncData.autoSync ? '<span style="color:#4ade80">ON</span>' : '<span style="color:#fbbf24">OFF</span>';
        const lastPush = syncData.project?.lastPush ? new Date(syncData.project.lastPush).toLocaleString('bg-BG') : 'никога';
        const lastPull = syncData.project?.lastPull ? new Date(syncData.project.lastPull).toLocaleString('bg-BG') : 'никога';
        syncInfo.innerHTML = 'Auto: ' + autoLabel + '<br>Push: ' + lastPush + '<br>Pull: ' + lastPull + '<br>Проекти: ' + syncData.totalProjects;
      } else if (syncEl) {
        syncEl.style.display = 'none';
      }
    }
  } catch {}
}, 5000);
</script>
</body>
</html>`;
  }

  async start(port: number = 3847, host: string = 'localhost'): Promise<void> {
    const memoryDir = path.join(this.projectDir, '.memory');
    if (!await fs.pathExists(memoryDir)) {
      throw new Error('Няма .memory/ папка в този проект. Използвай: svetlio init');
    }

    // Get project name from STATE.md
    let projectName = path.basename(this.projectDir);
    try {
      const state = await fs.readFile(path.join(memoryDir, 'STATE.md'), 'utf-8');
      const match = state.match(/##\s+Проект:\s+(.+)/);
      if (match) projectName = match[1].trim();
    } catch {}

    this.server = http.createServer(async (req, res) => {
      try {
        if (req.url === '/api/memory') {
          const files = await this.readMemoryFiles();
          const data = files.map(f => ({
            name: f.name,
            filename: f.filename,
            icon: f.icon,
            html: this.markdownToHtml(f.content),
          }));
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(data));
          return;
        }

        if (req.url === '/api/requests') {
          const requestsFiles = await this.readRequestsFiles();
          const data = requestsFiles.map(f => ({
            name: f.name,
            filename: f.filename,
            icon: f.icon,
            html: this.markdownToHtml(f.content),
          }));
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(data));
          return;
        }

        if (req.url === '/api/sync') {
          const syncData = await this.readSyncStatus();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(syncData));
          return;
        }

        // Serve main page
        const files = await this.readMemoryFiles();
        const requestsFiles = await this.readRequestsFiles();
        const html = this.generateHTML(files, projectName, requestsFiles);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error: ' + err.message);
      }
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(port, host, () => {
        resolve();
      });
      this.server!.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Порт ${port} е зает. Опитай с --port <друг порт>`));
        } else {
          reject(err);
        }
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  openBrowser(url: string): void {
    const platform = process.platform;
    let cmd: string;
    if (platform === 'win32') {
      cmd = `start "" "${url}"`;
    } else if (platform === 'darwin') {
      cmd = `open "${url}"`;
    } else {
      cmd = `xdg-open "${url}"`;
    }
    exec(cmd, () => {});
  }

  static async createLauncher(projectDir: string): Promise<string> {
    const platform = process.platform;
    let filename: string;
    let content: string;

    if (platform === 'win32') {
      filename = 'open-memory.bat';
      content = `@echo off\r\ntitle AI_Svetlio - Memory Viewer\r\necho.\r\necho   Starting AI_Svetlio Web Viewer...\r\necho.\r\ncd /d "%~dp0"\r\nnpx svetlio web\r\npause\r\n`;
    } else {
      filename = 'open-memory.sh';
      content = `#!/bin/sh\necho ""\necho "  Starting AI_Svetlio Web Viewer..."\necho ""\ncd "$(dirname "$0")"\nnpx svetlio web\n`;
    }

    const filePath = path.join(projectDir, filename);
    await fs.writeFile(filePath, content);

    // Make executable on unix
    if (platform !== 'win32') {
      await fs.chmod(filePath, '755');
    }

    return filename;
  }

  static async createDesktopShortcut(projectDir: string): Promise<string> {
    const platform = process.platform;
    const projectName = path.basename(projectDir);

    if (platform === 'win32') {
      const desktop = path.join(process.env.USERPROFILE || process.env.HOME || '~', 'Desktop');
      const shortcutPath = path.join(desktop, `Svetlio - ${projectName}.bat`);
      const content = `@echo off\r\ntitle AI_Svetlio - ${projectName}\r\ncd /d "${projectDir}"\r\nnpx svetlio web\r\npause\r\n`;
      await fs.writeFile(shortcutPath, content);
      return shortcutPath;
    } else if (platform === 'linux') {
      const desktop = path.join(process.env.HOME || '~', 'Desktop');
      await fs.ensureDir(desktop);
      const shortcutPath = path.join(desktop, `svetlio-${projectName}.desktop`);
      const content = `[Desktop Entry]
Type=Application
Name=Svetlio - ${projectName}
Comment=AI_Svetlio Memory Viewer
Exec=sh -c 'cd "${projectDir}" && npx svetlio web'
Terminal=true
Categories=Development;
`;
      await fs.writeFile(shortcutPath, content);
      await fs.chmod(shortcutPath, '755');
      return shortcutPath;
    } else {
      // macOS — create a shell script on Desktop
      const desktop = path.join(process.env.HOME || '~', 'Desktop');
      const shortcutPath = path.join(desktop, `Svetlio - ${projectName}.command`);
      const content = `#!/bin/sh\ncd "${projectDir}"\nnpx svetlio web\n`;
      await fs.writeFile(shortcutPath, content);
      await fs.chmod(shortcutPath, '755');
      return shortcutPath;
    }
  }
}
