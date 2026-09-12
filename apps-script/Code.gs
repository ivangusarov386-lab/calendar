/**
 * Служебные скрипты для Google Таблицы «Календарь класса 9Ц».
 *
 * Установка:
 * 1. В таблице: Расширения → Apps Script.
 * 2. Стереть содержимое Code.gs, вставить этот файл целиком, сохранить.
 * 3. Обновить страницу таблицы — в меню появится пункт «Календарь».
 * 4. При первом запуске любого пункта меню Google попросит авторизовать
 *    скрипт (доступ только к этой таблице) — это нормально, разрешить.
 *
 * Этот же файл отдаёт данные календаря сайту (функция doGet ниже) — см.
 * раздел «Публикация Web App» в README.md для инструкции по развёртыванию.
 * Так сайт читает таблицу без Google Cloud Console и без API-ключа.
 */

// ID вашей таблицы (из её ссылки: .../spreadsheets/d/ЭТОТ_КУСОК/edit).
// Указан явно, а не через SpreadsheetApp.getActiveSpreadsheet() — так
// doGet() гарантированно работает с нужной таблицей независимо от того,
// как именно был создан скрипт (привязан к таблице через «Расширения»
// или как отдельный проект на script.google.com).
const SPREADSHEET_ID = '1NdaeHr4sUdYV0B6v8FSI-66SeFGXyCOpP2QeKI2E668';

function getCalendarSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

const MONTH_NAMES_RU = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

const HEADERS = ['Дата', 'Время', 'Вид мероприятия', 'Мероприятие', 'Адрес', 'Участие'];

// Список категорий мероприятий для выпадающего списка в столбце «Вид
// мероприятия». Отредактируйте под реальные категории класса — сайт
// (js/app.js, CATEGORY_COLOR_MAP) использует те же названия для закреплённых
// цветов, так что при изменении списка стоит обновить и его на сайте.
const EVENT_KINDS = ['Собрание', 'Экскурсия', 'Праздник', 'Кружок', 'Другое'];

const PARTICIPATION_VALUES = ['Да', 'Нет'];

// Расписание уроков — отдельный лист в этой же таблице (не отдельная
// таблица): тот же Web App и то же меню, без второго набора прав/ссылок.
// В отличие от «Мероприятий» строка тут не про конкретную дату, а про
// день недели + номер урока — расписание одно и то же каждую неделю.
const SCHEDULE_SHEET_NAME = 'расписание';
const SCHEDULE_HEADERS = ['День недели', '№ урока', 'Время', 'Предмет', 'Кабинет', 'Учитель', 'Замена'];
// «Замена» — свободный текст. Если заполнено, сайт показывает его вместо
// обычного урока на этой строке (с пометкой «Замена»), а исходный предмет/
// кабинет/учитель — под ним зачёркнутыми, для справки. Пусто — обычный урок,
// как всегда.
const SCHEDULE_WEEKDAYS_RU = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
// Это только число строк в стартовом шаблоне — не ограничение. Сайт и сам
// лист прекрасно работают с любым числом уроков в день: если понадобится
// больше, используйте меню «Добавить уроки к расписанию…», а не редактируйте
// эту константу задним числом (лист уже создан — она больше не применится).

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Сайт обращается сюда четырьмя способами:
// - GET {URL}?month=9 (номер месяца, 1-12) — мероприятия. Номер, а не
//   русское название — google-редирект script.google.com →
//   script.googleusercontent.com иногда портит кириллицу в query-параметрах,
//   с цифрами такой проблемы нет.
// - GET {URL}?schedule=1 — расписание уроков.
// - GET {URL}?vacations=1 — периоды каникул.
// - GET {URL}?substitutions=1 — замены на конкретную дату.
// Отдаёт { rows: [...] } — строки листа (без строки заголовка), как их
// видно в таблице (getDisplayValues, а не getValues) — это важно, иначе
// даты уедут в формат JS Date вместо "ДД.ММ.ГГГГ", который ждёт сайт.
// Если нужный лист ещё не создан — { rows: null }.
function doGet(e) {
  const params = (e && e.parameter) || {};

  if (params.schedule) {
    return jsonResponse(getScheduleRows());
  }

  if (params.vacations) {
    return jsonResponse(getVacationRows());
  }

  if (params.substitutions) {
    return jsonResponse(getSubstitutionRows());
  }

  const monthNum = parseInt(params.month || '', 10);
  const result = { rows: null };

  if (!(monthNum >= 1 && monthNum <= 12)) {
    result.error = 'unknown_month';
  } else {
    const sheetName = MONTH_NAMES_RU[monthNum - 1];
    const sheet = getCalendarSpreadsheet().getSheetByName(sheetName);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      result.rows = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getDisplayValues();
    }
  }

  return jsonResponse(result);
}

