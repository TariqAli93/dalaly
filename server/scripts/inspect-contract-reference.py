"""Inspect exported fixture PDFs; requires pypdf and pypdfium2, not production."""
import json
import re
import sys
from pathlib import Path
from pypdf import PdfReader
import pypdfium2

root = Path(sys.argv[1]).resolve()
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
output = root / "pages"
output.mkdir(exist_ok=True)
reports = []
for item in manifest:
    for prefix in ("", "electron_"):
        filename = f"{prefix}{item['name']}.pdf"
        reader = PdfReader(root / filename)
        texts = [page.extract_text() or "" for page in reader.pages]
        # Extractors can interleave the RTL row's Arabic glyph runs between
        # wrapped Latin sentinel fragments. Keep their Latin reading sequence.
        compact = re.sub(r"[^A-Za-z0-9-]", "", "".join(texts))
        for sentinel in item["expected_sentinels"]:
            assert sentinel in compact, f"{filename}: missing {sentinel}"
        for index, (page, text) in enumerate(zip(reader.pages, texts)):
            assert abs(float(page.mediabox.width) - 595.3) < 2
            assert abs(float(page.mediabox.height) - 841.9) < 2
            assert len(text.strip()) > 65, f"{filename}: empty or unnecessary page {index + 1}"
        pdf = pypdfium2.PdfDocument(str(root / filename))
        for number in sorted(set((0, len(pdf) - 1))):
            page = pdf[number]
            bitmap = page.render(scale=1.4)
            image = bitmap.to_pil()
            image.save(output / f"{prefix}{item['name']}-page-{number + 1}.png")
            if item["name"] == "reference-sale" and number == 0:
                image.convert("L").save(output / f"{prefix}reference-sale-grayscale.png")
            page.close()
        pdf.close()
        reports.append({"file": filename, "pages": len(reader.pages), "sentinels": len(item["expected_sentinels"]), "text_lengths": [len(text) for text in texts]})
(root / "pdf-inspection.json").write_text(json.dumps(reports, indent=2), encoding="utf-8")
print(json.dumps(reports, indent=2))
