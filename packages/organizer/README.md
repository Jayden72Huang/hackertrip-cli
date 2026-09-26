# 📣 HackerTrip 主办方包（Organizer Kit)

> 给黑客松主办方 / 承办方 / 社区组织者：**丢一张海报或一条命令，活动上架 HackerTrip 网站 + 小程序双端，触达全网选手**。

## 包里有什么

| 内容 | 说明 |
|---|---|
| CLI 命令 `hackertrip submit-event` | 把活动提交到平台草稿箱，人工审核后上架分发 |
| Skill `HackerTrip-submit-event` | 给 Claude Code 等 AI agent 用：口述活动或丢海报图，AI 自动整理成标准字段并提交 |

## 三步上手

### 1. 准备 CLI（免安装）

需要 Node.js >= 18，之后所有命令都用 `npx hackertrip …` 直接跑，不用全局安装：

```bash
npx hackertrip --help
# 或从源码
git clone https://github.com/Jayden72Huang/hackertrip-cli && cd hackertrip-cli && npm link
```

### 2. 小程序复制凭证

打开 **HackerTrip 微信小程序 → 发布赛事 → 让 AI 帮我提交**（需先通过组织者认证），页面会给出**主办方编号**和**提交密钥**，并直接生成一条可复制给 AI 的完整指令。密钥长期有效，外泄了在小程序一键重置，旧命令立即失效。

> 旧链路仍可用：主办方后台生成 6 位一次性配对码，用 `--pair-code` + `HACKERTRIP_SYNC_TOKEN` 提交。

### 3. 提交活动

```bash
npx hackertrip submit-event \
  --organizer-no HT-XXXXXX --submit-key <提交密钥> \
  --name "AdventureX 2026 黑客松" \
  --city "杭州" \
  --start 2026-07-25 \
  --end 2026-07-27 \
  --website "https://adventure-x.org" \
  --mode offline \
  --prize "总奖池 50 万元" \
  --tracks "AI Agent,硬件,Web3" \
  --organizer "AdventureX 组委会"
```

信息多时写成 `event.json` 再 `--from event.json` 提交；字段名与小程序表单一致（`startDate` / `endDate` / `registrationDeadline` / `registrationUrl` / `contactEmail` / `cover` / `prizePool` …），小程序「让 AI 帮我提交」的指令模板里有完整清单。

**必填四件套：名称 + 起止时间 + 城市（线上填"线上"）+ 官网链接。** 奖金 / 日期不确定就留空，不要编造 —— 提交会经过准入门槛 + 格式双层校验，再由平台人工审核后上架。

## 用 AI 帮你跑（推荐）

一条命令把主办方 skill 装进 Claude Code：

```bash
npx hackertrip install-skills --organizer
```

（或手动 `cp -r skills/HackerTrip-submit-event ~/.claude/skills/`）

然后在 Claude Code 里直接说：

> "帮我把这个黑客松发到 HackerTrip"（附上活动海报图或口述信息）

AI 会 OCR 海报、整理字段、过准入自检、执行提交。

## 提交后会发生什么

```
提交 → 绑定你账号的草稿箱 → 平台人工审核 → 上架
     → hackertrip.space 网站赛事列表 + 微信小程序双端展示 → 选手报名/收藏
```

审核不通过会保留草稿并标注缺口，补全后可再审。虚假信息会被直接拒绝。

---

发活动、招选手，都在 [hackertrip.space](https://hackertrip.space)
