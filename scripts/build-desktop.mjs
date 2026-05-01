import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ResEdit = require("../desktop/node_modules/resedit/dist/index.js");

const VALID_PLATFORMS = new Set(["win", "linux", "mac", "current"]);

function parseArgs(argv) {
  const options = {
    platform: "current",
    domain: "",
    dir: false,
  };

  for (const arg of argv) {
    if (arg === "--dir") {
      options.dir = true;
      continue;
    }

    if (arg.startsWith("--platform=")) {
      options.platform = arg.slice("--platform=".length);
      continue;
    }

    if (arg === "--platform") {
      continue;
    }

    if (arg.startsWith("--domain=")) {
      options.domain = arg.slice("--domain=".length);
      continue;
    }
  }

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--platform" && argv[index + 1]) {
      options.platform = argv[index + 1];
    }

    if (argv[index] === "--domain" && argv[index + 1]) {
      options.domain = argv[index + 1];
    }
  }

  return options;
}

function resolveTargetPlatform(platform) {
  if (!VALID_PLATFORMS.has(platform)) {
    throw new Error(
      `Unsupported desktop target "${platform}". Use current, win, linux, or mac.`,
    );
  }

  if (platform !== "current") {
    return platform;
  }

  if (process.platform === "win32") {
    return "win";
  }

  if (process.platform === "darwin") {
    return "mac";
  }

  return "linux";
}

function normalizeDomain(inputValue) {
  const trimmed = inputValue.trim();

  if (!trimmed) {
    throw new Error("A domain is required.");
  }

  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(normalized);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https domains are supported.");
  }

  url.hash = "";
  return url.toString();
}

async function askForDomain() {
  const readline = createInterface({ input, output });

  try {
    const answer = await readline.question(
      "Server domain for this desktop app: ",
    );
    return normalizeDomain(answer);
  } finally {
    readline.close();
  }
}

function writeGeneratedConfig(domain, targetPlatform) {
  const generatedDir = path.resolve("desktop", ".generated");
  mkdirSync(generatedDir, { recursive: true });

  const configPath = path.join(generatedDir, "app-config.json");
  const config = {
    domain,
    targetPlatform,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
}

function runStep(command, args, description) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw new Error(`${description}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${description} failed.`);
  }
}

function refreshBrandAssets() {
  if (process.platform === "win32") {
    runStep(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.resolve("scripts", "export-brand-raster.ps1"),
      ],
      "Unable to export ReqLoom raster icons",
    );
  } else {
    console.warn(
      "Skipping raster icon export on non-Windows; using committed desktop/build/icons assets.",
    );
  }

  runStep(
    process.execPath,
    [path.resolve("scripts", "generate-brand-assets.mjs")],
    "Unable to generate ReqLoom desktop and favicon assets",
  );
}

function normalizeWindowsVersion(version) {
  const parts = version
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isInteger(part) && part >= 0)
    .slice(0, 4);

  while (parts.length < 4) {
    parts.push(0);
  }

  return parts.join(".");
}

function normalizeAuthorName(author) {
  if (!author) {
    return "";
  }

  if (typeof author === "string") {
    return author.replace(/\s*<[^>]+>\s*$/, "").trim();
  }

  if (typeof author.name === "string") {
    return author.name;
  }

  return "";
}

function readDesktopPackageMetadata() {
  const packageJson = JSON.parse(
    readFileSync(path.resolve("desktop", "package.json"), "utf8"),
  );
  const productName =
    packageJson.productName ?? packageJson.build?.productName ?? "ReqLoom";
  const version = packageJson.version ?? "0.0.0";

  return {
    productName,
    windowsVersion: normalizeWindowsVersion(version),
    description: packageJson.description ?? productName,
    companyName: normalizeAuthorName(packageJson.author),
  };
}

function stampExecutableResources(executablePath, iconPath, metadata) {
  const data = readFileSync(executablePath);
  const exe = ResEdit.NtExecutable.from(data, { ignoreCert: true });
  const resources = ResEdit.NtExecutableResource.from(exe);
  const iconFile = ResEdit.Data.IconFile.from(readFileSync(iconPath));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  const targetGroup = groups[0] ?? { id: 101, lang: 1033 };

  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    targetGroup.id,
    targetGroup.lang,
    iconFile.icons.map((item) => item.data),
  );

  const versionInfos = ResEdit.Resource.VersionInfo.fromEntries(
    resources.entries,
  );
  const versionInfo = versionInfos[0];
  if (versionInfo) {
    const language = { lang: 1033, codepage: 1200 };
    versionInfo.setFileVersion(metadata.windowsVersion, language.lang);
    versionInfo.setProductVersion(metadata.windowsVersion, language.lang);
    versionInfo.setStringValues(language, {
      CompanyName: metadata.companyName,
      FileDescription: metadata.description,
      InternalName: metadata.productName,
      OriginalFilename: `${metadata.productName}.exe`,
      ProductName: metadata.productName,
      LegalCopyright: `Copyright (C) ${new Date().getFullYear()} ${metadata.companyName}`,
    });
    versionInfo.outputToResourceEntries(resources.entries);
  }

  resources.outputResource(exe);
  writeFileSync(executablePath, Buffer.from(exe.generate()));
}

function stampWindowsBuildResources() {
  const iconPath = path.resolve("desktop", "build", "icon.ico");
  const distDir = path.resolve("desktop", "dist");
  const unpackedExe = path.join(distDir, "win-unpacked", "ReqLoom.exe");
  const metadata = readDesktopPackageMetadata();
  const rootExecutables = readdirSync(distDir)
    .filter((entry) => entry.endsWith(".exe"))
    .map((entry) => path.join(distDir, entry));

  for (const executablePath of [unpackedExe, ...rootExecutables]) {
    try {
      stampExecutableResources(executablePath, iconPath, metadata);
      console.log(
        `Stamped ReqLoom icon and metadata into ${path.relative(process.cwd(), executablePath)}`,
      );
    } catch (error) {
      console.warn(
        `Unable to stamp ReqLoom resources into ${path.relative(process.cwd(), executablePath)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targetPlatform = resolveTargetPlatform(options.platform);
  const domain = options.domain
    ? normalizeDomain(options.domain)
    : await askForDomain();

  if (targetPlatform === "mac" && process.platform !== "darwin") {
    console.warn(
      "macOS builds are most reliable on macOS. This build may fail on other operating systems.",
    );
  }

  refreshBrandAssets();
  writeGeneratedConfig(domain, targetPlatform);

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const builderArgs = [
    "--prefix",
    "desktop",
    "run",
    "dist",
    "--",
    `--${targetPlatform}`,
  ];

  if (options.dir) {
    builderArgs.push("--dir");
  }

  console.log(`Building ${targetPlatform} desktop app for ${domain}`);

  const childEnv = {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  };
  const result =
    process.platform === "win32"
      ? spawnSync(
          "cmd.exe",
          [
            "/d",
            "/s",
            "/c",
            [npmCommand, ...builderArgs].join(" "),
          ],
          {
            stdio: "inherit",
            env: childEnv,
          },
        )
      : spawnSync(npmCommand, builderArgs, {
          stdio: "inherit",
          env: childEnv,
        });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (targetPlatform === "win") {
    stampWindowsBuildResources();
  }

  console.log("Desktop build finished in desktop/dist");
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Desktop build failed.",
  );
  process.exit(1);
});
