"""Insert a platform-comparison page into the Zelle proposal."""
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit

SRC = Path(r"C:\Users\micha\Downloads\Triple-I-Zelle-Professional-Website-Proposal (2).pdf")
OUT_PAGE = Path(r"C:\Users\micha\turnkey-optimization\tmp\zelle-platform-insert.pdf")
OUT_DOC = Path(r"C:\Users\micha\Downloads\Triple-I-Zelle-Professional-Website-Proposal.pdf")
W, H = letter

NAVY = HexColor("#1B2A4A")
NAVY_DEEP = HexColor("#152238")
GOLD = HexColor("#B8954A")
CREAM = HexColor("#F6F1E8")
INK = HexColor("#2A2A2A")
MUTED = HexColor("#5C5A54")
RULE = HexColor("#D9D2C4")
ROW_ALT = HexColor("#FBF8F2")
BOX_BG = HexColor("#EEF2F6")


def wrap(c, text, font, size, max_w):
    return simpleSplit(text, font, size, max_w)


def draw_header(c):
    c.setFillColor(CREAM)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont("Times-Bold", 7.5)
    c.drawString(0.7 * inch, H - 0.48 * inch, "TRIPLE I BUSINESS SOLUTIONS")
    c.drawRightString(W - 0.7 * inch, H - 0.48 * inch, "CONFIDENTIAL  |  ZELLE LLP")
    c.setStrokeColor(RULE)
    c.setLineWidth(0.6)
    c.line(0.7 * inch, H - 0.62 * inch, W - 0.7 * inch, H - 0.62 * inch)


def draw_footer(c, page_label):
    c.setStrokeColor(RULE)
    c.setLineWidth(0.6)
    c.line(0.7 * inch, 0.48 * inch, W - 0.7 * inch, 0.48 * inch)
    c.setFillColor(MUTED)
    c.setFont("Times-Roman", 8)
    c.drawString(0.7 * inch, 0.32 * inch, "Website Design, Development, Hosting & Managed Support")
    c.drawRightString(W - 0.7 * inch, 0.32 * inch, page_label)


def section_kicker(c, y, kicker):
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 8)
    c.drawString(0.7 * inch, y, kicker)
    c.setStrokeColor(GOLD)
    c.setLineWidth(2.2)
    c.line(0.7 * inch, y - 8, 0.7 * inch + 36, y - 8)
    return y - 28


def h1(c, y, title):
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 22)
    c.drawString(0.7 * inch, y, title)
    return y - 22


def body(c, y, text, width=7.1 * inch, size=9.5, leading=12.4, color=INK, font="Times-Roman"):
    c.setFillColor(color)
    c.setFont(font, size)
    for line in wrap(c, text, font, size, width):
        c.drawString(0.7 * inch, y, line)
        y -= leading
    return y


def table(c, y, rows, col_w, header=True):
    x0 = 0.7 * inch
    row_h_min = 28
    pad = 6
    # measure
    heights = []
    wrapped_rows = []
    for i, row in enumerate(rows):
        fonts = []
        sizes = []
        cell_lines = []
        max_h = row_h_min
        for j, cell in enumerate(row):
            font = "Times-Bold" if (header and i == 0) else "Times-Roman"
            size = 8 if (header and i == 0) else 8.4
            lines = wrap(c, cell, font, size, col_w[j] - 12)
            cell_lines.append((font, size, lines))
            max_h = max(max_h, 10 + len(lines) * 11)
        wrapped_rows.append(cell_lines)
        heights.append(max_h)

    for i, row in enumerate(wrapped_rows):
        h = heights[i]
        y -= h
        if header and i == 0:
            c.setFillColor(NAVY)
            c.rect(x0, y, sum(col_w), h, fill=1, stroke=0)
        else:
            c.setFillColor(white if i % 2 else ROW_ALT)
            c.rect(x0, y, sum(col_w), h, fill=1, stroke=0)
        x = x0
        for j, (font, size, lines) in enumerate(row):
            c.setFillColor(white if header and i == 0 else INK)
            c.setFont(font, size)
            ty = y + h - 12
            for line in lines:
                c.drawString(x + 6, ty, line)
                ty -= 11
            x += col_w[j]
    return y - 10


