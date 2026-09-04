#!/usr/bin/env node
/**
 * Генерира документацията от ЕДИНСТВЕНИЯ източник (src/rules.ts + package.json):
 *   - documents/IRON_RULES.md  (правилата)
 *   - версията в README.md и documents/USER_GUIDE.md
 *
 * IRON RULE 21: правилата не се преписват на ръка на второ място.
 * Каноничният текст на всяко правило идва от източника; обясненията и
 * примерите живеят в documents/rules-examples/NN.md и се вграждат тук.
 *
 * Пуска се с: npm run gen:docs   (изисква предварителен build)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { projectRules, VERSION } = require(path.join(root, 'dist', 'rules.js'));

const tpl = projectRules(VERSION);

// 1. Извади блока с IRON RULES от шаблона
const start = tpl.indexOf('## 🔒 IRON RULES');
if (start < 0) throw new Error('Блокът IRON RULES не е намерен в източника');
const end = tpl.indexOf('\n### 📍 SESSION START PROTOCOL', start);
if (end < 0) throw new Error('Краят на блока не е намерен');
const block = tpl.slice(start, end);

// 2. Разбий на групи и правила
const out = [];
let count = 0;
for (const raw of block.split('\n')) {
  const group = raw.match(/^### (.+)$/);
  if (group) { out.push('', '## ' + group[1], ''); continue; }

  const rule = raw.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s+—\s+(.+)$/);
  if (rule) {
    count++;
    const [, n, title, text] = rule;
    out.push('### ' + n + '. ' + title, '', text, '');
    const ex = path.join(root, 'documents', 'rules-examples', String(n).padStart(2, '0') + '.md');
    if (fs.existsSync(ex)) out.push(fs.readFileSync(ex, 'utf-8').trim(), '');
    continue;
  }
  // продължения на правило (напр. **Why:** / **How to apply:** при правило 22)
  if (/^\s{2,}\*\*/.test(raw)) out.push(raw.trim(), '');
}

const appendixPath = path.join(root, 'documents', 'rules-appendix.md');
const appendix = fs.existsSync(appendixPath) ? '\n---\n\n' + fs.readFileSync(appendixPath, 'utf-8').trim() + '\n' : '';

const doc = `# 🔒 SVETLIO IRON RULES v${VERSION}

**Тези правила са ЗАДЪЛЖИТЕЛНИ за всички AI агенти, работещи с AI_Svetlio.**
**Нарушаването им води до загуба на данни, счупен код и разочаровани потребители.**

> ⚠️ **Този файл се ГЕНЕРИРА.** Не го редактирай на ръка — промените се губят при следващото
> генериране. Текстът на правилата живее в \`src/rules.ts\`; обясненията и примерите —
> в \`documents/rules-examples/NN.md\`. Регенериране: \`npm run gen:docs\`.
${out.join('\n')}${appendix}`;

fs.writeFileSync(path.join(root, 'documents', 'IRON_RULES.md'), doc.replace(/\n{3,}/g, '\n\n'), 'utf-8');
console.log('✓ documents/IRON_RULES.md генериран — v' + VERSION + ', ' + count + ' правила');

// ----------------------------------------------------------------------------
// Версията в документацията се СТЕМПВА, не се пише на ръка (IRON RULE 21).
// Без това всеки bump на версията пресъздава дрейфа, който този файл лекува.
// ----------------------------------------------------------------------------
const stamps = [
  ['README.md', /(Universal AI Agent Toolkit & Project Memory v)[0-9]+\.[0-9]+\.[0-9]+/g],
  ['documents/USER_GUIDE.md', /(\*\*Версия:\*\* )[0-9]+\.[0-9]+\.[0-9]+/g],
  ['documents/USER_GUIDE.md', /(\*\*За версия на AI_Svetlio:\*\* )[0-9]+\.[0-9]+\.[0-9]+/g],
  ['documents/USER_GUIDE.md', /(# Очакван резултат: )[0-9]+\.[0-9]+\.[0-9]+/g],
];
let stamped = 0;
for (const [file, re] of stamps) {
  const fp = path.join(root, file);
  if (!fs.existsSync(fp)) continue;
  const before = fs.readFileSync(fp, 'utf-8');
  const after = before.replace(re, (_m, prefix) => prefix + VERSION);
  if (after !== before) { fs.writeFileSync(fp, after, 'utf-8'); stamped++; }
}
console.log('✓ версията стемпната v' + VERSION + ' (променени файла: ' + stamped + ')');
