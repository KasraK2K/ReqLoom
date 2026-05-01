import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const IconFile =
  require("../desktop/node_modules/resedit/dist/data/IconFile.js").default;
const RawIconItem =
  require("../desktop/node_modules/resedit/dist/data/RawIconItem.js").default;

const iconSizes = [16, 32, 48, 64, 128, 256, 512, 1024];

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}

function writeIco(outputPath, sizes, pngBySize) {
  const iconFile = new IconFile();
  for (const size of sizes) {
    const png = pngBySize.get(size);
    if (!png) {
      continue;
    }

    iconFile.icons.push({
      width: size,
      height: size,
      colors: 0,
      planes: 1,
      bitCount: 32,
      data: RawIconItem.from(toArrayBuffer(png), size, size, 32),
    });
  }

  writeFileSync(outputPath, Buffer.from(iconFile.generate()));
}

function createIcnsChunk(type, data) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, "ascii");
  header.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([header, data]);
}

function writeIcns(outputPath, pngBySize) {
  const chunkTypes = new Map([
    [16, "icp4"],
    [32, "icp5"],
    [64, "icp6"],
    [128, "ic07"],
    [256, "ic08"],
    [512, "ic09"],
    [1024, "ic10"],
  ]);

  const chunks = [];
  for (const [size, type] of chunkTypes) {
    const png = pngBySize.get(size);
    if (!png) {
      continue;
    }

    chunks.push(createIcnsChunk(type, png));
  }

  const totalLength = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(totalLength, 4);
  writeFileSync(outputPath, Buffer.concat([header, ...chunks], totalLength));
}

function readRasterIcons(desktopBuildIconsDir) {
  return new Map(
    iconSizes.map((size) => {
      const iconPath = path.join(desktopBuildIconsDir, `${size}x${size}.png`);
      if (!existsSync(iconPath)) {
        throw new Error(
          `Missing raster icon source: ${iconPath}. Run scripts/export-brand-raster.ps1 first.`,
        );
      }

      return [size, readFileSync(iconPath)];
    }),
  );
}

function main() {
  const frontendPublicDir = path.join(repoRoot, "frontend", "public");
  const desktopBuildDir = path.join(repoRoot, "desktop", "build");
  const desktopBuildIconsDir = path.join(desktopBuildDir, "icons");
  const desktopRuntimeAssetsDir = path.join(
    repoRoot,
    "desktop",
    "src",
    "assets",
  );

  ensureDir(frontendPublicDir);
  ensureDir(desktopBuildDir);
  ensureDir(desktopBuildIconsDir);
  ensureDir(desktopRuntimeAssetsDir);
  rmSync(path.join(frontendPublicDir, "favicon.svg"), { force: true });

  const pngBySize = readRasterIcons(desktopBuildIconsDir);

  copyFileSync(
    path.join(desktopBuildIconsDir, "16x16.png"),
    path.join(frontendPublicDir, "favicon-16x16.png"),
  );
  copyFileSync(
    path.join(desktopBuildIconsDir, "32x32.png"),
    path.join(frontendPublicDir, "favicon-32x32.png"),
  );
  copyFileSync(
    path.join(desktopBuildIconsDir, "512x512.png"),
    path.join(desktopBuildDir, "icon.png"),
  );
  copyFileSync(
    path.join(desktopBuildIconsDir, "512x512.png"),
    path.join(desktopRuntimeAssetsDir, "window-icon.png"),
  );

  writeIco(
    path.join(frontendPublicDir, "favicon.ico"),
    [16, 32, 48, 64],
    pngBySize,
  );
  writeIco(
    path.join(desktopBuildDir, "icon.ico"),
    [16, 32, 48, 64, 128, 256],
    pngBySize,
  );
  writeIcns(path.join(desktopBuildDir, "icon.icns"), pngBySize);
}

main();
