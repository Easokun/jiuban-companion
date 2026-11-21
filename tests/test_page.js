/* 暖语页面冒烟测试：用 jsdom 加载 index.html，模拟 AndroidBridge，验证关键流程不报错 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML_PATH = 'E:/Desktop/一盏孤灯伴长夜/沧州交通学院-大学Vlog/AI/AIApp/暖语-情感陪伴助手/index.html';
const html = fs.readFileSync(HTML_PATH, 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

// 内存版原生存储
const db = {};          // role -> [msgs]
const kv = {};          // secure store
const log = [];

const dom = new JSDOM(html, {
  url: 'file:///android_asset/www/index.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.AndroidBridge = {
      getChat(role) { log.push('getChat:' + role); return JSON.stringify(db[role] || []); },
      appendChat(role, who, text, ts) {
        (db[role] = db[role] || []).push({ role: who, text, ts: Number(ts) });
        log.push('append:' + role);
        return true;
      },
      replaceChat(role, json) { db[role] = JSON.parse(json); log.push('replace:' + role); return true; },
      trimChat(role, keep) { db[role] = (db[role] || []).slice(-keep); },
      clearChat(role) { db[role] = []; },
      clearAllChats() { Object.keys(db).forEach(k => delete db[k]); },
      chatCount() { return Object.keys(db).reduce((n, k) => n + db[k].length, 0); },
      getApiKey() { return kv.key || ''; },
      setApiKey(k) { kv.key = k; return true; },
      hasApiKey() { return !!kv.key; },
      clearApiKey() { delete kv.key; },
      saveBackup(name, content) { log.push('saveBackup:' + name + ':' + content.length); return '/fake/' + name; },
      scheduleReminder() {}, cancelReminder() {}, scheduleGoodnight() {},
      speak() {}, stopSpeak() {}
    };
  }
});

const w = dom.window;
const d = w.document;

function step(name, fn) {
  try { fn(); console.log('OK   ' + name); }
  catch (e) { console.log('FAIL ' + name + ' -> ' + e.message); errors.push(name + ': ' + e.message); }
}

setTimeout(() => {
  step('页面已渲染', () => {
    if (!d.getElementById('app')) throw new Error('缺少 #app');
  });

  step('首次引导→选角色', () => {
    const btn = d.querySelector('#onboarding .role-item, #onboarding button');
    if (!btn) throw new Error('找不到引导页角色按钮');
    btn.click();
  });

  step('发一条消息（走离线）', () => {
    const ipt = d.getElementById('ipt');
    ipt.value = '我今天好累啊，加班到十点';
    d.getElementById('sendBtn').click();
  });

  setTimeout(() => {
    step('消息写入原生库', () => {
      const total = Object.keys(db).reduce((n, k) => n + db[k].length, 0);
      if (total === 0) throw new Error('数据库里没有消息');
      console.log('     库中消息数:', total, Object.keys(db));
    });

    step('存储信息显示原生库', () => {
      w.fillMore();
      const txt = d.getElementById('storageInfo').textContent;
      if (!/本机数据库/.test(txt)) throw new Error('存储信息未显示原生库: ' + txt);
      console.log('     ' + txt);
    });

    step('切换角色会懒加载', () => {
      w.switchRole('siDang');
      console.log('     已切到死党');
    });

    step('清理旧聊天', () => {
      w.confirm = () => true;
      d.getElementById('btnTrim').click();
    });

    step('记忆本注入离线回复', () => {
      w.state.mems[w.state.cur] = ['我喜欢深夜听歌'];
      const reply = w.offlineReply('最近总想起以前');
      if (!reply) throw new Error('回复为空');
      console.log('     离线回复:', reply.replace(/\n/g, ' / '));
    });

    step('导出加密备份', () => {
      if (typeof w.encryptBackup !== 'function') throw new Error('缺少 encryptBackup');
    });

    console.log('\n错误汇总:', errors.length ? errors : '无');
    process.exit(errors.length ? 1 : 0);
  }, 1800);
}, 600);
