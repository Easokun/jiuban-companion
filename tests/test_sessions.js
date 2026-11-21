/* 会话列表版冒烟测试：验证「消息列表 → 独立对话框 → 返回」的完整流程 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML_PATH = 'E:/Desktop/一盏孤灯伴长夜/沧州交通学院-大学Vlog/AI/AIApp/暖语-情感陪伴助手/index.html';
const html = fs.readFileSync(HTML_PATH, 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const db = {};
const kv = {};
const log = [];

const dom = new JSDOM(html, {
  url: 'file:///android_asset/www/index.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    /* jsdom 不实现 layout，这里给滚动属性一个安全的默认值 */
    Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', { get() { return 100; }, configurable: true });
    window.AndroidBridge = {
      getChat(role) { return JSON.stringify(db[role] || []); },
      appendChat(role, who, text, ts) { (db[role] = db[role] || []).push({ role: who, text, ts: Number(ts) }); return true; },
      replaceChat(role, json) { db[role] = JSON.parse(json); return true; },
      trimChat(role, keep) { db[role] = (db[role] || []).slice(-keep); },
      clearChat(role) { db[role] = []; },
      clearAllChats() { Object.keys(db).forEach(k => delete db[k]); },
      chatCount() { return Object.keys(db).reduce((n, k) => n + db[k].length, 0); },
      getApiKey() { return kv.key || ''; },
      setApiKey(k) { kv.key = k; return true; },
      hasApiKey() { return !!kv.key; },
      clearApiKey() { delete kv.key; },
      saveBackup(name, content) { log.push('saveBackup'); return '/fake/' + name; },
      scheduleReminder() {}, cancelReminder() {}, scheduleGoodnight() {},
      speak() {}, stopSpeak() {}
    };
  }
});

const w = dom.window;
const d = w.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failed = 0;
function ok(name, cond, extra) {
  if (cond) console.log('OK   ' + name + (extra ? '  [' + extra + ']' : ''));
  else { console.log('FAIL ' + name + (extra ? '  [' + extra + ']' : '')); failed++; }
}
const sessList = () => Array.from(d.querySelectorAll('#sessionList .sess'));
const sessName = el => el && el.querySelector('.s-name') ? el.querySelector('.s-name').textContent : '';

(async () => {
  await sleep(300);

  ok('引导页存在', !!d.getElementById('onboarding'));
  ok('默认停在引导页（未选角色）', d.getElementById('app').className.indexOf('show') < 0);

  /* 选角色 → 开始 */
  const card = d.querySelector('#roleGrid .role-card');
  ok('引导页有角色卡', !!card);
  card.click();
  d.getElementById('obStart').click();
  await sleep(700);

  ok('开始后进入该角色聊天页', d.getElementById('page-chat').classList.contains('show'));
  ok('聊天时隐藏底部导航', d.getElementById('app').classList.contains('in-chat'));
  ok('消息列表页被隐藏', !d.getElementById('page-home').classList.contains('show'));
  ok('有开场白写入库', (db['guimi'] || []).length >= 1, '条数=' + (db['guimi'] || []).length);

  /* 发一条消息 */
  d.getElementById('ipt').value = '今天真的有点累';
  d.getElementById('sendBtn').click();
  await sleep(1600);
  const guimiMsgs = (db['guimi'] || []).length;
  ok('用户消息 + 回复写入 guimi 库', guimiMsgs >= 3, '条数=' + guimiMsgs);

  /* 返回消息列表 */
  d.getElementById('chatBack').click();
  await sleep(120);
  ok('返回到消息列表', d.getElementById('page-home').classList.contains('show'));
  ok('返回后重新显示底部导航', !d.getElementById('app').classList.contains('in-chat'));
  ok('列表里有 1 个对话框', sessList().length === 1, '数量=' + sessList().length);
  ok('对话框名字是角色名', sessName(sessList()[0]).length > 0, sessName(sessList()[0]));
  ok('预览显示最后一条消息', !/还没有聊过/.test(sessList()[0].querySelector('.s-msg').textContent),
     sessList()[0].querySelector('.s-msg').textContent);

  /* 新增第二个角色 */
  d.getElementById('btnAddRole').click();
  await sleep(60);
  const items = Array.from(d.querySelectorAll('#rsGrid .rs-item'));
  ok('角色面板列出全部 8 个角色', items.length === 8, '数量=' + items.length);
  items[1].click();
  await sleep(700);

  ok('进入第二个角色的对话框', w.state.cur === 'banlv' && d.getElementById('page-chat').classList.contains('show'), w.state.cur);
  ok('第二个角色的聊天是空的（不会串台）', (db['banlv'] || []).length <= 1, '条数=' + (db['banlv'] || []).length);

  d.getElementById('ipt').value = '你好呀';
  d.getElementById('sendBtn').click();
  await sleep(1600);
  ok('banlv 自己的消息写入自己的库', (db['banlv'] || []).length >= 2, '条数=' + (db['banlv'] || []).length);

  d.getElementById('chatBack').click();
  await sleep(120);
  ok('列表变成 2 个对话框', sessList().length === 2, '数量=' + sessList().length);
  ok('两个对话框名字不同', sessName(sessList()[0]) !== sessName(sessList()[1]),
     sessName(sessList()[0]) + ' / ' + sessName(sessList()[1]));

  /* 回到第一个对话框，历史还在 */
  const first = sessList().find(el => /小暖|闺蜜/.test(sessName(el)));
  ok('能找到第一个角色的对话框', !!first);
  first.click();
  await sleep(200);
  ok('切回后聊天记录仍在', d.querySelectorAll('#msgs .msg').length >= 3,
     '气泡=' + d.querySelectorAll('#msgs .msg').length);

  /* 未读：给另一个角色推一条消息 */
  w.chatOpen = true;
  w.pushBot('测试未读消息', 'banlv');
  d.getElementById('chatBack').click();
  await sleep(120);
  let badgeSess = sessList().find(el => el.querySelector('.s-badge'));
  ok('非当前对话框收到消息会显示未读红点', !!badgeSess,
     badgeSess ? sessName(badgeSess) + ':' + badgeSess.querySelector('.s-badge').textContent : '无');
  if (badgeSess) {
    badgeSess.click();
    await sleep(150);
    d.getElementById('chatBack').click();
    await sleep(120);
    ok('进入后未读清零', !sessList().find(el => el.querySelector('.s-badge')));
  }

  /* 长按移除（直接调确认函数） */
  w.confirm = () => true;
  w.askRemove('banlv');
  await sleep(80);
  ok('移除后列表只剩 1 个对话框', sessList().length === 1, '数量=' + sessList().length);
  ok('移除对话框不会删聊天记录', (db['banlv'] || []).length >= 2, 'banlv 仍有 ' + (db['banlv'] || []).length + ' 条');

  /* 安全：localStorage 不该有明文 Key */
  let lsDump = '';
  try { for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); lsDump += k + '=' + w.localStorage.getItem(k) + '\n'; } } catch (e) {}
  ok('本地存储里没有 API Key 字段', !/api_key|sk-/.test(lsDump.replace(/nuanyu_api=/g, '')));

  console.log('\n错误汇总:', errors.length ? errors : '无');
  console.log(failed ? ('失败 ' + failed + ' 项') : '全部通过');
  process.exit(failed || errors.length ? 1 : 0);
})();
