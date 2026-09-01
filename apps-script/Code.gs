/**
 * Служебные скрипты для Google Таблицы «Календарь класса 9Ц».
 *
 * Установка:
 * 1. В таблице: Расширения → Apps Script.
 * 2. Стереть содержимое Code.gs, вставить этот файл целиком, сохранить.
 * 3. Обновить страницу таблицы — в меню появится пункт «Календарь».
 * 4. При первом запуске любого пункта меню Google попросит авторизовать
 *    скрипт (доступ только к этой таблице) — это нормально, разрешить.
 */

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

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Календарь')
    .addItem('Добавить лист на месяц…', 'createMonthSheetDialog')
    .addItem('Настроить проверку данных на текущем листе', 'applyValidationToActiveSheet')
    .addToUi();
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
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
