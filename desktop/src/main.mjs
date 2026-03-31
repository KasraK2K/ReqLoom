import { app, BrowserWindow, dialog, shell } from "electron";
import fs from "node:fs";
import path from "node:path";

function readDesktopConfig() {
  const configPath = path.join(
    app.getAppPath(),
    ".generated",
    "app-config.json",
  );

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    const domain = new URL(parsed.domain);

    if (!["http:", "https:"].includes(domain.protocol)) {
      throw new Error("Desktop domain must use http or https.");
    }

    return {
      domain: domain.toString(),
      origin: domain.origin,
    };
  } catch (error) {
    dialog.showErrorBox(
      "Desktop Configuration Error",
      `Unable to load the packaged server domain. Rebuild the desktop app with a valid domain.\n\n${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

function isAllowedNavigation(targetUrl, allowedOrigin) {
  try {
    return new URL(targetUrl).origin === allowedOrigin;
  } catch {
    return false;
  }
}

function createMainWindow(config) {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: "#0f1720",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url, config.origin)) {
      return { action: "allow" };
    }

    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isAllowedNavigation(url, config.origin)) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });

  void window.loadURL(config.domain);
}

app.whenReady().then(() => {
  const config = readDesktopConfig();
  createMainWindow(config);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(config);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