def callout(c, y, title, text, width=7.1 * inch):
    lines = wrap(c, text, "Times-Roman", 8.6, width - 20)
    h = 18 + len(lines) * 11.2
    c.setFillColor(BOX_BG)
    c.rect(0.7 * inch, y - h, width, h, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(0.7 * inch, y - h, 3.2, h, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 8.5)
    c.drawString(0.7 * inch + 12, y - 14, title)
    c.setFillColor(INK)
    c.setFont("Times-Roman", 8.6)
    ty = y - 27
    for line in lines:
        c.drawString(0.7 * inch + 12, ty, line)
        ty -= 11.2
    return y - h - 12


def build_page():
    OUT_PAGE.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT_PAGE), pagesize=letter)
    draw_header(c)
    y = H - 0.88 * inch
    y = section_kicker(c, y, "02A  /  CURRENT PLATFORM VS PROPOSED PLATFORM")
    y = h1(c, y, "Why the current site feels stuck")
    y -= 6
    y = body(
        c,
        y,
        "The current site is not weak because it is written in HTML. HTML is simply the language of web pages. The constraint is the publishing model: each page is a standalone file (attorneys-291.html, practices-55.html). Adding a lawyer or updating a bio means editing a file and republishing. Marketing cannot do that work in-house. That is what a CFO typically hears described as an “HTML platform.”",
    )
    y -= 4
    y = body(
        c,
        y,
        "Robins Kaplan is on Firmseek’s newer content-management generation — records in a system, pages generated from templates. Same category of vendor, different generation. The diagnosis of the old model is fair. The conclusion that only that vendor can fix it is not. The working prototype already makes the same jump for Zelle.",
    )
    y -= 14

    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 12)
    c.drawString(0.7 * inch, y, "X  →  Y  →  what that unlocks")
    y -= 12

    col = [1.55 * inch, 2.75 * inch, 2.8 * inch]
    y = table(
        c,
        y,
        [
            ["", "X  ·  Current site", "Y  ·  Proposed site"],
            [
                "Live URL",
                "zellelaw.com",
                "zelle-law.vercel.app  (working prototype)",
            ],
            [
                "What it is",
                "Static HTML files on the current hosting vendor. One file per page.",
                "A modern Next.js application on Vercel, with structured content and a staff administration platform.",
            ],
            [
                "Who can change it",
                "A developer or the original vendor. File edit, then republish.",
                "Authorized Zelle staff for routine bios, offices, practices, and listings — without a ticket for every change.",
            ],
            [
                "What it looks like",
                "Long static directories. Limited mobile behavior. Dated templates.",
                "Editorial layout, searchable professionals, practice and office pages, insights, and room to add features later.",
            ],
            [
                "Who owns it",
                "Tied to the current hosting / publishing vendor.",
                "Zelle owns the source code and approved content. Portable GitHub repository. Not locked to a closed legal-web platform.",
            ],
        ],
        col,
    )

    y -= 2
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 12)
    c.drawString(0.7 * inch, y, "ABC  ·  capability the new platform allows")
    y -= 10
    bullets = [
        "A. In-house publishing — update professional profiles, offices, practices, and insight listings without waiting on a vendor queue.",
        "B. A real directory — filter by office and practice instead of a long static attorney list; clean URLs instead of attorneys-291.html.",
        "C. Modern delivery — mobile-first layout, HTTPS, performance, analytics, redirects, and a controlled DNS cutover. Email and the domain stay in place.",
        "D. An owned stack — private GitHub repository + Vercel hosting. You can keep Triple I for managed support or take the site to another qualified provider.",
    ]
    c.setFillColor(INK)
    c.setFont("Times-Roman", 8.7)
    for b in bullets:
        for i, line in enumerate(wrap(c, b, "Times-Roman", 8.7, 7.1 * inch)):
            c.drawString(0.7 * inch, y, line)
            y -= 11.4
        y -= 2

    y -= 6
    y = callout(
        c,
        y,
        "How this compares with a Firmseek-style rebuild",
        "Firmseek’s newer work (for example Robins Kaplan) is a CMS-backed law-firm site. That is the right category of upgrade. The difference is ownership and lock-in. Their path keeps you on a proprietary legal-web platform. This proposal moves Zelle off static HTML files onto a site the firm owns — already visible as a working prototype at zelle-law.vercel.app, built from the same starting point as zellelaw.com. Email and Microsoft 365 do not move. Only website hosting changes at cutover.",
    )

    draw_footer(c, "4 / 14")
    c.save()


def merge():
    src = PdfReader(str(SRC))
    insert = PdfReader(str(OUT_PAGE))
    out = PdfWriter()
    # After prototype / engagement objectives (page 3)
    for i, page in enumerate(src.pages):
        out.add_page(page)
        if i == 2:
            out.add_page(insert.pages[0])
    with open(OUT_DOC, "wb") as f:
        out.write(f)
    print(f"Wrote {OUT_DOC} ({len(out.pages)} pages)")


if __name__ == "__main__":
    build_page()
    merge()
