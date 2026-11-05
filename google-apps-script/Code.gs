/**
 * Приём заявок «Команда КофеДней» в Google Таблицу.
 *
 * Установка (один раз):
 *  1. Создайте Google Таблицу → Расширения → Apps Script.
 *  2. Вставьте этот файл целиком вместо содержимого Code.gs, сохраните.
 *  3. Выполните функцию setup() (кнопка ▶) и разрешите доступ к таблице.
 *  4. Развернуть → Новое развёртывание → Тип «Веб-приложение»:
 *       Запуск от имени: «Я»;  У кого есть доступ: «Все».
 *  5. Скопируйте URL вида https://script.google.com/macros/s/…/exec
 *     и вставьте его в config.js → SCRIPT_URL.
 *
 * Уведомления (необязательно): Настройки проекта → Свойства скрипта:
 *   NOTIFY_EMAIL       — почта(ы) через запятую, куда слать письмо о каждой заявке;
 *   TELEGRAM_BOT_TOKEN — токен бота от @BotFather;
 *   TELEGRAM_CHAT_ID   — id чата/группы, куда бот пишет (бот должен быть в группе).
 */

var SHEET_NAME = 'Заявки';
var COLUMNS = [
  ['timestamp',    'Дата'],
  ['name',         'Имя'],
  ['age',          'Возраст'],
  ['phone',        'Телефон'],
  ['telegram',     'Telegram'],
  ['email',        'Email'],
  ['city',         'Город'],
  ['roles',        'Роли'],
  ['experience',   'Опыт'],
  ['availability', 'Когда готов(а)'],
  ['about',        'О себе'],
  ['status',       'Статус'],
  ['comment',      'Комментарий орга'],
  ['source',       'Страница'],
];

function setup() {
  var sheet = getSheet_();
  SpreadsheetApp.getActive().toast('Лист «' + SHEET_NAME + '» готов', 'КофеДни');
  return sheet.getName();
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var p = (e && e.parameter) || {};
    if (p.website) return json_({ ok: true }); // honeypot

    var row = COLUMNS.map(function (c) {
      if (c[0] === 'timestamp') return new Date();
      if (c[0] === 'status') return 'Новая';
      if (c[0] === 'comment') return '';
      var v = String(p[c[0]] || '').slice(0, 3000);
      // защита от формул в ячейках
      return /^[=+\-@]/.test(v) ? "'" + v : v;
    });

    var sheet = getSheet_();
    sheet.appendRow(row);
    notify_(p);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, service: 'coffeedays-team' });
}

function getSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS.map(function (c) { return c[1]; }));
    var head = sheet.getRange(1, 1, 1, COLUMNS.length);
    head.setFontWeight('bold').setBackground('#591520').setFontColor('#F9F7F2');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, COLUMNS.length, 160);
    sheet.setColumnWidth(8, 260);
    sheet.setColumnWidth(11, 320);
    var statusCol = COLUMNS.map(function (c) { return c[0]; }).indexOf('status') + 1;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Новая', 'Связались', 'В команде', 'Отказ'], true).build();
    sheet.getRange(2, statusCol, 1000, 1).setDataValidation(rule);
  }
  return sheet;
}

function notify_(p) {
  var props = PropertiesService.getScriptProperties();
  var text =
    '☕ Новая заявка в команду КофеДней\n\n' +
    'Имя: ' + (p.name || '') + '\n' +
    'Телефон: ' + (p.phone || '') + '\n' +
    'Telegram: ' + (p.telegram || '—') + '\n' +
    'Роли: ' + (p.roles || '') + '\n' +
    'Опыт: ' + (p.experience || '') + '\n' +
    'Когда: ' + (p.availability || '—') + '\n' +
    (p.about ? '\n' + p.about : '');

  var email = props.getProperty('NOTIFY_EMAIL');
  if (email) {
    try { MailApp.sendEmail(email, 'КофеДни: новая заявка — ' + (p.name || ''), text); } catch (e) {}
  }
  var token = props.getProperty('TELEGRAM_BOT_TOKEN');
  var chat = props.getProperty('TELEGRAM_CHAT_ID');
  if (token && chat) {
    try {
      UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'post',
        payload: { chat_id: chat, text: text },
        muteHttpExceptions: true,
      });
    } catch (e) {}
  }
}

/**
 * Подключение Telegram в один клик.
 * 1. Свойства скрипта → TELEGRAM_BOT_TOKEN = токен от @BotFather.
 * 2. Добавьте бота в чат организаторов и напишите там любое сообщение
 *    (или напишите боту в личку /start).
 * 3. Запустите эту функцию: она найдёт чат, сохранит TELEGRAM_CHAT_ID
 *    и пришлёт тестовое сообщение.
 */
function setupTelegram() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('Сначала добавьте свойство TELEGRAM_BOT_TOKEN (Настройки проекта → Свойства скрипта).');

  var res = JSON.parse(UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates', { muteHttpExceptions: true }).getContentText());
  if (!res.ok) throw new Error('Telegram не принял токен: ' + (res.description || 'проверьте TELEGRAM_BOT_TOKEN'));

  var chats = {};
  (res.result || []).forEach(function (u) {
    var m = u.message || u.channel_post || u.my_chat_member || u.edited_message;
    if (m && m.chat) chats[m.chat.id] = m.chat;
  });
  var list = Object.keys(chats).map(function (id) { return chats[id]; });
  if (!list.length) throw new Error('Бот пока не видит ни одного чата. Добавьте его в чат организаторов, напишите там сообщение и запустите снова.');

  // группы важнее личек
  list.sort(function (a, b) { return (a.type === 'private') - (b.type === 'private'); });
  list.forEach(function (c) { Logger.log('Найден чат: ' + (c.title || c.username || c.first_name) + ' (' + c.type + ') id=' + c.id); });

  var chat = list[0];
  props.setProperty('TELEGRAM_CHAT_ID', String(chat.id));
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    payload: { chat_id: chat.id, text: '☕ Бот КофеДней подключён! Сюда будут приходить новые заявки в команду.' },
    muteHttpExceptions: true,
  });
  Logger.log('Готово: уведомления пойдут в «' + (chat.title || chat.username || chat.first_name) + '»');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
