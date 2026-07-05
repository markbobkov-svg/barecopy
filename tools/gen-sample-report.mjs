// Regenerate the static marketing assets sample-report.pdf and
// sample-report-preview.png so the version printed INSIDE them tracks the app.
//
// Why this exists: those two files are committed binaries, not generated at
// deploy. The live app already stamps reports with BC_CONFIG.version, but these
// samples are static and silently go stale on a version bump. Run this whenever
// BC_CONFIG.version changes (and before pushing such a change).
//
// The version is read straight from index.html, so it is always "the latest".
// The PDF is produced with the vendored pdf-lib (zero external requests). The
// preview PNG needs a one-off renderer that is NOT vendored — if it is missing
// the script writes the PDF and prints the exact install command to finish.
//
//   node tools/gen-sample-report.mjs
//
// Keep the buildReportPDF body below in sync with index.html's buildReportPDF.

import { createRequire } from "module";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PDFLib = require(path.join(ROOT, "vendor", "pdf-lib.min.js"));

// --- read the current version from index.html (single source of truth) ---
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const vm = html.match(/version:\s*"([^"]+)"/);
if(!vm){ console.error("Could not find BC_CONFIG.version in index.html"); process.exit(1); }
const VERSION = vm[1];

// --- verbatim helpers from index.html ---
function fmtSize(bytes){
  if(bytes < 1024) return bytes + " B";
  if(bytes < 1048576) return (bytes/1024).toFixed(0) + " KB";
  return (bytes/1048576).toFixed(1) + " MB";
}
function winAnsiSafe(s){
  return String(s == null ? "" : s)
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, "?");
}

