"""Insert a management-facing cyber-security page into the Zelle proposal."""
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

SRC = Path(r"C:\Users\micha\Downloads\Triple-I-Zelle-Professional-Website-Proposal.pdf")
OUT_PAGE = Path(r"C:\Users\micha\turnkey-optimization\tmp\zelle-security-insert.pdf")
OUT_DOC = Path(r"C:\Users\micha\Downloads\Triple-I-Zelle-Professional-Website-Proposal.pdf")
W, H = letter

NAVY = HexColor("#1B2A4A")
GOLD = HexColor("#B8954A")
CREAM = HexColor("#F6F1E8")
INK = HexColor("#2A2A2A")
MUTED = HexColor("#5C5A54")
RULE = HexColor("#D9D2C4")
ROW_ALT = HexColor("#FBF8F2")
BOX_BG = HexColor("#EEF2F6")
WARM = HexColor("#F3EDE0")


def wrap(text, font, size, max_w):
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
    return y - 26


def h1(c, y, title):
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 20)
    c.drawString(0.7 * inch, y, title)
    return y - 18


def para(c, y, text, width=7.1 * inch, size=9.2, leading=12.0, font="Times-Roman"):
    c.setFillColor(INK)
    c.setFont(font, size)
    for line in wrap(text, font, size, width):
        c.drawString(0.7 * inch, y, line)
        y -= leading
    return y


def table(c, y, rows, col_w):
    x0 = 0.7 * inch
    wrapped_rows = []
    heights = []
    for i, row in enumerate(rows):
        cell_lines = []
        max_h = 26
        for j, cell in enumerate(row):
            font = "Times-Bold" if i == 0 else "Times-Roman"
            size = 8 if i == 0 else 8.15
            lines = wrap(cell, font, size, col_w[j] - 12)
            cell_lines.append((font, size, lines))
            max_h = max(max_h, 10 + len(lines) * 10.6)
        wrapped_rows.append(cell_lines)
        heights.append(max_h)

    for i, row in enumerate(wrapped_rows):
        h = heights[i]
        y -= h
        if i == 0:
            c.setFillColor(NAVY)
        else:
            c.setFillColor(white if i % 2 else ROW_ALT)
        c.rect(x0, y, sum(col_w), h, fill=1, stroke=0)
        x = x0
        for j, (font, size, lines) in enumerate(row):
            c.setFillColor(white if i == 0 else INK)
            c.setFont(font, size)
            ty = y + h - 11.5
            for line in lines:
                c.drawString(x + 6, ty, line)
                ty -= 10.6
            x += col_w[j]
    return y - 8


