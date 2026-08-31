'use strict';

// Порядок листов таблицы — учебный год: сентябрь -> август, зациклен.
const MONTHS_ORDER = [
  'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
  'январь', 'февраль', 'март', 'апрель',
  'май', 'июнь', 'июль', 'август',
];

const MONTH_TITLE = {
  'январь': 'Январь', 'февраль': 'Февраль', 'март': 'Март', 'апрель': 'Апрель',
  'май': 'Май', 'июнь': 'Июнь', 'июль': 'Июль', 'август': 'Август',
  'сентябрь': 'Сентябрь', 'октябрь': 'Октябрь', 'ноябрь': 'Ноябрь', 'декабрь': 'Декабрь',
};

const MONTH_NUM = {
  'январь': 1, 'февраль': 2, 'март': 3, 'апрель': 4, 'май': 5, 'июнь': 6,
  'июль': 7, 'август': 8, 'сентябрь': 9, 'октябрь': 10, 'ноябрь': 11, 'декабрь': 12,
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Палитра цветов для «Вида мероприятия». Цвет закрепляется за категорией
// при первом появлении и остаётся стабильным до перезагрузки страницы —
// точный список категорий и их цветов в ТЗ не зафиксирован (см. README, п.5).
const PALETTE = [
  '#4C6EF5', '#F59F00', '#12B886', '#E64980', '#7048E8',
  '#15AABF', '#FA5252', '#82C91E', '#FD7E14', '#1098AD',
];
const categoryColors = new Map();
function colorForCategory(kind) {
  if (!kind) return '#868E96';
  if (!categoryColors.has(kind)) {
    categoryColors.set(kind, PALETTE[categoryColors.size % PALETTE.length]);
  }
  return categoryColors.get(kind);
}

function todayIndexInOrder() {
  const now = new Date();
  const monthNum = now.getMonth() + 1;
  const key = Object.keys(MONTH_NUM).find((k) => MONTH_NUM[k] === monthNum);
  return MONTHS_ORDER.indexOf(key);
}

// Учебный год начинается в сентябре: сентябрь..декабрь -> текущий календарный год
// (если сейчас сентябрь-декабрь) или прошлый; январь..август -> следующий за ним.
function guessYearForMonth(monthKey, referenceDate) {
  const idx = MONTHS_ORDER.indexOf(monthKey);
  const refY = referenceDate.getFullYear();
  const refM = referenceDate.getMonth() + 1;
  const academicStartYear = refM >= 9 ? refY : refY - 1;
  return idx < 4 ? academicStartYear : academicStartYear + 1;
}

function formatDateKey(year, monthNum, day) {
  const dd = String(day).padStart(2, '0');
  const mm = String(monthNum).padStart(2, '0');
  return `${dd}.${mm}.${year}`;
}

async function fetchMonthRows(sheetName) {
  const range = `${encodeURIComponent(sheetName)}!A2:F1000`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CALENDAR_CONFIG.spreadsheetId}/values/${range}?key=${CALENDAR_CONFIG.apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) return null; // лист ещё не создан
    throw new Error(`Google Sheets API: ${res.status}`);
  }
  const json = await res.json();
  return json.values || [];
}

// Строки существуют на каждый день месяца заранее — мероприятие определяем
// по непустому полю "Мероприятие", а не по факту существования строки (см. ТЗ п.2).
function groupRowsByDate(rows) {
  const byDate = new Map();
  for (const row of rows) {
    const [dateStr, time, kind, title, address, participation] = row;
    if (!dateStr) continue;
    const hasEvent = !!(title && title.trim());
    if (!hasEvent) continue;
    if (!byDate.has(dateStr)) byDate.set(dateStr, []);
    byDate.get(dateStr).push({
      time: (time || '').trim(),
      kind: (kind || '').trim(),
      title: title.trim(),
      address: (address || '').trim(),
      participation: (participation || '').trim(),
    });
  }
  return byDate;
}

