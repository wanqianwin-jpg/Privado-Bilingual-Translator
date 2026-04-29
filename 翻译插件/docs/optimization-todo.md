# 优化待办清单

记录于 2026-04-29 全项目检查。已处理项见底部 ✓ 列表，未处理项按优先级排列。

## 📦 仓库卫生（未做，需 git 操作）

### R1. `privado-bilingual-translator.zip` 进了仓库
70KB build 产物。`.gitignore` 已忽略 `翻译插件/*.zip`，但需要清掉历史：

```bash
git rm --cached 翻译插件/privado-bilingual-translator.zip
```

### R2. `.DS_Store` 残留
仓库内多处。

```bash
git ls-files | grep -i 'ds_store$' | xargs -I{} git rm --cached "{}"
```

### R3. `package-lock.json` 在 .gitignore
非常规——通常应入库以保证依赖锁定可复现。除非有意为之（项目实际只是 jest 这一个 dev dep，影响不大）。

---

## ✓ 已处理

### 第一轮（2026-04-29）
1. **删除生产代码 console.log**：`background/batch-queue.js`、`background/translators/google-translator.js`（避免控制台泄露用户访问内容）
2. **修 `content.js:translateElement` pending 残留**：SW 失败/异常时清除 `dataset.btTranslated`，蓝点不再永转
3. **修 service-worker 队列摧毁逻辑**：`storage.onChanged` 仅在配置 key 真正变更时清队列，避免无关 storage 写入（displayMode、siteSettings 等）丢失飞行中的翻译请求
4. **重写 `tests/renderer.test.js`**：旧测试引用 `bt-original`/`bt-translation`/`addRetranslateButton`/`bt-shimmer` 等已不存在的 API 全部失效。新测试覆盖 sibling 注入 / slot 注入 / 三种 displayMode / 样式注入幂等
5. **删 `content/chrome-shim.js`**：manifest 未引用，纯死代码

### 第二轮（2026-04-29）
6. **manifest 版本同步** (Q5)：safari 0.1.0 → 0.2.0
7. **Translator 实例缓存** (P1)：`content/chrome-translator.js` 按 `(fromLang,toLang)` 缓存 Translator.create() 结果，避免每段文本都新建会话
8. **YouTube waitForControls 改 MutationObserver** (P3)：替代 `setInterval(500)` 死轮询，30s 安全网兜底，embed 页面不再无限跑
9. **OCR base64 用 FileReader.readAsDataURL** (P4)：替代手写 `String.fromCharCode` 分块拼接，大图不卡
10. **抽取 `shared/config.js`** (Q1)：统一 `resolveTranslateMode()` 与 `TRANSLATE_MODE_KEYS`，5 处迁移代码（popup/content/youtube/reddit/sw）共用，manifest 内引入。新增 `tests/config.test.js` 7 例
11. **Reddit filter 抽取** (Q3)：`shouldSkipRedditEl()` 替代两处复制粘贴
12. **随机 ID 改 `crypto.randomUUID()`** (Q2)：4 处 `Math.random().toString(36).slice(2)` 全部替换
13. **批内同文本去重** (P5)：`background/batch-queue.js flush()` 用 Map 合并相同文本，LLM 模式按字符省钱。新增 dedup 测试
14. **detector ANCESTOR_BLACKLIST/ID_BLACKLIST/ROLE_BLACKLIST 三个死 Set 删除** + `<aside>` 加入 `BLACKLIST_SELECTOR`（修复 Q6 测试失败 + 隐式 ARIA role 在 CSS 选择器里不可见的问题）

### 第三轮（2026-04-29）
15. **YouTube 字幕二分查找** (P2)：替换 `subtitles.findIndex` 全表扫为 `_findActiveSubIdx` 二分（O(log n)），`preTranslate` 也用 `_findSubStartIdx` 锁定窗口起点。timeupdate 4Hz × 长视频几百条字幕场景下显著降负载
16. **`hasAdSignal` 缓存 + 选择器化** (P6)：`detector.js` 用 WeakMap 缓存结果，class 前缀匹配整合进 `YT_CLASS_SELECTOR`（用 `[class^="..."]` + `[class*=" ..."]` 走 native closest），仅 tag 前缀仍 JS 走链。复用率高的祖先链命中缓存
17. **content.js MO 防抖** (P7)：MutationObserver 处理改成 idle callback 队列（fallback `setTimeout(150ms)`），解决 SPA（Twitter/GitHub）持续变更下 detector 高负载。新增 `isConnected` 检查避免处理已移除节点
18. **Options 加 privacy 政策链接** (S2)：options.html 新增 About 卡片，链接到 `chrome.runtime.getURL('privacy.html')`。所有 7 个 locale 加了 `optionsAbout` / `optionsPrivacyPolicy` 翻译

### 第四轮（2026-04-29）
19. **privacy.html 加 Google 日志披露** (S1-partial)：Machine mode 条目明确注明 "unofficial, no SLA" 及 Google 可能记录请求
20. **YouTube/Reddit MO 防抖** (P7-extra)：`youtube.js` / `reddit.js` MO 改为 idle callback 队列（fallback 150ms），积累节点到 `_ytMoPending` / `_rdMoPending`，flush 时检查 `isConnected`；YouTube player/desc 标志按轮次累积
21. **renderer.js 内联样式条件化** (Q4)：`injectTranslation` 中 `div.style.cssText` 改为仅在 `el.getRootNode() instanceof ShadowRoot` 时设置（`el.after` 路径），slotted child 路径（`el.appendChild`）无需内联因为 div 在 light DOM

22. **Options 加"允许 Google 免费翻译"开关** (S1-remaining)：options.html About 卡片新增 `enable-free-fallback` checkbox（默认开），`translators/index.js` 增加 `enableFreeFallback` 参数，关闭时返回空字符串数组跳过 Google 调用。service-worker.js config 对象同步新增该 key，存读 storage.local。7 个 locale 均加 `optionsFreeFallbackLabel`

**测试现状**：4 个 suite 全过，33 例全部 PASS。
