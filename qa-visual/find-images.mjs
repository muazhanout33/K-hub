import fs from 'fs';
import path from 'path';

async function searchWiki(query, limit = 8) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url|mime|size&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'WegoSports/1.0 (contact@wego.com)' } });
  if (!res.ok) return [];
  const data = await res.json();
  const pages = data.query?.pages || {};
  const results = [];
  for (const p of Object.values(pages)) {
    const info = p.imageinfo?.[0];
    if (info && info.mime === 'image/jpeg' && info.size > 80000 && info.size < 5000000) {
      results.push({ title: p.title, url: info.url, size: info.size });
    }
  }
  return results;
}

const queries = {
  'football-5v5': 'five-a-side artificial turf pitch',
  'football-7v7': 'soccer artificial turf field pitch',
  'tennis-hard': 'tennis court blue hard court',
  'sports-club': 'sports club pavilion clubhouse modern',
  'padel-match': 'padel match tournament',
  'sports-hero': 'athletic sports stadium floodlights night'
};

for (const [key, q] of Object.entries(queries)) {
  console.log(`\n=== Searching: ${key} (${q}) ===`);
  const items = await searchWiki(q, 8);
  items.slice(0, 3).forEach(it => console.log(`- ${it.title} -> ${it.url}`));
}
