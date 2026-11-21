/* 迁移 + 持久化测试：浏览器里有旧数据 → 首次启动应搬进原生库 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync('E:/Desktop/一盏孤灯伴长夜/沧州交通学院-大学Vlog/AI/AIApp/暖语-情感陪伴助手/index.html', 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/alert/.test(e.message)) errors.push(e.message); });

const db = {};
const legacy = {
  guimi: [
    { role: 'user', text: '老版本消息一', ts: 1700000000000 },
    { role: 'bot', text: '老版本回复一', ts: 1700000001000 }
  ]
};

const dom = new JSDOM(html, {
  url: 'https://nuanyu.local/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.confirm = () => true;
    window.alert = () => {};
    window.AndroidBridge = {
      getChat(role) { return JSON.stringify(db[role] || []); },
      appendChat(role, who, text, ts) { (db[role] = db[role] || []).push({ role: who, text, ts: Number(ts) }); return true; },
      replaceChat(role, json) { db[role] = JSON.parse(json); return true; },
      trimChat() {}, clearChat(role) { db[role] = []; }, clearAllChats() { for (const k in db) delete db[k]; },
      chatCount() { return Object.keys(db).reduce((n, k) => n + db[k].length, 0); },
      getApiKey() { return ''; }, setApiKey() { return true; }, hasApiKey() { return false; }, clearApiKey() {},
      saveBackup() { return '/fake'; }, scheduleReminder() {}, cancelReminder() {}, scheduleGoodnight() {}, speak() {}, stopSpeak() {}
    };
    window.localStorage.setItem('nuanyu_cur', JSON.stringify('guimi'));
    window.localStorage.setItem('nuanyu_chats', JSON.stringify(legacy));
  }
});

const w = dom.window;
setTimeout(() => {
  const migrated = (db.guimi || []).length;
  const left = w.localStorage.getItem('nuanyu_chats');
  console.log('迁移到原生库条数:', migrated, migrated === 2 ? 'OK' : 'FAIL');
  console.log('localStorage 旧数据是否已清:', left === null ? 'OK' : 'FAIL(' + left + ')');
  console.log('当前角色内存中的消息数:', (w.state.chats.guimi || []).length);

  // 模拟重启：同一个 db 再开一次
  const dom2 = new JSDOM(html, {
    url: 'https://nuanyu.local/',
    runScripts: 'dangerously',
    virtualConsole: vc,
    beforeParse(window) {
      window.confirm = () => true;
      window.alert = () => {};
      window.AndroidBridge = {
        getChat(role) { return JSON.stringify(db[role] || []); },
        appendChat() { return true; }, replaceChat() { return true; }, trimChat() {}, clearChat() {},
        clearAllChats() {}, chatCount() { return 0; },
        getApiKey() { return ''; }, setApiKey() { return true; }, hasApiKey() { return false; }, clearApiKey() {},
        saveBackup() { return '/fake'; }, scheduleReminder() {}, cancelReminder() {}, scheduleGoodnight() {}, speak() {}, stopSpeak() {}
      };
    }
  });
  setTimeout(() => {
    const n = (dom2.window.state.chats.guimi || []).length;
    console.log('重启后从数据库读回:', n, n === 2 ? 'OK' : 'FAIL');
    console.log('错误:', errors.length ? errors : '无');
    process.exit(0);
  }, 600);
}, 900);
