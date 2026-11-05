/**
 * КофеДни — загрузчик. Вставляется в Apps Script ОДИН раз.
 *
 * Вся логика (приём заявок с сайта, Telegram-бот) лежит в GitHub:
 *   google-apps-script/bot.js
 * и подтягивается отсюда автоматически (свежая версия — в течение ~1–2 минут после пуша).
 * Если GitHub недоступен или в новом коде ошибка — работает последняя рабочая версия.
 *
 * Функции для запуска вручную (выберите в списке и нажмите ▶):
 *   setup, setupTelegram, setupBot, botStatus, testTelegram,
 *   enableDailyDigest, disableDailyDigest, enablePolling, reloadCode
 */

var BOT_SRC = 'https://raw.githubusercontent.com/sergeystarodubtcev/coffeedays/refs/heads/claude/pensive-dijkstra-ucryo7/google-apps-script/bot.js';
var BOT_FRESH_SECONDS = 60;
var BOT_EXPORTS = ['doPost', 'doGet', 'setup', 'setupTelegram', 'setupBot', 'botStatus', 'testTelegram',
  'enableDailyDigest', 'disableDailyDigest', 'dailyDigest', 'enablePolling', 'pollUpdates', 'BUILD'];

function doPost(e) { return app_().doPost(e); }
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'reload') app_(true);
  return app_().doGet(e);
}

function setup()              { return app_().setup(); }
function setupTelegram()      { return app_().setupTelegram(); }
function setupBot()           { return app_().setupBot(); }
function botStatus()          { Logger.log('Версия кода: ' + app_().BUILD); return app_().botStatus(); }
function testTelegram()       { return app_().testTelegram(); }
function enableDailyDigest()  { return app_().enableDailyDigest(); }
function disableDailyDigest() { return app_().disableDailyDigest(); }
function dailyDigest()        { return app_().dailyDigest(); }
function enablePolling()      { return app_().enablePolling(); }
function pollUpdates()        { return app_().pollUpdates(); }
function reloadCode()         { Logger.log('Загружена версия ' + app_(true).BUILD); }

/* ---------------- загрузка кода ---------------- */

function app_(force) {
  if (!force && app_.cached) return app_.cached;
  var cache = CacheService.getScriptCache();
  var src = null;

  if (force || !cache.get('bot_fresh')) {
    cache.put('bot_fresh', '1', BOT_FRESH_SECONDS); // не чаще раза в минуту, даже если GitHub упал
    try {
      var r = UrlFetchApp.fetch(BOT_SRC + '?t=' + Date.now(), { muteHttpExceptions: true });
      if (r.getResponseCode() === 200) {
        var fresh = r.getContentText();
        compileBot_(fresh);               // упадёт, если в коде синтаксическая ошибка
        src = fresh;
        saveBot_(cache, src);
      } else {
        console.error('GitHub: HTTP ' + r.getResponseCode());
      }
    } catch (err) {
      console.error('Не удалось обновить код бота: ' + err);
    }
  }

  if (!src) src = cache.get('bot_src') || readBackup_();
  if (!src) throw new Error('Нет кода бота: GitHub недоступен и сохранённой копии ещё нет.');
  app_.cached = compileBot_(src);
  return app_.cached;
}

function compileBot_(src) {
  var ret = BOT_EXPORTS.map(function (n) {
    return JSON.stringify(n) + ': (typeof ' + n + " !== 'undefined' ? " + n + ' : undefined)';
  }).join(', ');
  return new Function(src + '\n;return {' + ret + '};')();
}

function saveBot_(cache, src) {
  cache.put('bot_src', src, 21600);
  var props = PropertiesService.getScriptProperties();
  var hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, src, Utilities.Charset.UTF_8));
  if (props.getProperty('BOT_SRC_HASH') === hash) return;
  // резервная копия в свойствах скрипта (по 8000 символов)
  var old = Number(props.getProperty('BOT_SRC_PARTS') || 0);
  var parts = Math.ceil(src.length / 8000);
  var kv = { BOT_SRC_PARTS: String(parts), BOT_SRC_HASH: hash };
  for (var i = 0; i < parts; i++) kv['BOT_SRC_' + i] = src.slice(i * 8000, (i + 1) * 8000);
  props.setProperties(kv);
  for (var j = parts; j < old; j++) props.deleteProperty('BOT_SRC_' + j);
}

function readBackup_() {
  var props = PropertiesService.getScriptProperties();
  var n = Number(props.getProperty('BOT_SRC_PARTS') || 0);
  if (!n) return null;
  var s = '';
  for (var i = 0; i < n; i++) s += props.getProperty('BOT_SRC_' + i) || '';
  return s;
}