function getScheduleRows() {
  const sheet = getCalendarSpreadsheet().getSheetByName(SCHEDULE_SHEET_NAME);
  if (!sheet) return { rows: null };
  const lastRow = sheet.getLastRow();
  const rows = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, SCHEDULE_HEADERS.length).getDisplayValues();
  return { rows };
}

// «Каникулы» — отдельный лист в этой же таблице: С какого числа | До
// какого числа (обе даты включительно, ДД.ММ.ГГГГ), одна строка на период.
// Сайт красит такие дни серым в календаре и пишет «Каникулы» в расписании
// вместо уроков — см. js/app.js.
const VACATIONS_SHEET_NAME = 'каникулы';
const VACATIONS_HEADERS_COUNT = 2; // С какого числа, До какого числа

function getVacationRows() {
  const sheet = getCalendarSpreadsheet().getSheetByName(VACATIONS_SHEET_NAME);
  if (!sheet) return { rows: null };
  const lastRow = sheet.getLastRow();
  const rows = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, VACATIONS_HEADERS_COUNT).getDisplayValues();
  return { rows };
}

// «Замена» — отдельный лист в этой же таблице: Дата | Номер урока | Где
// замена, одна строка на разовую замену конкретного урока в конкретный
// день (в отличие от столбца «Замена» в самом расписании, который
// повторяется каждую неделю на этот день недели). Сайт показывает её
// поверх обычного урока в тот день — см. js/app.js.
const SUBSTITUTIONS_SHEET_NAME = 'замена';
const SUBSTITUTIONS_HEADERS_COUNT = 3; // Дата, Номер урока, Где замена

function getSubstitutionRows() {
  const sheet = getCalendarSpreadsheet().getSheetByName(SUBSTITUTIONS_SHEET_NAME);
  if (!sheet) return { rows: null };
  const lastRow = sheet.getLastRow();
  const rows = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, SUBSTITUTIONS_HEADERS_COUNT).getDisplayValues();
  return { rows };
}

