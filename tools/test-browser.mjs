#!/usr/bin/env node
/* Browser test suite for Barecopy.
 *
 *   node tools/test-browser.mjs
 *
 * Everything Barecopy does happens in a browser — DOMParser, canvas,
 * createImageBitmap, jszip and pdf-lib — so the tests drive the real page in
 * headless Chromium rather than mocking any of it. index.html exposes its
 * internals on window.__BC only when window.__BC_ALLOW_TEST is set first, which
 * is what the harness below does; in production that hook stays closed.
 *
 * No entry in package.json on purpose: Playwright is a test-only tool and must
 * not ship to the serverless functions. Install it however you like —
 *   npm i -g playwright && npx playwright install chromium
 * — and this script will find it. It serves the repo itself, so nothing else
 * needs to be running.
 *
 * Exit code 0 = every assertion passed. Add an assertion whenever a real file
 * teaches you something the fixtures did not.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---- find Playwright wherever it is installed ---- */
async function loadChromium(){
  const tries = ["playwright", "playwright-core"];
  try{
    const g = execSync("npm root -g", { encoding:"utf8" }).trim();
    if(g) tries.push(path.join(g, "playwright", "index.mjs"), path.join(g, "playwright-core", "index.mjs"));
  }catch(e){}
  for(const t of tries){
    try{ return (await import(t)).chromium; }catch(e){}
  }
  console.error("Playwright not found. Install it with:\n  npm i -g playwright && npx playwright install chromium");
  process.exit(2);
}

/* ---- serve the repo so the page loads over http, like the real site ---- */
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".png":"image/png", ".pdf":"application/pdf",
  ".woff2":"font/woff2", ".svg":"image/svg+xml", ".xml":"application/xml" };
function serveRepo(){
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const file = path.join(ROOT, rel);
      if(!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

/* ---- fixture: a PDF saved twice, the first revision still inside it ---- */
function twoRevisionPdf(){
  const pad = n => String(n).padStart(10, "0");
  const offsets = {};
  let body = "%PDF-1.4\n";
  const put = (num, text) => { offsets[num] = body.length; body += num + " 0 obj\n" + text + "\nendobj\n"; };
  const s1 = "BT /F1 12 Tf 20 100 Td (SECRET SALARY 250000) Tj ET";
  put(1, "<</Type/Catalog/Pages 2 0 R>>");
  put(2, "<</Type/Pages/Kids[3 0 R]/Count 1>>");
  put(3, "<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>");
  put(4, "<</Length " + s1.length + ">>\nstream\n" + s1 + "\nendstream");
  const xref1 = body.length;
  body += "xref\n0 5\n0000000000 65535 f \n";
  for(let i = 1; i <= 4; i++) body += pad(offsets[i]) + " 00000 n \n";
  body += "trailer\n<</Size 5/Root 1 0 R>>\nstartxref\n" + xref1 + "\n%%EOF\n";
  // second save: a new content stream, the old one left behind unreferenced
  const s2 = "BT /F1 12 Tf 20 100 Td (REDACTED) Tj ET";
  const off5 = body.length;
  body += "5 0 obj\n<</Length " + s2.length + ">>\nstream\n" + s2 + "\nendstream\nendobj\n";
  const off3b = body.length;
  body += "3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 5 0 R>>\nendobj\n";
  const xref2 = body.length;
  body += "xref\n0 1\n0000000000 65535 f \n3 1\n" + pad(off3b) + " 00000 n \n5 1\n" + pad(off5) + " 00000 n \n";
  body += "trailer\n<</Size 6/Root 1 0 R/Prev " + xref1 + ">>\nstartxref\n" + xref2 + "\n%%EOF\n";
  return Buffer.from(body, "latin1");
}

const chromium = await loadChromium();
const { server, port } = await serveRepo();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", e => console.log("PAGE EXCEPTION:", e.message));
await page.addInitScript(() => { window.__BC_ALLOW_TEST = true; });
await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });

if(!await page.evaluate(() => !!window.__BC)){
  console.error("FAIL: index.html did not expose its test hook");
  await browser.close(); server.close(); process.exit(1);
}

const PDF_B64 = twoRevisionPdf().toString("base64");

