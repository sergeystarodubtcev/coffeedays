/**
 * «Команда КофеДней»: приём заявок с сайта в Google Таблицу + Telegram-бот.
 *
 * Установка таблицы (один раз):
 *  1. Таблица → Расширения → Apps Script → вставьте этот файл целиком, сохраните.
 *  2. Запустите setup() и разрешите доступ.
 *  3. Развернуть → Новое развёртывание → «Веб-приложение» (от имени: Я, доступ: Все).
 *  4. URL …/exec → config.js (SCRIPT_URL) и в константу WEBAPP_URL ниже.
 *
 * Бот (один раз):
 *  1. Свойства скрипта: TELEGRAM_BOT_TOKEN = токен от @BotFather.
 *  2. Добавьте бота в чат организаторов (лучше админом), отправьте /start@имя_бота.
 *  3. Запустите setupTelegram() — привяжет чат.
 *  4. Запустите setupBot() — включит команды и кнопки.
 *  5. После любых правок кода: Развернуть → Управление развёртываниями → ✏️ → Новая версия.
 *
 * Автообновление (один раз): включите Apps Script API на script.google.com/home/usersettings,
 *  вставьте appsscript.json и этот файл, запустите setupAutoUpdate(). Дальше скрипт сам
 *  подтягивает код из GitHub и публикует новую версию на тот же URL.
 *
 * Дополнительно: enableDailyDigest() — сводка каждый день в 10:00 (МСК);
 *                enablePolling() — запасной режим, если команды не доходят.
 */

var BUILD = '2026-11-05.1';
var REPO_RAW = 'https://raw.githubusercontent.com/sergeystarodubtcev/coffeedays/refs/heads/claude/pensive-dijkstra-ucryo7/google-apps-script/';

var SHEET_NAME = 'Заявки';
var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxR8XjjKyKizYZvjKWTs0UbliQ5u1wIpXRFNq8QioNdCmc0ni20e6QYQpjbDDP9k2zh/exec';
var TZ = 'Europe/Moscow';

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

var STATUSES = [
  { code: 'n', name: 'Новая',     ico: '🆕' },
  { code: 'c', name: 'Связались', ico: '📞' },
  { code: 't', name: 'В команде', ico: '✅' },
  { code: 'x', name: 'Отказ',     ico: '❌' },
];

// Те же роли, что на сайте (app.js → ROLES)
var ROLES = [
  ['Координатор волонтёров', '🧭'],
  ['Координатор зоны', '📍'],
  ['Волонтёр площадки', '🙌'],
  ['Команда чемпионатов', '🏆'],
  ['Лекторий и дегустации', '🎤'],
  ['Маркет и участники', '🛍'],
  ['SMM и контент', '📱'],
  ['Фото и видео', '📸'],
  ['Дизайн', '🎨'],
  ['Партнёры и спонсоры', '🤝'],
  ['Монтаж и логистика', '📦'],
  ['Другое — предложу сам(а)', '✨'],
];

var BOT_COMMANDS = [
  { command: 'all',   description: 'Все заявки одной таблицей' },
  { command: 'new',   description: 'Необработанные заявки' },
  { command: 'last',  description: 'Последние заявки карточками (/last 10)' },
  { command: 'card',  description: 'Карточка заявки по номеру (/card 12)' },
  { command: 'find',  description: 'Поиск по имени, телефону, нику' },
  { command: 'roles', description: 'Люди по ролям' },
  { command: 'team',  description: 'Кто уже в команде' },
  { command: 'stats', description: 'Статистика' },
  { command: 'today', description: 'Сводка за сутки' },
  { command: 'sheet', description: 'Ссылка на таблицу' },
  { command: 'help',  description: 'Что умеет бот' },
];

/* =====================================================================
 *  Таблица и приём заявок
 * ===================================================================== */

function setup() {
  var sheet = getSheet_();
  SpreadsheetApp.getActive().toast('Лист «' + SHEET_NAME + '» готов', 'КофеДни');
  return sheet.getName();
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  if (p.bot) return handleTelegram_(e);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (p.website) return json_({ ok: true }); // honeypot

    var row = COLUMNS.map(function (c) {
      if (c[0] === 'timestamp') return new Date();
      if (c[0] === 'status') return 'Новая';
      if (c[0] === 'comment') return '';
      var v = String(p[c[0]] || '').slice(0, 3000);
      return /^[=+\-@]/.test(v) ? "'" + v : v; // защита от формул
    });

    var sheet = getSheet_();
    sheet.appendRow(row);
    var rowNum = sheet.getLastRow();
    try { notify_(rowObj_(sheet, rowNum)); } catch (err) { console.error('notify: ' + err); }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var a = (e && e.parameter && e.parameter.action) || '';
  if (a === 'update') {
    var cache = CacheService.getScriptCache();
    if (cache.get('upd_throttle')) return json_({ ok: false, error: 'throttled', build: BUILD });
    cache.put('upd_throttle', '1', 20);
    try { return json_(selfUpdate_(false)); } catch (err) { return json_({ ok: false, error: String(err), build: BUILD }); }
  }
  if (a === 'postdeploy') {
    try { syncBot_(); } catch (err) { return json_({ ok: false, error: String(err), build: BUILD }); }
    return json_({ ok: true, build: BUILD });
  }
  return json_({ ok: true, service: 'coffeedays-team', build: BUILD });
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
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUSES.map(function (s) { return s.name; }), true).build();
    sheet.getRange(2, colIdx_('status') + 1, 1000, 1).setDataValidation(rule);
  }
  return sheet;
}

