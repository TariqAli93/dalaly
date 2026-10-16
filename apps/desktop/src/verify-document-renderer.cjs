const fs = require("node:fs");
const path = require("node:path");
module.exports = async function verifyDocumentRenderer(context) {
  const executable = path.resolve(
    context.packager.projectDir,
    "../../tools/libreoffice/program/soffice.exe",
  );
  if (!fs.existsSync(executable))
    throw new Error(
      "Local DOCX/PDF renderer is missing. Run pnpm prepare:documents before packaging Dalaly.",
    );
};
