import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { config } from "../../infrastructure/config.js";
import { sha256 } from "./docx.engine.js";
import { DocumentError } from "../../shared/errors.js";
const run = promisify(execFile);
export async function officeRenderer() {
  const resources = (process as NodeJS.Process & { resourcesPath?: string })
    .resourcesPath;
  const candidates = [
    process.env.LIBREOFFICE_PATH,
    path.join(
      config.appDataDir,
      "tools",
      "libreoffice",
      "program",
      "soffice.exe",
    ),
    resources &&
      path.join(resources, "tools", "libreoffice", "program", "soffice.exe"),
    path.resolve("tools/libreoffice/program/soffice.exe"),
    path.resolve("../tools/libreoffice/program/soffice.exe"),
    "C:/Program Files/LibreOffice/program/soffice.com",
    "C:/Program Files/LibreOffice/program/soffice.exe",
    "/usr/bin/libreoffice",
    "/usr/bin/soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  ].filter((v): v is string => Boolean(v));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      if (/soffice\.exe$/i.test(candidate)) {
        const consoleBinary = candidate.replace(/\.exe$/i, ".com");
        try {
          await fs.access(consoleBinary);
          return consoleBinary;
        } catch {
          /* executable fallback */
        }
      }
      return candidate;
    } catch {
      /* next local installation */
    }
  }
  return null;
}
let rendering = Promise.resolve();
export async function renderDocxPdf(buffer: Buffer) {
  const binary = await officeRenderer();
  if (!binary)
    throw new DocumentError(
      "معاينة PDF والطباعة بالتنسيق الأصلي تحتاج LibreOffice محلياً. ثبّته أو ضع نسخته المحمولة في tools/libreoffice؛ يمكنك معاينة DOCX وتصديره الآن.",
      503,
    );
  const cache = path.join(config.documentsDir, "render-cache");
  await fs.mkdir(cache, { recursive: true });
  const destination = path.join(cache, `${sha256(buffer)}.pdf`);
  try {
    return await fs.readFile(destination);
  } catch {
    /* render once */
  }
  const previous = rendering;
  let release!: () => void;
  rendering = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  let work = "";
  try {
    try {
      return await fs.readFile(destination);
    } catch {
      /* another render may have completed */
    }
    work = await fs.mkdtemp(path.join(os.tmpdir(), "dalaly-docx-"));
    const source = path.join(work, "contract.docx");
    const profile = path.join(work, "profile");
    await fs.mkdir(path.join(profile, "user"), { recursive: true });
    // Disable macros, link updates and first-run interaction in a disposable profile.
    await fs.writeFile(
      path.join(profile, "user", "registrymodifications.xcu"),
      '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item></oor:items>',
    );
    await fs.writeFile(source, buffer);
    await run(
      binary,
      [
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        "--headless",
        "--nologo",
        "--nodefault",
        "--nofirststartwizard",
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        work,
        source,
      ],
      { timeout: 45000, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    const pdf = await fs.readFile(path.join(work, "contract.pdf"));
    if (
      !pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
      pdf.length > 60 * 1024 * 1024
    )
      throw new Error("Invalid PDF");
    await fs.writeFile(destination, pdf);
    return pdf;
  } catch {
    throw new DocumentError(
      "تعذر عرض هذا القالب بمحرك المستندات المحلي. تحقق من الخطوط وبنية DOCX أو صدّره وافتحه في Word.",
      422,
    );
  } finally {
    if (work) await fs.rm(work, { recursive: true, force: true });
    release();
  }
}
