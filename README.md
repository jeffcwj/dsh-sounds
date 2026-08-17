# dsh-sounds

[English](#english)

DSH Web 插件：在 agent 回合**完成**或**失败**时、后台（子代理）会话结束时、以及 agent 请求输入或权限时播放音效。音效库使用 opencode 内置的完整音效包 —— **45 个音效**，分为五组（`alert-*`、`bip-bop-*`、`nope-*`、`staplebops-*`、`yup-*`；MIT 协议，来自 [anomalyco/opencode](https://github.com/anomalyco/opencode) `packages/ui/src/assets/audio`）—— 嵌入客户端 bundle 中。

<img width="1000" height="1000" alt="image" src="https://github.com/user-attachments/assets/34f9af71-41f1-4187-b03f-afb8954403d5" />


**DSH 设置面板中的"声音"区域**允许你为每个事件选择音效（分组菜单 + 逐行预览）、开关功能、调节音量，以及恢复 opencode 默认设置。

## 事件 → 音效映射（opencode 默认值）

| 事件 | 音效 | opencode pack key |
| --- | --- | --- |
| 当前会话回合完成（`turn/end`，reason `completed`） | `bip-bop-01` | `done` |
| 回合失败（reason `error`）或触发输出 token 上限（`max-tokens`） | `nope-03` | `error` |
| 后台 / 子代理会话完成（无窗口 → 无 reason 详情） | `yup-01` | `subagent_done` |
| Agent 等待用户输入（`pendingInteraction` 为 `question` / `plan-review`） | `bip-bop-03` | `question` |
| Agent 请求权限（`pendingInteraction` 为 `approval`） | `staplebops-06` | `permission` |

静音设计：`aborted`（用户点击停止）、`blocked`（输入被拒绝）、`interrupted`（崩溃恢复），以及页面加载时已关闭的回合或切换到会话时的历史记录（历史不播放音效）。

## 功能说明

- **检测**完全在浏览器端运行：客户端监听 sessions service —— `running` 状态翻转和待处理交互，以及当前会话的对话窗口中精确的 `turn/end` reason。音效以 base64 data URI 形式嵌入 bundle（无需额外路由，离线可用）。
- **设置 UI**：原生 DSH Settings 区域（`settings.section` 插槽，id `dsh-sounds`，导航标签"声音"），包含启用开关、音量滑块（默认 40%，与 opencode 一致）、每个事件的选择行（按音效组分组的菜单，当前音效标记）、**逐事件开关**、逐行**试听**按钮，以及"恢复 opencode 默认"重置（音效和开关状态）。
- **系统通知**（Windows 通知中心）：同一事件管道也会触发浏览器 `Notification`，镜像 opencode 的注意力语义 —— 仅在页面**未聚焦**时显示 toast。设置面板有"通知"组：主开关、权限行（含"请求通知权限"按钮，浏览器要求用户手势触发），以及逐事件开关。点击 toast 会聚焦 DSH 页面。
- **逐事件开关**（音效和通知）持久化在 `localStorage`（`dsh-sounds.events`、`dsh-sounds.notifications`）中，而非宿主设置命名空间，因此开关变更仅需刷新页面即可生效 —— 无需重启宿主。
- **自动播放策略**：浏览器在首次用户手势前会阻止音频播放。插件会排队最新的音效，并在首次点击/按键时回放。
- **偏好设置**存储在 `dsh-sounds` 设置命名空间（宿主端），通过插件自身的 fenced `/sounds` API 路由提供给浏览器（loopback-trust fence，与核心 `/api` 传输相同）。默认值：

  ```yaml
  dsh-sounds:
    enabled: true
    volume: 0.4          # 0..1（opencode 默认音量）
    done: bip-bop-01
    error: nope-03
    subagentDone: yup-01
    question: bip-bop-03
    permission: staplebops-06
  ```

## 安装

```sh
# 在包含此 checkout 的目录中执行：
dsh plugin --profile web add ../path/to/dsh-sounds-<version>.tgz
```

然后重启 Web 应用（`dsh web`）以使 profile 加载新的 bundle。请从打包的 tarball 安装（而非 `link:` 路径），以确保包作为真实目录存在于 profile 的 `node_modules` 中，使其自身的 imports 能正确解析。

## 手动验证 / 临时控制

页面加载后，打开 DevTools 控制台：

```js
window.__dshSounds.prefs()              // 当前偏好设置
window.__dshSounds.play("done")         // 播放指定事件类型的音效
window.__dshSounds.playName("yup-01")   // 播放指定名称的嵌入音效
window.__dshSounds.preview("nope-03")   // 试听（忽略启用开关）
window.__dshSounds.setPrefs({ volume: 0.8 })  // 持久化偏好补丁
```

## 开发

```sh
node scripts/build-client.mjs   # 将 assets/*.mp3 嵌入 lib/client.js
node scripts/test-client.mjs    # 检测引擎的 stub-loader 模拟
```

客户端 bundle 使用 shell 的模块加载器格式手写（`window.__ModuleLoader__.load({ id, factory })`），仅依赖平台种子模块（`react`、`@deepseek-ai/dsh-client-ui-primitives`）—— 源文件为 `src/client.template.js`；`lib/client.js` 为生成产物。要刷新音效库，替换 `assets/` 下的 mp3 文件（文件名即 opencode 文件名）并重新构建。

## 本地 shell 补丁：设置导航图标

设置面板的导航图标在 DSH shell 中硬编码（`@deepseek-ai/dsh-client-ui-settings-general`：models/agent-presets/plugins 有特殊图标，其他 section id 回退到齿轮图标）。目前没有注册 section 图标的通道，因此通过一个小型本地补丁为"声音"区域添加扬声器图标：

```sh
node scripts/patch-nav-icon.mjs   # 幂等操作；dsh 升级后重新运行
```

补丁在已安装的客户端 bundle 中添加了一个 `if (id === "dsh-sounds")` 分支。dsh 升级重装包后会还原此补丁 —— 重新运行脚本即可（标记注释使其在已应用时为空操作）。

## 许可证

MIT。音频资源来自 opencode（MIT）。

---

<a id="english"></a>

## English

DSH web plugin: plays sound effects when an agent turn **completes** or **fails**, when a background (subagent) session finishes, and when the agent asks for input or requests permissions. The sound library is opencode's full built-in pack — **45 sounds** in five families (`alert-*`, `bip-bop-*`, `nope-*`, `staplebops-*`, `yup-*`; MIT, from [anomalyco/opencode](https://github.com/anomalyco/opencode) `packages/ui/src/assets/audio`) — embedded in the client bundle.

A **"声音" section in the DSH Settings panel** lets you pick a sound for each event (grouped menu + per-row preview), toggle the feature, adjust volume, and reset to the opencode defaults.

### Event → sound mapping (opencode defaults)

| Event | Sound | opencode pack key |
| --- | --- | --- |
| Current session turn completed (`turn/end` reason `completed`) | `bip-bop-01` | `done` |
| Turn failed (`reason error`) or hit the output-token cap (`max-tokens`) | `nope-03` | `error` |
| Background / subagent session finished (no window → no reason detail) | `yup-01` | `subagent_done` |
| Agent is waiting for user input (`pendingInteraction` `question` / `plan-review`) | `bip-bop-03` | `question` |
| Agent requests permissions (`pendingInteraction` `approval`) | `staplebops-06` | `permission` |

Silent by design: `aborted` (user pressed stop), `blocked` (input rejected), `interrupted` (crash repair), and any turn that was already closed when the page loaded or when you switched to its session (history never beeps).

### What it does

- **Detection** runs entirely in the browser: the client half watches the sessions service — the list store for `running` flips and pending interactions, and the staged session's conversation window for exact `turn/end` reasons. Sounds are embedded in the bundle as base64 data URIs (no extra routes, works offline).
- **Settings UI**: a native DSH Settings section (`settings.section` slot, id `dsh-sounds`, nav label "声音") with an enable switch, a volume slider (default 40%, same as opencode), one picker row per event (sound menu grouped by pack family, current sound marked), a **per-event on/off switch**, a per-row **试听** preview button, and a "恢复 opencode 默认" reset (sounds AND switches).
- **System notifications** (Windows notification center): the same event pipeline also fires browser `Notification`s, mirroring opencode's attention semantics — toasts appear only while the page is **not focused**. The Settings panel has a "通知" group: a master switch, a permission row with a "请求通知权限" button (browsers require a user gesture), and one on/off switch per event. Clicking a toast focuses the DSH page.
- **Per-event switches** (sounds and notifications) are persisted in `localStorage` (`dsh-sounds.events`, `dsh-sounds.notifications`), not the host settings namespace, so switch changes take effect on a page refresh alone — no host restart required.
- **Autoplay policy**: browsers gate audio until the first user gesture. The plugin queues the newest sound and replays it on the first click/keypress.
- **Preferences** live in the `dsh-sounds` settings namespace (host half), served to the browser through the plugin's own fenced `/sounds/api` routes (loopback-trust fence, same as the core `/api` transport). Defaults:

  ```yaml
  dsh-sounds:
    enabled: true
    volume: 0.4          # 0..1 (opencode's default volume)
    done: bip-bop-01
    error: nope-03
    subagentDone: yup-01
    question: bip-bop-03
    permission: staplebops-06
  ```

### Install

```sh
# from the directory containing this checkout:
dsh plugin --profile web add ../path/to/dsh-sounds-<version>.tgz
```

Then restart the web app (`dsh web`) so the profile boots the new bundle. Install from the packed tarball (not a `link:` path) so the package lives as a real directory in the profile's `node_modules` and its own imports resolve.

### Manual verification / ad-hoc control

After the page loads, open the DevTools console:

```js
window.__dshSounds.prefs()              // current prefs
window.__dshSounds.play("done")         // play one event kind
window.__dshSounds.playName("yup-01")   // play one embedded sound
window.__dshSounds.preview("nope-03")   // preview (ignores the enable switch)
window.__dshSounds.setPrefs({ volume: 0.8 })  // persist a patch
```

### Development

```sh
node scripts/build-client.mjs   # embed assets/*.mp3 into lib/client.js
node scripts/test-client.mjs    # stub-loader simulation of the detection engine
```

The client bundle is hand-written in the shell's module-loader format (`window.__ModuleLoader__.load({ id, factory })`) and consumes only the platform seed modules (`react`, `@deepseek-ai/dsh-client-ui-primitives`) — the source of truth is `src/client.template.js`; `lib/client.js` is generated. To refresh the sound library, replace the mp3 files under `assets/` (names are the opencode filenames) and rebuild.

### Local shell patch: settings nav icon

The Settings panel nav glyphs are hardcoded in the DSH shell (`@deepseek-ai/dsh-client-ui-settings-general`: models/agent-presets/plugins get special icons, every other section id falls back to the gear). There is no registration channel for a section icon, so a tiny local patch adds a speaker glyph for the "声音" section:

```sh
node scripts/patch-nav-icon.mjs   # idempotent; re-run after a dsh upgrade
```

The patch is a single `if (id === "dsh-sounds")` branch in the installed client bundle. A dsh upgrade that reinstalls the package reverts it — re-run the script (the marker comment makes it a no-op when already applied).

### License

MIT. Audio assets are from opencode (MIT).

[回到顶部](#dsh-sounds)
