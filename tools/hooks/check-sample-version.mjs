// pre-push guard for the static sample report. Two checks, both block on failure:
//  1. the version printed inside sample-report.pdf == index.html's BC_CONFIG.version
//  2. the ?v= cache-busters in index.html == the sha256 of the on-disk assets
//     (so the deployed site can never serve a stale PDF/PNG behind a fixed URL)
// Dependency-free: Node's built-in zlib + crypto. Fix with: node tools/gen-sample-report.mjs
import fs from "fs";
import zlib from "zlib";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PDF = path.join(ROOT, "sample-report.pdf");
const HTML = path.join(ROOT, "index.html");

function appVersion(html){
  const m = html.match(/version:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

// Reconstruct the printed text from the PDF content streams. pdf-lib emits text
// as (literal)Tj, <hex>Tj, or [ ... ]TJ (kerned), so join all shown pieces.
function pdfPrintedVersion(){
  if(!fs.existsSync(PDF)) return null;
  const raw = fs.readFileSync(PDF).toString("latin1");
  let joined = "";
  for(const sm of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)){
    let s;
    try { s = zlib.inflateSync(Buffer.from(sm[1], "latin1")).toString("latin1"); }
    catch { continue; }
    for(const m of s.matchAll(/\[([\s\S]*?)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*Tj|<([0-9A-Fa-f\s]+)>\s*Tj/g)){
      if(m[1] != null){ for(const p of m[1].matchAll(/\(((?:[^()\\]|\\.)*)\)/g)) joined += p[1]; }
      else if(m[2] != null){ joined += m[2]; }
      else if(m[3] != null){ try { joined += Buffer.from(m[3].replace(/\s/g, ""), "hex").toString("latin1"); } catch {} }
    }
  }
  joined = joined.replace(/\\([()\\])/g, "$1");
  const vm = joined.match(/Generated[\s\S]*?v(\d+\.\d+\.\d+)/);
  return vm ? vm[1] : null;
}

const shortHash = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 10);

// index.html's ?v= for an asset must equal the sha256 of the file on disk.
function cacheBusterDrift(html){
  const bad = [];
  for(const name of ["sample-report.pdf", "sample-report-preview.png"]){
    const fp = path.join(ROOT, name);
    if(!fs.existsSync(fp)) continue;
    const m = html.match(new RegExp("/" + name.replace(/\./g, "\\.") + "\\?v=([^\"'\\s]+)"));
    if(!m) continue; // not referenced with a ?v= — nothing to keep in sync
    const want = shortHash(fp);
    if(m[1] !== want) bad.push("  " + name + ": index.html has ?v=" + m[1] + " but the file hashes to " + want);
  }
  return bad;
}

const html = fs.readFileSync(HTML, "utf8");
const app = appVersion(html);
const printed = pdfPrintedVersion();

if(app && printed && printed !== app){
  console.error(
    "\npre-push BLOCKED: sample-report.pdf prints v" + printed + " but the app is v" + app + ".\n" +
    "Regenerate and commit it, then push again:  node tools/gen-sample-report.mjs\n"
  );
  process.exit(1);
}

const drift = cacheBusterDrift(html);
if(drift.length){
  console.error(
    "\npre-push BLOCKED: sample-report cache-busters in index.html are out of date:\n" +
    drift.join("\n") + "\n" +
    "Regenerate so ?v= matches the files, then commit index.html + the assets:\n" +
    "  npm i --no-save pdf-to-img @napi-rs/canvas && node tools/gen-sample-report.mjs\n"
  );
  process.exit(1);
}

if(!app || !printed) console.error("pre-push: sample-report version unreadable — skipped version check; cache-busters OK.");
else console.error("pre-push: sample-report OK (v" + app + ", cache-busters match).");
process.exit(0);