// --- mirror of index.html buildReportPDF (returns Uint8Array) ---
async function buildReportPDF(data){
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle("Barecopy Verification Report");
  doc.setProducer("Barecopy");
  doc.setCreator("Barecopy");
  // Fixed dates make the PDF byte-deterministic (pdf-lib otherwise stamps "now"),
  // so its content hash is stable across regenerations with unchanged data.
  doc.setCreationDate(new Date(data.generated));
  doc.setModificationDate(new Date(data.generated));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const ink = rgb(0.11,0.14,0.19), soft = rgb(0.36,0.39,0.45);
  const red = rgb(0.76,0.15,0.23), green = rgb(0.12,0.50,0.31), line = rgb(0.86,0.85,0.81);
  const M = 56, W = 595.28, H = 841.89;
  let page = doc.addPage([W, H]);
  let y = H - M;

  const nl = (n=1) => { y -= 14*n; };
  const ensure = h => { if(y - h < M){ page = doc.addPage([W,H]); y = H - M; } };
  const text = (s, x, size, f, color) => page.drawText(winAnsiSafe(s), { x, y, size, font: f, color });
  const wrapMono = (s, x, size, color, maxChars) => {
    s = winAnsiSafe(s);
    for(let i=0;i<s.length;i+=maxChars){ ensure(12); text(s.slice(i,i+maxChars), x, size, mono, color); nl(1); }
  };

  const mk = 11 / 53.75;
  const mkS = 9.5 * mk;
  const gX = gx => M + (gx - 14.25) * mk;
  const gY = gy => y + (64.75 - gy) * mk;
  page.drawLine({ start:{x:gX(19),y:gY(11)}, end:{x:gX(19),y:gY(64.75)}, thickness:mkS, color:ink });
  page.drawCircle({ x:gX(37), y:gY(43), size:17*mk, borderColor:ink, borderWidth:mkS });
  const divX = M + (58.75 - 14.25) * mk + 7;
  page.drawLine({ start:{x:divX,y:y-2}, end:{x:divX,y:y+12}, thickness:0.75, color:line });
  const wordX = divX + 7;
  text("barecopy", wordX, 15, bold, ink);
  const markW = bold.widthOfTextAtSize("barecopy", 15);
  text("verification report", wordX+markW+10, 15, font, soft);
  nl(1.4);
  text("Generated " + data.generated + "   |   v" + data.version, M, 9, font, soft); nl(1.1);
  text("All processing performed locally in the browser. No file was transmitted.", M, 9, font, soft);
  nl(1.2);
  page.drawLine({ start:{x:M,y}, end:{x:W-M,y}, thickness:1, color:line }); nl(1.2);

  data.items.forEach((it, n) => {
    ensure(120);
    text((n+1) + ".  " + it.name, M, 12, bold, ink); nl(1.2);
    text(fmtSize(it.sizeBefore) + "  ->  " + fmtSize(it.sizeAfter) + "    |    clean copy: " + it.cleanName, M+14, 9, font, soft); nl(1.3);

    text("SHA-256 before", M+14, 8, bold, soft); nl(1);
    wrapMono(it.hashBefore, M+14, 8.5, ink, 64);
    text("SHA-256 after", M+14, 8, bold, soft); nl(1);
    wrapMono(it.hashAfter, M+14, 8.5, ink, 64);
    nl(0.4);

    if(it.removed.length){
      ensure(16); text("Removed " + it.removed.length + " identifying field(s):", M+14, 9, bold, ink); nl(1.1);
      for(const f of it.removed){
        ensure(12);
        const label = f.label + ": ";
        text("- " + label, M+22, 9, font, ink);
        const lw = font.widthOfTextAtSize("- " + label, 9);
        const val = f.value.length > 70 ? f.value.slice(0,67)+"..." : f.value;
        text(val, M+22+lw, 9, font, red); nl(1);
      }
    } else { ensure(12); text("No identifying fields were present.", M+14, 9, font, soft); nl(1); }

    for(const a of it.deepActions){
      ensure(12); text("+ " + a, M+14, 9, bold, green); nl(1);
    }
    if(it.kept.length){
      ensure(12); text("Kept by choice: " + it.kept.join(", "), M+14, 9, font, rgb(0.54,0.35,0)); nl(1);
    }

    for(const w of it.warnings){
      ensure(24);
      const words = w.split(" "); let ln = "";
      text("Warning:", M+14, 8.5, bold, rgb(0.54,0.35,0)); nl(1);
      for(const word of words){
        if(font.widthOfTextAtSize(ln+word+" ", 8.5) > W-2*M-28){ ensure(11); text(ln, M+22, 8.5, font, soft); nl(1); ln=""; }
        ln += word + " ";
      }
      if(ln){ ensure(11); text(ln, M+22, 8.5, font, soft); nl(1); }
    }

    ensure(16);
    if(it.verify === "verified"){ text("[OK]  Re-scanned: 0 identifying fields remain.", M+14, 9.5, bold, green); }
    else if(it.verify === "failed"){ text("!  Re-scan STILL FOUND: " + it.verifyRemaining.join(", "), M+14, 9.5, bold, red); }
    else { text("Re-scan unavailable - manual verification recommended.", M+14, 9, font, rgb(0.54,0.35,0)); }
    nl(1.4);
    page.drawLine({ start:{x:M,y}, end:{x:W-M,y}, thickness:0.5, color:line }); nl(1.1);
  });

  ensure(30);
  text("This report was generated by Barecopy on the user's device. The SHA-256 values let the", M, 8, font, soft); nl(0.9);
  text("recipient confirm the exact file that was verified. barecopy.com", M, 8, font, soft);

  return await doc.save();
}

// --- curated sample data (kept stable; only the version changes over time) ---
const data = {
  generated: "2026-07-04T09:24:00Z",
  version: VERSION,
  items: [
    {
      name: "Q3-client-proposal.docx",
      cleanName: "Q3-client-proposal_clean.docx",
      sizeBefore: 283648, sizeAfter: 189440,
      hashBefore: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      hashAfter:  "f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9",
      removed: [
        { label: "Author", value: "Michael Bennett" },
        { label: "Company", value: "Northwind Advisory" },
        { label: "Manager", value: "Chief Engineer" },
        { label: "Total editing time", value: "4 h 5 min" },
        { label: "Custom · ClientCode", value: "SECRET-CLIENT-7" }
      ],
      deepActions: [], kept: [],
      warnings: ["Tracked changes found in the text. Accept or reject them in Word before sending."],
      verify: "verified", verifyRemaining: []
    },
    {
      name: "site-photo.jpg",
      cleanName: "site-photo_clean.jpg",
      sizeBefore: 3145728, sizeAfter: 3138000,
      hashBefore: "11aa22bb33cc44dd55ee66ff77008899aabbccddeeff00112233445566778899",
      hashAfter:  "99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa",
      removed: [
        { label: "GPS location", value: "37.000000, -122.000000" },
        { label: "Camera", value: "Apple iPhone 15 Pro" }
      ],
      deepActions: [], kept: [], warnings: [],
      verify: "verified", verifyRemaining: []
    }
  ]
};