function colIdx_(key) {
  for (var i = 0; i < COLUMNS.length; i++) if (COLUMNS[i][0] === key) return i;
  return -1;
}

function toObj_(values, rowNum) {
  var o = { row: rowNum, num: rowNum - 1 };
  COLUMNS.forEach(function (c, j) {
    var v = values[j];
    o[c[0]] = typeof v === 'string' ? v.replace(/^'/, '') : v;
  });
  return o;
}

function rowObj_(sheet, rowNum) {
  return toObj_(sheet.getRange(rowNum, 1, 1, COLUMNS.length).getValues()[0], rowNum);
}

function allRows_() {
  var sh = getSheet_();
  var n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, COLUMNS.length).getValues()
    .map(function (v, i) { return toObj_(v, i + 2); })
    .filter(function (r) { return String(r.name || '').trim() !== ''; });
}

/* =====================================================================
 *  Уведомление о новой заявке
 * ===================================================================== */

function notify_(r) {
  var props = PropertiesService.getScriptProperties();

  var email = props.getProperty('NOTIFY_EMAIL');
  if (email) {
    var plain = 'Новая заявка в команду КофеДней\n\n' +
      'Имя: ' + r.name + '\nТелефон: ' + r.phone + '\nTelegram: ' + (r.telegram || '—') +
      '\nРоли: ' + r.roles + '\nОпыт: ' + r.experience + '\nКогда: ' + (r.availability || '—') +
      (r.about ? '\n\n' + r.about : '');
    try { MailApp.sendEmail(email, 'КофеДни: новая заявка — ' + r.name, plain); } catch (e) {}
  }

  var chat = (props.getProperty('TELEGRAM_CHAT_ID') || '').trim();
  if (!botToken_() || !chat) {
    console.warn('Telegram не настроен');
    return 'Telegram не настроен';
  }
  var res = send_({ chat: chat }, '🔔 <b>Новая заявка в команду!</b>\n\n' + card_(r), cardKeyboard_(r));
  return JSON.stringify(res);
}

/* =====================================================================
 *  Telegram: вебхук и команды
 * ===================================================================== */

function handleTelegram_(e) {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('BOT_SECRET') || e.parameter.bot !== props.getProperty('BOT_SECRET')) return json_({ ok: false });
  var u;
  try { u = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: true }); }

  // Telegram может прислать одно и то же событие повторно — обрабатываем один раз
  var cache = CacheService.getScriptCache();
  var key = 'upd_' + u.update_id;
  if (cache.get(key)) return json_({ ok: true });
  cache.put(key, '1', 21600);

  try { processUpdate_(u); } catch (err) { console.error('bot: ' + (err && err.stack || err)); }
  return json_({ ok: true });
}

function processUpdate_(u) {
  if (u.callback_query) return onCallback_(u.callback_query);
  var m = u.message;
  if (!m || !m.text || m.text.charAt(0) !== '/') return;

  var props = PropertiesService.getScriptProperties();
  var group = String(props.getProperty('TELEGRAM_CHAT_ID') || '');
  var ctx = { chat: m.chat.id, thread: m.is_topic_message ? m.message_thread_id : null };

  var first = m.text.split(/\s+/)[0];
  var arg = m.text.slice(first.length).trim();
  var at = first.indexOf('@');
  var cmd = (at > 0 ? first.slice(1, at) : first.slice(1)).toLowerCase();
  var mention = at > 0 ? first.slice(at + 1).toLowerCase() : '';
  var me = String(props.getProperty('BOT_USERNAME') || '').toLowerCase();
  if (mention && me && mention !== me) return; // команда другому боту

  if (String(m.chat.id) !== group) {
    if (m.chat.type === 'private') send_(ctx, '☕ Я работаю только в чате организаторов КофеДней.');
    return;
  }

  switch (cmd) {
    case 'start':
    case 'help':  return send_(ctx, helpText_());
    case 'all':
    case 'table': return cmdAll_(ctx, arg);
    case 'new':   return cmdNew_(ctx);
    case 'last':  return cmdLast_(ctx, arg);
    case 'card':  return cmdCard_(ctx, arg);
    case 'find':  return cmdFind_(ctx, arg);
    case 'roles': return cmdRoles_(ctx);
    case 'team':  return cmdTeam_(ctx);
    case 'stats': return cmdStats_(ctx);
    case 'today': return send_(ctx, digestText_(1));
    case 'week':  return send_(ctx, digestText_(7));
    case 'sheet': return send_(ctx, '📄 <a href="' + SpreadsheetApp.getActive().getUrl() + '">Открыть таблицу заявок</a>');
    default:
      if (mention) send_(ctx, 'Не знаю такую команду 🤔 Список — /help');
  }
}

