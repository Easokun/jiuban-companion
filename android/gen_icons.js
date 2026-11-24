/* 久伴 v1.12 图标生成：陪伴图标（白色剪影）+ 粉橙渐变底
 * 产出：
 *  - mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png  传统图标（圆角方 + 渐变 + 白剪影）
 *  - mipmap-xxxhdpi/ic_launcher_bg.png / ic_launcher_fg.png  自适应图标层（432px）
 *  - drawable/ic_notif.png  通知栏小图标（白色剪影，透明底）
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const RES = path.join(ROOT, "res");

/* 图标原始 path（iconfont「陪伴」，viewBox 0 0 1109 1024） */
const ICON_PATH = "M557.293411 75.099832a342.117974 342.117974 0 0 1 453.388593 22.724281 332.558104 332.558104 0 0 1 94.031509 185.86895 344.7822 344.7822 0 0 1 0 104.610054 45.99708 45.99708 0 0 1-51.090453 38.552919 43.567933 43.567933 0 0 1-37.377525-50.228498 256.079143 256.079143 0 0 0 0-77.419276 245.422239 245.422239 0 0 0-69.348238-137.364363 253.649996 253.649996 0 0 0-358.651848 4.153058l-32.049073 32.049073-31.343836-31.343836a256.62766 256.62766 0 0 0-362.804906 362.804906l417.108103 417.186462a45.291844 45.291844 0 0 1-64.019786 64.019786L98.027848 593.526886A347.681505 347.681505 0 0 1 557.606849 74.943113z m467.650038 440.380901a193.234751 193.234751 0 0 1-1.332113 272.377938q-101.47567 113.621407-155.857226 168.081323a584.954346 584.954346 0 0 1-45.448563 42.00074 112.759451 112.759451 0 0 1-20.216774 13.39949 44.978405 44.978405 0 0 1-57.045782-7.365801l-208.514872-208.514872a196.682573 196.682573 0 0 1 246.127475-302.781459 192.921313 192.921313 0 0 1 242.366215 22.881001z m-211.570895 65.743697l-31.970713 32.049073-31.343837-31.343837a105.707088 105.707088 0 0 0-149.35338 149.43174l183.048005 183.048004q9.324791-8.697915 21.705606-21.078729c34.791658-34.791658 85.647033-89.643372 153.976596-166.122333a103.199581 103.199581 0 1 0-145.983917-145.983918z";

const VB_W = 1109, VB_H = 1024;           /* 原始 viewBox */
const GRAD = ["#F0618A", "#FF9E68"];      /* App 主题色 */

/* 把图标 path 缩放到指定宽度、居中到画布 */
function iconGroup(canvas, iconW, fill) {
  const s = iconW / VB_W;
  const tx = (canvas - VB_W * s) / 2;
  const ty = (canvas - VB_H * s) / 2;
  return `<g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${s.toFixed(5)})"><path fill="${fill}" stroke="${fill}" stroke-width="40" stroke-linejoin="round" stroke-linecap="round" d="${ICON_PATH}"/></g>`;
}

function gradientDef(id) {
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GRAD[0]}"/><stop offset="1" stop-color="${GRAD[1]}"/></linearGradient></defs>`;
}

/* 1) 传统启动图标：圆角方 + 渐变 + 白剪影（居中，占 62%） */
function legacySvg(size) {
  const c = 1024, r = 230;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${c} ${c}">
${gradientDef("g")}
<rect width="${c}" height="${c}" rx="${r}" fill="url(#g)"/>
${iconGroup(c, Math.round(c * 0.64), "#FFFFFF")}
</svg>`;
}

/* 2) 自适应图标背景层：满幅渐变（不圆角，系统来裁） */
function bgSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${gradientDef("g")}<rect width="${size}" height="${size}" fill="url(#g)"/>
</svg>`;
}

/* 3) 自适应图标前景层：透明底 + 白剪影（宽 270，落在 66% 安全区内） */
function fgSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${iconGroup(size, Math.round(size * 270 / 432), "#FFFFFF")}
</svg>`;
}

/* 4) 通知栏小图标：透明底 + 白剪影（宽 32/48） */
function notifSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${iconGroup(size, Math.round(size * 32 / 48), "#FFFFFF")}
</svg>`;
}

const JOBS = [
  /* 传统五套 */
  ...[[48, "mipmap-mdpi"], [72, "mipmap-hdpi"], [96, "mipmap-xhdpi"], [144, "mipmap-xxhdpi"], [192, "mipmap-xxxhdpi"]]
    .map(([sz, dir]) => ({ svg: legacySvg(sz), out: path.join(RES, dir, "ic_launcher.png"), name: `ic_launcher ${sz}px` })),
  /* 自适应两层 432px */
  { svg: bgSvg(432), out: path.join(RES, "mipmap-xxxhdpi", "ic_launcher_bg.png"), name: "ic_launcher_bg 432px" },
  { svg: fgSvg(432), out: path.join(RES, "mipmap-xxxhdpi", "ic_launcher_fg.png"), name: "ic_launcher_fg 432px" },
  /* 通知小图标 */
  { svg: notifSvg(48), out: path.join(RES, "drawable", "ic_notif.png"), name: "ic_notif 48px" },
];

(async () => {
  for (const j of JOBS) {
    await sharp(Buffer.from(j.svg)).png().toFile(j.out);
    console.log("OK", j.name, "->", path.relative(ROOT, j.out));
  }
  /* 预览图：把 192px 传统图标和 432 前景层拼一起给自己看 */
  const prev = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="480" viewBox="0 0 960 480">
<rect width="960" height="480" fill="#f5f0f4"/>
<g transform="translate(60,40) scale(0.39)">${legacySvg(1024).replace(/<svg[^>]*>|<\/svg>/g, "")}</g>
<g transform="translate(540,40) scale(0.39)">${fgSvg(1024).replace(/<svg[^>]*>|<\/svg>/g, "")}</g>
<rect x="540" y="40" width="400" height="400" fill="none" stroke="#ddd" stroke-dasharray="8 6"/>
</svg>`;
  await sharp(Buffer.from(prev)).png().toFile(path.join(ROOT, "build", "icon_preview.png"));
  console.log("OK preview -> build/icon_preview.png");
})().catch(e => { console.error(e); process.exit(1); });
