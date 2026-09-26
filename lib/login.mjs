/**
 * hackertrip login —— 扫码把这台电脑连到小程序账号。
 *
 * 旧流程要用户在小程序生成 6 位码和 uploadToken，再手动搬到终端，一共三次复制粘贴。
 * 现在：终端出一张小程序码，微信扫一下就完事，凭证自动存本地。
 *
 *   1. cliStart  申请配对会话，拿到 sessionToken
 *   2. 终端直接渲染二维码（不落文件、不弹看图程序）
 *   3. 用户在小程序里「扫码连接」，wx.scanCode 扫终端 → 认领（那一刻才有 openid）
 *   4. cliPoll   轮询到绑定成功，把 uploadToken 写进 ~/.hackertrip/config.json
 *
 * 为什么不用小程序码：CLI 走 HTTP 触发器调云函数，没有微信调用上下文，
 * cloud.openapi 一律报 invalid wx openapi access_token。改成普通二维码 +
 * 小程序内扫一扫，绕开这个限制，终端还能直接显示，比弹图片更顺。
 *
 * 之后 `hackertrip match --sync` 直接读本地凭证推送，不用再输任何东西。
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform, arch, release, hostname, cpus, totalmem } from 'node:os';
import qrcodeTerminal from 'qrcode-terminal';

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const DEFAULT_SYNC_URL = 'https://test-1-d8gn28apcbf409627-1445960691.ap-shanghai.app.tcloudbase.com/pairSync';
const CONFIG_DIR = join(homedir(), '.hackertrip');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 码本身 30 分钟有效，但让终端干等 30 分钟没意义

export function readConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function writeConfig(patch) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const next = Object.assign(readConfig(), patch);
  // 0600：里面是长期凭证，不该让同机其他用户读到
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  return next;
}

/** 终端里画二维码：small 模式用半角块字符，普通终端宽度就能放下 */
function renderQr(text) {
  return new Promise((resolve) => {
    qrcodeTerminal.generate(text, { small: true }, (qr) => resolve(qr));
  });
}

async function callSync(syncUrl, payload) {
  const res = await fetch(syncUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (_) {
    throw new Error(`同步服务返回了非 JSON 内容（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }
  // 云函数 HTTP 触发器有时把结果包在 { result: ... } 里
  return json && json.result ? json.result : json;
}

/** 设备画像：给小程序详情页显示「这台电脑是什么」用，不含任何可定位到个人的信息 */
export function describeDevice() {
  const OS_LABEL = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
  let chip = '';
  try {
    const list = cpus() || [];
    chip = (list[0] && list[0].model ? String(list[0].model) : '').trim().slice(0, 60);
  } catch (_) { /* 取不到就不显示 */ }
  let memGB = 0;
  try { memGB = Math.round(totalmem() / (1024 ** 3)); } catch (_) { /* 同上 */ }
  return {
    os: OS_LABEL[platform()] || platform(),
    osVersion: String(release() || '').slice(0, 20),
    arch: arch(),
    chip,
    memGB,
    hostname: String(hostname() || '').slice(0, 40),
    user: String(process.env.USER || process.env.USERNAME || '').slice(0, 40),
    node: process.version,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function login(args = []) {
  let syncUrl = process.env.HACKERTRIP_SYNC_URL || DEFAULT_SYNC_URL;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--sync-url' && args[i + 1]) {
      syncUrl = args[i + 1];
      i += 1;
    }
  }

  console.log(`\n${C.bold}连接 HackerTrip 小程序${C.reset}`);
  console.log(`${C.dim}下面会画出一个二维码，用小程序扫它，这台电脑就和你的账号连上了。${C.reset}\n`);

  let start;
  try {
    start = await callSync(syncUrl, {
      action: 'cliStart',
      deviceName: `${process.platform}-${(process.env.USER || process.env.USERNAME || 'cli')}`,
      // 详情页要显示「连的是哪台机器」，光有 platform-user 认不出来
      device: describeDevice(),
    });
  } catch (e) {
    console.log(`${C.red}无法连接同步服务：${e.message}${C.reset}`);
    console.log(`${C.dim}可用 --sync-url <url> 指定地址，或设置 HACKERTRIP_SYNC_URL。${C.reset}\n`);
    process.exitCode = 1;
    return;
  }

  if (!start || !start.ok || !start.sessionToken) {
    console.log(`${C.red}发起配对失败：${(start && start.message) || '未知错误'}${C.reset}\n`);
    process.exitCode = 1;
    return;
  }

  const qr = await renderQr(start.sessionToken);
  console.log(qr);
  console.log(`${C.bold}用小程序扫上面的码${C.reset}`);
  console.log(`${C.dim}  打开 HackerTrip 小程序 → 我的 → 连接桌面端 → 扫码连接${C.reset}`);
  console.log(`${C.dim}  扫不出来时可手动输入：${C.reset}${C.cyan}${start.sessionToken}${C.reset}`);
  console.log(`\n${C.dim}等待扫码…（Ctrl+C 可随时退出）${C.reset}`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let dots = 0;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let poll;
    try {
      poll = await callSync(syncUrl, { action: 'cliPoll', sessionToken: start.sessionToken });
    } catch (_) {
      continue; // 网络抖动不中断整轮等待
    }
    if (poll && poll.ok && poll.bound && poll.uploadToken) {
      writeConfig({
        syncUrl,
        sessionToken: start.sessionToken,
        uploadToken: poll.uploadToken,
        boundAt: new Date().toISOString(),
      });
      process.stdout.write('\r' + ' '.repeat(40) + '\r');
      console.log(`\n${C.green}✓ 已连接${C.reset}`);
      console.log(`${C.dim}凭证已保存到 ${CONFIG_FILE}${C.reset}`);
      console.log(`${C.dim}现在可以运行：${C.reset}${C.bold}npx hackertrip match --sync${C.reset}\n`);
      return;
    }
    // 会话本身失效就没必要继续等了
    if (poll && !poll.ok && /SESSION_(NOT_FOUND|EXPIRED)/.test(poll.code || '')) {
      console.log(`\n${C.red}${poll.message || '配对已失效'}${C.reset}\n`);
      process.exitCode = 1;
      return;
    }
    dots = (dots + 1) % 4;
    process.stdout.write(`\r${C.dim}等待扫码${'.'.repeat(dots)}${' '.repeat(3 - dots)}${C.reset}`);
  }

  console.log(`\n${C.yellow}等待超时，请重新执行 npx hackertrip login${C.reset}\n`);
  process.exitCode = 1;
}