// Пункт меню: включает встроенный календарь-пикер Google Таблиц в столбце
// «Дата» листа «замена» — правило проверки данных «Дата» показывает
// иконку календаря по клику на ячейку, вписывать дату руками не нужно.
// setAllowInvalid(false) — намеренно строго: нераспознанная дата в этом
// столбце тихо не покажется на сайте (не сломается, а просто не сработает
// эта замена), лучше не дать такое вписать вовсе.
function setupSubstitutionsDatePicker() {
  const ui = SpreadsheetApp.getUi();
  const sheet = getCalendarSpreadsheet().getSheetByName(SUBSTITUTIONS_SHEET_NAME);
  if (!sheet) {
    ui.alert(`Лист «${SUBSTITUTIONS_SHEET_NAME}» ещё не создан. Создайте его вручную (три столбца: Дата | Номер урока | Где замена) и запустите этот пункт меню ещё раз.`);
    return;
  }

  const dateRange = sheet.getRange(2, 1, 999, 1); // столбец «Дата», с запасом на будущие строки
  const rule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build();
  dateRange.setDataValidation(rule);
  dateRange.setNumberFormat('dd.mm.yyyy');

  ui.alert(
    `Готово! В столбце «Дата» листа «${SUBSTITUTIONS_SHEET_NAME}» теперь календарь: ` +
    'кликните на ячейку — справа появится иконка календаря, через неё и выбирайте дату.'
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Календарь')
    .addItem('Добавить лист на месяц…', 'createMonthSheetDialog')
    .addItem('Настроить проверку данных на текущем листе', 'applyValidationToActiveSheet')
    .addSeparator()
    .addItem('Создать лист расписания…', 'createScheduleSheetDialog')
    .addItem('Добавить уроки к расписанию…', 'addMoreLessonsDialog')
    .addItem('Настроить автозаполнение расписания по предмету…', 'setupScheduleAutofill')
    .addItem('Включить календарь в столбце «Дата» листа «замена»', 'setupSubstitutionsDatePicker')
    .addToUi();
}

function createScheduleSheetDialog() {
  const ui = SpreadsheetApp.getUi();
  if (getCalendarSpreadsheet().getSheetByName(SCHEDULE_SHEET_NAME)) {
    ui.alert(`Лист «${SCHEDULE_SHEET_NAME}» уже существует. Чтобы добавить ещё уроков — используйте «Добавить уроки к расписанию…».`);
    return;
  }

  const resp = ui.prompt('Расписание уроков', 'Сколько уроков в день заложить в шаблон? (не ограничение — позже можно добавить ещё)', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const lessonsPerDay = parseInt(resp.getResponseText().trim(), 10);
  if (!(lessonsPerDay >= 1 && lessonsPerDay <= 20)) {
    ui.alert('Введите число от 1 до 20.');
    return;
  }

  createScheduleSheet(lessonsPerDay);
}

function createScheduleSheet(lessonsPerDay) {
  const ss = getCalendarSpreadsheet();
  const sheet = ss.insertSheet(SCHEDULE_SHEET_NAME);
  sheet.getRange(1, 1, 1, SCHEDULE_HEADERS.length).setValues([SCHEDULE_HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  const rows = [];
  for (const day of SCHEDULE_WEEKDAYS_RU) {
    for (let lesson = 1; lesson <= lessonsPerDay; lesson++) {
      rows.push([day, lesson, '', '', '', '', '']);
    }
  }
  sheet.getRange(2, 1, rows.length, SCHEDULE_HEADERS.length).setValues(rows);

  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 70);
  sheet.setColumnWidth(3, 110);
  sheet.setColumnWidth(4, 160);
  sheet.setColumnWidth(5, 90);
  sheet.setColumnWidth(6, 160);
  sheet.setColumnWidth(7, 200);

  SpreadsheetApp.getUi().alert(
    `Лист «${SCHEDULE_SHEET_NAME}» создан: ${SCHEDULE_WEEKDAYS_RU.length} дней × ${lessonsPerDay} уроков.\n\n` +
    'Заполните «Предмет» (и по желанию «Время»/«Кабинет»/«Учитель») только для реальных уроков — ' +
    'строки с пустым «Предмет» сайт просто не покажет, лишние можно не трогать. ' +
    'Понадобится больше уроков — меню «Добавить уроки к расписанию…».'
  );
}

// Дописывает N уроков в конец каждого дня, продолжая нумерацию с текущего
// максимума — можно вызывать сколько угодно раз, если уроков снова не хватило.
function addMoreLessonsDialog() {
  const ui = SpreadsheetApp.getUi();
  const sheet = getCalendarSpreadsheet().getSheetByName(SCHEDULE_SHEET_NAME);
  if (!sheet) {
    ui.alert(`Лист «${SCHEDULE_SHEET_NAME}» ещё не создан — сначала «Создать лист расписания…».`);
    return;
  }

  const resp = ui.prompt('Добавить уроки', 'Сколько дополнительных уроков добавить в конец каждого дня?', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const extra = parseInt(resp.getResponseText().trim(), 10);
  if (!(extra >= 1 && extra <= 20)) {
    ui.alert('Введите число от 1 до 20.');
    return;
  }

  const lastRow = sheet.getLastRow();
  const existing = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // День недели, № урока
  const maxLessonByDay = {};
  for (const [day, num] of existing) {
    if (!day) continue;
    const n = parseInt(num, 10) || 0;
    if (!maxLessonByDay[day] || n > maxLessonByDay[day]) maxLessonByDay[day] = n;
  }

  const newRows = [];
  for (const day of SCHEDULE_WEEKDAYS_RU) {
    const start = (maxLessonByDay[day] || 0) + 1;
    for (let lesson = start; lesson < start + extra; lesson++) {
      newRows.push([day, lesson, '', '', '', '', '']);
    }
  }
  sheet.getRange(lastRow + 1, 1, newRows.length, SCHEDULE_HEADERS.length).setValues(newRows);

  ui.alert(`Добавлено по ${extra} урок(ов) в конец каждого из ${SCHEDULE_WEEKDAYS_RU.length} дней.`);
}

function createMonthSheetDialog() {
  const ui = SpreadsheetApp.getUi();

  const monthResp = ui.prompt('Новый месяц', 'Введите номер месяца (1-12):', ui.ButtonSet.OK_CANCEL);
  if (monthResp.getSelectedButton() !== ui.Button.OK) return;
  const monthNum = parseInt(monthResp.getResponseText().trim(), 10);
  if (!(monthNum >= 1 && monthNum <= 12)) {
    ui.alert('Некорректный номер месяца.');
    return;
  }

  const yearResp = ui.prompt('Новый месяц', 'Введите год (например, 2026):', ui.ButtonSet.OK_CANCEL);
  if (yearResp.getSelectedButton() !== ui.Button.OK) return;
  const year = parseInt(yearResp.getResponseText().trim(), 10);
  if (!(year >= 2000 && year <= 2100)) {
    ui.alert('Некорректный год.');
    return;
  }

  createMonthSheet(monthNum, year);
}

function createMonthSheet(monthNum, year) {
  const ss = getCalendarSpreadsheet();
  const sheetName = MONTH_NAMES_RU[monthNum - 1];

  if (ss.getSheetByName(sheetName)) {
    SpreadsheetApp.getUi().alert(`Лист «${sheetName}» уже существует.`);
    return;
  }

  const sheet = ss.insertSheet(sheetName);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const rows = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, '0');
    const mm = String(monthNum).padStart(2, '0');
    rows.push([`${dd}.${mm}.${year}`, '', '', '', '', '']);
  }
  sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);

  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 80);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 220);
  sheet.setColumnWidth(5, 200);
  sheet.setColumnWidth(6, 80);

  applyValidation(sheet, rows.length);

  SpreadsheetApp.getUi().alert(`Лист «${sheetName}» создан: ${rows.length} строк (по одной на каждый день).`);
}

