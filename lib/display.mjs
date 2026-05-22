const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const MAGENTA = '\x1b[35m';
const WHITE = '\x1b[37m';

function scoreColor(score) {
  if (score >= 70) return GREEN;
  if (score >= 40) return YELLOW;
  return WHITE;
}

function formatDate(dateStr) {
  if (!dateStr) return '?';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function display(matches) {
  if (matches.length === 0) {
    console.log(`\n${YELLOW}No matching hackathons found for your project.${RESET}`);
    console.log(`${DIM}Try adding more details to your README or expanding your tech stack.${RESET}\n`);
    console.log(`${DIM}Browse all hackathons at ${CYAN}https://hackertrip.space/explore${RESET}\n`);
    return;
  }

  console.log(`\n${CYAN}${BOLD}🏆 Top ${matches.length} Matching Hackathons${RESET}`);
  console.log(`${DIM}${'━'.repeat(50)}${RESET}\n`);

  matches.forEach((h, i) => {
    const color = scoreColor(h.score);
    console.log(`${BOLD}${color}${i + 1}. ${h.name}${RESET}  ${DIM}Score: ${color}${h.score}/100${RESET}`);
    console.log(`   📅 ${formatDate(h.startDate)}–${formatDate(h.endDate)}  📍 ${h.location || 'Online'}  💰 ${h.prizePool || 'N/A'}`);
    if (h.matchReasons.length) {
      console.log(`   ${MAGENTA}🏷️  ${h.matchReasons.join(', ')}${RESET}`);
    }
    if (h.website) {
      console.log(`   ${CYAN}🔗 ${h.website}${RESET}`);
    }
    console.log('');
  });

  console.log(`${DIM}Powered by HackerTrip ${CYAN}https://hackertrip.space${RESET}\n`);
}