function helpText_() {
  return '☕ <b>Привет! Я бот команды КофеДней</b>\n\n' +
    'Присылаю сюда новые заявки с сайта и помогаю с ними работать:\n\n' +
    '👥 /all — все заявки одной таблицей\n' +
    '🆕 /new — кто ещё ждёт ответа\n' +
    '🗂 /last 5 — последние заявки карточками\n' +
    '🪪 /card 12 — карточка заявки №12\n' +
    '🔎 /find Анна — поиск по имени, телефону, нику\n' +
    '🎯 /roles — люди по ролям\n' +
    '✅ /team — кто уже в команде\n' +
    '📊 /stats — статистика\n' +
    '🗓 /today, /week — сводка за сутки / неделю\n' +
    '📄 /sheet — ссылка на таблицу\n\n' +
    'Под каждой карточкой есть кнопки <b>📞 Связались · ✅ В команде · ❌ Отказ</b> — статус сразу меняется в таблице.';
}

/* ---------- Команды ---------- */

function cmdAll_(ctx, arg) {
  var rows = allRows_();
  if (!rows.length) return send_(ctx, 'Заявок пока нет 🌱');
  sendTable_(ctx, '👥 <b>Все заявки — ' + rows.length + '</b>', rows, legend_(rows));
}

function cmdNew_(ctx) {
  var rows = allRows_().filter(function (r) { return statusOf_(r).code === 'n'; });
  if (!rows.length) return send_(ctx, '🎉 Все заявки обработаны!');
  sendTable_(ctx, '🆕 <b>Ждут ответа — ' + rows.length + '</b>', rows,
    'Открыть карточку с кнопками: /card <i>номер</i>');
}

function cmdTeam_(ctx) {
  var rows = allRows_().filter(function (r) { return statusOf_(r).code === 't'; });
  if (!rows.length) return send_(ctx, 'Пока никого не отметили «✅ В команде».');
  sendTable_(ctx, '✅ <b>Уже в команде — ' + rows.length + '</b>', rows, legend_(rows));
}

function cmdLast_(ctx, arg) {
  var n = Math.max(1, Math.min(10, parseInt(arg, 10) || 5));
  var rows = allRows_().slice(-n).reverse();
  if (!rows.length) return send_(ctx, 'Заявок пока нет 🌱');
  send_(ctx, '🗂 <b>Последние заявки: ' + rows.length + '</b>');
  rows.forEach(function (r) { send_(ctx, card_(r), cardKeyboard_(r)); });
}

function cmdCard_(ctx, arg) {
  var num = parseInt(String(arg).replace(/\D/g, ''), 10);
  if (!num) return send_(ctx, 'Укажите номер заявки: /card 12');
  var r = findByNum_(num);
  if (!r) return send_(ctx, 'Заявки №' + num + ' нет.');
  send_(ctx, card_(r), cardKeyboard_(r));
}

function cmdFind_(ctx, arg) {
  var q = String(arg || '').toLowerCase().replace(/^@/, '').trim();
  if (q.length < 2) return send_(ctx, 'Что ищем? Например: /find Анна, /find 900123, /find @nick');
  var qd = q.replace(/\D/g, '');
  var rows = allRows_().filter(function (r) {
    var hay = [r.name, r.telegram, r.email, r.city, r.roles, r.about].join(' ').toLowerCase();
    if (hay.indexOf(q) >= 0) return true;
    return qd.length >= 4 && String(r.phone).replace(/\D/g, '').indexOf(qd) >= 0;
  });
  if (!rows.length) return send_(ctx, 'Никого не нашёл по «' + esc_(arg) + '» 🤷');
  if (rows.length === 1) return send_(ctx, card_(rows[0]), cardKeyboard_(rows[0]));
  sendTable_(ctx, '🔎 <b>Найдено: ' + rows.length + '</b>', rows.slice(0, 50), 'Карточка: /card <i>номер</i>');
}

