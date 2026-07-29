import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createMinimalPNG(width: number, height: number): Buffer {
  const rawData: number[] = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0);
    for (let x = 0; x < width; x++) {
      const isHeader = y < Math.floor(height * 0.3);
      const isCenter = Math.abs(x - width/2) < width/4 && Math.abs(y - height/2) < height/4;
      
      let r = 99, g = 102, b = 241, a = 255;
      if (isHeader) {
        r = 139; g = 92; b = 246;
      } else if (isCenter) {
        r = 16; g = 185; b = 129;
      }
      
      rawData.push(r, g, b, a);
    }
  }

  const buffer = Buffer.from(rawData);
  const compressed = zlib.deflateSync(buffer);

  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  
  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuf = Buffer.from(type);
  const typeAndData = Buffer.concat([typeBuf, data]);
  
  const crc = Buffer.alloc(4);
  crc.writeInt32BE(crc32(typeAndData), 0);
  
  return Buffer.concat([length, typeAndData, crc]);
}

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return c ^ -1;
}

const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 8) : c >>> 8;
  }
  crcTable[n] = c;
}

const iconsDir = path.resolve('public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

for (const size of [16, 48, 128]) {
  const png = createMinimalPNG(size, size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`Generated icon${size}.png`);
}
