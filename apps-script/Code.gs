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
const SCHEDULE_HEADERS = ['День недели', '№ урока', 'Время', 'Предмет', 'Кабинет', 'Учитель'];
const SCHEDULE_WEEKDAYS_RU = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'];
const SCHEDULE_LESSONS_PER_DAY = 7; // пустые (без «Предмет») строки сайт просто не покажет

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Сайт обращается сюда двумя способами:
// - GET {URL}?month=9 (номер месяца, 1-12) — мероприятия. Номер, а не
//   русское название — google-редирект script.google.com →
//   script.googleusercontent.com иногда портит кириллицу в query-параметрах,
//   с цифрами такой проблемы нет.
// - GET {URL}?schedule=1 — расписание уроков.
// Отдаёт { rows: [...] } — строки листа (без строки заголовка), как их
// видно в таблице (getDisplayValues, а не getValues) — это важно, иначе
// даты уедут в формат JS Date вместо "ДД.ММ.ГГГГ", который ждёт сайт.
// Если нужный лист ещё не создан — { rows: null }.
function doGet(e) {
  const params = (e && e.parameter) || {};

  if (params.schedule) {
    return jsonResponse(getScheduleRows());
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

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Календарь')
    .addItem('Добавить лист на месяц…', 'createMonthSheetDialog')
    .addItem('Настроить проверку данных на текущем листе', 'applyValidationToActiveSheet')
    .addSeparator()
    .addItem('Создать лист расписания', 'createScheduleSheet')
    .addToUi();
}

function createScheduleSheet() {
  const ss = getCalendarSpreadsheet();
  if (ss.getSheetByName(SCHEDULE_SHEET_NAME)) {
    SpreadsheetApp.getUi().alert(`Лист «${SCHEDULE_SHEET_NAME}» уже существует.`);
    return;
  }

  const sheet = ss.insertSheet(SCHEDULE_SHEET_NAME);
  sheet.getRange(1, 1, 1, SCHEDULE_HEADERS.length).setValues([SCHEDULE_HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  const rows = [];
  for (const day of SCHEDULE_WEEKDAYS_RU) {
    for (let lesson = 1; lesson <= SCHEDULE_LESSONS_PER_DAY; lesson++) {
      rows.push([day, lesson, '', '', '', '']);
    }
  }
  sheet.getRange(2, 1, rows.length, SCHEDULE_HEADERS.length).setValues(rows);

  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 70);
  sheet.setColumnWidth(3, 110);
  sheet.setColumnWidth(4, 160);
  sheet.setColumnWidth(5, 90);
  sheet.setColumnWidth(6, 160);

  SpreadsheetApp.getUi().alert(
    `Лист «${SCHEDULE_SHEET_NAME}» создан: ${SCHEDULE_WEEKDAYS_RU.length} дней × ${SCHEDULE_LESSONS_PER_DAY} уроков.\n\n` +
    'Заполните «Предмет» (и по желанию «Время»/«Кабинет»/«Учитель») только для реальных уроков — ' +
    'строки с пустым «Предмет» сайт просто не покажет, лишние можно не трогать.'
  );
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
