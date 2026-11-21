/* 浏览器兜底路径：没有 AndroidBridge 时应写 localStorage，且能正常聊天 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync('E:/Desktop/一盏孤灯伴长夜/沧州交通学院-大学Vlog/AI/AIApp/暖语-情感陪伴助手/index.html', 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/alert/.test(e.message)) errors.push(e.message); });

const dom = new JSDOM(html, {
  url: 'https://nuanyu.local/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(w) { w.confirm = () => true; w.alert = () => {}; }
});
const w = dom.window, d = w.document;

setTimeout(() => {
  const btn = d.querySelector('#onboarding .role-item, #onboarding button');
  if (btn) btn.click();
  setTimeout(() => {
    d.getElementById('ipt').value = '你好呀';
    d.getElementById('sendBtn').click();
    setTimeout(() => {
      const raw = w.localStorage.getItem('nuanyu_chats');
      const arr = raw ? JSON.parse(raw).guimi || [] : [];
      console.log('无原生桥时写入 localStorage:', Array.isArray(arr) ? arr.length + ' 条' : 'FAIL');
      console.log('NATIVE_CHAT 应为 false:', w.NATIVE_CHAT === false ? 'OK' : 'FAIL');
      console.log('错误:', errors.length ? errors : '无');
      process.exit(0);
    }, 900);
  }, 500);
}, 500);
