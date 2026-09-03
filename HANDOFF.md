# HANDOFF — 《梗灵大陆》会话交接（供下次继续开发）

> 更新：2026-08-30 V3 完成后。先读 `ARCHITECTURE.md`（V1 规范 + 底部 V2 增补）与 `交付说明.md`。

## 当前状态

- 纯 H5（ES Modules 零构建），逻辑层可平移微信小游戏。项目根：`gengling/`
- 测试三套全绿：`tests/engine.test.mjs`(26)、`tests/meta.test.mjs`(248 断言)、`tests/ui.test.mjs`(23, jsdom 无头集成，`npm i jsdom` 已装未存 package.json)
- V3：大嗓汪改名大狗旺、WebAudio 合成音效（js/game/sfx.js，主循环/技能/受击/胜负/老虎机全部接线，主页+暂停菜单静音开关，存档 progress.muted）、无尽模式（main.startEndless/_endlessLevel/_nextWave，波间 20% 回血+血量继承，best 存 progress.endlessBest）
- 真机 V2156A 验收通过（世界地图/Q版立绘/逐角色HP/Boss战/无尽入口+第1波）
- 局域网服务器：`python server.py`（端口 8081，no-store）。手机访问 `http://192.168.5.7:8081/index.html`，调试入口 `?goto=关卡id`
- 注意：手机有多个浏览器，系统会弹"打开方式"；UC 横屏布局会挤出棋盘，推荐系统浏览器+锁定竖屏

## 关键设计决策（勿回退）

1. **board 原子操作返回 MoveResult `{events,score,matchedCounts,...}`**，不是事件数组。所有调用方必须 `res.events` 取事件（skills.js 的 push、battle.useItem 的 flat、main._processTurn 的 applyWind 都已适配）。这是本会话修过的最大坑。
2. **敌人 trait 命名归一化**：levels.js 用 noiseWave/lightning/windMove/subBlock/allIn，battle.js 用 noise/thunder/gust/sub_convert/allin，main.startBattle 里 TRAIT_MAP 转换 + traitEvery 从 traitParam.every 提取。
3. **逐角色 HP**（V2.2）：state.members 为权威，state.hp 只是兼容镜像；战败=全员 fainted。
4. **渲染精灵缓存**：render.js 主帧循环禁止 createLinearGradient/大量 path（有 regression 会卡顿回退）；改方块视觉要改离屏精灵构建处。
5. **机制种子生成在 main.js**（`_patternCells` 确定性生成 float/treasure/sub），levels.js 的 ch3/ch4 board 数组为空。
6. 障碍/机制"相邻"均为 4 邻；float 与 chain 同为重力分段边界；sub 格 shuffleAll 时固定原位。
7. 微信小游戏平移是既定方向：save.js 已做存储适配层，UI 层是 DOM（平移时需重写为 wx UI，逻辑层 core/game/data 可直接复用）。

## 未完成 / 下一步建议（按优先级）

1. **第三/四章剩余表现层**：起雾 fog 的 UI 遮罩已实现，但"气流每2回合"只在 doSwap 后触发（useSkill 后未触发）；sub_convert trait 只记事件未真正改棋盘（board 缺 setSub 接口）
2. **音效/BGM**：完全缺失，需求文档要求 8-bit 自制音效（可 WebAudio 合成，不引资源）
3. **微信小游戏移植**：微信开发者工具已安装（用户确认），需把 DOM UI 重写为 wx 组件/canvas，core/game/data 层直接搬
4. 教学关高亮引导（level 1-5 的 tutorial 只显示文案，无高亮手势引导）
5. 成就/签到/每日任务系统（数据层已有字段 achievements 未用）
6. 二章回声石/静音区机制引擎未实现（目标用总消除数兜底）

## 本会话踩过的环境坑

- vivo/系统浏览器强缓存 ES Modules：必须用 server.py（no-store）+ 换端口可破缓存
- 子 agent 偶发 "Model request failed"：重试即可；文件所有权要严格隔离（每 agent 只写指定文件）
- Mimosa 安全钩子禁止用 Bash 写源码文件（sed/cat >> .js 会被拒），一律用 Write/Edit
- adb 偶发掉线，`adb kill-server` + 等待重连；截图 898x1999 是缩放图，device 1080x2408，比例 1.2027/1.2046（横屏时 2408x1080，比例 1.204）

---

## 2026-09-01 V4 美术升级（AI 素材接入）

- 新增 `assets/`（约 10MB）：7 角色 PNG、16 敌人 PNG、logo.png、8 章节背景 bg_ch1~8、bg_home/burst/rain（源图在 Desktop\Pictures，预处理脚本 `Desktop\workspace\_tools_prep_art.ps1`：白底洪泛转透明 + 按网格裁切 + 压缩）。
- 新增 `js/ui/art.js`：资源预载（1.2s 超时不阻塞）+ 关键词匹配敌人立绘（drawArtCentered 贴图）；加载失败自动回退原矢量绘制，jsdom 无 Image 环境直接回退。
- 接入点：avatars.js drawAvatar（角色全场景贴图）、render.js drawMonster/drawLogo、map.js THEMES 章节背景图、game.css 首页云朵/战斗放射光/失败下雨背景。
- 测试 26+248+23 全绿；PC + vivo 真机（Via 浏览器）验证首页/Boss 战/地图均生效。
---

## 2026-09-01 V5 体验大修（音效/性能/开发者模式/卡通 UI）

**修复**
- 技能/道具消除不计入任务进度：skills.js push() 累计 ctx.score/matchedCounts；battle.useSkill/useItem 返回进度；main.useSkill/onPickCell/_pickBottleTo 调 _accProgress。
- 章节 tab 点击不切换：map.js 旧 api.currentChapter 快照导致重渲染仍用旧章，改传 `{...api, currentChapter: c.id}`。
- 章节解锁兜底：scenes.js chapterUnlocked 增加 unlockedLevels>上一章末关 即视为通关（防星级缺失）。
- 性能：_endBattle/_fail 调 renderer.detach()；render.js 帧循环在画布不可见（offsetParent=null）时跳帧。

**新增**
- 战斗回合数显示（#btTurn，每次交换/技能/道具 +1）。
- 商店能量瓶（items.js energyPotion 150金/限购5；首页体力卡"使用能量瓶"按钮 +10 体力）。
- 开发者模式：?dev=1 或连点顶栏标题 5 次开启；首页音效行 🛠 按钮打开面板：全关三星通关/资源拉满/全角色满配/查看存档状态/关闭。
- 音效升级：sfx.js 新增 button/pop/star/chest/energy/stun/boss 等，消除类叠加"闪粉"高频层；新 jingle unlock。
- BGM：sfx.js 新增 Bgm 音序器（home/battle/boss 三首 8-bit 循环，lookahead 调度）；场景切换/开战/胜负自动切曲；静音联动。

**UI**
- css/cartoon.css（新）：日韩卡通糖果皮肤——高饱和渐变按钮（按压下沉）、圆润卡片粗白边、糖果条纹流动血条、弹跳入场/浮动/摇摆动画、渐变标题字；经 index.html 在 game.css 之后加载覆盖。
- 首页 home-wrap 可滚动。

测试：26+248+23 全绿。真机已验证：首页新 UI/能量瓶按钮、开发者面板、全通后地图 15/15 ★45、第二章 tab 一键切换。