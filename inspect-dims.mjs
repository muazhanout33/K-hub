import fs from 'fs';

function getJpegDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 2;
  while (offset < buf.length) {
    if (buf[offset] !== 0xff) break;
    const marker = buf[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) { // SOF0 or SOF2
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    const len = buf.readUInt16BE(offset + 2);
    offset += 2 + len;
  }
  return null;
}

const files = [
  'test-mejorset.jpg',
  'test-padel-outdoor.jpg',
  'test-padel-action.jpg',
  'test-5v5.jpg',
  'test-7v7.jpg',
  'test-football-match.jpg',
  'test-download.jpg',
  'test-tennis-blue.jpg',
  'test-lounge-interior.jpg',
  'test-sports-action.jpg'
];

files.forEach(f => {
  try {
    const d = getJpegDimensions('public/images/' + f);
    console.log(f, d ? `${d.width}x${d.height}` : 'unknown dims');
  } catch(e) {
    console.log(f, 'error', e.message);
  }
});
