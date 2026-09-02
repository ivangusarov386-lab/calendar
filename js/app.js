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

// Закреплённые цвета для известных категорий «Вид мероприятия» — тот же
// список (по написанию), что и EVENT_KINDS в apps-script/Code.gs, где он
// используется для выпадающего списка на листе. Держите оба списка в
// синхроне: правите категории в таблице — обновите и цвета здесь.
const CATEGORY_COLOR_MAP = {
  'Собрание': '#3D6FE0',
  'Экскурсия': '#D2691E',
  'Праздник': '#E0A100',
  'Кружок': '#2E9E6B',
  'Другое': '#7B5EA7',
};

// Резервная палитра — для категорий, которых нет в CATEGORY_COLOR_MAP
// (например, вписанных вручную мимо выпадающего списка). Цвет закрепляется
// за такой категорией при первом появлении и остаётся стабильным до
// перезагрузки страницы.
const FALLBACK_PALETTE = [
  '#1AA6B7', '#C23B4C', '#8C9A2E', '#B8388A', '#4C5FD6',
];
const fallbackCategoryColors = new Map();
function colorForCategory(kind) {
  if (!kind) return '#868E96';
  if (CATEGORY_COLOR_MAP[kind]) return CATEGORY_COLOR_MAP[kind];
  if (!fallbackCategoryColors.has(kind)) {
    fallbackCategoryColors.set(kind, FALLBACK_PALETTE[fallbackCategoryColors.size % FALLBACK_PALETTE.length]);
  }
  return fallbackCategoryColors.get(kind);
}

// Светлая пастельная заливка на основе цвета категории — смешиваем с белым
// (а не делаем полупрозрачным), иначе на просвет лезет тёмный фон страницы
// позади ячейки и заливка выглядит мутной вместо лёгкого оттенка.
function tintWithWhite(hex, amount) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
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

// Данные читаются из Apps Script Web App (apps-script/Code.gs, функция
// doGet), развёрнутого прямо из самой таблицы — без Google Cloud Console
// и без API-ключа (см. README.md, раздел "Публикация Web App").
async function fetchMonthRows(monthNum) {
  const url = `${CALENDAR_CONFIG.webAppUrl}?month=${monthNum}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Apps Script Web App: ${res.status}`);
  }
  const json = await res.json();
  return json.rows; // null, если лист с этим названием ещё не создан
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

// Кэш ответов Apps Script на время открытой вкладки: monthNum -> rows
// (массив) или null («лист не создан»). Повторное открытие уже
// загруженного в этом сеансе месяца берёт данные отсюда, без нового
// запроса — переключение назад-вперёд становится мгновенным. При
// перезагрузке страницы кэш пуст, так что данные снова свежие «как есть».
const monthDataCache = new Map();

function isConfigured() {
  return CALENDAR_CONFIG.webAppUrl && !CALENDAR_CONFIG.webAppUrl.startsWith('ВСТАВЬТЕ');
}

// Сетку рисуем сразу, не дожидаясь ответа сети — числа месяца меняются
// мгновенно по клику; события/подсветка донакладываются следующим шагом,
// когда данные придут (см. applyEventsToGrid). Так переключение месяца не
// выглядит подвисанием, даже если Apps Script отвечает не сразу (у него
// всегда есть задержка на "холодный старт" в несколько секунд).
async function loadAndRender() {
  const monthKey = MONTHS_ORDER[state.orderIndex];
  const monthNum = MONTH_NUM[monthKey];
  const guessedYear = guessYearForMonth(monthKey, new Date());

  els.banner.hidden = true;
  els.legend.innerHTML = '';
  renderGridSkeleton(guessedYear, monthNum, monthKey);

  if (!isConfigured()) {
    els.banner.hidden = false;
    els.banner.textContent = 'Ссылка на Apps Script Web App не настроена. Откройте js/config.js и укажите webAppUrl (см. README.md).';
    return;
  }

  let rows;
  if (monthDataCache.has(monthNum)) {
    rows = monthDataCache.get(monthNum);
  } else {
    els.grid.classList.add('is-loading');
    try {
      rows = await fetchMonthRows(monthNum);
    } catch (err) {
      els.grid.classList.remove('is-loading');
      if (MONTHS_ORDER[state.orderIndex] === monthKey) {
        els.banner.hidden = false;
        els.banner.textContent = 'Не удалось загрузить данные из Google Таблицы. Попробуйте обновить страницу.';
      }
      return;
    }
    els.grid.classList.remove('is-loading');
    monthDataCache.set(monthNum, rows);
  }

  // Если пользователь успел переключить месяц, пока шёл этот запрос —
  // не накладываем устаревший ответ поверх уже другой отрисованной сетки.
  if (MONTHS_ORDER[state.orderIndex] !== monthKey) return;

  if (rows === null) {
    els.banner.hidden = false;
    els.banner.textContent = `Лист «${monthKey}» ещё не заполнен.`;
    return;
  }

  try {
    const byDate = groupRowsByDate(rows);
    let year = guessedYear;
    const firstKey = byDate.keys().next().value;
    if (firstKey) {
      const parts = firstKey.split('.');
      if (parts.length === 3 && parts[2]) year = Number(parts[2]);
    }
    if (year !== guessedYear) renderGridSkeleton(year, monthNum, monthKey);
    applyEventsToGrid(byDate);
    renderLegend(byDate);
  } catch (err) {
    els.banner.hidden = false;
    els.banner.textContent = 'Не удалось обработать данные из таблицы. Проверьте формат колонок на листе.';
  }
}