function cmdRoles_(ctx) {
  var rows = allRows_();
  var counts = roleCounts_(rows);
  var kb = ROLES.map(function (r, i) {
    return [{ text: r[1] + ' ' + r[0] + ' · ' + (counts[r[0]] || 0), callback_data: 'r:' + i }];
  });
  send_(ctx, '🎯 <b>Люди по ролям</b>\nНажмите на роль, чтобы увидеть список:', kb);
}

function cmdStats_(ctx) {
  var rows = allRows_();
  if (!rows.length) return send_(ctx, 'Заявок пока нет 🌱');
  var now = Date.now(), day = 864e5;
  var today = rows.filter(function (r) { return now - ts_(r) < day; }).length;
  var week = rows.filter(function (r) { return now - ts_(r) < 7 * day; }).length;

  var st = STATUSES.map(function (s) {
    return s.ico + ' ' + s.name + ': <b>' + rows.filter(function (r) { return statusOf_(r).code === s.code; }).length + '</b>';
  }).join('\n');

  var counts = roleCounts_(rows);
  var max = Math.max.apply(null, ROLES.map(function (r) { return counts[r[0]] || 0; }).concat([1]));
  var bars = ROLES.map(function (r) {
    var c = counts[r[0]] || 0;
    var len = c ? Math.max(1, Math.round(c / max * 10)) : 0;
    return r[1] + ' ' + pad_(r[0], 18) + ' ' + rep_('█', len) + rep_('░', 10 - len) + ' ' + c;
  }).join('\n');

  var exp = {};
  rows.forEach(function (r) { var k = String(r.experience || '—'); exp[k] = (exp[k] || 0) + 1; });
  var expTxt = Object.keys(exp).sort(function (a, b) { return exp[b] - exp[a]; })
    .map(function (k) { return '• ' + esc_(k) + ': <b>' + exp[k] + '</b>'; }).join('\n');

  send_(ctx,
    '📊 <b>Статистика заявок</b>\n\n' +
    'Всего: <b>' + rows.length + '</b> · за сутки: <b>' + today + '</b> · за неделю: <b>' + week + '</b>\n\n' +
    st + '\n\n<b>По ролям</b>\n<pre>' + esc_(bars) + '</pre>\n<b>Опыт</b>\n' + expTxt);
}

function digestText_(days) {
  var rows = allRows_();
  var since = Date.now() - days * 864e5;
  var fresh = rows.filter(function (r) { return ts_(r) >= since; });
  var waiting = rows.filter(function (r) { return statusOf_(r).code === 'n'; }).length;
  var head = '🗓 <b>Сводка за ' + (days === 1 ? 'сутки' : days + ' дн.') + '</b>\n\n';
  if (!fresh.length) {
    return head + 'Новых заявок не было.\n' + (waiting ? '🆕 Ждут ответа: <b>' + waiting + '</b> → /new' : '🎉 Все заявки обработаны.');
  }
  var lines = fresh.slice(-15).reverse().map(function (r) {
    return statusOf_(r).ico + ' <b>#' + r.num + '</b> ' + esc_(r.name) + ' — ' + rolesIcons_(r.roles) + ' ' + esc_(contact_(r));
  });
  return head + 'Новых заявок: <b>' + fresh.length + '</b>\n' + lines.join('\n') +
    (fresh.length > 15 ? '\n…и ещё ' + (fresh.length - 15) : '') +
    '\n\n🆕 Ждут ответа: <b>' + waiting + '</b>' + (waiting ? ' → /new' : '');
}

/* ---------- Кнопки ---------- */

