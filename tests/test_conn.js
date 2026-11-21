/* 连接状态与"测试连接"验证：用假 fetch 模拟各种返回 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML_PATH = 'E:/Desktop/一盏孤灯伴长夜/沧州交通学院-大学Vlog/AI/AIApp/暖语-情感陪伴助手/index.html';
const html = fs.readFileSync(HTML_PATH, 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + e.message));

const db = {}, kv = {};
const dom = new JSDOM(html, {
  url: 'file:///android_asset/www/index.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.AndroidBridge = {
      getChat: r => JSON.stringify(db[r] || []),
      appendChat(r, who, text, ts) { (db[r] = db[r] || []).push({ role: who, text, ts: Number(ts) }); return true; },
      replaceChat(r, j) { db[r] = JSON.parse(j); return true; },
      trimChat(r, k) { db[r] = (db[r] || []).slice(-k); },
      clearChat(r) { db[r] = []; },
      clearAllChats() {},
      chatCount: () => 0,
      getApiKey: () => kv.key || '',
      setApiKey(k) { kv.key = k; return true; },
      hasApiKey: () => !!kv.key,
      clearApiKey() { delete kv.key; },
      saveBackup: () => '/fake/x.json',
      scheduleReminder() {}, cancelReminder() {}, scheduleGoodnight() {}, speak() {}, stopSpeak() {}
    };
  }
});
const w = dom.window, d = w.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
function ok(name, cond, extra) {
  if (cond) console.log('OK   ' + name + (extra ? '  [' + extra + ']' : ''));
  else { fail++; console.log('FAIL ' + name + '  [' + (extra || '') + ']'); }
}
function ajaxOnce(body, status) {
  w.fetch = () => Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
  });
}
function setCfg({ on = true, key = 'sk-test', url = '', model = 'qwen3.7-max' }) {
  const sw = d.getElementById('apiSwitch');
  sw.classList.toggle('on', on);
  d.getElementById('apiUrl').value = url;
  d.getElementById('apiKey').value = '';
  d.getElementById('apiModel').value = model;
  w.state.api = { on, url, key, model };
}
function out() { return d.getElementById('apiTestOut').textContent || ''; }
function chip() { return d.getElementById('modeChipText').textContent || ''; }

(async () => {
  await sleep(500);

  ok('启动即为离线模式提示', /离线模式/.test(chip()), chip());
  ok('聊天页顶部显示"离线对话"', /离线对话/.test(d.getElementById('headStatus').textContent), d.getElementById('headStatus').textContent);

  /* 1. 成功连接 */
  setCfg({});
  ajaxOnce({ model: 'qwen3.7-max', choices: [{ message: { content: '在的' } }] }, 200);
  w.testConnection();
  await sleep(300);
  ok('200 时提示连接成功', /连接成功/.test(out()), out().split('\n')[0]);
  ok('状态里出现模型名', /qwen3\.7-max/.test(out()));
  ok('顶部状态变为已连通', /已连通/.test(chip()), chip());
  ok('聊天页顶部变为 AI 已连通', /AI 已连通/.test(d.getElementById('headStatus').textContent), d.getElementById('headStatus').textContent);

  /* 2. Key 无效 */
  setCfg({});
  ajaxOnce({ error: { message: 'Invalid API-key provided.' } }, 401);
  w.testConnection();
  await sleep(300);
  ok('401 给出"Key 无效"解释', /Key 无效/.test(out()), out().split('\n')[0]);
  ok('401 后顶部显示连接失败', /失败/.test(chip()), chip());

  /* 3. 模型名写错 */
  setCfg({ model: 'qwen-not-exist' });
  ajaxOnce({ error: { message: 'Model not exist.' } }, 404);
  w.testConnection();
  await sleep(300);
  ok('404 提示地址或模型不存在', /模型不存在|地址或模型/.test(out()), out().split('\n')[0]);

  /* 4. 网络层失败 */
  setCfg({});
  w.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  w.testConnection();
  await sleep(300);
  ok('网络失败给出网络层原因清单', /网络层失败/.test(out()), out().split('\n')[0]);

  /* 5. 自建代理：服务器通但没配 Key */
  delete w.state.apiStatus;
  setCfg({ url: 'http://1.2.3.4/api' });
  w.fetch = (u) => {
    if (String(u).endsWith('/health')) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, key_configured: false, token_configured: true })) });
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') });
  };
  w.testConnection();
  await sleep(300);
  ok('代理缺 Key 能准确指出', /服务端没配百炼 Key|DASHSCOPE_API_KEY/.test(out()), out().split('\n')[0]);

  /* 6. 没开开关 / 没 Key 的前置拦截 */
  setCfg({ on: false });
  w.testConnection();
  await sleep(200);
  ok('离线模式不发起请求并说明原因', /离线模式/.test(out()), out().split('\n')[0]);

  setCfg({ key: '' });
  w.testConnection();
  await sleep(200);
  ok('缺 Key 时明确提示', /没有 API Key/.test(out()), out().split('\n')[0]);
  ok('缺 Key 时顶部标为缺 Key', /缺 Key|离线/.test(chip()), chip());

  console.log('\n失败数:', fail, '| 页面错误:', errors.length ? errors : '无');
  process.exit(fail ? 1 : 0);
})();