function renderGridSkeleton(year, monthNum, monthKey) {
  els.title.textContent = `${MONTH_TITLE[monthKey]} ${year}`;
  els.grid.setAttribute('aria-busy', 'false');
  els.grid.innerHTML = '';

  const todayKey = formatDateKey(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const cells = buildDayCells(year, monthNum);
  cells.forEach((day, i) => {
    const weekday = i % 7; // 0=Пн ... 5=Сб, 6=Вс
    if (day === null) {
      const empty = document.createElement('div');
      empty.className = 'cal-cell cal-cell--empty';
      els.grid.appendChild(empty);
      return;
    }

    const key = formatDateKey(year, monthNum, day);
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    cell.dataset.date = key;
    cell.style.animationDelay = `${Math.min(i, 20) * 12}ms`;
    if (weekday === 5 || weekday === 6) cell.classList.add('is-weekend');
    if (key === todayKey) cell.classList.add('is-today');

    const num = document.createElement('div');
    num.className = 'cal-daynum';
    num.textContent = day;
    cell.appendChild(num);

    els.grid.appendChild(cell);
  });
}

// Донакладывает мероприятия на уже отрисованные ячейки (без перестройки
// сетки и повторной анимации появления — только сами ячейки с событиями).
function applyEventsToGrid(byDate) {
  for (const [key, events] of byDate.entries()) {
    if (!events.length) continue;
    const cell = els.grid.querySelector(`[data-date="${key}"]`);
    if (!cell) continue;

    cell.classList.add('has-event');

    // Фон ячейки красится цветом категории «Вид мероприятия» — если за
    // день несколько разных категорий, фон делится на равные диагональные
    // полосы (как раньше делился зелёный/красный по «Участию»).
    const kindColors = [];
    const seenKinds = new Set();
    for (const e of events) {
      if (e.kind && !seenKinds.has(e.kind)) {
        seenKinds.add(e.kind);
        kindColors.push(colorForCategory(e.kind));
      }
    }
    if (!kindColors.length) kindColors.push('#8892A6');
    cell.style.background = kindColors.length === 1
      ? tintWithWhite(kindColors[0], 0.82)
      : `linear-gradient(135deg, ${kindColors.map((c, i) => `${tintWithWhite(c, 0.82)} ${(i / kindColors.length) * 100}% ${((i + 1) / kindColors.length) * 100}%`).join(', ')})`;

    const dots = document.createElement('div');
    dots.className = 'cal-dots';
    for (const c of kindColors) {
      const dot = document.createElement('span');
      dot.className = 'cal-dot';
      dot.style.background = c;
      dots.appendChild(dot);
    }
    cell.appendChild(dots);

    // «Участие» (Да/Нет) — отдельные точки снизу слева, чтобы не спорить
    // за фон ячейки с цветом категории.
    const hasDa = events.some((e) => e.participation === 'Да');
    const hasNet = events.some((e) => e.participation === 'Нет');
    if (hasDa || hasNet) {
      const marks = document.createElement('div');
      marks.className = 'cal-participation';
      if (hasDa) {
        const dot = document.createElement('span');
        dot.className = 'cal-participation-dot cal-participation-dot--yes';
        marks.appendChild(dot);
      }
      if (hasNet) {
        const dot = document.createElement('span');
        dot.className = 'cal-participation-dot cal-participation-dot--no';
        marks.appendChild(dot);
      }
      cell.appendChild(marks);
    }

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

    card.style.setProperty('--event-accent', colorForCategory(e.kind));

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
  els.weekdays = document.getElementById('cal-weekdays');
  els.banner = document.getElementById('cal-banner');
  els.legend = document.getElementById('cal-legend');
  els.prevBtn = document.getElementById('cal-prev');
  els.nextBtn = document.getElementById('cal-next');
  els.modalOverlay = document.getElementById('modal-overlay');
  els.modalDate = document.getElementById('modal-date');
  els.modalEvents = document.getElementById('modal-events');
  els.modalClose = document.getElementById('modal-close');

  for (const wd of WEEKDAYS) {
    const el = document.createElement('div');
    el.className = 'cal-weekday';
    el.textContent = wd;
    els.weekdays.appendChild(el);
  }

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

function showFatalError() {
  const title = document.getElementById('cal-title');
  const banner = document.getElementById('cal-banner');
  if (title) title.textContent = 'Ошибка загрузки';
  if (banner) {
    banner.hidden = false;
    banner.textContent = 'Не удалось загрузить календарь. Попробуйте обновить страницу.';
  }
}

window.addEventListener('error', showFatalError);
window.addEventListener('unhandledrejection', showFatalError);

document.addEventListener('DOMContentLoaded', () => {
  try {
    init();
  } catch (err) {
    showFatalError();
  }
});