// --- write the PDF (always) ---
const pdfBytes = await buildReportPDF(data);
fs.writeFileSync(path.join(ROOT, "sample-report.pdf"), Buffer.from(pdfBytes));
console.log("wrote sample-report.pdf  (v" + VERSION + ")");

// --- render the preview PNG (best effort; needs the one-off renderer) ---
// Render page 1, then crop off ONLY the letter page's empty tail so the preview
// shows the whole report (both files + footer), matching the PDF — never cutting
// content mid-item as a fixed-height crop would.
const TARGET_W = 1191, PAGE_W = 595.28, BOTTOM_MARGIN = 36;
try {
  const { pdf } = await import("pdf-to-img");
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const doc = await pdf(path.join(ROOT, "sample-report.pdf"), { scale: TARGET_W / PAGE_W });
  let first;
  for await (const p of doc) { first = p; break; }
  const img = await loadImage(first);

  // find the last row with any non-near-white pixel = bottom of the content
  const meas = createCanvas(img.width, img.height);
  const mctx = meas.getContext("2d");
  mctx.drawImage(img, 0, 0);
  const px = mctx.getImageData(0, 0, img.width, img.height).data;
  let lastContent = 0;
  for(let y = 0; y < img.height; y++){
    for(let x = 0; x < img.width; x++){
      const i = (y * img.width + x) * 4;
      if(px[i] < 245 || px[i+1] < 245 || px[i+2] < 245){ lastContent = y; break; }
    }
  }
  const TARGET_H = Math.min(img.height, lastContent + BOTTOM_MARGIN);

  const canvas = createCanvas(TARGET_W, TARGET_H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, TARGET_W, TARGET_H);
  ctx.drawImage(img, 0, 0); // top-left; the shorter canvas trims the empty tail only
  fs.writeFileSync(path.join(ROOT, "sample-report-preview.png"), canvas.toBuffer("image/png"));
  console.log("wrote sample-report-preview.png  (" + TARGET_W + "x" + TARGET_H + ")");
} catch (e) {
  console.log("\nPDF done. To also refresh the preview PNG, install the one-off renderer and re-run:");
  console.log("  npm i --no-save pdf-to-img @napi-rs/canvas && node tools/gen-sample-report.mjs");
}

// --- cache-bust by content hash so the ?v= changes exactly when a file does ---
// (version-based busting never changed on sample-only edits -> browsers/CDN
// served a stale preview). Hashes are read from whatever is on disk now.
const indexPath = path.join(ROOT, "index.html");
const shortHash = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 10);
let idx = fs.readFileSync(indexPath, "utf8");
const pdfHash = shortHash(path.join(ROOT, "sample-report.pdf"));
idx = idx.replace(/\/sample-report\.pdf\?v=[^"'\s]*/g, "/sample-report.pdf?v=" + pdfHash);
let pngHash = null;
if(fs.existsSync(path.join(ROOT, "sample-report-preview.png"))){
  pngHash = shortHash(path.join(ROOT, "sample-report-preview.png"));
  idx = idx.replace(/\/sample-report-preview\.png\?v=[^"'\s]*/g, "/sample-report-preview.png?v=" + pngHash);
}
fs.writeFileSync(indexPath, idx);
console.log("cache-busters -> pdf ?v=" + pdfHash + (pngHash ? "  png ?v=" + pngHash : "  (png unchanged)"));