function onCallback_(q) {
  var props = PropertiesService.getScriptProperties();
  var group = String(props.getProperty('TELEGRAM_CHAT_ID') || '');
  var msg = q.message || {};
  if (!msg.chat || String(msg.chat.id) !== group) {
    return tg_('answerCallbackQuery', { callback_query_id: q.id, text: 'Нет доступа' });
  }
  var ctx = { chat: msg.chat.id, thread: msg.is_topic_message ? msg.message_thread_id : null };
  var data = String(q.data || '');

  if (data.indexOf('s:') === 0) {               // смена статуса: s:<row>:<code>
    var parts = data.split(':');
    var row = parseInt(parts[1], 10);
    var st = STATUSES.filter(function (s) { return s.code === parts[2]; })[0];
    var sh = getSheet_();
    if (!st || !(row >= 2 && row <= sh.getLastRow())) {
      return tg_('answerCallbackQuery', { callback_query_id: q.id, text: 'Заявка не найдена' });
    }
    sh.getRange(row, colIdx_('status') + 1).setValue(st.name);
    var who = q.from.username ? '@' + q.from.username : (q.from.first_name || 'кто-то');
    var r = rowObj_(sh, row);
    tg_('answerCallbackQuery', { callback_query_id: q.id, text: st.ico + ' ' + st.name });
    tg_('editMessageText', {
      chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: 'HTML', disable_web_page_preview: true,
      text: card_(r) + '\n\n<i>' + st.ico + ' ' + esc_(who) + ' · ' + fmtDate_(new Date()) + '</i>',
      reply_markup: { inline_keyboard: cardKeyboard_(r) },
    });
    return;
  }

  if (data.indexOf('r:') === 0) {               // список по роли
    var role = ROLES[parseInt(data.slice(2), 10)];
    tg_('answerCallbackQuery', { callback_query_id: q.id });
    if (!role) return;
    var rows = allRows_().filter(function (r) { return splitRoles_(r.roles).indexOf(role[0]) >= 0; });
    if (!rows.length) return send_(ctx, role[1] + ' <b>' + esc_(role[0]) + '</b>: пока никого.');
    return sendTable_(ctx, role[1] + ' <b>' + esc_(role[0]) + ' — ' + rows.length + '</b>', rows, 'Карточка: /card <i>номер</i>');
  }

  tg_('answerCallbackQuery', { callback_query_id: q.id });
}

/* ---------- Форматирование ---------- */

function card_(r) {
  var st = statusOf_(r);
  var lines = ['<b>#' + r.num + ' · ' + esc_(r.name) + '</b>   ' + st.ico + ' ' + st.name];
  if (r.phone) lines.push('📞 ' + esc_(r.phone));
  var tgName = tgUser_(r.telegram);
  if (tgName) lines.push('✈️ <a href="https://t.me/' + tgName + '">@' + esc_(tgName) + '</a>');
  else if (r.telegram) lines.push('✈️ ' + esc_(r.telegram));
  if (r.email) lines.push('✉️ ' + esc_(r.email));
  var who = [r.city, r.age ? r.age + ' лет' : ''].filter(String).join(' · ');
  if (who) lines.push('🏙 ' + esc_(who));
  lines.push('');
  if (r.roles) lines.push('🎯 <b>Роли:</b> ' + esc_(r.roles));
  if (r.experience) lines.push('💼 <b>Опыт:</b> ' + esc_(r.experience));
  if (r.availability) lines.push('🗓 <b>Когда:</b> ' + esc_(r.availability));
  if (r.about) lines.push('💬 ' + esc_(String(r.about).slice(0, 700)));
  if (r.comment) lines.push('📝 <i>' + esc_(r.comment) + '</i>');
  if (r.timestamp) lines.push('', '🕒 ' + fmtDate_(r.timestamp));
  return lines.join('\n');
}

function cardKeyboard_(r) {
  if (!r.row) return null;
  var cur = statusOf_(r).code;
  var btns = STATUSES.filter(function (s) { return s.code !== 'n'; }).map(function (s) {
    return { text: (s.code === cur ? '• ' : '') + s.ico + ' ' + s.name, callback_data: 's:' + r.row + ':' + s.code };
  });
  var kb = [btns];
  var tgName = tgUser_(r.telegram);
  if (tgName) kb.push([{ text: '✈️ Написать @' + tgName, url: 'https://t.me/' + tgName }]);
  if (cur !== 'n') kb.push([{ text: '↩️ Вернуть в «Новая»', callback_data: 's:' + r.row + ':n' }]);
  return kb;
}

// Таблица моноширинным шрифтом прямо в сообщении (длинные режутся на части)
function sendTable_(ctx, title, rows, footer) {
  var head = '   ' + pad_('№', 4) + pad_('Имя', 15) + pad_('Контакт', 14) + 'Роли';
  var lines = rows.map(function (r) {
    return statusOf_(r).ico + ' ' + pad_(String(r.num), 4) + pad_(r.name, 15) + pad_(contact_(r), 14) + rolesIcons_(r.roles);
  });
  var chunks = [], cur = [];
  lines.forEach(function (l) {
    if ((cur.join('\n') + l).length > 3300) { chunks.push(cur); cur = []; }
    cur.push(l);
  });
  if (cur.length) chunks.push(cur);
  chunks.forEach(function (c, i) {
    var text = (i === 0 ? title + '\n' : '') + '<pre>' + esc_((i === 0 ? head + '\n' : '') + c.join('\n')) + '</pre>';
    if (i === chunks.length - 1 && footer) text += '\n' + footer;
    send_(ctx, text);
  });
}

function legend_(rows) {
  var used = roleCounts_(rows || []);
  return '<i>' + STATUSES.map(function (s) { return s.ico + ' ' + s.name; }).join(' · ') + '</i>\n' +
    '<i>' + ROLES.filter(function (r) { return used[r[0]]; }).map(function (r) { return r[1] + ' ' + r[0]; }).join(' · ') + '</i>\n' +
    'Карточка с кнопками: /card <i>номер</i>';
}