// «Предмет» — отдельный справочник (лист) в этой же таблице: Предмет |
// ФИО учителя | Кабинет, по одной строке на предмет. Нужен, чтобы при
// выборе предмета в расписании кабинет и учитель подставлялись сами, а не
// вписывались вручную на каждом уроке.
const SUBJECT_SHEET_NAME = 'предмет';
const SUBJECT_HEADERS = ['Предмет', 'ФИО учителя', 'Кабинет'];

function getOrCreateSubjectSheet() {
  const ss = getCalendarSpreadsheet();
  let sheet = ss.getSheetByName(SUBJECT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SUBJECT_SHEET_NAME);
  }
  const firstRow = sheet.getRange(1, 1, 1, SUBJECT_HEADERS.length).getValues()[0];
  if (firstRow.join('') === '') {
    sheet.getRange(1, 1, 1, SUBJECT_HEADERS.length).setValues([SUBJECT_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 200);
    sheet.setColumnWidth(3, 100);
  }
  return sheet;
}

// Пункт меню «Настроить автозаполнение расписания по предмету…»: создаёт
// лист «предмет» (если его ещё нет), делает столбец «Предмет» в расписании
// выпадающим списком из этого справочника и сразу подставляет кабинет/
// учителя туда, где предмет уже был указан. Дальше подстановка работает
// сама — см. onEdit ниже — при каждом выборе предмета из списка.
function setupScheduleAutofill() {
  const ui = SpreadsheetApp.getUi();
  const scheduleSheet = getCalendarSpreadsheet().getSheetByName(SCHEDULE_SHEET_NAME);
  if (!scheduleSheet) {
    ui.alert(`Лист «${SCHEDULE_SHEET_NAME}» ещё не создан — сначала «Создать лист расписания…».`);
    return;
  }

  getOrCreateSubjectSheet();
  const subjectSheet = getCalendarSpreadsheet().getSheetByName(SUBJECT_SHEET_NAME);
  const subjectListRange = subjectSheet.getRange(2, 1, 999, 1); // предмет!A2:A1000

  const subjectColumnRange = scheduleSheet.getRange(2, 4, 999, 1); // расписание!D2:D1000, с запасом на будущие уроки
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(subjectListRange, true)
    .setAllowInvalid(true)
    .build();
  subjectColumnRange.setDataValidation(rule);

  // На «Учитель» могла раньше стоять своя проверка (список уже введённых
  // вручную значений) — теперь эта колонка подставляется автоматически,
  // старое правило будет только мешать (жёлтый треугольник на каждой
  // автоподставленной ячейке, если её значения нет в том старом списке).
  scheduleSheet.getRange(2, 6, 999, 1).clearDataValidations();

  backfillScheduleFromSubjects(scheduleSheet);

  ui.alert(
    'Готово!\n\n' +
    `1. На листе «${SUBJECT_SHEET_NAME}» заполните строки: Предмет, ФИО учителя, Кабинет — по одной строке на предмет.\n` +
    `2. В листе «${SCHEDULE_SHEET_NAME}» столбец «Предмет» теперь — выпадающий список из этого справочника.\n` +
    '3. При выборе предмета «Кабинет» и «Учитель» на этой же строке подставятся сами.\n\n' +
    'Если у предмета несколько параллельных групп с разными кабинетами/учителями — впишите ' +
    'нужный кабинет/учителя вручную поверх подстановки на конкретной строке, это не собьётся, ' +
    'пока вы снова не смените предмет на этой же строке.'
  );
}

