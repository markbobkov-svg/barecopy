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
// "barecopy" wordmark drawn as a Space Grotesk 600 vector outline (em-normalised,
// baseline at y=0). Rendered via drawSvgPath so the report header matches the site
// wordmark font without embedding a font or adding a dependency. Width 4.628 em.
const BARECOPY_PATH = "M0.365 0.014Q0.295 0.014 0.258 -0.01Q0.22 -0.035 0.203 -0.065L0.186 -0.065L0.186 0L0.073 0L0.073 -0.7L0.188 -0.7L0.188 -0.432L0.205 -0.432Q0.216 -0.452 0.236 -0.469Q0.255 -0.486 0.287 -0.497Q0.318 -0.508 0.365 -0.508Q0.426 -0.508 0.477 -0.478Q0.528 -0.449 0.559 -0.392Q0.59 -0.335 0.59 -0.255L0.59 -0.239Q0.59 -0.159 0.559 -0.102Q0.528 -0.045 0.477 -0.015Q0.425 0.014 0.365 0.014ZM0.331 -0.086Q0.393 -0.086 0.434 -0.126Q0.475 -0.167 0.475 -0.242L0.475 -0.252Q0.475 -0.328 0.435 -0.368Q0.394 -0.408 0.331 -0.408Q0.269 -0.408 0.228 -0.368Q0.186 -0.328 0.186 -0.252L0.186 -0.242Q0.186 -0.167 0.228 -0.126Q0.269 -0.086 0.331 -0.086ZM0.865 0.014Q0.813 0.014 0.771 -0.004Q0.729 -0.023 0.705 -0.058Q0.68 -0.093 0.68 -0.144Q0.68 -0.194 0.705 -0.228Q0.729 -0.262 0.772 -0.279Q0.815 -0.297 0.87 -0.297L1.013 -0.297L1.013 -0.327Q1.013 -0.366 0.989 -0.39Q0.965 -0.415 0.914 -0.415Q0.864 -0.415 0.839 -0.391Q0.813 -0.368 0.805 -0.331L0.699 -0.366Q0.711 -0.405 0.738 -0.437Q0.764 -0.469 0.808 -0.488Q0.852 -0.508 0.916 -0.508Q1.013 -0.508 1.069 -0.459Q1.124 -0.411 1.124 -0.319L1.124 -0.125Q1.124 -0.095 1.152 -0.095L1.194 -0.095L1.194 0L1.113 0Q1.077 0 1.054 -0.018Q1.031 -0.036 1.031 -0.067L1.031 -0.069L1.014 -0.069Q1.008 -0.055 0.993 -0.035Q0.978 -0.015 0.948 0Q0.917 0.014 0.865 0.014ZM0.884 -0.08Q0.941 -0.08 0.977 -0.112Q1.013 -0.145 1.013 -0.2L1.013 -0.21L0.877 -0.21Q0.84 -0.21 0.817 -0.194Q0.794 -0.178 0.794 -0.147Q0.794 -0.117 0.818 -0.098Q0.842 -0.08 0.884 -0.08ZM1.29 0L1.29 -0.494L1.403 -0.494L1.403 -0.437L1.42 -0.437Q1.431 -0.468 1.457 -0.482Q1.483 -0.496 1.519 -0.496L1.579 -0.496L1.579 -0.394L1.517 -0.394Q1.467 -0.394 1.436 -0.367Q1.405 -0.341 1.405 -0.286L1.405 0ZM1.889 0.014Q1.815 0.014 1.758 -0.017Q1.702 -0.049 1.67 -0.106Q1.639 -0.164 1.639 -0.241L1.639 -0.253Q1.639 -0.331 1.67 -0.388Q1.701 -0.445 1.757 -0.476Q1.813 -0.508 1.886 -0.508Q1.958 -0.508 2.012 -0.476Q2.066 -0.445 2.096 -0.388Q2.126 -0.331 2.126 -0.255L2.126 -0.214L1.755 -0.214Q1.757 -0.156 1.796 -0.121Q1.835 -0.086 1.892 -0.086Q1.948 -0.086 1.975 -0.11Q2.002 -0.135 2.016 -0.166L2.111 -0.117Q2.097 -0.09 2.07 -0.059Q2.044 -0.029 2 -0.007Q1.956 0.014 1.889 0.014ZM1.756 -0.301L2.009 -0.301Q2.005 -0.35 1.971 -0.379Q1.938 -0.408 1.885 -0.408Q1.83 -0.408 1.797 -0.379Q1.764 -0.35 1.756 -0.301ZM2.475 0.014Q2.403 0.014 2.345 -0.016Q2.287 -0.046 2.253 -0.103Q2.22 -0.16 2.22 -0.24L2.22 -0.254Q2.22 -0.334 2.253 -0.391Q2.287 -0.448 2.345 -0.478Q2.403 -0.508 2.475 -0.508Q2.546 -0.508 2.596 -0.483Q2.647 -0.458 2.678 -0.414Q2.709 -0.371 2.718 -0.317L2.607 -0.294Q2.603 -0.325 2.588 -0.35Q2.573 -0.376 2.545 -0.391Q2.518 -0.406 2.478 -0.406Q2.437 -0.406 2.404 -0.388Q2.372 -0.371 2.353 -0.336Q2.335 -0.301 2.335 -0.252L2.335 -0.242Q2.335 -0.193 2.353 -0.158Q2.372 -0.124 2.404 -0.106Q2.437 -0.088 2.478 -0.088Q2.539 -0.088 2.57 -0.119Q2.602 -0.151 2.61 -0.201L2.721 -0.175Q2.709 -0.123 2.678 -0.08Q2.647 -0.037 2.596 -0.011Q2.546 0.014 2.475 0.014ZM3.067 0.014Q2.993 0.014 2.934 -0.016Q2.876 -0.047 2.842 -0.103Q2.809 -0.16 2.809 -0.239L2.809 -0.255Q2.809 -0.334 2.842 -0.391Q2.876 -0.448 2.934 -0.478Q2.993 -0.508 3.067 -0.508Q3.141 -0.508 3.199 -0.478Q3.257 -0.448 3.29 -0.391Q3.324 -0.334 3.324 -0.255L3.324 -0.239Q3.324 -0.16 3.29 -0.103Q3.257 -0.047 3.199 -0.016Q3.141 0.014 3.067 0.014ZM3.067 -0.088Q3.13 -0.088 3.17 -0.128Q3.21 -0.169 3.21 -0.242L3.21 -0.252Q3.21 -0.325 3.17 -0.365Q3.13 -0.406 3.067 -0.406Q3.004 -0.406 2.964 -0.365Q2.924 -0.325 2.924 -0.252L2.924 -0.242Q2.924 -0.169 2.964 -0.128Q3.004 -0.088 3.067 -0.088ZM3.446 0.2L3.446 -0.494L3.559 -0.494L3.559 -0.429L3.576 -0.429Q3.593 -0.46 3.631 -0.484Q3.668 -0.508 3.738 -0.508Q3.798 -0.508 3.85 -0.478Q3.901 -0.449 3.932 -0.392Q3.963 -0.335 3.963 -0.255L3.963 -0.239Q3.963 -0.159 3.932 -0.102Q3.901 -0.045 3.85 -0.015Q3.799 0.014 3.738 0.014Q3.691 0.014 3.66 0.003Q3.628 -0.008 3.609 -0.026Q3.589 -0.044 3.578 -0.062L3.561 -0.062L3.561 0.2ZM3.704 -0.086Q3.767 -0.086 3.808 -0.126Q3.848 -0.167 3.848 -0.242L3.848 -0.252Q3.848 -0.328 3.807 -0.368Q3.766 -0.408 3.704 -0.408Q3.642 -0.408 3.601 -0.368Q3.559 -0.328 3.559 -0.252L3.559 -0.242Q3.559 -0.167 3.601 -0.126Q3.642 -0.086 3.704 -0.086ZM4.14 0.2L4.14 0.1L4.413 0.1Q4.441 0.1 4.441 0.07L4.441 -0.068L4.424 -0.068Q4.416 -0.05 4.398 -0.032Q4.38 -0.015 4.35 -0.003Q4.32 0.008 4.274 0.008Q4.217 0.008 4.173 -0.017Q4.129 -0.043 4.105 -0.089Q4.081 -0.136 4.081 -0.198L4.081 -0.494L4.195 -0.494L4.195 -0.207Q4.195 -0.147 4.225 -0.118Q4.254 -0.089 4.308 -0.089Q4.369 -0.089 4.405 -0.129Q4.44 -0.169 4.44 -0.244L4.44 -0.494L4.554 -0.494L4.554 0.094Q4.554 0.143 4.526 0.172Q4.498 0.2 4.45 0.2Z";
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
  // Brand wordmark as a vector outline (Space Grotesk 600) so it matches the
  // site header. Baseline on y, like the "b" mark and the adjacent text.
  page.drawSvgPath(BARECOPY_PATH, { x: wordX, y, scale: 15, color: ink });
  const markW = 4.628 * 15;                    // advance width of the outline
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
