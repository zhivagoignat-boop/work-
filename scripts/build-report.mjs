#!/usr/bin/env node
/*
  Собирает постоянный отчёт для Claude из выгрузки приложения.

  Использование:
    node scripts/build-report.mjs                       # reports/data.json -> reports/CLAUDE_REPORT.md
    node scripts/build-report.mjs путь/к/data.json      # свой источник
    node scripts/build-report.mjs data.json out.md      # свой источник и вывод

  Выгрузка делается в приложении: вкладка «Прогресс» → «Экспорт JSON»
  (или вкладка «Отчёт» → «Данные .json»), файл кладётся в reports/data.json.
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(process.argv[2] || path.join(root, 'reports/data.json'));
const out = path.resolve(process.argv[3] || path.join(root, 'reports/CLAUDE_REPORT.md'));

if (!fs.existsSync(src)) {
  console.error('Нет файла с данными: ' + src);
  console.error('Сделай экспорт JSON в приложении и положи его сюда.');
  process.exit(1);
}

/* Грузим браузерные модули приложения в песочницу, чтобы логика отчёта была одна и та же. */
const sandbox = { console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['assets/js/data.js', 'assets/js/store.js', 'assets/js/report.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
}

const state = JSON.parse(fs.readFileSync(src, 'utf8'));
if (!state || typeof state !== 'object' || !('days' in state)) {
  console.error('Это не выгрузка приложения: в JSON нет поля "days".');
  process.exit(1);
}
/* дополняем недостающие поля структурой по умолчанию */
const base = sandbox.Store.emptyState();
for (const k of Object.keys(base)) if (!(k in state)) state[k] = base[k];

const now = process.env.REPORT_DATE || sandbox.Store.today();
const md = sandbox.Report.build(state, { now });

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md + '\n');
console.log('Отчёт обновлён: ' + path.relative(root, out) + ' (на дату ' + now + ')');
