#!/usr/bin/env node
/*
 * One coverage score for the whole platform, from the four reports the tests write. No server needed.
 *
 *   node scripts/coverage-summary.js
 *
 * Two numbers per part and in total:
 *   lines       covered lines / lines that can run
 *   SonarQube   (covered lines + covered branches) / (lines + branches): the formula SonarQube's "Coverage" uses, so this total should match
 *               the project's Coverage on the SonarQube dashboard, give or take the files Sonar excludes (sonar-project.properties).
 * Exit code 1 when a report is missing, so a script can stop.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const PARTS = [
  { name: 'frontend', kind: 'lcov', file: 'frontend/coverage/frontend/lcov.info' },
  { name: 'auth-service', kind: 'lcov', file: 'services/auth-service/coverage/lcov.info' },
  { name: 'order-service', kind: 'jacoco', file: 'services/order-service/target/site/jacoco/jacoco.xml' },
  { name: 'executor-service', kind: 'jacoco', file: 'services/executor-service/target/site/jacoco/jacoco.xml' },
];

function lcov(text) {
  const t = { lines: 0, linesHit: 0, branches: 0, branchesHit: 0 };
  for (const line of text.split(/\r?\n/)) {
    const [key, value] = [line.slice(0, line.indexOf(':')), Number(line.slice(line.indexOf(':') + 1))];
    if (key === 'LF') t.lines += value;
    else if (key === 'LH') t.linesHit += value;
    else if (key === 'BRF') t.branches += value;
    else if (key === 'BRH') t.branchesHit += value;
  }
  return t;
}

function jacoco(text) {
  // The report's own totals are the counters that sit directly under <report>, after the last </package>.
  const tail = text.slice(text.lastIndexOf('</package>'));
  const counter = (type) => {
    const m = new RegExp(`<counter type="${type}" missed="(\\d+)" covered="(\\d+)"`).exec(tail);
    return m ? { missed: Number(m[1]), covered: Number(m[2]) } : { missed: 0, covered: 0 };
  };
  const line = counter('LINE');
  const branch = counter('BRANCH');
  return { lines: line.missed + line.covered, linesHit: line.covered, branches: branch.missed + branch.covered, branchesHit: branch.covered };
}

const pct = (hit, total) => (total === 0 ? '   n/a' : `${((hit / total) * 100).toFixed(1).padStart(5)}%`);

const rows = [];
const total = { lines: 0, linesHit: 0, branches: 0, branchesHit: 0 };
const missing = [];
for (const part of PARTS) {
  const file = path.join(ROOT, part.file);
  if (!fs.existsSync(file)) {
    missing.push(part);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  const t = part.kind === 'lcov' ? lcov(text) : jacoco(text);
  rows.push({ name: part.name, ...t });
  for (const k of Object.keys(total)) total[k] += t[k];
}

const sonar = (t) => pct(t.linesHit + t.branchesHit, t.lines + t.branches);
console.log('');
console.log('part                lines              branches           SonarQube formula');
for (const r of rows) {
  console.log(
    `${r.name.padEnd(18)}  ${pct(r.linesHit, r.lines)} (${r.linesHit}/${r.lines})`.padEnd(46) +
      `${pct(r.branchesHit, r.branches)} (${r.branchesHit}/${r.branches})`.padEnd(26) +
      sonar(r),
  );
}
console.log('-'.repeat(86));
console.log(
  `${'WHOLE PLATFORM'.padEnd(18)}  ${pct(total.linesHit, total.lines)} (${total.linesHit}/${total.lines})`.padEnd(46) +
    `${pct(total.branchesHit, total.branches)} (${total.branchesHit}/${total.branches})`.padEnd(26) +
    sonar(total),
);
if (missing.length) {
  console.log(`\nMissing (run its tests with coverage first): ${missing.map((p) => `${p.name} -> ${p.file}`).join(', ')}`);
  console.log('The total above leaves those parts out.');
  process.exitCode = 1;
}
