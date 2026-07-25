// Redimensionne + encode en WebP les captures du guide (via le canvas de
// Chromium : pas de dépendance sharp / imagemagick à installer).
// Voir tutorial-shots.mjs pour la chaîne complète.
// Usage: node tutorial-encode.mjs <srcDir> <dstDir> <maxWidth> <quality>
import { chromium } from "playwright";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const [srcDir, dstDir, maxW = "1200", q = "0.82"] = process.argv.slice(2);
await mkdir(dstDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

for (const f of (await readdir(srcDir)).filter((n) => n.endsWith(".png"))) {
  const b64 = (await readFile(path.join(srcDir, f))).toString("base64");
  const out = await page.evaluate(
    async ({ b64, maxW, q }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return { data: c.toDataURL("image/webp", q).split(",")[1], w: c.width, h: c.height };
    },
    { b64, maxW: Number(maxW), q: Number(q) }
  );
  const dst = path.join(dstDir, f.replace(/\.png$/, ".webp"));
  await writeFile(dst, Buffer.from(out.data, "base64"));
  console.log(`${f} → ${path.basename(dst)} ${out.w}×${out.h}`);
}

await browser.close();
