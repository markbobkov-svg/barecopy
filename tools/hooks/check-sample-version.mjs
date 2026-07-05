// Compare the version printed inside sample-report.pdf against index.html's
// BC_CONFIG.version. Exit 1 (block the push) on mismatch; 0 otherwise.
// Dependency-free: Node's built-in zlib inflates the PDF's FlateDecode streams.
import fs from "fs";
import zlib from "zlib";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PDF = path.join(ROOT, "sample-report.pdf");
const PNG = path.join(ROOT, "sample-report-preview.png");

// Cheap staleness heuristic: the PDF and its preview should always be committed
// together. If the PDF was last touched in a LATER commit than the PNG, the
// preview is probably out of date. Uses commit timestamps (not file mtimes) so a
// fresh clone/checkout never trips it. Warns only — never blocks the push.
function lastCommitTime(file){
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%ct", "--", file], { cwd: ROOT }).toString().trim();
    return out ? parseInt(out, 10) : null;
  } catch { return null; }
}
function warnIfPreviewStale(){
  if(!fs.existsSync(PNG)){ console.error("pre-push: NOTE — sample-report-preview.png is missing."); return; }
  const pdfT = lastCommitTime("sample-report.pdf"), pngT = lastCommitTime("sample-report-preview.png");
  if(pdfT != null && pngT != null && pdfT > pngT){
    console.error(
      "pre-push: NOTE — sample-report.pdf was updated in a later commit than its preview; " +
      "the PNG may be stale. Refresh it with:\n" +
      "  npm i --no-save pdf-to-img @napi-rs/canvas && node tools/gen-sample-report.mjs"
    );
  }
}

function appVersion(){
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const m = html.match(/version:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

// Reconstruct the printed text from the PDF content streams. pdf-lib emits text
// as (literal)Tj, <hex>Tj, or [ ... ]TJ (kerned), so join all shown pieces.
function pdfPrintedVersion(){
  if(!fs.existsSync(PDF)) return { found: false };
  const raw = fs.readFileSync(PDF).toString("latin1");
  let joined = "";
  const streams = raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g);
  for(const sm of streams){
    let s;
    try { s = zlib.inflateSync(Buffer.from(sm[1], "latin1")).toString("latin1"); }
    catch { continue; }
    for(const m of s.matchAll(/\[([\s\S]*?)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*Tj|<([0-9A-Fa-f\s]+)>\s*Tj/g)){
      if(m[1] != null){
        for(const p of m[1].matchAll(/\(((?:[^()\\]|\\.)*)\)/g)) joined += p[1];
      } else if(m[2] != null){
        joined += m[2];
      } else if(m[3] != null){
        try { joined += Buffer.from(m[3].replace(/\s/g, ""), "hex").toString("latin1"); } catch {}
      }
    }
  }
  joined = joined.replace(/\\([()\\])/g, "$1");
  const vm = joined.match(/Generated[\s\S]*?v(\d+\.\d+\.\d+)/);
  return vm ? { found: true, version: vm[1] } : { found: false };
}

const app = appVersion();
if(!app){
  console.error("pre-push: could not read BC_CONFIG.version from index.html — skipping check.");
  process.exit(0);
}
const printed = pdfPrintedVersion();
if(!printed.found){
  console.error("pre-push: could not read the version printed in sample-report.pdf — skipping check (verify manually).");
  process.exit(0);
}
if(printed.version !== app){
  console.error(
    "\npre-push BLOCKED: sample-report.pdf prints v" + printed.version +
    " but the app is v" + app + ".\n" +
    "Regenerate the sample and commit it, then push again:\n" +
    "  node tools/gen-sample-report.mjs\n" +
    "  (preview PNG: npm i --no-save pdf-to-img @napi-rs/canvas && node tools/gen-sample-report.mjs)\n" +
    "  git add sample-report.pdf sample-report-preview.png && git commit --amend --no-edit  # or a new commit\n"
  );
  process.exit(1);
}
console.error("pre-push: sample-report.pdf matches app version v" + app + " — OK.");
warnIfPreviewStale();
process.exit(0);
