# HackerTrip 主办方 CLI & Skills

给黑客松主办方、社区和已开通频道的孵化项目方：把赛事文档交给 Agent，补齐和确认信息后，保存到自己的「待提交」草稿箱。

## 推荐：选中 Skill，再附赛事文档

先安装一次（电脑需要 Node.js ≥18）：

```bash
npx hackertrip@latest install-skills --organizer
```

在支持技能提及的 Agent 中选择 `hackertrip-submit-event`，附上文档或官网，例如：

```text
@hackertrip-submit-event
根据这份赛事文档整理信息，不确定的内容用选择题问我，确认后存入我的草稿箱。
[附赛事文档、官网或海报]
```

Agent 会阅读资料、核对信息完整度，集中询问缺失或冲突的关键项。必需字段齐全后，展示摘要并调用 CLI 保存草稿；可选信息暂缺时由主办方选择补齐或先保存。Skill 不代为提交平台审核。

首次使用从小程序「我的 → 我要举办 → 发起赛事&项目 / 发布黑客松 → 让 AI 帮我提交」复制专属指令，提供给自己的 Agent 完成账号绑定凭证。未认证先完成主办方认证；指令含密钥，不发群聊。

默认安装到 Claude Code；其他工具用其实际的技能选择方式，不保证都采用 `@` 语法。不便安装 Skill 时，也可直接把小程序完整指令连同赛事资料交给 Agent。

> 1.4.1 已公开发布，配套云函数已部署；小程序开发版 2.3.22 已上传，正式版仍需微信发布。公开包、Skills 安装与真实草稿查询已回读验证。

## 两条业务命令

需要 Node.js ≥18，新流程 CLI ≥1.4.1，无需全局安装。`npx hackertrip@latest --version` 可查看版本。

```bash
# 提交：每次创建一个新草稿
npx hackertrip@latest submit-event --organizer-no <主办方编号> --submit-key <提交密钥> --from event.json

# 查询：最多最近 20 条，不会重复提交
npx hackertrip@latest event-status --organizer-no <主办方编号> --submit-key <提交密钥>
```

默认接口已内置。也支持环境变量 HACKERTRIP_ORGANIZER_NO / HACKERTRIP_SUBMIT_KEY。凭证从小程序复制，外泄回原页面重置。

提交至少需 name、city、startDate、endDate、website。日期 YYYY-MM-DD；时刻 HH:mm（北京时间）。可补报名时间、地点、简介、封面链接、奖金、赛道、联系与报名方式、赛程、视频号直播及官方转播申请。转播申请字段放在 live 内；不填资料里没有的信息。孵化项目须有频道权限，AI福利在小程序人工填写。

## 两个主办方 Skills

```bash
npx hackertrip@latest install-skills --organizer
```

默认安装到 `~/.claude/skills`，重新打开 Claude Code 会话：

| Skill | 自然语言示例 | 对应 CLI |
|---|---|---|
| hackertrip-submit-event | @hackertrip-submit-event + 赛事文档，分析并保存草稿 | submit-event |
| hackertrip-event-status | 帮我查一下刚提交的赛事审核状态 | event-status |

已有旧 Skill 可加 `--force` 更新。其他 AI 工具可用 `--dest <该工具实际读取的skills目录>` 指定位置，是否自动加载按工具本身设置核对。直接复制小程序完整指令给电脑端 AI 即可使用，不强制安装 Skill。

## 提交后的边界

成功会返回 Draft id，配套新版本成功状态为 pending_submission（待提交）。请回小程序核对、补充及管理内容；是否公开以平台审核和实际上架为准。CLI 不提供已有赛事编辑、删除或直接上架。网络结果不明时先 event-status 查询，避免重复提交。封面参数接收图片链接，不会自动上传电脑里的图片文件。

CLI 只保存 `pending_submission`（待提交）草稿，不代主办方提交平台审核。主办方在小程序「赛事&项目管理」打开详情、编辑并保存后，亲自点击「提交平台审核」。平台审核中的草稿可查看、不可修改；已上线内容归入正式赛事与项目。
