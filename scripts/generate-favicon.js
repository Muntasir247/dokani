const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#059669"/>
  <path d="M20 22h24l-3 24H23L20 22z" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round"/>
  <path d="M26 22v-4a6 6 0 0 1 12 0v4" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/>
  <circle cx="32" cy="33" r="2.5" fill="white"/>
</svg>`;

const appIconPath = path.resolve(__dirname, "../src/app/icon.svg");
fs.writeFileSync(appIconPath, svg, "utf-8");

sharp(Buffer.from(svg))
  .resize(32, 32)
  .toFormat("png")
  .toBuffer()
  .then((pngBuffer) => {
    const icoHeader = Buffer.from([
      0, 0, // reserved
      1, 0, // ICO type
      1, 0, // 1 image
      32, 32, 0, 0, // width, height, colors, reserved
      1, 0, // color planes
      32, 0, // bits per pixel
      pngBuffer.length & 0xff,
      (pngBuffer.length >> 8) & 0xff,
      (pngBuffer.length >> 16) & 0xff,
      (pngBuffer.length >> 24) & 0xff,
      22, 0, 0, 0, // offset
    ]);
    const ico = Buffer.concat([icoHeader, pngBuffer]);
    fs.writeFileSync(path.resolve(__dirname, "../public/favicon.ico"), ico);
    console.log("favicon.ico generated successfully! Size:", ico.length);
  })
  .catch(console.error);
