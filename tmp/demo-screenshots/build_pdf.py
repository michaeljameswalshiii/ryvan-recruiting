
from pathlib import Path
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

out = Path(r"C:\\Users\\micha\\turnkey-optimization\\tmp\\demo-account-pages.pdf")
shots = sorted(Path(r"C:\\Users\\micha\\turnkey-optimization\\tmp\\demo-screenshots").glob("*.png"))
page_w, page_h = landscape(letter)
c = canvas.Canvas(str(out), pagesize=landscape(letter))
margin = 0.45 * inch
for shot in shots:
    img = ImageReader(str(shot))
    iw, ih = img.getSize()
    title = shot.stem
    header = 0.32 * inch
    max_w = page_w - 2 * margin
    max_h = page_h - 2 * margin - header
    scale = min(max_w / iw, max_h / ih)
    w, h = iw * scale, ih * scale
    x = (page_w - w) / 2
    y = margin
    c.setFillColorRGB(0.12, 0.16, 0.22)
    c.rect(0, 0, page_w, page_h, fill=1, stroke=0)
    c.setFillColorRGB(0.95, 0.96, 0.97)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, page_h - margin - 12, title)
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(0.75, 0.78, 0.82)
    c.drawRightString(page_w - margin, page_h - margin - 12, "Turnkey demo account")
    c.drawImage(img, x, y, width=w, height=h, preserveAspectRatio=True, mask="auto")
    c.showPage()
c.save()
print("PDF", out, "pages", len(shots))
