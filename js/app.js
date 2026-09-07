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

// Родительный падеж — для дат в списке ("1 сентября", а не "1 Сентябрь").
const MONTH_GENITIVE = {
  'январь': 'января', 'февраль': 'февраля', 'март': 'марта', 'апрель': 'апреля',
  'май': 'мая', 'июнь': 'июня', 'июль': 'июля', 'август': 'августа',
  'сентябрь': 'сентября', 'октябрь': 'октября', 'ноябрь': 'ноября', 'декабрь': 'декабря',
};

const MONTH_NUM = {
  'январь': 1, 'февраль': 2, 'март': 3, 'апрель': 4, 'май': 5, 'июнь': 6,
  'июль': 7, 'август': 8, 'сентябрь': 9, 'октябрь': 10, 'ноябрь': 11, 'декабрь': 12,
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Расписание уроков — те же названия дней, что в apps-script/Code.gs
// (SCHEDULE_WEEKDAYS_RU), лист «расписание».
const SCHEDULE_WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'];

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

// Расписание — GET {webAppUrl}?schedule=1, лист «расписание» (apps-script/Code.gs).
async function fetchScheduleRows() {
  const url = `${CALENDAR_CONFIG.webAppUrl}?schedule=1`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Apps Script Web App: ${res.status}`);
  }
  const json = await res.json();
  return json.rows; // null, если лист «расписание» ещё не создан
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

// «Есть обновления» отслеживается локально в браузере (localStorage) —
// у сайта нет сервера/базы, так что это именно «на этом устройстве», а не
// общее для всех, кто открывает сайт. При первом знакомстве с датой (её
// раньше не было в сохранённом снимке) baseline устанавливается тихо, без
// пометки — иначе при самом первом визите подсветились бы вообще все дни.
// Дата помечается «непросмотренной», только если её содержимое реально
// отличается от того, что было сохранено с прошлого раза; метка снимается,
// когда пользователь открывает карточку дня (см. openModal → acknowledgeDateSeen).
const SEEN_SIGNATURES_KEY = 'calendarSeenEventSignatures';
const UNSEEN_DATES_KEY = 'calendarUnseenDates';

function eventsSignature(events) {
  return JSON.stringify(events.map((e) => [e.time, e.kind, e.title, e.address, e.participation]));
}

function loadJsonFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function saveJsonToStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* приватный режим — не критично */ }
}

// Сравнивает byDate с сохранённым снимком, обновляет снимок и множество
// непросмотренных дат, возвращает те даты ИЗ ЭТОГО месяца, что сейчас
// непросмотрены (для подсветки в сетке/списке).
function diffAndTrackUpdates(byDate) {
  const signatures = loadJsonFromStorage(SEEN_SIGNATURES_KEY, {});
  const unseen = new Set(loadJsonFromStorage(UNSEEN_DATES_KEY, []));

  for (const [key, events] of byDate.entries()) {
    const sig = eventsSignature(events);
    if (!(key in signatures)) {
      signatures[key] = sig; // впервые видим эту дату — просто база для сравнения
    } else if (signatures[key] !== sig) {
      signatures[key] = sig;
      unseen.add(key);
    }
  }

  saveJsonToStorage(SEEN_SIGNATURES_KEY, signatures);
  saveJsonToStorage(UNSEEN_DATES_KEY, [...unseen]);
  updateEventsBadge(unseen);

  return unseen;
}

function updateEventsBadge(unseen) {
  const set = unseen || new Set(loadJsonFromStorage(UNSEEN_DATES_KEY, []));
  if (els.eventsUpdateDot) els.eventsUpdateDot.hidden = set.size === 0;
}

// Вызывается при открытии карточки дня — «посмотрел», точка для этой даты
// больше не показывается (пока содержимое снова не изменится).
function acknowledgeDateSeen(dateKey) {
  const unseen = new Set(loadJsonFromStorage(UNSEEN_DATES_KEY, []));
  if (!unseen.has(dateKey)) return;
  unseen.delete(dateKey);
  saveJsonToStorage(UNSEEN_DATES_KEY, [...unseen]);
  updateEventsBadge(unseen);

  const cell = els.grid.querySelector(`[data-date="${dateKey}"] .cal-update-dot`);
  if (cell) cell.remove();
  const listDot = els.list.querySelector(`[data-update-date="${dateKey}"]`);
  if (listDot) listDot.remove();
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
  view: 'grid', // 'grid' | 'list'
  section: 'events', // 'events' | 'schedule'
  scheduleDayIndex: 0, // 0..4, Пн..Пт
};

const els = {};

// Кэш ответов Apps Script: monthNum -> rows (массив) или null («лист не
// создан»). Хранится и в памяти (мгновенно при переключении месяцев в
// рамках сеанса), и в localStorage (переживает перезагрузку страницы) —
// так при открытии сайта заново не нужно ждать ответ сети: сразу
// показываются последние известные данные, а свежие тихо подгружаются
// следом и подменяют их, если что-то изменилось (см. loadAndRender).
const MONTH_CACHE_KEY = 'calendarMonthCache';
const monthDataCache = new Map(
  Object.entries(loadJsonFromStorage(MONTH_CACHE_KEY, {})).map(([k, v]) => [Number(k), v])
);

function persistMonthCache() {
  saveJsonToStorage(MONTH_CACHE_KEY, Object.fromEntries(monthDataCache));
}

function isConfigured() {
  return CALENDAR_CONFIG.webAppUrl && !CALENDAR_CONFIG.webAppUrl.startsWith('ВСТАВЬТЕ');
}

function processAndRenderMonth(rows, monthKey, monthNum, guessedYear) {
  const byDate = groupRowsByDate(rows);
  let year = guessedYear;
  const firstKey = byDate.keys().next().value;
  if (firstKey) {
    const parts = firstKey.split('.');
    if (parts.length === 3 && parts[2]) year = Number(parts[2]);
  }
  if (year !== guessedYear) renderGridSkeleton(year, monthNum, monthKey);
  const unseen = diffAndTrackUpdates(byDate);
  applyEventsToGrid(byDate, unseen);
  renderLegend(byDate);
  renderListView(byDate, year, monthNum, monthKey, unseen);
}

// Сетку рисуем сразу, не дожидаясь ответа сети — числа месяца меняются
// мгновенно по клику. Если для месяца уже есть кэш (из этого сеанса или из
// прошлого визита на сайт) — сразу же показываем его, без «Загрузка…».
// Свежий ответ от Apps Script запрашивается всегда, в фоне, и тихо
// обновляет экран, если данные изменились («устаревшее-пока-обновляем»).
async function loadAndRender() {
  const monthKey = MONTHS_ORDER[state.orderIndex];
  const monthNum = MONTH_NUM[monthKey];
  const guessedYear = guessYearForMonth(monthKey, new Date());

  els.banner.hidden = true;
  els.legend.innerHTML = '';
  renderGridSkeleton(guessedYear, monthNum, monthKey);

  const cachedRows = monthDataCache.has(monthNum) ? monthDataCache.get(monthNum) : undefined;
  const hadCache = cachedRows !== undefined;

  if (hadCache) {
    if (cachedRows === null) {
      els.banner.hidden = false;
      els.banner.textContent = `Лист «${monthKey}» ещё не заполнен.`;
      renderListPlaceholder('');
    } else {
      renderListPlaceholder('');
      try {
        processAndRenderMonth(cachedRows, monthKey, monthNum, guessedYear);
      } catch (err) {
        renderListPlaceholder('');
      }
    }
  } else {
    renderListPlaceholder('Загрузка…');
  }

  if (!isConfigured()) {
    if (!hadCache) {
      els.banner.hidden = false;
      els.banner.textContent = 'Ссылка на Apps Script Web App не настроена. Откройте js/config.js и укажите webAppUrl (см. README.md).';
      renderListPlaceholder('');
    }
    return;
  }

  if (!hadCache) setLoading(true);
  let rows;
  try {
    rows = await fetchMonthRows(monthNum);
  } catch (err) {
    setLoading(false);
    // Если уже показали кэш — молча оставляем его, свежих данных подождём в следующий раз.
    if (!hadCache && MONTHS_ORDER[state.orderIndex] === monthKey) {
      els.banner.hidden = false;
      els.banner.textContent = 'Не удалось загрузить данные из Google Таблицы. Попробуйте обновить страницу.';
      renderListPlaceholder('');
    }
    return;
  }
  setLoading(false);

  monthDataCache.set(monthNum, rows);
  persistMonthCache();

  // Если пользователь успел переключить месяц, пока шёл этот запрос —
  // не накладываем устаревший ответ поверх уже другой отрисованной сетки.
  if (MONTHS_ORDER[state.orderIndex] !== monthKey) return;

  if (rows === null) {
    els.banner.hidden = false;
    els.banner.textContent = `Лист «${monthKey}» ещё не заполнен.`;
    renderListPlaceholder('');
    return;
  }

  try {
    processAndRenderMonth(rows, monthKey, monthNum, guessedYear);
    els.banner.hidden = true;
  } catch (err) {
    els.banner.hidden = false;
    els.banner.textContent = 'Не удалось обработать данные из таблицы. Проверьте формат колонок на листе.';
    renderListPlaceholder('');
  }
}

function setLoading(isLoading) {
  els.grid.classList.toggle('is-loading', isLoading);
  els.list.classList.toggle('is-loading', isLoading);
  els.schedulePanel.classList.toggle('is-loading', isLoading);
}

// Расписание не привязано к месяцу — грузится лениво, при первом
// переключении на вкладку «Расписание». Как и мероприятия, кэшируется в
// localStorage: при открытии сайта показывается последнее известное
// расписание сразу, без ожидания, а свежий ответ Apps Script запрашивается
// в фоне и тихо обновляет экран, если что-то поменялось. Показывается по
// одному дню за раз — стрелки листают дни недели, как стрелки в
// «Мероприятиях» листают месяцы.
const SCHEDULE_CACHE_KEY = 'calendarScheduleCache';
let scheduleLoaded = false;
let scheduleByDay = null; // Map: день недели -> отсортированный массив уроков

(function hydrateScheduleFromStorage() {
  const cached = loadJsonFromStorage(SCHEDULE_CACHE_KEY, null);
  if (cached) {
    scheduleByDay = parseScheduleRows(cached);
    scheduleLoaded = true;
  }
})();

function todayScheduleDayIndex() {
  const jsDay = new Date().getDay(); // 0=Вс..6=Сб
  const mondayBased = jsDay === 0 ? 6 : jsDay - 1; // 0=Пн..6=Вс
  return mondayBased <= 4 ? mondayBased : 0; // на выходных по умолчанию — понедельник
}

function parseScheduleRows(rows) {
  const byDay = new Map();
  for (const row of rows) {
    const [day, num, time, subject, room, teacher] = row;
    if (!day || !subject || !subject.trim()) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push({
      num: parseInt(num, 10) || 0,
      time: (time || '').trim(),
      subject: subject.trim(),
      room: (room || '').trim(),
      teacher: (teacher || '').trim(),
    });
  }
  for (const lessons of byDay.values()) lessons.sort((a, b) => a.num - b.num);
  return byDay;
}

async function loadSchedule() {
  els.banner.hidden = true;
  renderScheduleDay(); // мгновенно показывает кэш, если он есть (см. hydrateScheduleFromStorage)

  if (!isConfigured()) {
    if (!scheduleLoaded) {
      els.banner.hidden = false;
      els.banner.textContent = 'Ссылка на Apps Script Web App не настроена. Откройте js/config.js и укажите webAppUrl (см. README.md).';
      renderSchedulePlaceholder('');
    }
    return;
  }

  if (!scheduleLoaded) setLoading(true);
  let rows;
  try {
    rows = await fetchScheduleRows();
  } catch (err) {
    setLoading(false);
    // Если уже показали кэш — молча оставляем его, свежее подождём в следующий раз.
    if (!scheduleLoaded) {
      els.banner.hidden = false;
      els.banner.textContent = 'Не удалось загрузить расписание. Попробуйте обновить страницу.';
      renderSchedulePlaceholder('');
    }
    return;
  }
  setLoading(false);

  if (rows === null) {
    if (!scheduleLoaded) {
      els.banner.hidden = false;
      els.banner.textContent = 'Лист «расписание» ещё не создан (меню «Календарь → Создать лист расписания» в таблице).';
      renderSchedulePlaceholder('');
    }
    return;
  }

  saveJsonToStorage(SCHEDULE_CACHE_KEY, rows);
  scheduleByDay = parseScheduleRows(rows);
  scheduleLoaded = true;
  renderScheduleDay();
}

function renderSchedulePlaceholder(message) {
  els.schedulePanel.innerHTML = '';
  if (!message) return;
  const p = document.createElement('p');
  p.className = 'list-empty';
  p.textContent = message;
  els.schedulePanel.appendChild(p);
}

// Достаёт первое время ЧЧ:ММ из строки («08:30–09:15» → 510 минут от
// полуночи). Возвращает null, если время не проставлено/не распознано —
// такой урок просто не участвует в определении «текущего».
function parseLessonStartMinutes(timeStr) {
  const match = /(\d{1,2}):(\d{2})/.exec(timeStr || '');
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

// «Текущий урок» имеет смысл только для реального сегодняшнего дня недели —
// не когда вы просто листаете расписание стрелками на другой день.
function isViewingActualToday() {
  const jsDay = new Date().getDay(); // 0=Вс..6=Сб
  if (jsDay === 0 || jsDay === 6) return false;
  return state.scheduleDayIndex === jsDay - 1; // 0=Пн..4=Пт
}

// Правило: подсвечивается последний по порядку урок, чьё время начала уже
// наступило. Пока идёт урок — подсвечен он; в перемене между уроками —
// ещё предыдущий (пока не начался следующий); после последнего урока —
// подсветка так и остаётся на нём («если уже поздно — как сейчас»). Если
// не наступило время ни одного урока (ещё раннее утро) — не подсвечивается
// ничего.
function currentLessonIndex(lessons) {
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  let best = -1;
  let bestStart = -1;
  lessons.forEach((l, i) => {
    const start = parseLessonStartMinutes(l.time);
    if (start !== null && start <= nowMinutes && start > bestStart) {
      best = i;
      bestStart = start;
    }
  });
  return best;
}

function renderScheduleDay() {
  const day = SCHEDULE_WEEKDAYS[state.scheduleDayIndex];
  els.scheduleTitle.textContent = day;

  if (!scheduleLoaded) {
    renderSchedulePlaceholder('Загрузка…');
    return;
  }

  const lessons = scheduleByDay.get(day);
  if (!lessons || !lessons.length) {
    renderSchedulePlaceholder('На этот день уроков не добавлено.');
    return;
  }

  const currentIndex = isViewingActualToday() ? currentLessonIndex(lessons) : -1;

  els.schedulePanel.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'list-day__events';
  lessons.forEach((l, i) => {
    const row = document.createElement('div');
    row.className = 'lesson-row';
    if (i === currentIndex) row.classList.add('is-current');

    const num = document.createElement('span');
    num.className = 'lesson-row__num';
    num.textContent = l.num || '·';
    row.appendChild(num);

    const main = document.createElement('div');
    main.className = 'lesson-row__main';

    const top = document.createElement('div');
    top.className = 'lesson-row__top';
    const subj = document.createElement('span');
    subj.className = 'lesson-row__subject';
    subj.textContent = l.subject;
    top.appendChild(subj);
    if (i === currentIndex) {
      const badge = document.createElement('span');
      badge.className = 'list-day__badge';
      badge.textContent = 'Сейчас';
      top.appendChild(badge);
    }
    if (l.time) {
      const time = document.createElement('span');
      time.className = 'lesson-row__time';
      time.textContent = l.time;
      top.appendChild(time);
    }
    main.appendChild(top);

    const metaParts = [l.room ? `Каб. ${l.room}` : '', l.teacher].filter(Boolean);
    if (metaParts.length) {
      const meta = document.createElement('div');
      meta.className = 'lesson-row__meta';
      meta.textContent = metaParts.join(' · ');
      main.appendChild(meta);
    }
    row.appendChild(main);
    wrap.appendChild(row);
  });
  els.schedulePanel.appendChild(wrap);
}

function switchSection(section) {
  state.section = section;
  try { localStorage.setItem('calendarSection', section); } catch (err) { /* приватный режим — не критично */ }

  const isEvents = section === 'events';

  els.sectionEventsBtn.classList.toggle('is-active', isEvents);
  els.sectionEventsBtn.setAttribute('aria-selected', String(isEvents));
  els.sectionScheduleBtn.classList.toggle('is-active', !isEvents);
  els.sectionScheduleBtn.setAttribute('aria-selected', String(!isEvents));

  els.nav.hidden = !isEvents;
  els.eventsViewSwitch.hidden = !isEvents;
  els.legend.hidden = !isEvents;
  els.panel.hidden = !(isEvents && state.view === 'grid');
  els.list.hidden = !(isEvents && state.view === 'list');
  els.scheduleNav.hidden = isEvents;
  els.schedulePanel.hidden = isEvents;

  els.banner.hidden = true;

  if (!isEvents) loadSchedule();
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
// Может вызываться несколько раз на одну и ту же сетку (сперва с кэшем,
// потом со свежими данными из сети) — поэтому сначала подчищает то, что
// сама же добавила в прошлый раз, вместо того чтобы копить дубликаты.
function applyEventsToGrid(byDate, unseen) {
  for (const [key, events] of byDate.entries()) {
    if (!events.length) continue;
    const cell = els.grid.querySelector(`[data-date="${key}"]`);
    if (!cell) continue;

    cell.querySelectorAll('.cal-update-dot, .cal-dots, .cal-participation, .cal-count').forEach((el) => el.remove());

    cell.classList.add('has-event');

    if (unseen && unseen.has(key)) {
      const updateDot = document.createElement('span');
      updateDot.className = 'cal-update-dot';
      cell.appendChild(updateDot);
    }

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
    // onclick/onkeydown (не addEventListener) — переприсваивание, а не
    // накопление, при повторном вызове на той же ячейке.
    cell.onclick = () => openModal(key, events);
    cell.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(key, events);
      }
    };
  }
}

function renderListPlaceholder(message) {
  els.list.innerHTML = '';
  if (!message) return;
  const p = document.createElement('p');
  p.className = 'list-empty';
  p.textContent = message;
  els.list.appendChild(p);
}

// Список — та же неделя/дни месяца, что и сетка, но показывает только дни
// с мероприятиями, построчно с временем/названием/категорией/участием.
// Полный адрес — по клику на строку, открывает ту же модалку, что и сетка.
function renderListView(byDate, year, monthNum, monthKey, unseen) {
  els.list.innerHTML = '';
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const todayKey = formatDateKey(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  let any = false;

  for (let day = 1; day <= daysInMonth; day++) {
    const key = formatDateKey(year, monthNum, day);
    const events = byDate.get(key);
    if (!events || !events.length) continue;
    any = true;

    const group = document.createElement('div');
    group.className = 'list-day';
    if (key === todayKey) group.classList.add('is-today');

    const header = document.createElement('div');
    header.className = 'list-day__header';
    const weekday = WEEKDAYS[(new Date(year, monthNum - 1, day).getDay() + 6) % 7];
    header.textContent = `${weekday}, ${day} ${MONTH_GENITIVE[monthKey]}`;
    if (unseen && unseen.has(key)) {
      const dot = document.createElement('span');
      dot.className = 'list-day__update-dot';
      dot.dataset.updateDate = key;
      header.appendChild(dot);
    }
    if (key === todayKey) {
      const badge = document.createElement('span');
      badge.className = 'list-day__badge';
      badge.textContent = 'Сегодня';
      header.appendChild(badge);
    }
    group.appendChild(header);

    const eventsWrap = document.createElement('div');
    eventsWrap.className = 'list-day__events';
    for (const e of events) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'list-event';
      row.style.setProperty('--event-accent', colorForCategory(e.kind));

      const time = document.createElement('span');
      time.className = 'list-event__time';
      time.textContent = e.time || '—';
      row.appendChild(time);

      const title = document.createElement('span');
      title.className = 'list-event__title';
      title.textContent = e.title;
      row.appendChild(title);

      if (e.kind) {
        const kind = document.createElement('span');
        kind.className = 'list-event__kind';
        kind.textContent = e.kind;
        kind.style.background = colorForCategory(e.kind);
        row.appendChild(kind);
      }

      if (e.participation === 'Да' || e.participation === 'Нет') {
        const p = document.createElement('span');
        p.className = `list-event__participation ${e.participation === 'Да' ? 'yes' : 'no'}`;
        p.textContent = e.participation;
        row.appendChild(p);
      }

      row.addEventListener('click', () => openModal(key, events));
      eventsWrap.appendChild(row);
    }
    group.appendChild(eventsWrap);
    els.list.appendChild(group);
  }

  if (!any) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = 'В этом месяце пока нет мероприятий.';
    els.list.appendChild(empty);
  }
}

function switchView(view) {
  state.view = view;
  try { localStorage.setItem('calendarView', view); } catch (err) { /* приватный режим — не критично */ }

  // Сетку/список показываем, только пока активен раздел «Мероприятия» —
  // переключатель видов всё равно скрыт в «Расписании», но защищаемся и
  // здесь на случай программного вызова.
  const isEvents = state.section === 'events';
  els.panel.hidden = !(isEvents && view === 'grid');
  els.list.hidden = !(isEvents && view === 'list');

  els.viewGridBtn.classList.toggle('is-active', view === 'grid');
  els.viewGridBtn.setAttribute('aria-selected', String(view === 'grid'));
  els.viewListBtn.classList.toggle('is-active', view === 'list');
  els.viewListBtn.setAttribute('aria-selected', String(view === 'list'));
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
  acknowledgeDateSeen(dateKey);

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
  els.nav = document.getElementById('cal-nav');
  els.panel = document.getElementById('cal-panel');
  els.grid = document.getElementById('cal-grid');
  els.list = document.getElementById('cal-list');
  els.scheduleNav = document.getElementById('schedule-nav');
  els.schedulePrevBtn = document.getElementById('schedule-prev');
  els.scheduleNextBtn = document.getElementById('schedule-next');
  els.scheduleTitle = document.getElementById('schedule-title');
  els.schedulePanel = document.getElementById('schedule-panel');
  els.weekdays = document.getElementById('cal-weekdays');
  els.banner = document.getElementById('cal-banner');
  els.legend = document.getElementById('cal-legend');
  els.prevBtn = document.getElementById('cal-prev');
  els.nextBtn = document.getElementById('cal-next');
  els.eventsViewSwitch = document.getElementById('events-view-switch');
  els.viewGridBtn = document.getElementById('view-grid-btn');
  els.viewListBtn = document.getElementById('view-list-btn');
  els.sectionEventsBtn = document.getElementById('section-events-btn');
  els.sectionScheduleBtn = document.getElementById('section-schedule-btn');
  els.eventsUpdateDot = document.getElementById('events-update-dot');
  els.modalOverlay = document.getElementById('modal-overlay');
  els.modalDate = document.getElementById('modal-date');
  els.modalEvents = document.getElementById('modal-events');
  els.modalClose = document.getElementById('modal-close');

  updateEventsBadge(); // восстановить точку из прошлого сеанса, если остались непросмотренные даты

  for (const wd of WEEKDAYS) {
    const el = document.createElement('div');
    el.className = 'cal-weekday';
    el.textContent = wd;
    els.weekdays.appendChild(el);
  }

  const idx = todayIndexInOrder();
  state.orderIndex = idx >= 0 ? idx : 0;
  state.scheduleDayIndex = todayScheduleDayIndex();

  let savedSection = 'events';
  try { savedSection = localStorage.getItem('calendarSection') || 'events'; } catch (err) { /* приватный режим — не критично */ }
  state.section = savedSection === 'schedule' ? 'schedule' : 'events';

  let savedView = 'grid';
  try { savedView = localStorage.getItem('calendarView') || 'grid'; } catch (err) { /* приватный режим — не критично */ }
  switchView(savedView === 'list' ? 'list' : 'grid');
  switchSection(state.section);

  els.sectionEventsBtn.addEventListener('click', () => switchSection('events'));
  els.sectionScheduleBtn.addEventListener('click', () => switchSection('schedule'));
  els.viewGridBtn.addEventListener('click', () => switchView('grid'));
  els.viewListBtn.addEventListener('click', () => switchView('list'));

  els.schedulePrevBtn.addEventListener('click', () => {
    state.scheduleDayIndex = (state.scheduleDayIndex - 1 + SCHEDULE_WEEKDAYS.length) % SCHEDULE_WEEKDAYS.length;
    renderScheduleDay();
  });
  els.scheduleNextBtn.addEventListener('click', () => {
    state.scheduleDayIndex = (state.scheduleDayIndex + 1) % SCHEDULE_WEEKDAYS.length;
    renderScheduleDay();
  });

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

  // Подсветка «текущего урока» зависит от часов — обновляем её раз в
  // минуту, пока открыт раздел «Расписание», без повторного запроса к сети.
  setInterval(() => {
    if (state.section === 'schedule') renderScheduleDay();
  }, 60000);
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

// Регистрация service worker — нужна браузеру, чтобы предложить
// "Добавить на экран" (без неё PWA не считается устанавливаемым).
// Сам service worker не кэширует данные календаря (см. sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* не критично */ });
  });
}
