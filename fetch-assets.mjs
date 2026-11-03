import { execSync } from 'child_process';

function searchWiki(query) {
  const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + ' filetype:bitmap')}&srnamespace=6&format=json&srlimit=5`;
  const jsonStr = execSync(`curl.exe -s -L -A "WegoApp/1.0" "${apiUrl}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const data = JSON.parse(jsonStr);
  return (data.query?.search || []).map(s => s.title);
}

function getUrl(title) {
  const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json`;
  const jsonStr = execSync(`curl.exe -s -L -A "WegoApp/1.0" "${apiUrl}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const data = JSON.parse(jsonStr);
  const pages = data.query?.pages || {};
  const first = Object.values(pages)[0];
  return first?.imageinfo?.[0]?.url;
}

console.log('Tennis Flushing / Melbourne:');
const courts = searchWiki('Tennis court Flushing Meadows');
console.log(courts);
courts.forEach(c => console.log(c, '->', getUrl(c)));

console.log('Sports Cafe / Lounge:');
const lounge = searchWiki('modern sports club interior OR modern cafe lounge');
console.log(lounge);
lounge.forEach(l => console.log(l, '->', getUrl(l)));

console.log('Mejorset Padel:');
console.log(getUrl('File:Mejorset Full Panoramic Padel Court Delivered by SG Padel.jpg'));
