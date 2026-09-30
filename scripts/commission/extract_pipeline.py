"""Extract the reusable portion of Ali's SMI Commission.sql.

Robust to hand-edits: rather than matching an exact ORDER BY string, this finds
the statement that creates #SMI_CommIII and cuts at the start of the next
top-level SELECT that is not part of it.
"""
import re, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else (
    "C:/Users/ali_m/OneDrive/Business/Colaberry Novedea/Stats/Commissions/SMI Comm/SMI Commission.sql")
OUT = sys.argv[2] if len(sys.argv) > 2 else "smi_pipeline.sql"

raw = open(SRC, "rb").read()
for enc in ("utf-16", "utf-8-sig", "utf-8", "cp1252"):
    try:
        text = raw.decode(enc)
        break
    except (UnicodeDecodeError, UnicodeError):
        continue
else:
    raise SystemExit("could not decode " + SRC)

# Locate the SELECT ... INTO #SMI_CommIII statement.
m = re.search(r"INTO\s+#SMI_CommIII\b", text, re.I)
if not m:
    raise SystemExit("FATAL: no 'INTO #SMI_CommIII' in the source SQL. "
                     "The query was restructured - re-read it before running.")

# Everything between "INTO #SMI_CommIII" and the next line-initial SELECT is the
# remainder of that statement (FROM / GROUP BY / ORDER BY, none of which begin a
# line with SELECT). That next SELECT is the first ad-hoc reporting query, which
# is where the hand-toggled month filter lives - so cut there.
tail = text[m.end():]
nxt = re.search(r"(?m)^\s*SELECT\b", tail, re.I)
cut = m.end() + (nxt.start() if nxt else len(tail))
pipeline = text[:cut].rstrip()

# Guard rails: the extracted chunk must build every temp table the final
# SELECTs depend on, and must NOT carry the hand-toggled month filter.
required = ["#AdjustAmount", "#AdjustAmount_Final", "#SMI_Comm_PRE", "#SMI_Comm", "#SMI_CommII", "#SMI_CommIII"]
missing = [t for t in required if t.lower() not in pipeline.lower()]
if missing:
    raise SystemExit("FATAL: extracted pipeline is missing %s" % missing)
if re.search(r"OrderMonth\s+NOT\s+IN", pipeline, re.I):
    raise SystemExit("FATAL: extracted pipeline still contains the hand-toggled "
                     "'OrderMonth NOT IN (...)' filter - cut point is wrong.")

open(OUT, "w", encoding="utf-8").write(pipeline)
print("source encoding ok, %d chars -> %s (%d chars)" % (len(text), OUT, len(pipeline)))
print("tail: %r" % pipeline[-90:])
