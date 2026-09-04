# 梗灵大陆 · GengLing Continent

> 三消 + RPG 的解压小游戏。纯 H5（Canvas + WebAudio 全合成音效，零外部资源），可一键打包为安卓 APK。

![build](https://github.com/wuliao00/gengling/actions/workflows/build-apk.yml/badge.svg)
![language](https://img.shields.io/badge/language-JavaScript-f7df1e?logo=javascript&logoColor=black)
![platform](https://img.shields.io/badge/platform-Android%20%7C%20Web-3DDC84?logo=android&logoColor=white)
![render](https://img.shields.io/badge/render-Canvas%202D-orange)
![audio](https://img.shields.io/badge/audio-WebAudio%20%E5%85%A8%E5%90%88%E6%88%90-blueviolet)
![deps](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)
![apk](https://img.shields.io/badge/APK-GitHub%20Actions%20%E4%BA%91%E7%AB%AF%E6%9E%84%E5%BB%BA-blue)
![license](https://img.shields.io/badge/license-%E6%9C%AA%E9%99%84%C2%B7%E4%BF%9D%E7%95%99%E6%89%80%E6%9C%89%E6%9D%83%E5%88%A9-lightgrey)

---

## ✨ 特性

- **三消棋盘**：8×8、3/4/5 连、行/列炸弹、彩虹球、连锁 combo、冰块/锁链障碍。
- **RPG 战斗**：7 只梗灵角色（主动技 + 被动 + 觉醒）、逐角色 HP、11 种 Boss 技能、共鸣组合。
- **156 关 + 无尽模式**：8 章主线（含隐藏章）+ 无限波次爬塔。
- **自动战斗**：一键托管，自动释放就绪技能 + 自动消除。
- **梗之护盾（分级）**：Pro Mini / Max / Pro Max / Ultra，减伤 50%–100%。
- **合成音频**：3 首战斗 BGM + 鼓点、7 角色专属招式音、开场/点击/胜负音，全部 WebAudio 实时合成，无需音频文件。
- **安卓 APK**：WebView 壳 + GitHub Actions 云端构建，离线可玩。

##  快速开始（网页版）

```bash
# 方式一：Python
python server.py            # 端口 8081，禁缓存

# 方式二：Node（无需依赖）
node -e "/* 见 HANDOFF.md 的静态服务器片段 */"
```

手机（同一 Wi-Fi）打开：`http://<电脑局域网IP>:8081/index.html`
调试入口：`?dev=1`（开发者面板）、`?goto=关卡ID`（直达指定关）。

## 📦 构建安卓 APK（云端，无需本地 Android Studio）

push 到 `main` 即触发 `.github/workflows/build-apk.yml`：

1. GitHub Actions（ubuntu + JDK17 + Android SDK）执行 `./gradlew assembleDebug`；
2. 产物上传为 Artifact **`gengling-debug-apk`**；
3. 在 Actions 页面下载 zip，解压得 `app-debug.apk`，安装即可（竖屏、离线可玩）。

> 安卓壳工程在 `android/`：WebView + `WebViewAssetLoader` 加载打包进 assets 的 H5（ES Module 需 https 安全上下文）。
> 依赖含 `kotlin-bom` 以规避 androidx 传递依赖的 kotlin-stdlib 重复类问题。

## 🧪 测试

```bash
node tests/engine.test.mjs   # 三消引擎 26 项
node tests/meta.test.mjs     # 元游戏 248 断言
node tests/ui.test.mjs       # jsdom 无头集成 26 项
```

## 🗂 项目结构

```
gengling/
├── index.html            # H5 入口
├── css/                  # game.css + cartoon.css（卡通皮肤）
├── js/
│   ├── core/             # board.js 三消引擎 / rng.js（纯逻辑，无 DOM）
│   ├── data/             # characters / levels / items（数值配置）
│   ├── game/             # battle / skills / meta / save / sfx（战斗与元系统）
│   ├── ui/               # render / scenes / input / avatars / map / art
│   └── main.js           # 主循环粘合
├── android/              # 安卓 WebView 壳工程（Gradle）
├── .github/workflows/    # build-apk.yml（云端构建 APK）
└── tests/                # 三套测试
```

## 🔒 安全说明

- **纯客户端**：无后端、无服务器、无网络请求，存档存于本地（网页 `localStorage` / APK WebView DOM Storage）。
- **无密钥**：仓库不含任何 token / 私钥 / API key。
- **WebView 加固**：禁用 `file://` 与 `content://` 访问、不暴露 JS 接口，仅通过 `WebViewAssetLoader` 的虚拟 https 域加载包内资源。
- 仓库已**公开**，GitHub 免费安全扫描（secret scanning / Dependabot / CodeQL）已启用；本仓库零运行时依赖，无供应链攻击面。

## 📄 许可

当前**未附开源许可证**（默认保留所有权利）。仓库公开仅供展示与存档；如需他人复用或商用分发，请另行选择合适的许可证。
