import io
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

template_path, output_path, title, employee, course, date, certificate_id, score = sys.argv[1:]
navy, gold, muted = HexColor("#071B4F"), HexColor("#FFCC00"), HexColor("#657381")

def fields(c, width, height, custom=False):
    c.setFillColor(navy)
    c.setFont("Helvetica-Bold", 30)
    c.drawCentredString(width / 2, height - 160, title)
    c.setFillColor(muted)
    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 205, "This certificate is proudly presented to")
    c.setFillColor(navy)
    c.setFont("Helvetica-Bold", 27)
    c.drawCentredString(width / 2, height - 253, employee)
    c.setStrokeColor(gold)
    c.setLineWidth(2)
    c.line(width * .28, height - 269, width * .72, height - 269)
    c.setFillColor(muted)
    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 303, "for successfully completing the course")
    c.setFillColor(navy)
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(width / 2, height - 345, course)
    entries = [(.15, "COMPLETION DATE", date), (.42, "CERTIFICATE ID", certificate_id), (.78, "FINAL SCORE", f"{score}%")]
    for ratio, label, value in entries:
        x = width * ratio
        c.setFillColor(muted)
        c.setFont("Helvetica", 10)
        c.drawString(x, 174, label)
        c.setFillColor(navy)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(x, 151, value)

def system_background(c, width, height):
    c.setFillColor(white); c.rect(0, 0, width, height, fill=1, stroke=0)
    c.setStrokeColor(navy); c.setLineWidth(3); c.rect(18, 18, width - 36, height - 36, fill=0, stroke=1)
    c.setStrokeColor(gold); c.setLineWidth(1.5); c.rect(26, 26, width - 52, height - 52, fill=0, stroke=1)
    c.setFillColor(navy); c.rect(30, height - 95, width - 60, 55, fill=1, stroke=0)
    c.setFillColor(gold); c.rect(30, height - 102, width - 60, 7, fill=1, stroke=0)
    c.setFillColor(white); c.setFont("Helvetica-Bold", 13); c.drawString(58, height - 72, "ATOZ GROUP")
    c.setFont("Helvetica", 9); c.drawRightString(width - 58, height - 72, "LEARNING & DEVELOPMENT")
    c.setStrokeColor(HexColor("#A6B1BD")); c.line(width - 257, 92, width - 82, 92)
    c.setFillColor(muted); c.setFont("Helvetica", 9); c.drawCentredString(width - 169, 76, "AUTHORIZED SIGNATURE")
    c.setFont("Helvetica", 8); c.drawString(52, 48, "Verified digital certificate - Company Portal Learning Management")

template = Path(template_path) if template_path else None
if template and template.suffix.lower() == ".pdf":
    source = PdfReader(str(template)); page = source.pages[0]
    width, height = float(page.mediabox.width), float(page.mediabox.height)
    overlay_data = io.BytesIO(); overlay = canvas.Canvas(overlay_data, pagesize=(width, height)); fields(overlay, width, height, True); overlay.save(); overlay_data.seek(0)
    page.merge_page(PdfReader(overlay_data).pages[0]); writer = PdfWriter(); writer.add_page(page)
    with open(output_path, "wb") as stream: writer.write(stream)
else:
    width, height = landscape(A4); c = canvas.Canvas(output_path, pagesize=(width, height))
    if template: c.drawImage(str(template), 0, 0, width=width, height=height, preserveAspectRatio=False, mask='auto')
    else: system_background(c, width, height)
    fields(c, width, height, bool(template)); c.showPage(); c.save()
