# 🎒 HackerTrip 选手包（Player Kit)

> 给黑客松选手：**扫项目找比赛，一条命令把作品发到你的 HackerTrip 个人主页**（求职 / 组队 / 展示）。

## 包里有什么

| 内容 | 说明 |
|---|---|
| CLI 命令 `hackertrip match` | 扫描本地项目代码，AI 语义匹配最适合你参加的黑客松 |
| CLI 命令 `hackertrip publish-work` | 扫 repo 自动提取作品信息，经配对码同步到个人主页 |
| Skill `HackerTrip-publish-work` | 给 Claude Code 等 AI agent 用，自然语言驱动整个发布流程 |

## 三步上手

### 1. 装 CLI

```bash
npm i -g hackertrip
# 或从源码
git clone https://github.com/Jayden72Huang/hackertrip-cli && cd hackertrip-cli && npm link
```

### 2. 小程序拿配对码

打开 **HackerTrip 微信小程序 → 我的 → Skills 同步 → 生成配对码**，得到：

- 6 位配对码（30 分钟一次性失效）
- 同步地址 + uploadToken

```bash
export HACKERTRIP_SYNC_URL="<Skills 同步页给出的同步地址>"
export HACKERTRIP_SYNC_TOKEN="<uploadToken>"
```

### 3. 跑命令

**找比赛**（纯本地扫描，代码不上传）：

```bash
hackertrip match --path .
```

**发作品**：

```bash
hackertrip publish-work \
  --pair-code 482915 \
  --path . \
  --demo "https://your.demo.app" \
  --cover "https://cdn.you.com/cover.png" \
  --awards "2026 AdventureX 最佳人气奖"
```

项目名 / 技术栈 / 描述 / 仓库地址会自动从 repo 扫出来，你只补机器抓不到的（demo / 封面 / 获奖）。

### 4. 小程序确认发布

同步上去的作品是**「待审核」状态，不会自动公开**。回小程序 **我的 → 作品**，预览确认后点『发布』，才会出现在你的个人主页。

## 用 AI 帮你跑（推荐）

一条命令把选手 skill 装进 Claude Code：

```bash
npx hackertrip install-skills --player
```

（或手动 `cp -r skills/HackerTrip-publish-work ~/.claude/skills/`）

然后在 Claude Code 里直接说：

> "帮我把这个黑客松作品发到 HackerTrip"

AI 会自动扫描、追问补全、自检格式、执行发布。

## 安全说明

- 全程**不需要账号密码**，只靠一次性配对码 + token
- repo 扫描 100% 在本地完成，只上传你确认要发布的字段
- token 属敏感信息，放环境变量，不要提交进 git

---

找比赛、秀作品，都在 [hackertrip.space](https://hackertrip.space)
