# Barecopy — SaaSHub listing answers

## What makes Barecopy unique?
Barecopy does 100% of its work in your browser. Files are read, analyzed, and cleaned locally — nothing is ever uploaded to a server. Most "metadata remover" tools online quietly upload your document to their backend to process it, which is exactly the wrong trust model for a privacy tool handling sensitive files. Barecopy's entire app is a single static page with self-hosted libraries and zero external requests, so even on locked-down corporate networks (which block CDNs) it works — and there's no server that *could* leak your data.

## Why should a person choose Barecopy over its competitors?
- **Truly private by design** — not a promise, an architecture. There's no upload endpoint.
- **Broad format coverage** — Word/Excel/PowerPoint (DOCX/XLSX/PPTX), PDF, and JPG/PNG/WebP photos, all in one tool.
- **Lossless photo cleaning** — strips EXIF/GPS while copying pixels untouched (no re-compression).
- **Deep cleaning, not just the obvious fields** — clears document core/app/custom properties, thumbnails, PDF info dict + XMP metadata.
- **Verifiable results** — an optional on-brand PDF report records what was found and removed per file, including the SHA-256 of the clean copy.
- **Honest, fair pricing** — free for up to 3 files at a time; Pro is €4/mo.

## How would you describe the primary audience of Barecopy?
Privacy-conscious professionals who share documents and photos: lawyers, journalists, HR and recruiters, real-estate and finance staff, consultants, and anyone in a corporate environment who needs to strip author names, company info, edit history, or GPS location before sending a file out. The corporate-network-friendly, no-upload design specifically targets people whose employers block cloud tools.

## What's the story behind Barecopy?
Barecopy grew out of a real, recurring problem: hidden metadata leaking sensitive information — an author's name, a company, revision history, or the GPS coordinates baked into a photo. Existing online cleaners solved this by uploading your file to their servers, which defeats the purpose. Barecopy was built on the opposite principle — your files never leave your machine — after CDN-blocking corporate networks repeatedly broke server-dependent tools. It's a deliberately simple, self-hosted, single-page app so that the privacy guarantee is provable, not just marketing.

## Which are the primary technologies used for building Barecopy?
- **Plain HTML/CSS/JavaScript** — no framework, no bundler, no build step; one static page.
- **Client-side libraries, self-hosted:** JSZip (OOXML unzip/rezip), pdf-lib (PDF metadata), exif-js (EXIF).
- **Browser-native APIs** for byte-level image metadata stripping.
- **Hosting:** Vercel (static), with a single serverless function only for the contact form (SMTP via nodemailer).
- **Payments:** Polar for the Pro subscription.

## Who are some of the biggest customers of Barecopy?
Barecopy is used by privacy-conscious individuals and professionals across legal, journalism, HR, and corporate roles. By design it processes files entirely on the user's device and collects no data, so it keeps no customer list.