function statusOf_(r) {
  var s = String(r.status || '').trim();
  return STATUSES.filter(function (x) { return x.name === s; })[0] || STATUSES[0];
}
function splitRoles_(s) { return String(s || '').split(/\s*,\s*/).filter(String); }
function rolesIcons_(s) {
  return splitRoles_(s).map(function (name) {
    var r = ROLES.filter(function (x) { return x[0] === name; })[0];
    return r ? r[1] : '•';
  }).join('');
}
function roleCounts_(rows) {
  var c = {};
  rows.forEach(function (r) { splitRoles_(r.roles).forEach(function (x) { c[x] = (c[x] || 0) + 1; }); });
  return c;
}
function tgUser_(v) {
  var s = String(v || '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(s) ? s : '';
}
function contact_(r) {
  var t = tgUser_(r.telegram);
  if (t) return '@' + t;
  if (r.phone) return String(r.phone).replace(/[^\d+]/g, '');
  return String(r.email || '—');
}
function findByNum_(num) {
  var sh = getSheet_();
  var row = num + 1;
  if (row < 2 || row > sh.getLastRow()) return null;
  var r = rowObj_(sh, row);
  return String(r.name || '').trim() ? r : null;
}
function ts_(r) { var d = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp); return d.getTime() || 0; }
function fmtDate_(d) { return Utilities.formatDate(d instanceof Date ? d : new Date(d), TZ, 'dd.MM.yyyy HH:mm'); }
function pad_(s, w) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (s.length > w - 1) s = s.slice(0, w - 2) + '…';
  return s + rep_(' ', w - s.length);
}
function rep_(ch, n) { return n > 0 ? new Array(n + 1).join(ch) : ''; }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* ---------- Telegram API ---------- */

function botToken_() { return (PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN') || '').trim(); }

function tg_(method, payload) {
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken_() + '/' + method, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true,
  });
  var j;
  try { j = JSON.parse(r.getContentText()); } catch (e) { j = { ok: false, description: r.getContentText() }; }
  if (!j.ok) console.error('Telegram ' + method + ': ' + j.description);
  return j;
}

function send_(ctx, html, keyboard) {
  var p = { chat_id: ctx.chat, text: html, parse_mode: 'HTML', disable_web_page_preview: true };
  if (ctx.thread) p.message_thread_id = ctx.thread;
  if (keyboard) p.reply_markup = { inline_keyboard: keyboard };
  return tg_('sendMessage', p);
}

/* =====================================================================
 *  Настройка (запускать из редактора)
 * ===================================================================== */

/** Шаг 1: найти чат организаторов и запомнить его. */
function setupTelegram() {
  var props = PropertiesService.getScriptProperties();
  var token = botToken_();
  if (!token) throw new Error('Сначала добавьте свойство TELEGRAM_BOT_TOKEN (Настройки проекта → Свойства скрипта).');
  props.setProperty('TELEGRAM_BOT_TOKEN', token);

  var me = tg_('getMe');
  if (!me.ok) throw new Error('Telegram не принял токен: ' + (me.description || 'проверьте TELEGRAM_BOT_TOKEN'));
  props.setProperty('BOT_USERNAME', me.result.username);
  Logger.log('Токен от бота @' + me.result.username + ' (' + me.result.first_name + ')');

  var manual = (props.getProperty('TELEGRAM_CHAT_ID_MANUAL') || '').trim();
  var chat;
  if (manual) {
    chat = { id: manual, title: 'TELEGRAM_CHAT_ID_MANUAL=' + manual };
  } else {
    var wh = tg_('getWebhookInfo');
    var hadWebhook = wh.ok && wh.result.url;
    if (hadWebhook) tg_('deleteWebhook'); // getUpdates не работает при включённом вебхуке
    var res = tg_('getUpdates', { allowed_updates: ['message', 'channel_post', 'my_chat_member'] });
    if (!res.ok) throw new Error('getUpdates: ' + res.description);
    var chats = {}, order = 0;
    res.result.forEach(function (u) {
      var m = u.message || u.channel_post || u.my_chat_member;
      if (m && m.chat) { m.chat._last = ++order; chats[m.chat.id] = m.chat; }
    });
    var list = Object.keys(chats).map(function (id) { return chats[id]; });
    list.forEach(function (c) {
      Logger.log('Найден чат: «' + (c.title || c.username || c.first_name) + '» ' + c.type + (c.is_forum ? ' (с темами)' : '') + ' id=' + c.id);
    });
    if (!list.length) {
      if (hadWebhook) Logger.log('Бот уже был в режиме команд — после выбора чата запустите setupBot().');
      throw new Error('Бот @' + me.result.username + ' пока не получил сообщений. Отправьте в нужном чате /start@' +
        me.result.username + ' и запустите снова.');
    }
    var rank = function (c) { return c.type === 'supergroup' ? 0 : c.type === 'group' ? 1 : c.type === 'channel' ? 2 : 3; };
    list.sort(function (a, b) { return rank(a) - rank(b) || b._last - a._last; });
    chat = list[0];
  }

  var sent = tg_('sendMessage', { chat_id: chat.id, text: '☕ Бот КофеДней подключён к этому чату!' });
  if (!sent.ok) throw new Error('Не удалось написать в чат ' + chat.id + ': ' + sent.description);
  props.setProperty('TELEGRAM_CHAT_ID', String(chat.id));
  Logger.log('Готово: чат «' + (chat.title || chat.username || chat.first_name) + '» (id ' + chat.id + '). Теперь запустите setupBot().');
}