const results = await page.evaluate(async (pdfB64) => {
  const out = [];
  const log = (name, pass, detail) => out.push({ name, pass, detail });
  const B = window.__BC;
  const b64ToBuf = b64 => {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  };
  const asText = buf => new TextDecoder('latin1').decode(new Uint8Array(buf));

  /* ---------------- PDF: earlier revisions ---------------- */
  const pdfBuf = b64ToBuf(pdfB64);
  log('fixture PDF really carries the old revision', asText(pdfBuf).includes('SECRET SALARY'));
  log('prior-revision count', B.pdfPriorRevisions(pdfBuf) === 1, 'got ' + B.pdfPriorRevisions(pdfBuf));

  const mkRec = (buf, deep) => ({ ext:'pdf', kind:'pdf', fields:[], warnings:[], deepApplied:[],
    buffer: buf, deepSelected: new Set(deep || []), file: new File([buf], 't.pdf') });

  const rec = mkRec(pdfBuf);
  await B.analyzePdf(rec, pdfBuf);
  const rev = rec.fields.find(f => f.label === 'Earlier revisions');
  log('analyze flags earlier revisions', !!rev, rev && rev.value);
  log('finding is a leak with a deep switch', !!rev && rev.leak === true && rev.deep === 'pdfRevisions');

  // clean WITHOUT the deep option: old revision content survives (honest report)
  const plain = await B.cleanPdf(mkRec(pdfBuf));
  const plainTxt = asText(await plain.arrayBuffer());
  log('plain clean leaves old revision behind (expected)', plainTxt.includes('SECRET SALARY'));

  // clean WITH the deep option: old revision content is gone, page survives
  const deepRec = mkRec(pdfBuf, ['pdfRevisions']);
  const cleaned = await B.cleanPdf(deepRec);
  const cleanedBuf = await cleaned.arrayBuffer();
  const cleanTxt = asText(cleanedBuf);
  log('deep clean removes old revision text', !cleanTxt.includes('SECRET SALARY'));
  log('deep clean keeps current content', cleanTxt.includes('REDACTED'));
  log('deep clean reports what it did', deepRec.deepApplied.length > 0, deepRec.deepApplied.join('; '));
  log('no warning on the happy path', deepRec.warnings.length === 0, deepRec.warnings.join('; '));
  const reload = await PDFLib.PDFDocument.load(cleanedBuf, { updateMetadata:false });
  log('cleaned PDF still opens with 1 page', reload.getPageCount() === 1);

  // re-scan of the deep-cleaned copy must no longer report the finding
  const probe = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(probe, cleanedBuf);
  log('re-scan of deep-cleaned copy is quiet', !probe.fields.some(f => f.label === 'Earlier revisions'),
    JSON.stringify(probe.fields.map(f => f.label)));
  // and the plainly-cleaned copy still reports it (so the card tells the truth)
  const probe2 = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(probe2, await plain.arrayBuffer());
  log('re-scan of plain-cleaned copy still reports leftovers',
    probe2.fields.some(f => f.label === 'Earlier revisions'));

  /* ---------------- PDF: single-revision + linearized are quiet ------------- */
  const fresh = await PDFLib.PDFDocument.create();
  fresh.addPage([200,200]).drawText('hello', { x:10, y:100 });
  const freshBytes = await fresh.save({ useObjectStreams:false });
  const p3 = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(p3, freshBytes.buffer.slice(freshBytes.byteOffset, freshBytes.byteOffset + freshBytes.byteLength));
  log('a plain one-revision PDF reports nothing', !p3.fields.some(f => f.label === 'Earlier revisions'),
    JSON.stringify(p3.fields.map(f => f.label)));

  const linear = '%PDF-1.4\n1 0 obj<</Linearized 1>>endobj\nxref\ntrailer<<>>\nstartxref\n0\n%%EOF\n junk \nxref\ntrailer<<>>\nstartxref\n9\n%%EOF\n';
  const lu8 = new Uint8Array([...linear].map(c => c.charCodeAt(0)));
  log('linearized file is not mistaken for 2 revisions', B.pdfPriorRevisions(lu8.buffer) === 0,
    'got ' + B.pdfPriorRevisions(lu8.buffer));

  // A stray %%EOF inside the file (an embedded PDF attachment, say) is not a revision
  const embedded = '%PDF-1.4\n1 0 obj<</Type/EmbeddedFile>>stream\n%PDF-1.4 inner \nstartxref\n99\n%%EOF\nendstream endobj\nxref\ntrailer<<>>\nstartxref\n10\n%%EOF\n';
  const eu8 = new Uint8Array([...embedded].map(c => c.charCodeAt(0)));
  log('an embedded PDF that is flate-compressed leaves no marks',
    B.pdfPriorRevisions(new Uint8Array([...'%PDF-1.4 junk %%EOF more junk %%EOF\nstartxref\n5\n%%EOF\n'].map(c => c.charCodeAt(0))).buffer) === 0,
    'bare %%EOF markers must not count');
  log('an uncompressed embedded PDF is counted at most once', B.pdfPriorRevisions(eu8.buffer) === 1,
    'got ' + B.pdfPriorRevisions(eu8.buffer) + ' (a known limit: it looks like a revision)');

  /* ---------------- PDF: digital signatures ---------------- */
  const { PDFString, PDFHexString, PDFName } = PDFLib;
  const mkSigned = async (nest) => {
    const d = await PDFLib.PDFDocument.create();
    d.addPage([200,200]);
    const c = d.context;
    const sig = c.register(c.obj({ Type:'Sig', Filter:'Adobe.PPKLite', SubFilter:'adbe.pkcs7.detached',
      Name: PDFString.of('Michael Bennett'), M: PDFString.of("D:20250131094500+01'00'"),
      Reason: PDFString.of('I approve this document'), Location: PDFString.of('Berlin'),
      ByteRange: [0,0,0,0], Contents: PDFHexString.of('00') }));
    const leaf = c.register(c.obj({ FT:'Sig', T: PDFString.of('Signature1'), V: sig,
      Type:'Annot', Subtype:'Widget', Rect:[0,0,0,0] }));
    const top = nest
      ? c.register(c.obj({ T: PDFString.of('form'), Kids: [leaf] }))
      : leaf;
    d.catalog.set(PDFName.of('AcroForm'), c.obj({ Fields: [top], SigFlags: 3 }));
    const b = await d.save({ useObjectStreams:false });
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };

  const signedBuf = await mkSigned(false);
  const srecP = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(srecP, signedBuf);
  const sigField = srecP.fields.find(f => /Digital signature/.test(f.label));
  log('signature detected with signer, date, reason', !!sigField &&
    /Michael Bennett/.test(sigField.value) && /2025-01-31 08:45/.test(sigField.value) &&
    /I approve this document/.test(sigField.value), sigField && sigField.value);
  log('signing time converted from +01:00 to UTC', !!sigField && /08:45 UTC/.test(sigField.value));
  log('signature is a finding with an opt-in removal switch',
    !!sigField && sigField.leak === true && sigField.deep === 'pdfSignature');
  log('signed file raises the warning', srecP.warnings.some(w => /digitally signed/.test(w)),
    srecP.warnings.join(' | '));

  const nestedBuf = await mkSigned(true);
  const nrec = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(nrec, nestedBuf);
  log('signature nested under a parent field is found',
    nrec.fields.some(f => /Digital signature/.test(f.label)));

  // an empty signature placeholder (no /V) must not be reported as signed
  const ph = await PDFLib.PDFDocument.create();
  ph.addPage([200,200]);
  const phc = ph.context;
  const phField = phc.register(phc.obj({ FT:'Sig', T: PDFString.of('Signature1'), Type:'Annot', Subtype:'Widget', Rect:[0,0,0,0] }));
  ph.catalog.set(PDFName.of('AcroForm'), phc.obj({ Fields:[phField] }));
  const phBytes = await ph.save({ useObjectStreams:false });
  const phrec = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(phrec, phBytes.buffer.slice(phBytes.byteOffset, phBytes.byteOffset + phBytes.byteLength));
  log('an unsigned signature placeholder is not reported',
    !phrec.fields.some(f => /Digital signature/.test(f.label)) && phrec.warnings.length === 0);

  // an ordinary PDF stays quiet
  const qrec = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(qrec, freshBytes.buffer.slice(freshBytes.byteOffset, freshBytes.byteOffset + freshBytes.byteLength));
  log('an unsigned PDF raises no signature warning',
    !qrec.fields.some(f => /Digital signature/.test(f.label)) && qrec.warnings.length === 0);

  // cleaning a signed PDF still works and does not fail verification
  const srec2 = { ext:'pdf', kind:'pdf', fields:[], warnings:[], deepApplied:[], buffer: signedBuf,
    deepSelected: new Set(['pdfRevisions']), file: new File([signedBuf], 'signed.pdf') };
  await B.analyzePdf(srec2, signedBuf);
  const signedOut = await B.cleanPdf(srec2);
  const signedOutBuf = await signedOut.arrayBuffer();
  const vrec = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(vrec, signedOutBuf);
  log('cleaned signed PDF has no leaks left', !vrec.fields.some(f => B.wasRemoved(srec2, f)),
    JSON.stringify(vrec.fields.filter(f => f.leak).map(f => f.label)));
  log('the signature is left in place unless asked (we never strip it silently)',
    vrec.fields.some(f => /Digital signature/.test(f.label)));
  log('an unremoved signature is reported as kept, not as a failure',
    B.wasRemoved(srec2, { leak:true, value:'x', deep:'pdfSignature' }) === false);

  // opting in removes the signature AND the signer's name from the bytes
  const srec3 = { ext:'pdf', kind:'pdf', fields:[], warnings:[], deepApplied:[], buffer: signedBuf,
    deepSelected: new Set(['pdfSignature']), file: new File([signedBuf], 'signed.pdf') };
  await B.analyzePdf(srec3, signedBuf);
  const strippedBuf = await (await B.cleanPdf(srec3)).arrayBuffer();
  const strippedTxt = asText(strippedBuf);
  log('signature removal reports what it did', srec3.deepApplied.length > 0, srec3.deepApplied.join('; '));
  log("the signer's name is gone from the file bytes", !strippedTxt.includes('Michael Bennett'));
  log('the reason and location are gone too',
    !strippedTxt.includes('I approve this document') && !strippedTxt.includes('Berlin'));
  log('AcroForm and SigFlags are gone', !strippedTxt.includes('SigFlags'));
  const srecProbe = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(srecProbe, strippedBuf);
  log('re-scan finds no signature and raises no warning',
    !srecProbe.fields.some(f => /Digital signature/.test(f.label)) && srecProbe.warnings.length === 0);
  const reopened = await PDFLib.PDFDocument.load(strippedBuf, { updateMetadata:false });
  log('the de-signed PDF still opens with its page', reopened.getPageCount() === 1);

  // a PDF with a non-signature form field keeps that field
  const formDoc = await PDFLib.PDFDocument.create();
  formDoc.addPage([200,200]);
  const fc = formDoc.context;
  const textField = fc.register(fc.obj({ FT:'Tx', T: PDFString.of('fullName'), V: PDFString.of('keep me') }));
  const sig2 = fc.register(fc.obj({ Type:'Sig', Name: PDFString.of('Michael Bennett') }));
  const sigField2 = fc.register(fc.obj({ FT:'Sig', T: PDFString.of('Signature1'), V: sig2 }));
  formDoc.catalog.set(PDFName.of('AcroForm'), fc.obj({ Fields:[textField, sigField2], SigFlags:3 }));
  const formBytes = await formDoc.save({ useObjectStreams:false });
  const formBuf = formBytes.buffer.slice(formBytes.byteOffset, formBytes.byteOffset + formBytes.byteLength);
  const frec = { ext:'pdf', kind:'pdf', fields:[], warnings:[], deepApplied:[], buffer: formBuf,
    deepSelected: new Set(['pdfSignature']), file: new File([formBuf], 'form.pdf') };
  await B.analyzePdf(frec, formBuf);
  const formOut = asText(await (await B.cleanPdf(frec)).arrayBuffer());
  log('a form field next to the signature survives',
    formOut.includes('fullName') && formOut.includes('keep me') && !formOut.includes('Michael Bennett'));

  /* ---------------- PDF: annotations, attachments, form data -------------- */
  const mkAnnotated = async () => {
    const d = await PDFLib.PDFDocument.create();
    const pg = d.addPage([300,300]);
    const c = d.context;
    const mk = o => c.register(c.obj(o));
    const note = mk({ Type:'Annot', Subtype:'Text', Rect:[10,10,30,30],
      T: PDFString.of('Olga Aleksandrova'), Contents: PDFString.of('internal: do not send to client'),
      M: PDFString.of("D:20250301101500Z") });
    const hl = mk({ Type:'Annot', Subtype:'Highlight', Rect:[10,40,90,60],
      T: PDFString.of('Janne Tikko'), Contents: PDFString.of('check this number') });
    const ink = mk({ Type:'Annot', Subtype:'Ink', Rect:[10,70,90,90], T: PDFString.of('Olga Aleksandrova') });
    const link = mk({ Type:'Annot', Subtype:'Link', Rect:[10,100,90,120],
      A: c.obj({ S:'URI', URI: PDFString.of('https://example.com/keep-me') }) });
    const redact = mk({ Type:'Annot', Subtype:'Redact', Rect:[10,130,90,150],
      T: PDFString.of('Compliance'), Contents: PDFString.of('to redact: account number') });
    pg.node.set(PDFName.of('Annots'), c.obj([note, hl, ink, link, redact]));
    await d.attach(new TextEncoder().encode('salary,amount\nBennett,250000\n'), 'salaries.csv',
      { mimeType:'text/csv' });
    // a hidden, filled form field alongside a visible one
    const hiddenField = mk({ FT:'Tx', T: PDFString.of('internalRef'), V: PDFString.of('CASE-2026-0042'), F: 2 });
    const shownField  = mk({ FT:'Tx', T: PDFString.of('fullName'), V: PDFString.of('Visible Form Answer'), F: 4 });
    d.catalog.set(PDFName.of('AcroForm'), c.obj({ Fields: [hiddenField, shownField] }));
    const b = await d.save({ useObjectStreams:false });
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  const annBuf = await mkAnnotated();
  const arec = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(arec, annBuf);
  const ann = arec.fields.find(f => f.label === 'Annotations');
  log('annotations counted with kinds, authors and comment text', !!ann &&
    /3 annotations/.test(ann.value) && /Olga Aleksandrova/.test(ann.value) &&
    /2 with comment text/.test(ann.value), ann && ann.value);
  log('links are not counted as annotations to remove', !!ann && !/Link/.test(ann.value));
  const red = arec.fields.find(f => f.label === 'Unapplied redactions');
  log('unapplied redaction marks get their own warning', !!red && /1 redaction mark/.test(red.value), red && red.value);
  const att = arec.fields.find(f => f.label === 'Attached files');
  log('attached file listed with name and size', !!att && /salaries\.csv/.test(att.value), att && att.value);
  const hid = arec.fields.find(f => f.label === 'Hidden form fields');
  log('hidden filled field reported by name', !!hid && /internalRef/.test(hid.value), hid && hid.value);
  const fdat = arec.fields.find(f => f.label === 'Form data');
  log('a visible filled field is reported but not as a leak', !!fdat && fdat.leak === false, fdat && fdat.value);

  // removal
  const arec2 = { ext:'pdf', kind:'pdf', fields:[], warnings:[], deepApplied:[], buffer: annBuf,
    deepSelected: new Set(['pdfAnnots','pdfAttachments']), file: new File([annBuf], 'a.pdf') };
  await B.analyzePdf(arec2, annBuf);
  const annOutBuf = await (await B.cleanPdf(arec2)).arrayBuffer();
  const annOut = asText(annOutBuf);
  log('annotation authors and comment text are gone from the bytes',
    !/Olga Aleksandrova|Janne Tikko|do not send to client|check this number/.test(annOut));
  log('the attached file content is gone', !/Bennett,250000|salaries\.csv/.test(annOut));
  log('the link survives', /keep-me/.test(annOut));
  log('a visible form answer is left alone', /Visible Form Answer/.test(annOut));
  log('the unapplied redaction mark survives — we never hide that warning',
    /to redact: account number/.test(annOut));
  log('removal reports what it did', arec2.deepApplied.length === 2, arec2.deepApplied.join('; '));
  const areload = await PDFLib.PDFDocument.load(annOutBuf, { updateMetadata:false });
  log('the cleaned PDF still opens with its page', areload.getPageCount() === 1);
  const aprobe = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(aprobe, annOutBuf);
  log('re-scan reports no annotations and no attachments',
    !aprobe.fields.some(f => ['Annotations','Attached files'].indexOf(f.label) !== -1),
    JSON.stringify(aprobe.fields.map(f => f.label)));
  log('re-scan still reports the redaction marks', aprobe.fields.some(f => f.label === 'Unapplied redactions'));

  // an ordinary PDF must not grow annotation findings
  const qp = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(qp, freshBytes.buffer.slice(freshBytes.byteOffset, freshBytes.byteOffset + freshBytes.byteLength));
  log('a plain PDF reports no annotations, attachments or form data',
    !qp.fields.some(f => ['Annotations','Attached files','Hidden form fields','Form data','Unapplied redactions'].indexOf(f.label) !== -1),
    JSON.stringify(qp.fields.map(f => f.label)));

  /* ---------------- PDF: cropped pages ---------------- */
  const cropDoc = await PDFLib.PDFDocument.create();
  const cp = cropDoc.addPage([400,400]);
  cp.drawText('header that was cropped away', { x:10, y:380, size:8 });
  cp.setCropBox(0, 0, 400, 300);
  const cropBytes = await cropDoc.save({ useObjectStreams:false });
  const p4 = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(p4, cropBytes.buffer.slice(cropBytes.byteOffset, cropBytes.byteOffset + cropBytes.byteLength));
  const cropField = p4.fields.find(f => f.label === 'Cropped pages');
  log('cropped page detected', !!cropField, cropField && cropField.value);
  log('cropped page is tagged detection-only', !!cropField && cropField.deep === 'pdfCrop');
  log('resolveTarget walks ../ out of a subfolder',
    B.resolveTarget('ppt/slides/slide1.xml', '../media/image1.png') === 'ppt/media/image1.png',
    B.resolveTarget('ppt/slides/slide1.xml', '../media/image1.png'));

  /* ---------------- DOCX: cropped picture ---------------- */
  // Build a picture: left half red, right half green, then crop away the left
  // half in the document. After deep clean the stored image must be green only.
  const cv = document.createElement('canvas');
  cv.width = 200; cv.height = 100;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#ff0000'; cx.fillRect(0, 0, 100, 100);
  cx.fillStyle = '#00ff00'; cx.fillRect(100, 0, 100, 100);
  const picBlob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const picBytes = new Uint8Array(await picBlob.arrayBuffer());

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body><w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData>
<pic:pic><pic:blipFill><a:blip r:embed="rId5"/><a:srcRect l="50000"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill></pic:pic>
</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>`;
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="png" ContentType="image/png"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const mkDocx = async () => {
    const z = new JSZip();
    z.file('[Content_Types].xml', ct);
    z.file('_rels/.rels', rootRels);
    z.file('word/document.xml', docXml);
    z.file('word/_rels/document.xml.rels', relsXml);
    z.file('word/media/image1.png', picBytes);
    return z.generateAsync({ type:'arraybuffer' });
  };
  const docxBuf = await mkDocx();
  const drec = { ext:'docx', kind:'ooxml', fields:[], warnings:[], deepApplied:[], buffer: docxBuf,
    deepSelected: new Set(), file: new File([docxBuf], 't.docx') };
  await B.analyzeOoxml(drec, docxBuf);
  const cropPic = drec.fields.find(f => f.label === 'Cropped pictures');
  log('cropped picture detected in DOCX', !!cropPic, cropPic && cropPic.value);
  log('cropped picture offers the deep switch', !!cropPic && cropPic.deep === 'croppedImages');

  // without opting in, the picture keeps its hidden half
  const asIs = await B.cleanOoxml(drec);
  const zAsIs = await JSZip.loadAsync(await asIs.arrayBuffer());
  const keptXml = await zAsIs.file('word/document.xml').async('string');
  log('without opt-in the crop is left alone', keptXml.includes('srcRect'));

  // with the option on, the stored image is cropped and srcRect is gone
  const drec2 = { ext:'docx', kind:'ooxml', fields:[], warnings:[], deepApplied:[], buffer: docxBuf,
    deepSelected: new Set(['croppedImages']), file: new File([docxBuf], 't.docx') };
  await B.analyzeOoxml(drec2, docxBuf);
  const cleanedDocx = await B.cleanOoxml(drec2);
  const z2 = await JSZip.loadAsync(await cleanedDocx.arrayBuffer());
  const xml2 = await z2.file('word/document.xml').async('string');
  log('deep clean drops srcRect', !xml2.includes('srcRect'));
  log('deep clean reports the action', drec2.deepApplied.length > 0, drec2.deepApplied.join('; '));
  log('deep clean raised no warning', drec2.warnings.length === 0, drec2.warnings.join('; '));
  const newPic = await z2.file('word/media/image1.png').async('blob');
  const bmp = await createImageBitmap(newPic);
  log('stored picture is now the visible half only', bmp.width === 100 && bmp.height === 100,
    bmp.width + 'x' + bmp.height);
  const c2 = document.createElement('canvas');
  c2.width = bmp.width; c2.height = bmp.height;
  c2.getContext('2d').drawImage(bmp, 0, 0);
  const px = c2.getContext('2d').getImageData(5, 5, 1, 1).data;
  log('the cropped-away (red) half is really gone', px[0] < 40 && px[1] > 200,
    'pixel rgb=' + px[0] + ',' + px[1] + ',' + px[2]);

  // re-scan of the cleaned docx no longer reports it
  const probeD = { ext:'docx', kind:'ooxml', fields:[], warnings:[] };
  await B.analyzeOoxml(probeD, await cleanedDocx.arrayBuffer());
  log('re-scan of cleaned DOCX is quiet about crops',
    !probeD.fields.some(f => f.label === 'Cropped pictures'));

  /* ------ shared picture must be left alone (cropping it would hit both) ---- */
  const sharedRels = relsXml.replace('</Relationships>',
    '<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>');
  const zs = new JSZip();
  zs.file('[Content_Types].xml', ct); zs.file('_rels/.rels', rootRels);
  zs.file('word/document.xml', docXml);
  zs.file('word/_rels/document.xml.rels', sharedRels);
  zs.file('word/media/image1.png', picBytes);
  const sharedBuf = await zs.generateAsync({ type:'arraybuffer' });
  const srec = { ext:'docx', kind:'ooxml', fields:[], warnings:[], deepApplied:[], buffer: sharedBuf,
    deepSelected: new Set(['croppedImages']), file: new File([sharedBuf], 's.docx') };
  await B.analyzeOoxml(srec, sharedBuf);
  const sharedOut = await B.cleanOoxml(srec);
  const zsOut = await JSZip.loadAsync(await sharedOut.arrayBuffer());
  const sharedXml = await zsOut.file('word/document.xml').async('string');
  const sharedPic = await zsOut.file('word/media/image1.png').async('uint8array');
  log('a shared picture is not cropped', sharedXml.includes('srcRect') && sharedPic.length === picBytes.length,
    srec.deepApplied.join('; '));

  /* ---------------- PPTX: crop on a slide (media via ../media/) ------------ */
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<p:cSld><p:spTree><p:pic><p:blipFill><a:blip r:embed="rId2"/><a:srcRect l="50000"/><a:stretch><a:fillRect/></a:stretch></p:blipFill></p:pic></p:spTree></p:cSld></p:sld>`;
  const slideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`;
  const zpp = new JSZip();
  zpp.file('[Content_Types].xml', ct);
  zpp.file('_rels/.rels', rootRels);
  zpp.file('ppt/slides/slide1.xml', slideXml);
  zpp.file('ppt/slides/_rels/slide1.xml.rels', slideRels);
  zpp.file('ppt/media/image1.png', picBytes);
  const pptBuf = await zpp.generateAsync({ type:'arraybuffer' });
  const pprec = { ext:'pptx', kind:'ooxml', fields:[], warnings:[], deepApplied:[], buffer: pptBuf,
    deepSelected: new Set(['croppedImages']), file: new File([pptBuf], 't.pptx') };
  await B.analyzeOoxml(pprec, pptBuf);
  log('cropped picture detected in PPTX', pprec.fields.some(f => f.label === 'Cropped pictures'));
  const pptOut = await B.cleanOoxml(pprec);
  const zppOut = await JSZip.loadAsync(await pptOut.arrayBuffer());
  const slideOut = await zppOut.file('ppt/slides/slide1.xml').async('string');
  const pptPic = await createImageBitmap(await zppOut.file('ppt/media/image1.png').async('blob'));
  log('PPTX picture cropped through a ../media/ relationship',
    !slideOut.includes('srcRect') && pptPic.width === 100, pprec.deepApplied.join('; '));

  /* ---------------- XLSX: crop inside a drawing part ---------------- */
  const drawXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<xdr:twoCellAnchor><xdr:pic><xdr:blipFill><a:blip r:embed="rId1"/><a:srcRect t="25000" b="25000"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill></xdr:pic></xdr:twoCellAnchor></xdr:wsDr>`;
  const drawRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`;
  const zx = new JSZip();
  zx.file('[Content_Types].xml', ct);
  zx.file('_rels/.rels', rootRels);
  zx.file('xl/drawings/drawing1.xml', drawXml);
  zx.file('xl/drawings/_rels/drawing1.xml.rels', drawRels);
  zx.file('xl/media/image1.png', picBytes);
  const xlsBuf = await zx.generateAsync({ type:'arraybuffer' });
  const xrec = { ext:'xlsx', kind:'ooxml', fields:[], warnings:[], deepApplied:[], buffer: xlsBuf,
    deepSelected: new Set(['croppedImages']), file: new File([xlsBuf], 't.xlsx') };
  await B.analyzeOoxml(xrec, xlsBuf);
  log('cropped picture detected in XLSX', xrec.fields.some(f => f.label === 'Cropped pictures'),
    (xrec.fields.find(f => f.label === 'Cropped pictures') || {}).value);
  const xlsOut = await B.cleanOoxml(xrec);
  const zxOut = await JSZip.loadAsync(await xlsOut.arrayBuffer());
  const xPic = await createImageBitmap(await zxOut.file('xl/media/image1.png').async('blob'));
  log('XLSX picture cropped top and bottom', xPic.width === 200 && xPic.height === 50,
    xPic.width + 'x' + xPic.height);

  /* ---------------- XLSX: pivot cache, external links, connections -------- */
  const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets>
<externalReferences><externalReference r:id="rId9"/></externalReferences>
<pivotCaches><pivotCache cacheId="1" r:id="rId8"/></pivotCaches></workbook>`;
  const pivotDef = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 r:id="rId1" recordCount="1240" saveData="1">
<cacheSource type="worksheet"><worksheetSource ref="A1:C1240" sheet="Salaries"/></cacheSource>
<cacheFields count="3">
<cacheField name="Name"><sharedItems count="2"><s v="Michael Bennett"/><s v="Anna Krause"/></sharedItems></cacheField>
<cacheField name="Salary"><sharedItems containsNumber="1" minValue="41000" maxValue="250000"/></cacheField>
<cacheField name="Team"><sharedItems count="1"><s v="Finance"/></sharedItems></cacheField>
</cacheFields></pivotCacheDefinition>`;
  const pivotRecs = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2">
<r><s v="Michael Bennett"/><n v="250000"/><s v="Finance"/></r>
<r><s v="Anna Krause"/><n v="41000"/><s v="Finance"/></r></pivotCacheRecords>`;
  const extLink = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<externalLink xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<externalBook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1">
<sheetNames><sheetName val="Budget"/></sheetNames>
<sheetDataSet><sheetData sheetId="0"><row r="1"><cell r="A1"><v>98000</v></cell><cell r="B1"><v>12000</v></cell></row></sheetData></sheetDataSet>
</externalBook></externalLink>`;
  const extRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLinkPath" Target="file:///\\\\fileserver\\finance\\2025\\Budget%20master.xlsx" TargetMode="External"/>
</Relationships>`;
  const connections = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<connections xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<connection id="1" name="PayrollQuery" type="5" refreshedVersion="8">
<dbPr connection="Provider=SQLOLEDB;Data Source=fin-sql01;Initial Catalog=Payroll;User ID=svc_reports" command="SELECT * FROM dbo.Salaries"/>
</connection></connections>`;
  const mkBook = (parts) => {
    const z = new JSZip();
    z.file('[Content_Types].xml', ct);
    z.file('_rels/.rels', rootRels);
    z.file('xl/workbook.xml', parts.wb === undefined ? wbXml : parts.wb);
    if(parts.def) z.file('xl/pivotCache/pivotCacheDefinition1.xml', parts.def);
    if(parts.recs) z.file('xl/pivotCache/pivotCacheRecords1.xml', parts.recs);
    if(parts.ext){ z.file('xl/externalLinks/externalLink1.xml', parts.ext); z.file('xl/externalLinks/_rels/externalLink1.xml.rels', extRels); }
    if(parts.conn) z.file('xl/connections.xml', parts.conn);
    return z.generateAsync({ type:'arraybuffer' });
  };

  const bookBuf = await mkBook({ def: pivotDef, recs: pivotRecs, ext: extLink, conn: connections });
  const brec = { ext:'xlsx', kind:'ooxml', fields:[], warnings:[] };
  await B.analyzeOoxml(brec, bookBuf);
  const pv = brec.fields.find(f => f.label === 'Pivot table cache');
  log('pivot cache detected with row count and source sheet', !!pv &&
    /1240 row/.test(pv.value) && /3 column/.test(pv.value) && /Salaries/.test(pv.value), pv && pv.value);
  const ex = brec.fields.find(f => f.label === 'Links to other workbooks');
  log('external link path detected and URL-decoded', !!ex &&
    /fileserver/.test(ex.value) && /Budget master\.xlsx/.test(ex.value) && !/file:\/\//.test(ex.value), ex && ex.value);
  log('cached values from the other workbook counted', !!ex && /2 cached cell values/.test(ex.value));
  const cn = brec.fields.find(f => f.label === 'Data connections');
  log('data connection server detected', !!cn && /fin-sql01/.test(cn.value), cn && cn.value);

  // removing the cache: nothing from the source data may survive anywhere
  const zipText = async (buf) => {
    const z = await JSZip.loadAsync(buf);
    const names = Object.keys(z.files).filter(n => !z.files[n].dir);
    let all = '';
    for(const n of names) all += n + '\n' + await z.file(n).async('string');
    return all;
  };
  const cutRec = { ext:'xlsx', kind:'ooxml', fields:[], warnings:[], deepApplied:[], buffer: bookBuf,
    deepSelected: new Set(['pivotCache']), file: new File([bookBuf], 'book.xlsx') };
  await B.analyzeOoxml(cutRec, bookBuf);
  const cutOut = await B.cleanOoxml(cutRec);
  const cutBuf = await cutOut.arrayBuffer();
  const cutZip = await JSZip.loadAsync(cutBuf);
  const cutAll = await zipText(cutBuf);
  log('cache records part is gone', !cutZip.file('xl/pivotCache/pivotCacheRecords1.xml'));
  log('no source row survives anywhere in the package',
    !/Michael Bennett|Anna Krause|250000|41000/.test(cutAll));
  const defOut = await cutZip.file('xl/pivotCache/pivotCacheDefinition1.xml').async('string');
  log('definition switched to save-no-data and refresh-on-open',
    /saveData="0"/.test(defOut) && /refreshOnLoad="1"/.test(defOut) &&
    !/recordCount/.test(defOut) && !/r:id/.test(defOut), defOut.slice(0, 260));
  log('the field list (pivot layout) survives',
    /cacheField/.test(defOut) && /name="Salary"/.test(defOut) && /worksheetSource/.test(defOut));
  log('cache removal reports what it did', cutRec.deepApplied.length > 0, cutRec.deepApplied.join('; '));
  log('no warning raised', cutRec.warnings.length === 0, cutRec.warnings.join('; '));
  const cutProbe = { ext:'xlsx', kind:'ooxml', fields:[], warnings:[] };
  await B.analyzeOoxml(cutProbe, cutBuf);
  log('re-scan of the cleaned workbook reports no cache',
    !cutProbe.fields.some(f => f.label === 'Pivot table cache'),
    JSON.stringify(cutProbe.fields.map(f => f.label)));
  log('external link and connection are untouched by the cache option',
    cutProbe.fields.some(f => f.label === 'Links to other workbooks') &&
    cutProbe.fields.some(f => f.label === 'Data connections'));

  // regression: the comments option still works after the restructure
  const cmRec = { ext:'xlsx', kind:'ooxml', fields:[], warnings:[], deepApplied:[], buffer: null,
    deepSelected: new Set(['comments']), file: null };
  const zc = new JSZip();
  zc.file('[Content_Types].xml', ct); zc.file('_rels/.rels', rootRels);
  zc.file('xl/workbook.xml', wbXml);
  zc.file('xl/comments1.xml', '<?xml version="1.0"?><comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>Anna Krause</author></authors><commentList><comment ref="A1" authorId="0"><text><t>check this</t></text></comment></commentList></comments>');
  const cmBuf = await zc.generateAsync({ type:'arraybuffer' });
  cmRec.buffer = cmBuf; cmRec.file = new File([cmBuf], 'c.xlsx');
  await B.analyzeOoxml(cmRec, cmBuf);
  const cmOut = await B.cleanOoxml(cmRec);
  const cmZip = await JSZip.loadAsync(await cmOut.arrayBuffer());
  log('cell comments removal still works', !cmZip.file('xl/comments1.xml'), cmRec.deepApplied.join('; '));

  // a cache saved without its data must not be reported
  const noData = pivotDef.replace('recordCount="1240" saveData="1"', 'saveData="0"')
    .replace(/<sharedItems count="2">[\s\S]*?<\/sharedItems>/, '<sharedItems/>')
    .replace(/<sharedItems count="1">[\s\S]*?<\/sharedItems>/, '<sharedItems/>')
    .replace('<sharedItems containsNumber="1" minValue="41000" maxValue="250000"/>', '<sharedItems containsNumber="1"/>');
  const leanBuf = await mkBook({ def: noData });
  const lrec = { ext:'xlsx', kind:'ooxml', fields:[], warnings:[] };
  await B.analyzeOoxml(lrec, leanBuf);
  log('a pivot cache saved without its data is not flagged',
    !lrec.fields.some(f => f.label === 'Pivot table cache'),
    JSON.stringify(lrec.fields.map(f => f.label)));

  // shared items alone (no records part) still count as stored data
  const itemsOnly = pivotDef.replace('recordCount="1240" ', '');
  const itemsBuf = await mkBook({ def: itemsOnly });
  const irec = { ext:'xlsx', kind:'ooxml', fields:[], warnings:[] };
  await B.analyzeOoxml(irec, itemsBuf);
  const iv = irec.fields.find(f => f.label === 'Pivot table cache');
  log('values kept in the cache definition are still reported', !!iv &&
    /5 stored values/.test(iv.value), iv && iv.value);

  // a numeric column's min/max is data too, even with no shared item list
  const rangeOnly = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" saveData="0">
<cacheSource type="worksheet"><worksheetSource ref="A1:B900" sheet="Payroll"/></cacheSource>
<cacheFields count="1"><cacheField name="Salary"><sharedItems containsNumber="1" minValue="41000" maxValue="250000"/></cacheField></cacheFields>
</pivotCacheDefinition>`;
  const rangeBuf = await mkBook({ def: rangeOnly });
  const rrec = { ext:'xlsx', kind:'ooxml', fields:[], warnings:[] };
  await B.analyzeOoxml(rrec, rangeBuf);
  log('a numeric column range left in the cache is reported',
    rrec.fields.some(f => f.label === 'Pivot table cache'),
    (rrec.fields.find(f => f.label === 'Pivot table cache') || {}).value);

  // an ordinary workbook stays quiet
  const plainBook = await mkBook({ wb: wbXml.replace(/<externalReferences>[\s\S]*<\/pivotCaches>/, '') });
  const pbrec = { ext:'xlsx', kind:'ooxml', fields:[], warnings:[] };
  await B.analyzeOoxml(pbrec, plainBook);
  log('a workbook with no cache, link or connection is quiet',
    !pbrec.fields.some(f => /Pivot table cache|Links to other workbooks|Data connections/.test(f.label)),
    JSON.stringify(pbrec.fields.map(f => f.label)));

  /* ------ XLSX: threaded comments, printer setup, customXml, workbook ----- */
  // Excel mirrors each threaded comment as a legacy note authored by "tc={guid}"
  const legacy = `<?xml version="1.0"?><comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<authors><author>tc={158E7BD2-A46C-4E5C-96C1-1D1E586D97DB}</author><author>Real Note Author</author></authors>
<commentList>
<comment ref="A1" authorId="0"><text><t>mirror of a thread</t></text></comment>
<comment ref="A2" authorId="0"><text><t>mirror of a thread</t></text></comment>
<comment ref="B1" authorId="1"><text><t>an actual old-style note</t></text></comment>
</commentList></comments>`;
  const threaded = `<?xml version="1.0"?><ThreadedComments xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments">
<threadedComment ref="A1" personId="{P1}" id="{C1}"><text>one</text></threadedComment>
<threadedComment ref="A2" personId="{P2}" id="{C2}"><text>two</text></threadedComment></ThreadedComments>`;
  const persons = `<?xml version="1.0"?><personList xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments">
<person displayName="Olga Aleksandrova" id="{P1}" userId="S::Olga.Aleksandrova@example.com::a835dc40" providerId="AD"/>
<person displayName="Janne Tikko" id="{P2}" userId="S::Janne.Tikko@example.com::b935dc41" providerId="AD"/></personList>`;
  const wbLeaks = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:x15ac="http://schemas.microsoft.com/office/spreadsheetml/2010/11/ac">
<fileSharing readOnlyRecommended="1" userName="Olga Aleksandrova" algorithmName="SHA-512" hashValue="AAAA" saltValue="BBBB" spinCount="100000"/>
<mc:AlternateContent><mc:Choice Requires="x15"><x15ac:absPath url="https://corp.sharepoint.com/sites/Line/Shared Documents/Rosters/"/></mc:Choice></mc:AlternateContent>
<sheets><sheet name="Report" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets></workbook>`;
  const sheetWithPrinter = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetData/><pageSetup paperSize="9" scale="61" orientation="landscape" r:id="rId9"/></worksheet>`;
  const sheetRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings" Target="../printerSettings/printerSettings1.bin"/></Relationships>`;
  // DEVMODE: the device name as UTF-16LE at the head of the blob
  const devmode = (name) => {
    const b = new Uint8Array(220);
    for(let i = 0; i < name.length; i++){ b[i*2] = name.charCodeAt(i) & 0xff; b[i*2+1] = name.charCodeAt(i) >> 8; }
    return b;
  };
  const zx2 = new JSZip();
  zx2.file('[Content_Types].xml', ct);
  zx2.file('_rels/.rels', rootRels);
  zx2.file('xl/workbook.xml', wbLeaks);
  zx2.file('xl/comments1.xml', legacy);
  zx2.file('xl/threadedComments/threadedComment1.xml', threaded);
  zx2.file('xl/persons/person.xml', persons);
  zx2.file('xl/worksheets/sheet1.xml', sheetWithPrinter);
  zx2.file('xl/worksheets/_rels/sheet1.xml.rels', sheetRels);
  zx2.file('xl/printerSettings/printerSettings1.bin', devmode('\\\\PRNT1.corp.local\\Finance'));
  zx2.file('customXml/item1.xml', '<?xml version="1.0"?><props><site>LineMaintenance</site></props>');
  zx2.file('customXml/itemProps1.xml', '<?xml version="1.0"?><ds:datastoreItem xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml" ds:itemID="{4C62}"/>');
  const realish = await zx2.generateAsync({ type:'arraybuffer' });

  const xr = { ext:'xlsx', kind:'ooxml', fields:[], warnings:[] };
  await B.analyzeOoxml(xr, realish);
  const cm = xr.fields.find(f => f.label === 'Cell comments');
  log('threaded-comment mirrors are not double counted', !!cm && /^3 comments/.test(cm.value), cm && cm.value);
  log('GUID thread ids never show up as authors', !!cm && !/tc=\{/.test(cm.value));
  log('real names and work emails are reported', !!cm &&
    /Olga Aleksandrova/.test(cm.value) && /Janne\.Tikko@example\.com/.test(cm.value));
  const pr = xr.fields.find(f => f.label === 'Printer setup');
  log('printer device name read out of the DEVMODE blob', !!pr &&
    /PRNT1\.corp\.local\\Finance/.test(pr.value), pr && pr.value);
  // dmDeviceName is a fixed 32-WCHAR field, so Windows itself truncates longer
  // names; read exactly that field and never run past it into the binary tail.
  log('the device name is read as the fixed 32-char field, no binary spill',
    !!pr && !/[\u0000-\u001f]/.test(pr.value) && pr.value.split(' \u2014 ')[0].length <= 32,
    JSON.stringify(pr && pr.value.split(' \u2014 ')[0]));
  log('custom XML parts reported', xr.fields.some(f => f.label === 'Custom XML data'));
  const wr = xr.fields.find(f => f.label === 'Write-reservation user');
  log('write-reservation user name reported', !!wr && /Olga Aleksandrova/.test(wr.value));
  const sp = xr.fields.find(f => f.label === 'Storage path');
  log('SharePoint storage path reported', !!sp && /corp\.sharepoint\.com\/sites\/Line/.test(sp.value));

  const xrec2 = { ext:'xlsx', kind:'ooxml', fields:[], warnings:[], deepApplied:[], buffer: realish,
    deepSelected: new Set(['comments','printerSettings','customXml']), file: new File([realish], 'r.xlsx') };
  await B.analyzeOoxml(xrec2, realish);
  const outBuf = await (await B.cleanOoxml(xrec2)).arrayBuffer();
  const outZip = await JSZip.loadAsync(outBuf);
  const outAll = await zipText(outBuf);
  log('printer part, customXml and comment parts are gone',
    !outZip.file('xl/printerSettings/printerSettings1.bin') &&
    !outZip.file('customXml/item1.xml') && !outZip.file('xl/persons/person.xml'));
  log('no name, email, printer host or storage path survives',
    !/Olga|Janne|PRNT1|sharepoint\.com|tc=\{/.test(outAll));
  const sheetOut = await outZip.file('xl/worksheets/sheet1.xml').async('string');
  log('pageSetup keeps paper size and scale but loses the printer pointer',
    /paperSize="9"/.test(sheetOut) && /scale="61"/.test(sheetOut) && !/r:id/.test(sheetOut), sheetOut.slice(-120));
  const wbOut = await outZip.file('xl/workbook.xml').async('string');
  log('write reservation keeps working, only the name is dropped',
    /readOnlyRecommended="1"/.test(wbOut) && /hashValue="AAAA"/.test(wbOut) && !/userName/.test(wbOut));
  log('absPath and its empty wrapper are both gone',
    !/absPath/.test(wbOut) && !/AlternateContent/.test(wbOut));
  const xprobe = { ext:'xlsx', kind:'ooxml', fields:[], warnings:[] };
  await B.analyzeOoxml(xprobe, outBuf);
  log('re-scan of the cleaned workbook is quiet',
    !xprobe.fields.some(f => f.leak), JSON.stringify(xprobe.fields.map(f => f.label)));

  /* ---------------- PDF: links pointing at local files ---------------- */
  const linkDoc = await PDFLib.PDFDocument.create();
  const lpg = linkDoc.addPage([300,300]);
  const lc = linkDoc.context;
  lpg.node.set(PDFName.of('Annots'), lc.obj([
    lc.register(lc.obj({ Type:'Annot', Subtype:'Link', Rect:[0,0,10,10],
      A: lc.obj({ S:'URI', URI: PDFString.of('file:///C:/Users/anne/Documents/rates.xlsx') }) })),
    lc.register(lc.obj({ Type:'Annot', Subtype:'Link', Rect:[0,20,10,30],
      A: lc.obj({ S:'Launch', F: lc.obj({ Type:'Filespec', F: PDFString.of('\\\\\\\\fileserver\\\\finance\\\\budget.xls') }) }) })),
    lc.register(lc.obj({ Type:'Annot', Subtype:'Link', Rect:[0,40,10,50],
      A: lc.obj({ S:'URI', URI: PDFString.of('https://example.com/public') }) }))
  ]));
  const linkBytes = await linkDoc.save({ useObjectStreams:false });
  const lrec2 = { ext:'pdf', kind:'pdf', fields:[], warnings:[] };
  await B.analyzePdf(lrec2, linkBytes.buffer.slice(linkBytes.byteOffset, linkBytes.byteOffset + linkBytes.byteLength));
  const ll = lrec2.fields.find(f => f.label === 'Links to local files');
  log('file: and Launch link targets are reported', !!ll &&
    /Users\/anne\/Documents\/rates\.xlsx/.test(ll.value) && /fileserver/.test(ll.value), ll && ll.value);
  log('an ordinary https link is not reported as local', !!ll && !/example\.com/.test(ll.value));

  /* ---------------- ODF: cropped pictures ---------------- */
  const odfContent = (clipInContent) => `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
 xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 xmlns:xlink="http://www.w3.org/1999/xlink">
<office:automatic-styles>${clipInContent ? `
<style:style style:name="fr1" style:family="graphic"><style:graphic-properties fo:clip="rect(0cm 0cm 0cm 5cm)"/></style:style>` : ''}
</office:automatic-styles>
<office:body><office:text><text:p>
<draw:frame draw:style-name="fr1" svg:width="5cm" svg:height="5cm">
<draw:image xlink:href="Pictures/photo.png"/></draw:frame>
</text:p></office:text></office:body></office:document-content>`;
  const odfStyles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
<office:styles><style:style style:name="fr1" style:family="graphic">
<style:graphic-properties fo:clip="rect(0cm 0cm 0cm 5cm)"/></style:style></office:styles></office:document-styles>`;
  const mkOdt = async (clipInContent) => {
    const z = new JSZip();
    z.file('mimetype', 'application/vnd.oasis.opendocument.text');
    z.file('META-INF/manifest.xml', '<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/></manifest:manifest>');
    z.file('meta.xml', '<?xml version="1.0"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><office:meta><dc:creator>Olga Aleksandrova</dc:creator></office:meta></office:document-meta>');
    z.file('content.xml', odfContent(clipInContent));
    if(!clipInContent) z.file('styles.xml', odfStyles);
    z.file('Pictures/photo.png', picBytes);      // 200x100: left half red, right half green
    return z.generateAsync({ type:'arraybuffer' });
  };

  for(const where of ['content.xml', 'styles.xml']){
    const buf = await mkOdt(where === 'content.xml');
    const orec = { ext:'odt', kind:'odf', fields:[], warnings:[], deepApplied:[], buffer: buf,
      deepSelected: new Set(), file: new File([buf], 'a.odt') };
    await B.analyzeOdf(orec, buf);
    const oc = orec.fields.find(f => f.label === 'Cropped pictures');
    log('ODF crop detected (style in ' + where + ')', !!oc && /50%/.test(oc.value), oc && oc.value);

    const orec2 = { ext:'odt', kind:'odf', fields:[], warnings:[], deepApplied:[], buffer: buf,
      deepSelected: new Set(['croppedImages']), file: new File([buf], 'a.odt') };
    await B.analyzeOdf(orec2, buf);
    const outB = await (await B.cleanOdf(orec2)).arrayBuffer();
    const oz = await JSZip.loadAsync(outB);
    const bmpO = await createImageBitmap(await oz.file('Pictures/photo.png').async('blob'));
    const stylePart = await oz.file(where).async('string');
    log('ODF picture cropped to the visible half (style in ' + where + ')',
      bmpO.width === 100 && bmpO.height === 100 && !/fo:clip/.test(stylePart),
      bmpO.width + 'x' + bmpO.height + ' | ' + orec2.deepApplied.join('; '));
    const oc2 = document.createElement('canvas');
    oc2.width = bmpO.width; oc2.height = bmpO.height;
    oc2.getContext('2d').drawImage(bmpO, 0, 0);
    const opx = oc2.getContext('2d').getImageData(5, 5, 1, 1).data;
    log('the hidden (red) half is gone from the ODF picture (style in ' + where + ')',
      opx[0] < 40 && opx[1] > 200, 'rgb=' + opx[0] + ',' + opx[1]);
    log('ODF deep clean raised no warning (style in ' + where + ')', orec2.warnings.length === 0,
      orec2.warnings.join('; '));
    const oprobe = { ext:'odt', kind:'odf', fields:[], warnings:[] };
    await B.analyzeOdf(oprobe, outB);
    log('re-scan of the cleaned ODF is quiet about crops (style in ' + where + ')',
      !oprobe.fields.some(f => f.label === 'Cropped pictures'));
    const mimeEntry = oz.file('mimetype');
    log('ODF mimetype entry survives the rewrite (style in ' + where + ')',
      !!mimeEntry && (await mimeEntry.async('string')) === 'application/vnd.oasis.opendocument.text');
  }

  // an uncropped ODF must stay quiet
  const zClean = new JSZip();
  zClean.file('mimetype', 'application/vnd.oasis.opendocument.text');
  zClean.file('content.xml', odfContent(true).replace(' fo:clip="rect(0cm 0cm 0cm 5cm)"', ''));
  zClean.file('Pictures/photo.png', picBytes);
  const cleanOdfBuf = await zClean.generateAsync({ type:'arraybuffer' });
  const ocl = { ext:'odt', kind:'odf', fields:[], warnings:[] };
  await B.analyzeOdf(ocl, cleanOdfBuf);
  log('an uncropped ODF picture is not flagged', !ocl.fields.some(f => f.label === 'Cropped pictures'));
  log('a zero clip rect is not a crop', B.parseOdfClip('rect(0cm 0cm 0cm 0cm)') === null &&
    B.parseOdfClip('rect(auto auto auto auto)') === null);
  log('clip units are converted', Math.abs(B.odfLen('10mm') - 1) < 1e-9 && Math.abs(B.odfLen('1in') - 2.54) < 1e-9);

  /* ---------------- no false positives on a clean docx ---------------- */
  const plainDocXml = docXml.replace('<a:srcRect l="50000"/>', '');
  const zp = new JSZip();
  zp.file('[Content_Types].xml', ct); zp.file('_rels/.rels', rootRels);
  zp.file('word/document.xml', plainDocXml);
  zp.file('word/_rels/document.xml.rels', relsXml);
  zp.file('word/media/image1.png', picBytes);
  const plainBuf = await zp.generateAsync({ type:'arraybuffer' });
  const prec = { ext:'docx', kind:'ooxml', fields:[], warnings:[] };
  await B.analyzeOoxml(prec, plainBuf);
  log('an uncropped picture is not flagged', !prec.fields.some(f => f.label === 'Cropped pictures'));

  return out;
}, PDF_B64);


let failed = 0;
for(const r of results){
  if(!r.pass) failed++;
  console.log((r.pass ? "PASS " : "FAIL ") + r.name + (r.detail ? "  [" + r.detail + "]" : ""));
}
console.log("\n" + (results.length - failed) + "/" + results.length + " passed");

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