function buildDayCells(year, monthNum) {
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  let startWeekday = new Date(year, monthNum - 1, 1).getDay(); // 0=Вс
  startWeekday = startWeekday === 0 ? 6 : startWeekday - 1; // 0=Пн
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const state = {
  orderIndex: 0,
};

const els = {};

function isConfigured() {
  return CALENDAR_CONFIG.apiKey && !CALENDAR_CONFIG.apiKey.startsWith('ВСТАВЬТЕ');
}

async function loadAndRender() {
  const monthKey = MONTHS_ORDER[state.orderIndex];
  els.title.textContent = `${MONTH_TITLE[monthKey]} …`;
  els.grid.setAttribute('aria-busy', 'true');
  els.banner.hidden = true;
  els.legend.innerHTML = '';

  if (!isConfigured()) {
    els.banner.hidden = false;
    els.banner.textContent = 'API-ключ Google Sheets не настроен. Откройте js/config.js и укажите ключ (см. README.md).';
    renderGrid(guessYearForMonth(monthKey, new Date()), MONTH_NUM[monthKey], monthKey, new Map());
    return;
  }

  let rows;
  try {
    rows = await fetchMonthRows(monthKey);
  } catch (err) {
    els.banner.hidden = false;
    els.banner.textContent = 'Не удалось загрузить данные из Google Таблицы. Попробуйте обновить страницу.';
    renderGrid(guessYearForMonth(monthKey, new Date()), MONTH_NUM[monthKey], monthKey, new Map());
    return;
  }

  if (rows === null) {
    els.banner.hidden = false;
    els.banner.textContent = `Лист «${monthKey}» ещё не заполнен.`;
    renderGrid(guessYearForMonth(monthKey, new Date()), MONTH_NUM[monthKey], monthKey, new Map());
    return;
  }

  const byDate = groupRowsByDate(rows);
  let year = guessYearForMonth(monthKey, new Date());
  const firstKey = byDate.keys().next().value;
  if (firstKey) {
    const parts = firstKey.split('.');
    if (parts.length === 3 && parts[2]) year = Number(parts[2]);
  }
  renderGrid(year, MONTH_NUM[monthKey], monthKey, byDate);
  renderLegend(byDate);
}

function renderGrid(year, monthNum, monthKey, byDate) {
  els.title.textContent = `${MONTH_TITLE[monthKey]} ${year}`;
  els.grid.setAttribute('aria-busy', 'false');
  els.grid.innerHTML = '';

  for (const wd of WEEKDAYS) {
    const el = document.createElement('div');
    el.className = 'cal-weekday';
    el.textContent = wd;
    els.grid.appendChild(el);
  }

  const todayKey = formatDateKey(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const cells = buildDayCells(year, monthNum);
  for (const day of cells) {
    if (day === null) {
      const empty = document.createElement('div');
      empty.className = 'cal-cell cal-cell--empty';
      els.grid.appendChild(empty);
      continue;
    }

    const key = formatDateKey(year, monthNum, day);
    const events = byDate.get(key) || [];
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (key === todayKey) cell.classList.add('is-today');

    const num = document.createElement('div');
    num.className = 'cal-daynum';
    num.textContent = day;
    cell.appendChild(num);

    if (events.length) {
      cell.classList.add('has-event');

      const hasDa = events.some((e) => e.participation === 'Да');
      const hasNet = events.some((e) => e.participation === 'Нет');
      if (hasDa && hasNet) cell.classList.add('participation-mixed');
      else if (hasDa) cell.classList.add('participation-yes');
      else if (hasNet) cell.classList.add('participation-no');

      const dots = document.createElement('div');
      dots.className = 'cal-dots';
      const seen = new Set();
      for (const e of events) {
        if (e.kind && !seen.has(e.kind)) {
          seen.add(e.kind);
          const dot = document.createElement('span');
          dot.className = 'cal-dot';
          dot.style.background = colorForCategory(e.kind);
          dots.appendChild(dot);
        }
      }
      cell.appendChild(dots);

      if (events.length > 1) {
        const count = document.createElement('span');
        count.className = 'cal-count';
        count.textContent = String(events.length);
        cell.appendChild(count);
      }

      cell.tabIndex = 0;
      cell.setAttribute('role', 'button');
      cell.addEventListener('click', () => openModal(key, events));
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(key, events);
        }
      });
    }

    els.grid.appendChild(cell);
  }
}

