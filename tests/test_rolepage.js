/* 角色主页 v1.9 专项冒烟测试 */
const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync("E:/Desktop/一盏孤灯伴长夜/沧州交通学院-大学Vlog/AI/AIApp/暖语-情感陪伴助手/index.html", "utf-8");

let pass = 0, fail = 0;
function step(name, fn) {
  try { fn(); pass++; console.log("OK  ", name); }
  catch (e) { fail++; console.log("FAIL", name, "-", e.message); }
}
const db = {}; /* 模拟原生 SQLite */
const dom = new JSDOM(html, {
  runScripts: "dangerously", url: "https://nuanyu.local/",
  beforeParse(w) {
    w.AndroidBridge = {
      chatLoad(k){ return JSON.stringify(db[k] || []); },
      chatSave(k, v){ db[k] = JSON.parse(v); },
      chatReplace(k, v){ db[k] = JSON.parse(v); },
      chatCount(){ return Object.keys(db).reduce((n,k)=>n+db[k].length,0); },
      chatDelete(k){ delete db[k]; },
      clearAllChats(){ Object.keys(db).forEach(k=>delete db[k]); },
      setApiKey(){ return true; }, clearApiKey(){},
      setChatOpen(){}, scheduleGoodnight(){}, scheduleReminder(){}, speak(){}
    };
    w.alert = () => {};
    w.confirm = () => true;
  }
});
const { window: w } = dom, d = w.document;
setTimeout(() => {
  /* 引导页建角色 */
  d.getElementById("obStart").click();
  step("引导页建角色并直达聊天框", () => {
    if (!d.getElementById("page-chat").classList.contains("show")) throw new Error("没进聊天");
  });
  step("设置页签已移除", () => {
    if (d.querySelector('[data-tab="page-set"]')) throw new Error("设置页签还在");
    if (d.getElementById("page-set")) throw new Error("page-set 还在");
  });
  /* 打开角色主页 */
  d.getElementById("chatProfile").click();
  step("聊天右上角进入角色主页", () => {
    if (!d.getElementById("page-role").classList.contains("show")) throw new Error("角色主页没打开");
    if (d.getElementById("page-chat").classList.contains("show")) throw new Error("聊天页还在最上层");
  });
  step("主页显示当前角色身份", () => {
    if (!d.getElementById("setBotName").value) throw new Error("名字没填进表单");
  });
  /* 改头像+名字保存 */
  d.getElementById("setEmoji").value = "🌟";
  d.getElementById("setBotName").value = "小星星";
  d.getElementById("setSave").click();
  step("保存头像与名字生效", () => {
    if (d.getElementById("roleName").textContent !== "小星星") throw new Error("名字未更新");
    if (d.getElementById("roleAvatar").textContent !== "🌟") throw new Error("头像未更新");
  });
  /* 记忆本 */
  d.getElementById("memBox").value = "喜欢深夜听歌\n在准备期末考试";
  d.getElementById("memSave").click();
  step("记忆本保存并显示条数", () => {
    const t = d.getElementById("memHealth").textContent;
    if (!/2 条/.test(t)) throw new Error("记忆健康行不对: " + t);
  });
  /* 重新锚定：先伪造一份摘要 */
  w.state.summaries["guimi"] = "旧摘要旧摘要旧摘要";
  w.state.summaryDone["guimi"] = 40;
  d.getElementById("btnReanchor").click();
  step("重新锚定清掉压缩摘要", () => {
    if (w.state.summaries["guimi"]) throw new Error("摘要没被清掉");
    if (w.state.summaryDone["guimi"]) throw new Error("summaryDone 没清");
  });
  /* 纪念日按角色 */
  d.getElementById("annivName").value = "认识的日子";
  d.getElementById("annivDate").value = "2026-03-05";
  d.getElementById("annivAdd").click();
  step("纪念日写入当前角色", () => {
    const arr = w.state.annivs["guimi"] || [];
    if (arr.length !== 1 || arr[0].name !== "认识的日子") throw new Error("annivs 没写入");
    if (w.LS.get("anniv", null)) throw new Error("旧 anniv 键还在");
  });
  step("纪念日列表渲染", () => {
    const t = d.getElementById("annivList").textContent;
    if (!/认识的日子/.test(t)) throw new Error("列表没渲染");
  });
  /* 返回聊天，头像同步 */
  d.getElementById("roleBack").click();
  step("返回聊天页", () => {
    if (!d.getElementById("page-chat").classList.contains("show")) throw new Error("没回到聊天");
  });
  /* 语音开关按角色 */
  d.getElementById("chatProfile").click();
  d.getElementById("voiceSwitch").click();
  step("语音开关写进该角色的档案", () => {
    if (w.state.profiles["guimi"].voice !== true) throw new Error("voice 没存进 profile");
  });
  /* 全局弹层 */
  d.getElementById("btnGoApi").click();
  step("AI 模型弹层打开", () => {
    if (!d.getElementById("apiSheet").classList.contains("show")) throw new Error("apiSheet 没开");
  });
  d.getElementById("apiClose").click();
  d.getElementById("btnGoMore").click();
  step("数据与推送弹层打开", () => {
    if (!d.getElementById("moreSheet").classList.contains("show")) throw new Error("moreSheet 没开");
  });
  d.getElementById("moreClose").click();
  /* 导出聊天记录 */
  d.getElementById("roleBack").click();
  setTimeout(() => {
    step("导出聊天弹窗可打开", () => {
      d.getElementById("btnExportChat").click();
      if (!d.getElementById("modal").classList.contains("show")) throw new Error("modal 没开");
      if (!/聊天记录/.test(d.getElementById("mdTitle").textContent)) throw new Error("标题不对");
    });
    console.log("\n通过 " + pass + " / 失败 " + fail);
    process.exit(fail ? 1 : 0);
  }, 800);
}, 400);
