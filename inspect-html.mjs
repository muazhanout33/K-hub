import fs from 'fs';

const html = fs.readFileSync('commons_search.html', 'utf8');
console.log('HTML length:', html.length);
console.log('Title:', html.match(/<title>([^<]+)<\/title>/i)?.[1]);
const imgMatches = [...html.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
console.log('Img src count:', imgMatches.length);
console.log('Sample imgs:', imgMatches.slice(0, 10));
