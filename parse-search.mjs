import fs from 'fs';

const html = fs.readFileSync('commons_search.html', 'utf8');
const regex = /https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/[^\s"']+\.(?:jpg|jpeg)/gi;
const matches = [...html.matchAll(regex)].map(m => m[0]);
console.log('Unique thumbnail URLs:');
const unique = [...new Set(matches)];
console.log(unique.slice(0, 10));