// Разом подставляет кабинет/учителя туда, где предмет в расписании уже
// указан, но подстановки ещё не было (например, лист расписания заполняли
// до того, как завели справочник «предмет»).
function backfillScheduleFromSubjects(scheduleSheetParam) {
  const scheduleSheet = scheduleSheetParam || getCalendarSpreadsheet().getSheetByName(SCHEDULE_SHEET_NAME);
  if (!scheduleSheet) return;
  const lastRow = scheduleSheet.getLastRow();
  if (lastRow < 2) return;

  const subjects = getSubjectLookup();
  const subjectColumn = scheduleSheet.getRange(2, 4, lastRow - 1, 1).getValues();
  for (let i = 0; i < subjectColumn.length; i++) {
    const subject = String(subjectColumn[i][0] || '').trim();
    if (!subject || !subjects[subject]) continue;
    const row = i + 2;
    scheduleSheet.getRange(row, 5).setValue(subjects[subject].room);
    scheduleSheet.getRange(row, 6).setValue(subjects[subject].teacher);
  }
}

// { 'Физика': { teacher: 'Гусаров И.В', room: '2.36' }, ... } из листа «предмет».
function getSubjectLookup() {
  const map = {};
  const sheet = getCalendarSpreadsheet().getSheetByName(SUBJECT_SHEET_NAME);
  if (!sheet) return map;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return map;
  const values = sheet.getRange(2, 1, lastRow - 1, SUBJECT_HEADERS.length).getValues();
  for (const [subject, teacher, room] of values) {
    const key = String(subject || '').trim();
    if (!key) continue;
    map[key] = { teacher: teacher || '', room: room || '' };
  }
  return map;
}

// Простой триггер — Google запускает его сам при любом ручном изменении
// ячейки в таблице, отдельно включать не нужно. Реагирует только на
// изменение столбца «Предмет» (D) листа «расписание»: подставляет кабинет
// и учителя из листа «предмет» на этой же строке (или очищает их, если
// предмет стёрли). Работает и при вставке сразу нескольких строк в столбец.
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SCHEDULE_SHEET_NAME) return;
  if (e.range.getColumn() !== 4 || e.range.getLastColumn() !== 4) return; // только столбец «Предмет»

  const startRow = e.range.getRow();
  const numRows = e.range.getNumRows();
  const subjects = getSubjectLookup();
  const subjectValues = e.range.getValues();

  for (let i = 0; i < numRows; i++) {
    const row = startRow + i;
    if (row < 2) continue;
    const subject = String(subjectValues[i][0] || '').trim();
    if (subject && subjects[subject]) {
      sheet.getRange(row, 5).setValue(subjects[subject].room);
      sheet.getRange(row, 6).setValue(subjects[subject].teacher);
    } else if (!subject) {
      sheet.getRange(row, 5, 1, 2).clearContent();
    }
  }
}

function applyValidationToActiveSheet() {
  const sheet = getCalendarSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('На листе нет строк с данными (кроме заголовка).');
    return;
  }
  applyValidation(sheet, lastRow - 1);
  SpreadsheetApp.getUi().alert('Проверка данных настроена для столбцов «Вид мероприятия» и «Участие».');
}

function applyValidation(sheet, dayRowCount) {
  // «Вид мероприятия» — подсказка списком, но разрешаем и свой вариант
  // (setAllowInvalid(true)), чтобы не блокировать ввод новой категории.
  const kindRange = sheet.getRange(2, 3, dayRowCount, 1);
  const kindRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(EVENT_KINDS, true)
    .setAllowInvalid(true)
    .build();
  kindRange.setDataValidation(kindRule);

  // «Участие» — строго Да/Нет, от этого напрямую зависит подсветка ячеек
  // на сайте, опечатка здесь тихо ломает цвет дня.
  const participationRange = sheet.getRange(2, 6, dayRowCount, 1);
  const participationRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(PARTICIPATION_VALUES, true)
    .setAllowInvalid(false)
    .build();
  participationRange.setDataValidation(participationRule);
}