function renderLegend(byDate) {
  const kinds = new Set();
  for (const events of byDate.values()) {
    for (const e of events) if (e.kind) kinds.add(e.kind);
  }
  els.legend.innerHTML = '';
  for (const kind of kinds) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = colorForCategory(kind);
    item.appendChild(dot);
    const label = document.createElement('span');
    label.textContent = kind;
    item.appendChild(label);
    els.legend.appendChild(item);
  }
}

function openModal(dateKey, events) {
  els.modalDate.textContent = dateKey;
  els.modalEvents.innerHTML = '';

  for (const e of events) {
    const card = document.createElement('div');
    card.className = 'event-card';

    const badge = document.createElement('span');
    badge.className = 'event-kind';
    badge.textContent = e.kind || 'Мероприятие';
    badge.style.background = colorForCategory(e.kind);
    card.appendChild(badge);

    const title = document.createElement('h3');
    title.textContent = e.title;
    card.appendChild(title);

    const rows = document.createElement('dl');
    rows.className = 'event-rows';
    addRow(rows, 'Время', e.time || '—');
    addRow(rows, 'Адрес', e.address || '—');
    if (e.participation) {
      const partVal = document.createElement('dd');
      partVal.textContent = e.participation;
      partVal.className = e.participation === 'Да' ? 'participation-tag yes' : e.participation === 'Нет' ? 'participation-tag no' : '';
      const dt = document.createElement('dt');
      dt.textContent = 'Участие';
      rows.appendChild(dt);
      rows.appendChild(partVal);
    }
    card.appendChild(rows);

    els.modalEvents.appendChild(card);
  }

  els.modalOverlay.hidden = false;
  requestAnimationFrame(() => els.modalOverlay.classList.add('is-open'));
}

function addRow(dl, label, value) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  dl.appendChild(dt);
  dl.appendChild(dd);
}

function closeModal() {
  els.modalOverlay.classList.remove('is-open');
  setTimeout(() => { els.modalOverlay.hidden = true; }, 200);
}

function init() {
  els.title = document.getElementById('cal-title');
  els.grid = document.getElementById('cal-grid');
  els.banner = document.getElementById('cal-banner');
  els.legend = document.getElementById('cal-legend');
  els.prevBtn = document.getElementById('cal-prev');
  els.nextBtn = document.getElementById('cal-next');
  els.modalOverlay = document.getElementById('modal-overlay');
  els.modalDate = document.getElementById('modal-date');
  els.modalEvents = document.getElementById('modal-events');
  els.modalClose = document.getElementById('modal-close');

  const idx = todayIndexInOrder();
  state.orderIndex = idx >= 0 ? idx : 0;

  els.prevBtn.addEventListener('click', () => {
    state.orderIndex = (state.orderIndex - 1 + MONTHS_ORDER.length) % MONTHS_ORDER.length;
    loadAndRender();
  });
  els.nextBtn.addEventListener('click', () => {
    state.orderIndex = (state.orderIndex + 1) % MONTHS_ORDER.length;
    loadAndRender();
  });

  els.modalClose.addEventListener('click', closeModal);
  els.modalOverlay.addEventListener('click', (e) => {
    if (e.target === els.modalOverlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.modalOverlay.hidden) closeModal();
  });

  loadAndRender();
}

document.addEventListener('DOMContentLoaded', init);
