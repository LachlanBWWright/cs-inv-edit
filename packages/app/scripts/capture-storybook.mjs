import { spawn } from "node:child_process";
import { mkdir, readdir, unlink } from "node:fs/promises";
import { chromium } from "@playwright/test";

const port = 6006;
const baseUrl = `http://127.0.0.1:${port}`;
const outputDirectory = "artifacts/storybook";
const server = spawn(
  "pnpm",
  ["exec", "storybook", "dev", "--ci", "--no-open", "-p", String(port)],
  { detached: process.platform !== "win32", stdio: "inherit" },
);

function stopServer() {
  if (process.platform === "win32" || server.pid === undefined) {
    server.kill("SIGTERM");
    return;
  }
  process.kill(-server.pid, "SIGTERM");
}

async function waitForStorybook(attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`${baseUrl}/index.json`).catch(() => undefined);
    if (response?.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Storybook did not become ready at ${baseUrl}`);
}

async function capture() {
  await waitForStorybook();
  const indexResponse = await fetch(`${baseUrl}/index.json`);
  const index = await indexResponse.json();
  const stories = Object.values(index.entries)
    .filter((entry) => entry.type === "story")
    .sort((left, right) => left.id.localeCompare(right.id));
  await mkdir(outputDirectory, { recursive: true });
  const previousScreenshots = (await readdir(outputDirectory)).filter((name) =>
    name.endsWith(".png"),
  );
  await Promise.all(
    previousScreenshots.map((name) => unlink(`${outputDirectory}/${name}`)),
  );
  const browser = await chromium.launch({ headless: true });
  let nextStory = 0;
  const captureNextStory = async () => {
    const story = stories[nextStory];
    nextStory += 1;
    if (!story) return;
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { width: 1440, height: 900 },
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(
      `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`,
      { waitUntil: "networkidle" },
    );
    await page.locator("#storybook-root > *").first().waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await page.screenshot({
      path: `${outputDirectory}/${story.id}.png`,
      fullPage: true,
    });
    await page.close();
    process.stdout.write(`${story.id}\n`);
    await captureNextStory();
  };
  await Promise.all(
    Array.from({ length: Math.min(4, stories.length) }, captureNextStory),
  );
  await browser.close();
  process.stdout.write(`${stories.length} story screenshots written to ${outputDirectory}\n`);
}

capture().finally(stopServer);
