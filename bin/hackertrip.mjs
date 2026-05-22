#!/usr/bin/env node

import { scanProject } from '../lib/scan.mjs';
import { fetchHackathons } from '../lib/fetch-hackathons.mjs';
import { matchHackathons } from '../lib/match.mjs';
import { display } from '../lib/display.mjs';

const API_URL = process.env.HACKERTRIP_API || 'https://hackertrip.space/api/match';

async function main() {
  console.log('\n\x1b[36m🔍 Scanning project...\x1b[0m\n');

  const project = await scanProject(process.cwd());

  console.log(`   \x1b[1mTech Stack:\x1b[0m ${project.techStack.join(', ') || 'Not detected'}`);
  console.log(`   \x1b[1mKeywords:\x1b[0m ${project.keywords.join(', ') || 'None'}`);
  if (project.description) {
    console.log(`   \x1b[1mProject:\x1b[0m ${project.description}`);
  }

  console.log('\n\x1b[36m📡 Fetching hackathons from HackerTrip...\x1b[0m\n');

  const hackathons = await fetchHackathons(API_URL);

  if (!hackathons.length) {
    console.log('\x1b[33m   No upcoming hackathons found.\x1b[0m');
    process.exit(0);
  }

  const matches = matchHackathons(project, hackathons);

  display(matches);
}

main().catch((err) => {
  console.error('\x1b[31mError:\x1b[0m', err.message);
  process.exit(1);
});
