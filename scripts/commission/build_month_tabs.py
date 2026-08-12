"""Add the new month's tab to the running SMI Commissions workbook and to the
IPBC Group workbook, following the established layout exactly."""
import json, shutil, openpyxl

SRC_DIR = "C:/Users/ali_m/OneDrive/Business/Colaberry Novedea/Stats/Commissions/SMI Comm"
OUT_DIR = "c:/Users/ali_m/Downloads/April 2026 Commission"
TAB = "Apr 2026"
MM, YY = 4, 2026

detail = json.load(open("smi_detail.json"))
summary = json.load(open("smi_summary.json"))
ipbc = json.load(open("ipbc_apr.json"))

HDR = ["SMIC_SalesRep", "SMIC_Name", "OrderMonth", "OrderYear", "TotalPaid",
       "AliComm", "SalesRepComm", "MonthlyPaid", "MonthlyPaidMinus25per",
       None, "Name", "OrderMonth", "OrderYear", "Comm"]

# ---------- 1. SMI Commissions ----------
src = SRC_DIR + "/2026_03_SMI Commisions.xlsx"
dst = OUT_DIR + "/2026_04_SMI Commisions.xlsx"
shutil.copyfile(src, dst)

wb = openpyxl.load_workbook(dst)
before = list(wb.sheetnames)
if TAB in wb.sheetnames:
    del wb[TAB]
ws = wb.create_sheet(TAB, 0)

for c, h in enumerate(HDR, start=1):
    if h is not None:
        ws.cell(1, c, h)

for i, r in enumerate(detail, start=2):
    ws.cell(i, 1, r["SMIC_SalesRep"])
    ws.cell(i, 2, r["SMIC_Name"])
    ws.cell(i, 3, r["OrderMonth"])
    ws.cell(i, 4, r["OrderYear"])
    ws.cell(i, 5, float(r["TotalPaid"]) if r["TotalPaid"] is not None else None)
    ws.cell(i, 6, float(r["AliComm"]) if r["AliComm"] is not None else None)
    # the export renders a NULL sales-rep commission as the literal string NULL
    ws.cell(i, 7, "NULL" if r["SalesRepComm"] is None else float(r["SalesRepComm"]))
    ws.cell(i, 8, float(r["MonthlyPaid"]) if r["MonthlyPaid"] is not None else None)
    ws.cell(i, 9, float(r["MonthlyPaidMinus25per"]) if r["MonthlyPaidMinus25per"] is not None else None)

for i, r in enumerate(summary, start=2):
    ws.cell(i, 11, r["Name"])
    ws.cell(i, 12, r["OrderMonth"])
    ws.cell(i, 13, r["OrderYear"])
    ws.cell(i, 14, float(r["Comm"]))

wb.save(dst)
print("SMI workbook -> %s" % dst)
print("  sheets before: %d   after: %d   new tab first: %s" % (len(before), len(wb.sheetnames), wb.sheetnames[0]))

# ---------- 2. IPBC Group ----------
isrc = SRC_DIR + "/IPBC Group Mar 2026.xlsx"
idst = OUT_DIR + "/IPBC Group Apr 2026.xlsx"
shutil.copyfile(isrc, idst)

iwb = openpyxl.load_workbook(idst)
if TAB in iwb.sheetnames:
    del iwb[TAB]
iws = iwb.create_sheet(TAB, 0)

IHDR = ["Customer #", "Source", "Order Date", "Status", "Total", "Amount Paid",
        "Balance Due", "ModifiedDate", "SMIC_SalesRep", "SMIC_CommID", "SMIC_UserID"]
if not ipbc:
    # matches the existing convention for empty months (see the May/Mar/Feb 2024 tabs)
    iws.cell(1, 1, "No Data for the month")
else:
    for c, h in enumerate(IHDR, start=1):
        iws.cell(1, c, h)
    for i, r in enumerate(ipbc, start=2):
        for c, h in enumerate(IHDR, start=1):
            v = r[h]
            iws.cell(i, c, str(v) if h in ("Order Date", "ModifiedDate") and v else v)

iwb.save(idst)
print("IPBC workbook -> %s" % idst)
print("  sheets: %d   new tab first: %s   rows: %d" % (len(iwb.sheetnames), iwb.sheetnames[0], len(ipbc)))
