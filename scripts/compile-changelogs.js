const fs = require('fs');
const path = require('path');

const projects = ['CMC','GAIN','AIFactory','CHN','Polaris','Aesop','jira','thecard','cmmc','wwebmin','playagame','diamond','mojo','experts','CareGuide','openclaw','plane'];
const vaultBase = 'G:/My Drive/Aesop Academy/Obsidian';

const allItems = [];
const stats = {};

projects.forEach(proj => {
  const changelogPath = path.join(vaultBase, proj + '_Build', '4-Changelog.md');
  if (!fs.existsSync(changelogPath)) {
    stats[proj] = 0;
    return;
  }

  const content = fs.readFileSync(changelogPath, 'utf8');

  // Find the Build Index table
  const lines = content.split('\n');
  let rowCount = 0;

  for (let i = 0; i < lines.length && rowCount < 10; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) continue;

    // Skip header-like lines
    if (line.includes('version') || line.includes('---') || line.includes('date') || line.includes('description')) continue;

    // Parse row: | version | date | description |
    const parts = line.split('|').map(p => p.trim()).filter(p => p);
    if (parts.length < 3) continue;

    const [version, date, desc] = parts;

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    // Extract first sentence (before period + space or end)
    let firstSent = desc.split(/\.\s+/)[0].trim();
    if (!firstSent.endsWith('.')) firstSent += '.';
    // Strip markdown formatting
    firstSent = firstSent.replace(/\*\*.*?:\*\*/g, '').replace(/\[.*?\]\(.*?\)/g, '').trim();

    allItems.push({
      project: proj,
      version,
      date: new Date(date),
      dateStr: date,
      description: firstSent
    });
    rowCount++;
  }

  stats[proj] = rowCount;
});

// Sort by date descending, take top 15
const sorted = allItems.sort((a, b) => b.date - a.date).slice(0, 15);

// Format as required
const formatted = sorted.map(item => {
  return `${item.project} ${item.version} (${item.dateStr}): ${item.description}`;
});

// Output stats and formatted items
console.log('STATS:');
Object.entries(stats).forEach(([proj, count]) => {
  if (count > 0) console.log(`  ${proj}: ${count}`);
});
console.log(`\nFORMATTED (${formatted.length} items):`);
formatted.forEach(item => console.log(`  ${item}`));

// Also output as JSON for use in the next step
console.log('\nJSON:');
console.log(JSON.stringify(formatted));
