#!/usr/bin/env node

import { scanProject } from '../lib/scan.mjs';
import { fetchHackathons } from '../lib/fetch-hackathons.mjs';
import { matchHackathons } from '../lib/match.mjs';
import { display, displayProjectInfo } from '../lib/display.mjs';

const API_URL = process.env.HACKERTRIP_API || 'https://hackertrip.space/api/match';

function parseArgs(args) {
  let projectPath = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--path' && args[i + 1]) {
      projectPath = args[i + 1];
      i++;
    } else if (!args[i].startsWith('-')) {
      projectPath = args[i];
    }
  }

  return { projectPath };
}

async function main() {
  const { projectPath } = parseArgs(process.argv.slice(2));

  console.log('\n\x1b[36m🔍 Scanning project...\x1b[0m');

  const project = await scanProject(projectPath);
  displayProjectInfo(project);

  console.log('\n\x1b[36m📡 Fetching hackathons...\x1b[0m');

  const { hackathons, source } = await fetchHackathons(API_URL);

  if (!hackathons.length) {
    console.log('\x1b[33m   No hackathon data available.\x1b[0m');
    process.exit(0);
  }

  console.log(`\x1b[2m   Found ${hackathons.length} hackathons (${source})\x1b[0m`);

  const matches = matchHackathons(project, hackathons);

  display(matches, source);
}

main().catch((err) => {
  console.error('\x1b[31mError:\x1b[0m', err.message);
  process.exit(1);
});
