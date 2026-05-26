const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const MAGENTA = '\x1b[35m';
const WHITE = '\x1b[37m';
const RED = '\x1b[31m';

function scoreColor(score) {
  if (score >= 70) return GREEN;
  if (score >= 40) return YELLOW;
  return WHITE;
}

function formatDate(dateStr) {
  if (!dateStr) return '?';
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function statusBadge(h) {
  if (h.isPast === false) {
    const now = new Date();
    const start = new Date(h.startDate);
    const days = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
    if (days > 0) return `${GREEN}报名中${RESET}`;
    if (days >= -3) return `${YELLOW}进行中${RESET}`;
  }
  if (h.isPast === true) return `${DIM}已结束${RESET}`;
  return '';
}

export function displayProjectInfo(project) {
  console.log(`\n${CYAN}${BOLD}📦 Project Profile${RESET}`);
  console.log(`${DIM}${'─'.repeat(50)}${RESET}`);
  if (project.name) {
    console.log(`   ${BOLD}Name:${RESET}  ${project.name}`);
  }
  console.log(`   ${BOLD}Stack:${RESET} ${project.techStack.join(', ') || 'Not detected'}`);
  console.log(`   ${BOLD}Tags:${RESET}  ${project.keywords.join(', ') || 'None'}`);
  if (project.description) {
    console.log(`   ${BOLD}Desc:${RESET}  ${project.description.slice(0, 100)}`);
  }
}

export function display(matches, source) {
  if (matches.length === 0) {
    console.log(`\n${YELLOW}No matching hackathons found for your project.${RESET}`);
    console.log(`${DIM}Try adding more details to your README or expanding your tech stack.${RESET}\n`);
    console.log(`${DIM}Browse all hackathons at ${CYAN}https://hackertrip.space/explore${RESET}\n`);
    return;
  }

  const sourceLabel = source === 'api' ? 'Live' : source === 'cache' ? 'Cached' : 'Bundled';

  console.log(`\n${CYAN}${BOLD}🏆 Top ${matches.length} Matching Hackathons${RESET}  ${DIM}(${sourceLabel} data)${RESET}`);
  console.log(`${DIM}${'━'.repeat(55)}${RESET}\n`);

  matches.forEach((h, i) => {
    const color = scoreColor(h.score);
    const badge = statusBadge(h);
    const badgeStr = badge ? `  ${badge}` : '';

    console.log(`${BOLD}${color}${i + 1}. ${h.name || h.shortName}${RESET}  ${DIM}Score: ${color}${h.score}/100${RESET}${badgeStr}`);
    console.log(`   📅 ${formatDate(h.startDate)}–${formatDate(h.endDate)}  📍 ${h.location || h.city || 'Online'}  💰 ${h.prizePool || 'N/A'}`);

    if (h.bestTrack) {
      console.log(`   ${CYAN}🎯 推荐赛道: ${h.bestTrack}${RESET}`);
    }

    if (h.matchReasons.length) {
      console.log(`   ${MAGENTA}🏷️  ${h.matchReasons.join(' · ')}${RESET}`);
    }

    if (h.website) {
      console.log(`   ${DIM}🔗 ${h.website}${RESET}`);
    }
    console.log('');
  });

  console.log(`${DIM}${'─'.repeat(55)}${RESET}`);
  console.log(`${DIM}Powered by HackerTrip ${CYAN}https://hackertrip.space${RESET}`);
  console.log(`${DIM}Run in Claude Code: /ht-scan-project for AI-native matching${RESET}\n`);
}
