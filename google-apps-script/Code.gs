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
  var token = (props.getProperty('TELEGRAM_BOT_TOKEN') || '').trim();
  var chat = (props.getProperty('TELEGRAM_CHAT_ID') || '').trim();
  if (!token || !chat) {
    console.warn('Telegram не настроен: TELEGRAM_BOT_TOKEN=' + (token ? 'есть' : 'нет') + ', TELEGRAM_CHAT_ID=' + (chat || 'нет'));
    return 'Telegram не настроен';
  }
  try {
    var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      payload: { chat_id: chat, text: text },
      muteHttpExceptions: true,
    });
    var body = r.getContentText();
    if (r.getResponseCode() !== 200) console.error('Telegram ответил ошибкой: ' + body);
    return body;
  } catch (e) {
    console.error('Ошибка отправки в Telegram: ' + e);
    return String(e);
  }
}

/**
 * Проверка уведомлений: запустите из редактора.
 * Шлёт в чат тестовую заявку и пишет в журнал, что ответил Telegram.
 */
function testTelegram() {
  var props = PropertiesService.getScriptProperties();
  Logger.log('TELEGRAM_CHAT_ID = ' + (props.getProperty('TELEGRAM_CHAT_ID') || '— не задан, сначала запустите setupTelegram'));
  var res = notify_({ name: 'Тестовая заявка', phone: '+7 900 000-00-00', roles: 'Проверка уведомлений', experience: '—' });
  Logger.log('Ответ Telegram: ' + res);
  var j = {}; try { j = JSON.parse(res); } catch (e) {}
  if (j.ok) Logger.log('✅ Сообщение отправлено в чат «' + (j.result.chat.title || j.result.chat.first_name) + '»');
  else if (/chat not found/i.test(res)) Logger.log('❌ Бот не состоит в этом чате или id неверный → запустите setupTelegram заново.');
  else if (/kicked|not a member/i.test(res)) Logger.log('❌ Бота удалили из чата → добавьте снова и запустите setupTelegram.');
  else if (/not enough rights|CHAT_WRITE_FORBIDDEN|TOPIC_CLOSED/i.test(res)) Logger.log('❌ Боту запрещено писать: дайте ему право отправлять сообщения (или сделайте админом), проверьте, что General не закрыт.');
  else if (/upgraded to a supergroup/i.test(res)) Logger.log('❌ Группа стала супергруппой и сменила id → запустите setupTelegram заново.');
}

/**
 * Подключение Telegram в один клик.
 * 1. Свойства скрипта → TELEGRAM_BOT_TOKEN = токен от @BotFather.
 * 2. Добавьте бота в чат организаторов и напишите в чате (в General)
 *    команду /start@имя_бота — команды бот видит всегда.
 * 3. Запустите эту функцию: она найдёт чат, сохранит TELEGRAM_CHAT_ID
 *    и пришлёт тестовое сообщение. В чатах с темами сообщения идут в General.
 */
function setupTelegram() {
  var props = PropertiesService.getScriptProperties();
  var token = (props.getProperty('TELEGRAM_BOT_TOKEN') || '').trim();
  if (!token) throw new Error('Сначала добавьте свойство TELEGRAM_BOT_TOKEN (Настройки проекта → Свойства скрипта).');
  props.setProperty('TELEGRAM_BOT_TOKEN', token);

  function tg(method, payload) {
    var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'post', payload: payload || {}, muteHttpExceptions: true,
    });
    return JSON.parse(r.getContentText());
  }

  var me = tg('getMe');
  if (!me.ok) throw new Error('Telegram не принял токен: ' + (me.description || 'проверьте TELEGRAM_BOT_TOKEN'));
  var botName = '@' + me.result.username;
  Logger.log('Токен от бота ' + botName + ' (' + me.result.first_name + ')');
  Logger.log('Видит все сообщения в группах: ' + (me.result.can_read_all_group_messages ? 'да' : 'нет, только команды вида /start@' + me.result.username));

  // TELEGRAM_CHAT_ID_MANUAL — если хотите указать чат вручную.
  var manual = (props.getProperty('TELEGRAM_CHAT_ID_MANUAL') || '').trim();

  var wh = tg('getWebhookInfo');
  if (wh.ok && wh.result.url) {
    Logger.log('У бота был webhook (' + wh.result.url + ') — он мешает. Отключаю.');
    tg('deleteWebhook');
  }

  var res = tg('getUpdates', { allowed_updates: JSON.stringify(['message', 'channel_post', 'my_chat_member', 'edited_message']) });
  if (!res.ok) throw new Error('getUpdates: ' + res.description + ' — возможно, этот токен уже использует другой сервис.');
  Logger.log('Событий у бота: ' + res.result.length);

  var chats = {}, order = 0;
  res.result.forEach(function (u) {
    var m = u.message || u.channel_post || u.my_chat_member || u.edited_message;
    if (m && m.chat) { m.chat._last = ++order; chats[m.chat.id] = m.chat; }
  });
  var list = Object.keys(chats).map(function (id) { return chats[id]; });
  list.forEach(function (c) {
    Logger.log('Найден чат: «' + (c.title || c.username || c.first_name) + '» тип=' + c.type + (c.is_forum ? ' (с темами)' : '') + ' id=' + c.id);
  });

  var chat;
  if (manual) {
    chat = { id: manual, title: 'TELEGRAM_CHAT_ID=' + manual };
  } else {
    if (!list.length) {
      throw new Error('Бот ' + botName + ' пока не получил ни одного сообщения. ' +
        'Проверьте, что пишете именно ему, затем в General чата отправьте /start@' + me.result.username +
        ' и запустите снова. Если не поможет: @BotFather → /mybots → бот → Bot Settings → Group Privacy → Turn off, ' +
        'удалите бота из чата, добавьте заново и повторите.');
    }
    var rank = function (c) { return c.type === 'supergroup' ? 0 : c.type === 'group' ? 1 : c.type === 'channel' ? 2 : 3; };
    // группы важнее личек; среди групп — та, где писали последней
    list.sort(function (a, b) { return rank(a) - rank(b) || b._last - a._last; });
    chat = list[0];
  }

  // без message_thread_id сообщение попадает в General
  var sent = tg('sendMessage', { chat_id: chat.id, text: '☕ Бот КофеДней подключён! Сюда будут приходить новые заявки в команду.' });
  if (!sent.ok) throw new Error('Не удалось написать в чат ' + chat.id + ': ' + sent.description);
  props.setProperty('TELEGRAM_CHAT_ID', String(chat.id));
  Logger.log('Готово: уведомления пойдут в «' + (chat.title || chat.username || chat.first_name) + '» (id ' + chat.id + ')');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
