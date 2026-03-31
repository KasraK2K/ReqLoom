import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

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

  console.log("Desktop build finished in desktop/dist");
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Desktop build failed.",
  );
  process.exit(1);
});