/** Шаг 2: включить команды и кнопки (вебхук на это веб-приложение). */
function setupBot() {
  var props = PropertiesService.getScriptProperties();
  var chat = props.getProperty('TELEGRAM_CHAT_ID');
  if (!botToken_() || !chat) throw new Error('Сначала запустите setupTelegram().');

  var me = tg_('getMe');
  if (!me.ok) throw new Error('Токен не работает: ' + me.description);
  props.setProperty('BOT_USERNAME', me.result.username);

  var secret = props.getProperty('BOT_SECRET');
  if (!secret) { secret = Utilities.getUuid().replace(/-/g, ''); props.setProperty('BOT_SECRET', secret); }

  var wh = tg_('setWebhook', {
    url: WEBAPP_URL + '?bot=' + secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  if (!wh.ok) throw new Error('setWebhook: ' + wh.description);
  deleteTriggers_('pollUpdates');

  tg_('setMyCommands', { commands: BOT_COMMANDS, scope: { type: 'chat', chat_id: Number(chat) } });
  tg_('setMyCommands', { commands: BOT_COMMANDS, scope: { type: 'all_group_chats' } });

  var sent = send_({ chat: chat }, helpText_());
  if (!sent.ok) throw new Error('Не удалось написать в чат: ' + sent.description);
  Logger.log('✅ Бот @' + me.result.username + ' готов. Если команды не отвечают — проверьте, что сделали «Новая версия» развёртывания, или запустите botStatus().');
}

/** Диагностика: что Telegram думает о вебхуке. */
function botStatus() {
  var wh = tg_('getWebhookInfo');
  Logger.log(JSON.stringify(wh.result, null, 2));
  var props = PropertiesService.getScriptProperties();
  Logger.log('Чат: ' + props.getProperty('TELEGRAM_CHAT_ID') + ', бот: @' + props.getProperty('BOT_USERNAME'));
  Logger.log('Триггеры: ' + ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }).join(', '));
}

/** Тест уведомления о заявке. */
function testTelegram() {
  var res = notify_({
    num: 0, name: 'Тестовая заявка', phone: '+7 900 000-00-00', telegram: '', roles: 'Координатор волонтёров, SMM и контент',
    experience: 'Впервые, но очень хочу', availability: 'Первый день фестиваля', status: 'Новая', timestamp: new Date(),
  });
  Logger.log('Ответ Telegram: ' + res);
}

/** Сводка каждый день в 10:00 по Москве. */
function enableDailyDigest() {
  deleteTriggers_('dailyDigest');
  ScriptApp.newTrigger('dailyDigest').timeBased().everyDays(1).atHour(10).inTimezone(TZ).create();
  Logger.log('✅ Ежедневная сводка включена (10:00 МСК)');
}
function disableDailyDigest() { deleteTriggers_('dailyDigest'); Logger.log('Сводка выключена'); }
function dailyDigest() {
  var chat = PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID');
  if (chat) send_({ chat: chat }, digestText_(1));
}

/** Запасной режим: бот проверяет команды раз в минуту (если вебхук почему-то не работает). */
function enablePolling() {
  tg_('deleteWebhook');
  deleteTriggers_('pollUpdates');
  ScriptApp.newTrigger('pollUpdates').timeBased().everyMinutes(1).create();
  Logger.log('✅ Запасной режим включён: бот отвечает в течение минуты. Вернуться к мгновенному — setupBot().');
}
function pollUpdates() {
  var props = PropertiesService.getScriptProperties();
  var offset = Number(props.getProperty('TG_OFFSET') || 0);
  var res = tg_('getUpdates', { offset: offset, timeout: 0, allowed_updates: ['message', 'callback_query'] });
  if (!res.ok) return;
  res.result.forEach(function (u) {
    props.setProperty('TG_OFFSET', String(u.update_id + 1));
    try { processUpdate_(u); } catch (e) { console.error(e); }
  });
}

