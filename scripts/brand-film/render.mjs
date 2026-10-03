import { chromium } from "playwright";
import { spawn } from "node:child_process";
const S = process.cwd() + "/";
const FFMPEG = process.env.FFMPEG;
const fmt = process.argv[2] ?? "wide";
const out = process.argv[3];
const fps = 30, duration = 46;
const size = fmt === "tall" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
const ff = spawn(FFMPEG, ["-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "slow", "-crf", "20", "-movflags", "+faststart", out], { stdio: ["pipe", "ignore", "inherit"] });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: size });
await p.goto(`http://127.0.0.1:5175/film?t=0&format=${fmt}`, { waitUntil: "networkidle", timeout: 180000 });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(800);
for (let i = 0; i < fps * duration; i++) {
  await p.evaluate((v) => window.__setT(v), i / fps);
  await p.evaluate(() => new Promise(requestAnimationFrame));
  const buf = await p.screenshot({ type: "png" });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
await b.close();
console.log("done", out);
