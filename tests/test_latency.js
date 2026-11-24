/* v1.12.1 响应速度专项测试 */
const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync("E:/Desktop/一盏孤灯伴长夜/沧州交通学院-大学Vlog/AI/AIApp/暖语-情感陪伴助手/index.html", "utf-8");
let pass = 0, fail = 0;
function step(n, f) { try { f(); pass++; console.log("OK  ", n); } catch (e) { fail++; console.log("FAIL", n, "-", e.message); } }
const db = {};
const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://nuanyu.local/",
  beforeParse(w) {
    w.AndroidBridge = { chatLoad(k){return JSON.stringify(db[k]||[])}, chatSave(k,v){db[k]=JSON.parse(v)}, chatReplace(k,v){db[k]=JSON.parse(v)}, chatCount(){return 0}, chatDelete(k){delete db[k]}, clearAllChats(){}, setApiKey(){return true}, clearApiKey(){}, setChatOpen(){}, scheduleGoodnight(){}, scheduleReminder(){}, speak(){} };
    w.alert = () => {}; w.confirm = () => true;
  }});
const w = dom.window, d = w.document;
setTimeout(() => {
  d.getElementById("obStart").click();
  setTimeout(() => {
    step("qwen3 系列自动关闭思考模式", () => {
      w.state.api.model = "qwen3-max";
      const b = w.reqBody({ model: w.modelName(), messages: [] });
      if (b.enable_thinking !== false) throw new Error("enable_thinking 未关闭");
    });
    step("非 qwen3 模型不加该参数（避免兼容性问题）", () => {
      w.state.api.model = "qwen-plus";
      const b = w.reqBody({ model: w.modelName() });
      if ("enable_thinking" in b) throw new Error("不该加 enable_thinking");
    });
    step("工具意图正则收紧：闲聊不再误走慢通道", () => {
      const src = html;
      const m = src.match(/var isToolIntent = (\/.+\/)\.test\(text\)/);
      if (!m) throw new Error("正则没找到");
      const re = new RegExp(m[1].replace(/^\//,"").replace(/\/$/,""));
      if (re.test("你要记住哦") || re.test("这个日子别忘啦") || re.test("今天日程满了")) throw new Error("误命中闲聊");
      if (!re.test("提醒我明天八点开会") || !re.test("定个闹钟") || !re.test("叫我起床")) throw new Error("漏掉真工具意图");
    });
    step("流式与工具请求都带 60 秒超时", () => {
      if (!/fetchT\(apiBase\(\) \+ "\/chat\/completions"/.test(html)) throw new Error("没用 fetchT");
      if ((html.match(/, 60000\)/g) || []).length < 2) throw new Error("超时参数缺失");
    });
    step("AbortController 超时会转成 __timeout", () => {
      const src = html;
      if (!/new Error\("__timeout"\)/.test(src)) throw new Error("缺超时转换");
      if (!/__timeout\|timeout\/i/.test(src)) throw new Error("catch 未区分超时");
    });
    step("超时文案与普通失败文案不同", () => {
      if (!/连接超时（60 秒无响应/.test(html)) throw new Error("缺超时提示");
      if (!/等了好久都没等到回复/.test(html)) throw new Error("缺角色化超时话术");
    });
    step("打字指示器带秒数计时", () => {
      if (!/typingT0 = Date\.now\(\)/.test(html)) throw new Error("缺计时起点");
      if (!/\.t-sec/.test(html)) throw new Error("缺样式/元素");
    });
    step("摘要任务同样关闭思考", () => {
      if (!/reqBody\(\{ model: modelName\(\), temperature:0\.2/.test(html)) throw new Error("摘要未走 reqBody");
    });
    console.log("\n通过 " + pass + " / 失败 " + fail);
    process.exit(fail ? 1 : 0);
  }, 800);
}, 400);