/* =====================================================================
 *  Автообновление из GitHub
 * ===================================================================== */

/** Один раз: включает автообновление, публикует свежую версию и настраивает бота. */
function setupAutoUpdate() {
  var res = selfUpdate_(true);
  Logger.log('Обновление: ' + JSON.stringify(res));
  deleteTriggers_('autoUpdate');
  ScriptApp.newTrigger('autoUpdate').timeBased().everyMinutes(10).create();
  Logger.log('✅ Автообновление включено: скрипт проверяет GitHub каждые 10 минут.');
  var props = PropertiesService.getScriptProperties();
  if (botToken_() && props.getProperty('TELEGRAM_CHAT_ID')) {
    setupBot();
  } else {
    Logger.log('Бот ещё не привязан к чату — запустите setupTelegram(), затем setupBot().');
  }
}

function autoUpdate() {
  try { var r = selfUpdate_(false); if (r.updated) console.log('Обновлено: ' + JSON.stringify(r)); }
  catch (e) { console.error('autoUpdate: ' + e); }
}

function selfUpdate_(force) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var get = function (name) {
      var r = UrlFetchApp.fetch(REPO_RAW + name + '?t=' + Date.now(), { muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) throw new Error('GitHub ' + name + ': HTTP ' + r.getResponseCode());
      return r.getContentText();
    };
    var code = get('Code.gs');
    var manifest = get('appsscript.json');
    if (code.indexOf('function doPost') < 0 || code.indexOf('function selfUpdate_') < 0) throw new Error('Код из GitHub выглядит неполным — пропускаю');
    JSON.parse(manifest);

    var hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, code + manifest, Utilities.Charset.UTF_8));
    var props = PropertiesService.getScriptProperties();
    var remoteBuild = (code.match(/var BUILD = '([^']*)'/) || [])[1] || '?';
    if (!force && props.getProperty('DEPLOYED_HASH') === hash) return { ok: true, updated: false, build: BUILD, remote: remoteBuild };

    var api = 'https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId();
    var call = function (method, path, body) {
      var r = UrlFetchApp.fetch(api + path, {
        method: method, contentType: 'application/json', payload: JSON.stringify(body),
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
      });
      var j = JSON.parse(r.getContentText() || '{}');
      if (r.getResponseCode() >= 300) {
        var msg = (j.error && j.error.message) || r.getContentText();
        if (/has not been used|is disabled|User has not enabled/i.test(msg)) {
          msg = 'Включите Apps Script API: script.google.com/home/usersettings → Google Apps Script API → Вкл. (' + msg + ')';
        }
        throw new Error(path + ': ' + msg);
      }
      return j;
    };

    call('put', '/content', { files: [
      { name: 'appsscript', type: 'JSON', source: manifest },
      { name: 'Code', type: 'SERVER_JS', source: code },
    ] });
    var ver = call('post', '/versions', { description: 'GitHub build ' + remoteBuild });
    var depId = WEBAPP_URL.match(/\/s\/([^/]+)\/exec/)[1];
    call('put', '/deployments/' + depId, { deploymentConfig: {
      scriptId: ScriptApp.getScriptId(), versionNumber: ver.versionNumber,
      manifestFileName: 'appsscript', description: 'GitHub build ' + remoteBuild,
    } });
    props.setProperty('DEPLOYED_HASH', hash);

    // свежая версия сама синхронизирует команды бота
    try { UrlFetchApp.fetch(WEBAPP_URL + '?action=postdeploy', { muteHttpExceptions: true }); } catch (e) {}
    return { ok: true, updated: true, from: BUILD, build: remoteBuild, version: ver.versionNumber };
  } finally {
    lock.releaseLock();
  }
}

/** Идемпотентно: вебхук и меню команд (вызывается после каждого обновления). */
function syncBot_() {
  var props = PropertiesService.getScriptProperties();
  var chat = props.getProperty('TELEGRAM_CHAT_ID');
  var secret = props.getProperty('BOT_SECRET');
  if (!botToken_() || !chat || !secret) return;
  var hasPolling = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'pollUpdates'; });
  if (!hasPolling) tg_('setWebhook', { url: WEBAPP_URL + '?bot=' + secret, allowed_updates: ['message', 'callback_query'] });
  tg_('setMyCommands', { commands: BOT_COMMANDS, scope: { type: 'chat', chat_id: Number(chat) } });
  tg_('setMyCommands', { commands: BOT_COMMANDS, scope: { type: 'all_group_chats' } });
}

function deleteTriggers_(fn) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t); });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
