import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const run = promisify(execFile);

// 隐私红线：本模块只产出聚合统计值（次数/天数/token 数），
// 绝不读取源码内容、对话内容，也不上传任何本地路径明细。

// 统计当前 repo 的 commit 总数、首末 commit 时间与活跃天数。无 git / 非 repo 时返回 null。
async function collectGitStats(projectPath) {
  let stdout;
  try {
    ({ stdout } = await run('git', ['-C', projectPath, 'log', '--pretty=%aI'], {
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch {
    return null;
  }
  const dates = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!dates.length) return null;

  const lastAt = dates[0];
  const firstAt = dates[dates.length - 1];
  const spanMs = new Date(lastAt).getTime() - new Date(firstAt).getTime();
  const spanDays = Number.isFinite(spanMs) ? Math.floor(Math.max(0, spanMs) / 86400000) + 1 : 1;
  const activeDays = new Set(dates.map((d) => d.slice(0, 10))).size;

  return {
    commits: { total: dates.length, firstAt, lastAt, spanDays },
    activeDays,
  };
}

// Claude Code 将项目路径中的非字母数字字符替换为 '-' 作为会话目录名。
function claudeProjectDirName(projectPath) {
  return resolve(projectPath).replace(/[^a-zA-Z0-9]/g, '-');
}

// 解析 ~/.claude/projects/<当前项目>/ 下的会话日志(jsonl)，聚合会话数与 token 用量。
// 目录不存在或解析失败一律返回 null，绝不阻塞发布。
async function collectAiStats(projectPath) {
  const dir = join(homedir(), '.claude', 'projects', claudeProjectDirName(projectPath));
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const files = entries.filter((f) => f.endsWith('.jsonl'));
  if (!files.length) return null;

  const tokens = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  const sessions = new Set();
  const seen = new Set(); // 同一 message.id + requestId 会因流式写入重复出现，需去重

  for (const file of files) {
    try {
      const path = join(dir, file);
      if (!(await stat(path)).isFile()) continue;
      const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.includes('"usage"')) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        if (obj.type !== 'assistant' || !obj.message?.usage) continue;
        const dedupKey = `${obj.message.id || ''}:${obj.requestId || obj.uuid || ''}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        const u = obj.message.usage;
        tokens.input += u.input_tokens || 0;
        tokens.output += u.output_tokens || 0;
        tokens.cacheWrite += u.cache_creation_input_tokens || 0;
        tokens.cacheRead += u.cache_read_input_tokens || 0;
        if (obj.sessionId) sessions.add(obj.sessionId);
      }
    } catch {
      // 单个文件解析失败直接跳过
    }
  }

  const total = tokens.input + tokens.output + tokens.cacheWrite + tokens.cacheRead;
  if (!total && !sessions.size) return null;

  return {
    sessions: sessions.size || files.length,
    tokens: { ...tokens, total },
  };
}

// 采集过程数据快照。所有维度均为可选，采不到就缺省；任何失败都不抛出。
export async function collectProcessStats(projectPath) {
  const [git, ai] = await Promise.all([
    collectGitStats(projectPath).catch(() => null),
    collectAiStats(projectPath).catch(() => null),
  ]);
  if (!git && !ai) return null;

  const stats = {
    source: 'hackertrip-cli',
    collectedAt: new Date().toISOString(),
  };
  if (git) {
    stats.commits = git.commits;
    stats.activeDays = git.activeDays;
  }
  if (ai) stats.ai = ai;
  return stats;
}

const fmtNum = (n) =>
  n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);

// 生成向用户展示的快照行（数组，每项一行）。
export function formatProcessStats(stats) {
  const lines = [];
  if (stats.commits) {
    lines.push(`Commits:    ${stats.commits.total} 次（${stats.commits.firstAt.slice(0, 10)} ~ ${stats.commits.lastAt.slice(0, 10)}，跨 ${stats.commits.spanDays} 天）`);
  }
  if (stats.activeDays) {
    lines.push(`活跃天数:   ${stats.activeDays} 天`);
  }
  if (stats.ai) {
    lines.push(`AI 会话:    ${stats.ai.sessions} 个 / ${fmtNum(stats.ai.tokens.total)} tokens（输出 ${fmtNum(stats.ai.tokens.output)}）`);
  }
  return lines;
}