def callout(c, y, title, text, width=7.1 * inch, fill=BOX_BG):
    lines = wrap(text, "Times-Roman", 8.4, width - 22)
    h = 18 + len(lines) * 11.0
    c.setFillColor(fill)
    c.rect(0.7 * inch, y - h, width, h, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(0.7 * inch, y - h, 3.2, h, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 8.4)
    c.drawString(0.7 * inch + 12, y - 13, title)
    c.setFillColor(INK)
    c.setFont("Times-Roman", 8.4)
    ty = y - 26
    for line in lines:
        c.drawString(0.7 * inch + 12, ty, line)
        ty -= 11.0
    return y - h - 10


def build_page():
    OUT_PAGE.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT_PAGE), pagesize=letter)
    draw_header(c)
    y = H - 0.86 * inch
    y = section_kicker(c, y, "05A  /  CYBER SECURITY: PLAN AND RISKS")
    y = h1(c, y, "What we secure — and what can go wrong")
    y -= 4
    y = para(
        c,
        y,
        "Zelle is right to treat cyber security as a management issue, not a technical afterthought. The first security decision is what this site is not: it is a public marketing website, not a client portal, matter system, or place for privileged files. That limit is intentional. It shrinks the blast radius if something goes wrong.",
    )
    y -= 3
    y = para(
        c,
        y,
        "The plan is layered: named people with two-factor authentication, secrets kept out of source code, HTTPS and platform DDoS protection on Vercel, preview-then-publish releases with rollback, continuous monitoring under the $350 monthly plan, and form copy that tells visitors not to send confidential matter information. Section 05 lists the controls. This page is the risk conversation behind them.",
    )
    y -= 12

    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 12)
    c.drawString(0.7 * inch, y, "What can go wrong — and the plan")
    y -= 8

    y = table(
        c,
        y,
        [
            ["What can go wrong", "Why it matters to a law firm", "How we plan for it"],
            [
                "Stolen admin credentials",
                "Someone changes bios, posts false content, or publishes in the firm’s name.",
                "Named accounts only. Two-factor authentication for administrators. Least-privilege roles. Access removed when people leave.",
            ],
            [
                "Site defacement or a bad publish",
                "A public page is altered or a draft goes live by mistake.",
                "Preview before production. Versioned releases. Fast rollback to the last good deploy. Production launch requires a named Zelle approver.",
            ],
            [
                "Contact-form abuse, or a visitor sending privileged facts",
                "Spam floods the inbox, or someone treats the form like a matter intake channel.",
                "The form is not a client portal. On-page warning against confidential or privileged material. Submissions go to a controlled admin inbox, not a public mailbox.",
            ],
            [
                "Site taken offline (DDoS or outage)",
                "Clients and recruits cannot reach the firm; it looks like a crisis even when it is not.",
                "Vercel edge delivery, platform DDoS mitigation, HTTPS, uptime monitoring, and 24/7 P1 response (site down or all forms failing) under the monthly plan.",
            ],
            [
                "A software dependency is compromised",
                "An update in the stack becomes the way in.",
                "Managed framework and dependency updates. Secrets live in Vercel environment variables, not in GitHub. Production, preview, and development settings are separated.",
            ],
            [
                "DNS or domain hijack",
                "Traffic is pointed at a fake site. Email is a separate, higher-stakes risk.",
                "Only website DNS records change at cutover. MX, SPF, DKIM, and DMARC stay with Microsoft 365 unless Zelle separately authorizes a change. Domain registrar access remains Zelle’s.",
            ],
            [
                "Impersonation / look-alike phishing",
                "A third party copies the look of the site or the firm name. That is mostly off-site.",
                "Clean HTTPS on the real domain, restrained public forms, and no matter data on the site. Registrar and mailbox security remain Zelle’s to operate. We will flag obvious issues we see.",
            ],
        ],
        [1.85 * inch, 2.35 * inch, 2.9 * inch],
    )

    y -= 2
    y = callout(
        c,
        y,
        "What this proposal does not claim",
        "This is not a security warranty, a formal penetration test, incident forensics, or a certification. Those are specialist engagements if management wants them. We also do not operate Zelle’s Microsoft 365 tenant, domain registrar, or attorney laptops. The website plan is designed so a public-site incident is embarrassing and recoverable — not a privilege or client-data event.",
        fill=WARM,
    )
    y = callout(
        c,
        y,
        "The practical ask of management",
        "Approve the site remaining a public brochure with a warning on forms. Require two-factor authentication for anyone who can publish. Keep domain and email credentials with a short named list at the firm. Treat a full security audit or penetration test as a separate decision if the partnership wants one before or after launch.",
    )

    draw_footer(c, "8 / 15")
    c.save()


def merge():
    src = PdfReader(str(SRC))
    insert = PdfReader(str(OUT_PAGE))
    out = PdfWriter()
    # After existing Section 05 (page 7)
    for i, page in enumerate(src.pages):
        out.add_page(page)
        if i == 6:
            out.add_page(insert.pages[0])
    with open(OUT_DOC, "wb") as f:
        out.write(f)
    print(f"Wrote {OUT_DOC} ({len(out.pages)} pages)")


if __name__ == "__main__":
    build_page()
    merge()
