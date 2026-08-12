"""Build the "<Mon> <Year> Staff Commission.png" table image from the
Staff Commissions sheet of the month's ColaberryTrainingCommissions workbook.

Reproduces the layout of the known-good "Feb 2026 Staff Commission.png":
white background, 1px black grid, header row "Name | Total Comm",
names left-aligned, amounts right-aligned as $X,XXX.00, bold Total row.
"""
import sys, openpyxl
from PIL import Image, ImageDraw, ImageFont

xlsx_path, out_path, label = sys.argv[1], sys.argv[2], sys.argv[3]

wb = openpyxl.load_workbook(xlsx_path, data_only=True)
ws = wb["Staff Commissions"]

rows = []
for r in range(2, ws.max_row + 1):
    name = ws.cell(r, 1).value
    total = ws.cell(r, 20).value  # column T = "Total Comm"
    if name is None or str(name).strip() == "":
        continue
    try:
        amt = float(total or 0)
    except (TypeError, ValueError):
        amt = 0.0
    rows.append((" ".join(str(name).split()), amt))

grand = sum(a for _, a in rows)
print("%s: %d staff rows, total = %.2f" % (label, len(rows), grand))
for n, a in rows:
    print("   %-28s %10.2f" % (n, a))

def money(v):
    return "${:,.2f}".format(v)

# --- layout ---
PAD_X, ROW_H, FS = 6, 22, 13
try:
    font = ImageFont.truetype("arial.ttf", FS)
    bold = ImageFont.truetype("arialbd.ttf", FS)
except OSError:
    font = bold = ImageFont.load_default()

probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
def w(txt, f):
    b = probe.textbbox((0, 0), txt, font=f)
    return b[2] - b[0]

col1 = max([w("Name", bold)] + [w(n, font) for n, _ in rows] + [w("Total", bold)]) + PAD_X * 2
col2 = max([w("Total Comm", bold)] + [w(money(a), font) for _, a in rows] + [w(money(grand), bold)]) + PAD_X * 2

n_rows = len(rows) + 2  # header + body + total
W, H = col1 + col2 + 1, ROW_H * n_rows + 1

img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)

def cell(x, y, text, f, align):
    ty = y + (ROW_H - FS) // 2 - 1
    if align == "l":
        d.text((x + PAD_X, ty), text, font=f, fill="black")
    else:
        d.text((x + col2 - PAD_X - w(text, f), ty), text, font=f, fill="black")

y = 0
cell(0, y, "Name", bold, "l")
cell(col1, y, "Total Comm", bold, "r")
y += ROW_H
for n, a in rows:
    cell(0, y, n, font, "l")
    cell(col1, y, money(a), font, "r")
    y += ROW_H
cell(0, y, "Total", bold, "l")
cell(col1, y, money(grand), bold, "r")

# grid
for i in range(n_rows + 1):
    d.line([(0, i * ROW_H), (W - 1, i * ROW_H)], fill="black", width=1)
for x in (0, col1, W - 1):
    d.line([(x, 0), (x, H - 1)], fill="black", width=1)

img.save(out_path)
print("WROTE %s  (%dx%d)" % (out_path, W, H))
print("STAFF_COMMISSION_TOTAL=%.2f" % grand)
