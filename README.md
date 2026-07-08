# HackerTrip CLI + Skills

> 选手秀作品、主办方发活动、开发者找黑客松 —— 一套开源命令行工具 + Claude Code skills。

[![npm](https://img.shields.io/npm/v/hackertrip.svg)](https://www.npmjs.com/package/hackertrip)
[![License: MIT](https://img.shields.io/badge/License-MIT-7c5dff.svg)](#许可证)
[![Node](https://img.shields.io/badge/node-%3E%3D18-4de1ff.svg)](https://nodejs.org)

HackerTrip 是面向黑客松的开发者社区。这个开源合集把"参加黑客松"这件事拆成三条命令：

- 🔍 **`match`** —— 扫描你的本地项目，AI 语义匹配最适合参加的黑客松。
- 🚀 **`publish-work`** —— 选手把作品一键发布到 HackerTrip 个人主页（求职 / 组队 / 展示）。
- 📮 **`submit-event`** —— 主办方零门槛把活动提交到平台草稿箱，触达全网选手。

按角色打包了两个开箱即用的包（角色专属上手指南 + 配套 [Claude Code](https://claude.com/claude-code) skill）：

| 包 | 给谁用 | 里面有什么 |
|---|---|---|
| 🎒 [**选手包** `packages/player`](packages/player/) | 黑客松选手 / 开发者 | `match` 找比赛 + `publish-work` 发作品 + skill `HackerTrip-publish-work` |
| 📣 [**主办方包** `packages/organizer`](packages/organizer/) | 主办方 / 社区组织者 | `submit-event` 提交活动 + skill `HackerTrip-submit-event` |

---

## 安装

免安装直接用：

```bash
npx hackertrip --help
```

或全局安装：

```bash
npm i -g hackertrip
```

> 需要 Node.js >= 18。

---

## 命令用法

### 1. `match` —— 找黑客松

在项目目录里扫描代码（读 `package.json` / `README` / 源码，推断技术栈与画像），返回最匹配的黑客松：

```bash
hackertrip match --path .
```

加 `--sync` 可把扫描结果 + 匹配卡片同步到小程序（需配对码，见下方环境变量）：

```bash
hackertrip match --path . --sync --sync-code 482915
```

### 2. `publish-work` —— 选手发布作品

把本地 repo 里的作品发布到 HackerTrip 个人主页。CLI 先自动扫出项目名 / 技术栈 / 描述，你再补全 demo / 封面 / 获奖：

```bash
hackertrip publish-work \
  --pair-code 482915 \
  --path . \
  --name "Haki 暗号" \
  --summary "AI 黑客松组队雷达" \
  --repo "https://github.com/you/haki" \
  --demo "https://haki.demo.app" \
  --cover "https://cdn.you.com/cover.png" \
  --awards "2026 AdventureX 最佳人气奖" \
  --tech "Next.js,TypeScript,OpenAI"
```

| 参数 | 说明 |
|---|---|
| `--pair-code` | **必填**，小程序生成的 6 位配对码 |
| `--path` | 作品目录，默认当前目录 |
| `--name` / `--summary` / `--repo` | 作品名 / 简介 / 仓库地址（覆盖扫描值） |
| `--demo` / `--cover` | 在线 demo 链接 / 封面截图 URL |
| `--awards` / `--tech` | 获奖情况 / 技术栈（逗号分隔） |

发布后回小程序 **我的 → Skills 同步 → 拉取同步结果**。多个作品就换 `--path` 用同一配对码逐个跑。

### 3. `submit-event` —— 主办方提交活动

把黑客松活动提交到平台草稿箱（人工审核后上架）：

```bash
hackertrip submit-event \
  --pair-code 482915 \
  --name "AdventureX 2026 黑客松" \
  --city "杭州" \
  --start 2026-07-25 \
  --end 2026-07-27 \
  --website "https://adventure-x.org" \
  --mode offline \
  --prize "总奖池 50 万元" \
  --tracks "AI Agent,硬件,Web3" \
  --summary "48 小时连续开发" \
  --organizer "AdventureX 组委会" \
  --contact "公众号后台报名"
```

信息多时可写成 `event.json` 再 `--from` 提交：

```bash
hackertrip submit-event --pair-code 482915 --from event.json
```

| 参数 | 说明 |
|---|---|
| `--pair-code` | **必填**，小程序「主办方后台 → 生成提交码」生成的 6 位码，绑定主办方账号 |
| `--from` | 从 JSON 文件读取字段（命令行同名参数可覆盖） |
| `--name` / `--city` | **必填** 活动名 / 城市（线上填"线上"） |
| `--start` / `--end` | **必填** 开始 / 结束日期 `YYYY-MM-DD` |
| `--website` | **必填** 官网或报名链接 |
| `--mode` | `offline` / `online` / `hybrid` |
| `--prize` / `--tracks` | 奖金 / 赛道（不确定就留空，别编造） |
| `--summary` / `--organizer` / `--contact` | 简介 / 主办方 / 联系方式 |

> 必填四件套：**名称 + 起止时间 + 城市 + 官网**。提交即进草稿待人工审核，假信息会被拒。

---

## 环境变量

| 变量 | 用于 | 说明 |
|---|---|---|
| `HACKERTRIP_API` | `match` | 匹配接口，默认 `https://hackertrip.space/api/match` |
| `HACKERTRIP_SYNC_URL` | `match --sync` / `publish-work` | pairSync HTTP 触发器地址 |
| `HACKERTRIP_SYNC_TOKEN` | `match --sync` / `publish-work` | 小程序配对生成的 uploadToken |
| `HACKERTRIP_EVENT_URL` | `submit-event` | 活动草稿提交接口地址 |

```bash
export HACKERTRIP_SYNC_URL="<pairSync 同步地址>"
export HACKERTRIP_SYNC_TOKEN="<小程序配对的 uploadToken>"
export HACKERTRIP_EVENT_URL="<活动提交接口地址>"
```

---

## Claude Code Skills

两个角色包各带一个 `HackerTrip-*` skill，让 Claude Code（或任意支持 skills 的 AI agent）端到端帮你跑完整流程——你只要用自然语言说需求，AI 会自动扫描、补全、调用上面的 CLI 命令。

| Skill | 给谁用 | 所在包 | 做什么 |
|---|---|---|---|
| **HackerTrip-publish-work** | 选手 | [`packages/player`](packages/player/) | 扫 repo 自动抓作品信息 + 引导补全 demo/截图/获奖，经配对码安全同步到个人主页。说"帮我把黑客松作品发到 HackerTrip"即触发。 |
| **HackerTrip-submit-event** | 主办方 | [`packages/organizer`](packages/organizer/) | 口述活动或丢一张海报图，AI 视觉 OCR 整理成标准字段 + 过准入门槛自检，提交到草稿箱。说"帮我把这个黑客松发到 HackerTrip"即触发。 |

**怎么用**：把对应包 `skills/` 下的 skill 目录拷到你的 Claude Code skills 目录（如 `~/.claude/skills/`），对话里直接说目标（如"我想把作品发布到 HackerTrip"），Claude 会自动加载对应 skill 并引导你走完每一步。

```bash
# 选手
cp -r packages/player/skills/HackerTrip-publish-work ~/.claude/skills/
# 主办方
cp -r packages/organizer/skills/HackerTrip-submit-event ~/.claude/skills/
```

---

## 配对码与安全

`publish-work` 和 `match --sync` 不需要你的账号密码，全程靠**一次性配对码**鉴权：

1. 小程序 **我的 → Skills 同步 → 生成配对码**，拿到 6 位码 + uploadToken。
2. 配对码 **30 分钟一次性失效**，过期作废，泄露风险极低。
3. CLI 只用配对码 + token 走同步接口，**拿不到也不需要你的登录凭证**；repo 扫描在本地完成，只上传你确认要发布的字段。

> token 属敏感信息，建议放环境变量、不要提交进 git。

---

## 贡献

欢迎 PR 与 issue：

1. Fork 本仓库并新建分支。
2. 改动后确保 `node bin/hackertrip.mjs --help` 正常。
3. 提交 PR，描述清楚动机与改动范围。

数据源、匹配算法、新的 skill 都欢迎共建。

---

## 许可证

[MIT](LICENSE) © HackerTrip

—— Made for hackers, by hackers. 找黑客松、秀作品、发活动，都在 [hackertrip.space](https://hackertrip.space)。
