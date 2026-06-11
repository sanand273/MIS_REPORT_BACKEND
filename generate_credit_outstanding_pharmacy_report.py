#!/usr/bin/env python3
"""
Pharmacy Credit Outstanding Report — live MongoDB runner.

Python port of the TypeScript gist at
  https://gist.github.com/nabeel-yanthralabs/46d4529c938a1d9556d86d089c8d9baf

Same logic, same 15 columns, same TOTAL row, same Return multiplier rules.
Emits CSV + XLSX + PDF in one run.

Usage
-----
  python generate_credit_outstanding_pharmacy_report.py \
      --from 2026-04-01 --to 2026-04-30 \
      --tenant 1ea40969-112e-11f0-891d-028579933a83

All flags have defaults baked in so you can also just run:
  python generate_credit_outstanding_pharmacy_report.py

Install once:
  pip install "pymongo[srv]" openpyxl reportlab python-dateutil
"""

from __future__ import annotations
import argparse, csv, os, sys
from datetime import datetime, timedelta, timezone

# ── Defaults — override via CLI ─────────────────────────────────────────────
DEFAULT_MONGO_URI = "mongodb+srv://devops:devops0103@yanthralabs.k2c9q.mongodb.net/?retryWrites=true&w=majority"
DEFAULT_DB_NAME   = "ecare360"        # change if your DB name differs
DEFAULT_TENANT    = "1ea40969-112e-11f0-891d-028579933a83"
DEFAULT_FROM      = "2026-04-01"
DEFAULT_TO        = "2026-04-30"
DEFAULT_OUTDIR    = os.path.join(os.path.dirname(os.path.abspath(__file__)))
TENANT_DISPLAY_NAME = "eCare360 Multi-Specialty Hospital"

IST = timezone(timedelta(hours=5, minutes=30))

HEADER = [
    "SNo.", "Billed Date", "Bill Number", "MRN", "Visit Type", "Patient Name",
    "Doctor Name", "Scheme", "Company Name",
    "Gross Amount", "Total Amount", "Rounded Amount",
    "Payment Mode", "Bill Payment Status", "Type",
]

# ── CLI ─────────────────────────────────────────────────────────────────────

def parse_args():
    ap = argparse.ArgumentParser(description="Pharmacy Credit Outstanding Report")
    ap.add_argument("--from", dest="from_date", default=DEFAULT_FROM,
                    help="From date, YYYY-MM-DD (IST). Default: %(default)s")
    ap.add_argument("--to", dest="to_date", default=DEFAULT_TO,
                    help="To date, YYYY-MM-DD (IST). Default: %(default)s")
    ap.add_argument("--tenant", default=DEFAULT_TENANT,
                    help="tenantKey UUID. Default: %(default)s")
    ap.add_argument("--mongo-uri", default=os.environ.get("MONGO_URI", DEFAULT_MONGO_URI),
                    help="Mongo connection string. Default: $MONGO_URI or baked-in")
    ap.add_argument("--db", default=os.environ.get("MONGO_DB", DEFAULT_DB_NAME),
                    help="Database name. Default: %(default)s")
    ap.add_argument("--outdir", default=DEFAULT_OUTDIR,
                    help="Output directory. Default: same folder as this script")
    return ap.parse_args()

# ── Mongo query (mirrors the gist) ──────────────────────────────────────────

def fetch_from_mongo(args):
    try:
        from pymongo import MongoClient
        from bson import ObjectId  # noqa: F401
    except ImportError:
        sys.exit("Missing pymongo. Run:  pip install 'pymongo[srv]' openpyxl reportlab")

    from_dt = datetime.fromisoformat(args.from_date).replace(tzinfo=IST)
    to_dt   = datetime.fromisoformat(args.to_date).replace(
                 hour=23, minute=59, second=59, microsecond=999000, tzinfo=IST)

    client = MongoClient(args.mongo_uri, serverSelectionTimeoutMS=20000)
    db = client[args.db]
    bills_col, orders_col, payments_col, transactions_col = (
        db.billreports, db.orders, db.payments, db.transactions,
    )

    print(f"Querying tenant={args.tenant}  {args.from_date} → {args.to_date}")

    # 1. UNPAID bills in window
    bills = list(bills_col.find({
        "tenantKey": args.tenant,
        "$or": [
            {"billedAt":  {"$gte": from_dt, "$lte": to_dt}},
            {"billedAt":  {"$exists": False},
             "createdAt": {"$gte": from_dt, "$lte": to_dt}},
        ],
        "paymentStatus": {"$in": ["UNPAID"]},
    }).sort([("billedAt", 1), ("createdAt", 1)]))
    print(f"  bills(unpaid in window): {len(bills)}")

    if not bills:
        return [], [], [], []

    # 2. Orders → filter to orderType == pharmacy
    order_ids = [b["orderId"] for b in bills if b.get("orderId")]
    orders = list(orders_col.find({"_id": {"$in": order_ids}}))
    order_map = {str(o["_id"]): o for o in orders}
    pharmacy_bills = [b for b in bills
                      if order_map.get(str(b.get("orderId"))) and
                         order_map[str(b["orderId"])].get("orderType") == "pharmacy"]
    print(f"  pharmacy bills        : {len(pharmacy_bills)}")
    if not pharmacy_bills:
        return [], [], [], []

    # 3. Payments + transactions
    payment_ids = [b.get("paymentId") for b in pharmacy_bills if b.get("paymentId")]
    bill_obj_ids = [b["_id"] for b in pharmacy_bills]
    bill_order_ids = [b["orderId"] for b in pharmacy_bills if b.get("orderId")]
    bill_session_ids = [b["sessionId"] for b in pharmacy_bills if b.get("sessionId")]

    payments = list(payments_col.find({
        "$or": [
            {"_id":       {"$in": payment_ids}},
            {"billId":    {"$in": bill_obj_ids}},
            {"orderId":   {"$in": bill_order_ids}},
            {"sessionId": {"$in": bill_session_ids}},
        ],
    }))

    tx_ids = [tid for p in payments for tid in (p.get("transactions") or [])]
    transactions = list(transactions_col.find({"_id": {"$in": tx_ids}})) if tx_ids else []

    print(f"  payments              : {len(payments)}")
    print(f"  transactions          : {len(transactions)}")
    return pharmacy_bills, orders, payments, transactions

# ── Pipeline (mirrors the gist row-for-row) ─────────────────────────────────

def build_rows(pharmacy_bills, orders, payments, transactions):
    order_map = {str(o["_id"]): o for o in orders}
    tx_map    = {str(t["_id"]): t for t in transactions}

    def is_credit(bill):
        for p in payments:
            direct = bill.get("paymentId") and str(p["_id"]) == str(bill["paymentId"])
            linked = p.get("billId") and str(p["billId"]) == str(bill["_id"])
            if direct or linked:
                for tid in (p.get("transactions") or []):
                    t = tx_map.get(str(tid))
                    if t and str(t.get("mode", "")).upper() == "CREDIT":
                        return True
        return False

    credit_bills = [b for b in pharmacy_bills if is_credit(b)]
    print(f"  credit-mode bills     : {len(credit_bills)}")

    rows, totals = [], {"gross": 0.0, "total": 0.0, "rounded": 0.0}
    for sno, bill in enumerate(credit_bills, start=1):
        order = order_map.get(str(bill["orderId"]), {})
        modes = set()
        for p in payments:
            direct = bill.get("paymentId") and str(p["_id"]) == str(bill["paymentId"])
            linked = p.get("billId") and str(p["billId"]) == str(bill["_id"])
            if direct or linked:
                for tid in (p.get("transactions") or []):
                    t = tx_map.get(str(tid))
                    if t and t.get("mode"):
                        modes.add(str(t["mode"]).upper())
        payment_mode = " | ".join(sorted(modes)) if modes else "N/A"

        is_return = bill.get("paymentStatus") == "REFUNDED"
        mult = -1 if is_return else 1
        gross  = (bill.get("totalAmount") or 0) * mult
        total  = ((bill.get("grandTotal") or 0) - (bill.get("roundOff") or 0)) * mult
        rounded = (bill.get("grandTotal") or 0) * mult
        totals["gross"] += gross; totals["total"] += total; totals["rounded"] += rounded

        billed_at = bill.get("billedAt") or bill.get("createdAt")
        billed_str = billed_at.astimezone(IST).strftime("%Y-%m-%d %H:%M:%S") if billed_at else "-"

        rows.append([
            sno, billed_str,
            bill.get("billNo") or "-",
            bill.get("MRN") or "-",
            bill.get("patientType") or "-",
            bill.get("patientName") or "-",
            order.get("doctorName") or "-",
            order.get("schemeName") or "-",
            order.get("companyName") or "-",
            f"{gross:.2f}", f"{total:.2f}", f"{rounded:.2f}",
            payment_mode,
            bill.get("paymentStatus") or "-",
            "Return" if is_return else "Sale",
        ])
    return rows, totals, len(credit_bills)

# ── CSV / XLSX / PDF writers — identical layout to the sample reports ────────

def write_csv(rows, totals, args, ts):
    name = f"credit_outstanding_pharmacy_{args.tenant}_{args.from_date}_to_{args.to_date}_{ts}.csv"
    path = os.path.join(args.outdir, name)
    with open(path, "w", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        w.writerow(HEADER)
        for r in rows:
            w.writerow(r)
        w.writerow([])
        tot = [""] * len(HEADER)
        tot[0] = "TOTAL"
        tot[9]  = f"{totals['gross']:.2f}"
        tot[10] = f"{totals['total']:.2f}"
        tot[11] = f"{totals['rounded']:.2f}"
        w.writerow(tot)
    return path

def write_xlsx(rows, totals, n_pharmacy, n_credit, args, ts):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    name = f"credit_outstanding_pharmacy_{args.tenant}_{args.from_date}_to_{args.to_date}_{ts}.xlsx"
    path = os.path.join(args.outdir, name)

    NAVY, NAVY_2 = "FF0F2D52", "FF1A3C5E"
    SOFT, SHADE, WHITE = "FFE8EEF4", "FFF0F4F8", "FFFFFFFF"
    DANGER, GOLD = "FFFFE5E5", "FFFFF1C2"

    thin = Side(style="thin", color="FFD0D8E4")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    wb = Workbook(); ws = wb.active; ws.title = "Credit Outstanding"
    last_col = len(HEADER); last_letter = get_column_letter(last_col)

    ws.merge_cells(f"A1:{last_letter}1")
    c = ws["A1"]; c.value = "PHARMACY CREDIT OUTSTANDING REPORT"
    c.font = Font(name="Calibri", size=18, bold=True, color="FFFFFFFF")
    c.fill = PatternFill("solid", fgColor=NAVY)
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 32

    ws.merge_cells(f"A2:{last_letter}2")
    c = ws["A2"]
    c.value = (f"{TENANT_DISPLAY_NAME}   •   Tenant: {args.tenant}   •   "
               f"Period: {args.from_date} → {args.to_date}")
    c.font = Font(name="Calibri", size=10, italic=True, color="FFFFFFFF")
    c.fill = PatternFill("solid", fgColor=NAVY_2)
    c.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[2].height = 20

    tiles = [
        ("Bills Scanned (UNPAID)", f"{n_pharmacy}"),
        ("Pharmacy Bills",         f"{n_pharmacy}"),
        ("Credit-Mode Bills",      f"{n_credit}"),
        ("Outstanding (Gross)",    f"INR {totals['gross']:,.2f}"),
        ("Outstanding (Rounded)",  f"INR {totals['rounded']:,.2f}"),
    ]
    span = last_col // len(tiles)
    for i, (label, val) in enumerate(tiles):
        c0 = i * span + 1; c1 = (i + 1) * span if i < len(tiles) - 1 else last_col
        ws.merge_cells(start_row=3, end_row=3, start_column=c0, end_column=c1)
        lc = ws.cell(row=3, column=c0); lc.value = label.upper()
        lc.font = Font(size=8, bold=True, color="FF1A3C5E")
        lc.fill = PatternFill("solid", fgColor=SOFT)
        lc.alignment = Alignment(horizontal="center", vertical="center")
        ws.merge_cells(start_row=4, end_row=4, start_column=c0, end_column=c1)
        vc = ws.cell(row=4, column=c0); vc.value = val
        vc.font = Font(size=13, bold=True, color="FF0F2D52")
        vc.fill = PatternFill("solid", fgColor=WHITE)
        vc.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[3].height = 16; ws.row_dimensions[4].height = 24
    ws.row_dimensions[5].height = 6

    header_row = 6
    for i, h in enumerate(HEADER, start=1):
        c = ws.cell(row=header_row, column=i, value=h)
        c.font = Font(size=10, bold=True, color="FFFFFFFF")
        c.fill = PatternFill("solid", fgColor=NAVY)
        c.alignment = Alignment(
            horizontal="center" if i in (1, 10, 11, 12, 15) else "left",
            vertical="center", wrap_text=True)
        c.border = border
    ws.row_dimensions[header_row].height = 32

    for r_idx, row in enumerate(rows, start=header_row + 1):
        is_return = row[-1] == "Return"
        base_fill = DANGER if is_return else (SHADE if r_idx % 2 == 0 else WHITE)
        for c_idx, val in enumerate(row, start=1):
            if c_idx in (10, 11, 12):
                try: val = float(val)
                except (TypeError, ValueError): pass
            cell = ws.cell(row=r_idx, column=c_idx, value=val)
            cell.font = Font(size=10, color="FFB91C1C" if is_return else "FF1A1A2E",
                             bold=is_return and c_idx in (10, 11, 12))
            cell.fill = PatternFill("solid", fgColor=base_fill)
            cell.alignment = Alignment(
                horizontal="center" if c_idx in (1, 15) else
                           ("right" if c_idx in (10, 11, 12) else "left"),
                vertical="center", wrap_text=True)
            cell.border = border
            if c_idx in (10, 11, 12):
                cell.number_format = '#,##0.00;[Red]-#,##0.00'

    totals_row = header_row + 1 + len(rows) + 1
    label_cell = ws.cell(row=totals_row, column=1, value="TOTAL")
    ws.merge_cells(start_row=totals_row, end_row=totals_row, start_column=1, end_column=9)
    label_cell.font = Font(size=11, bold=True, color="FF0F2D52")
    label_cell.fill = PatternFill("solid", fgColor=GOLD)
    label_cell.alignment = Alignment(horizontal="right", vertical="center")
    label_cell.border = border
    for i in range(2, 10):
        ws.cell(row=totals_row, column=i).fill = PatternFill("solid", fgColor=GOLD)
        ws.cell(row=totals_row, column=i).border = border
    for col, key in [(10, "gross"), (11, "total"), (12, "rounded")]:
        tc = ws.cell(row=totals_row, column=col, value=totals[key])
        tc.font = Font(size=11, bold=True, color="FF0F2D52")
        tc.fill = PatternFill("solid", fgColor=GOLD)
        tc.alignment = Alignment(horizontal="right", vertical="center")
        tc.border = border
        tc.number_format = '#,##0.00;[Red]-#,##0.00'
    for col in (13, 14, 15):
        tc = ws.cell(row=totals_row, column=col, value="")
        tc.fill = PatternFill("solid", fgColor=GOLD); tc.border = border
    ws.row_dimensions[totals_row].height = 22

    widths = [6, 20, 18, 14, 12, 24, 32, 16, 32, 14, 14, 16, 14, 16, 10]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.freeze_panes = f"A{header_row + 1}"
    if rows:
        ws.auto_filter.ref = f"A{header_row}:{last_letter}{header_row + len(rows)}"

    foot_row = totals_row + 2
    ws.merge_cells(start_row=foot_row, end_row=foot_row, start_column=1, end_column=last_col)
    fc = ws.cell(row=foot_row, column=1)
    fc.value = (f"Generated {datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S IST')}   •   "
                f"Source: pharmacy + credit mode + UNPAID/REFUNDED bills "
                f"(BillReport ⋈ Order ⋈ Payment ⋈ Transaction)")
    fc.font = Font(size=8, italic=True, color="FF6B7280")
    fc.alignment = Alignment(horizontal="center", vertical="center")

    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_options.horizontalCentered = True
    ws.page_margins.left = 0.4; ws.page_margins.right = 0.4
    wb.save(path); return path

def write_pdf(rows, totals, n_pharmacy, n_credit, args, ts):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate,
                                    Paragraph, Spacer, Table, TableStyle)
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT

    name = f"credit_outstanding_pharmacy_{args.tenant}_{args.from_date}_to_{args.to_date}_{ts}.pdf"
    path = os.path.join(args.outdir, name)

    NAVY = colors.HexColor("#0F2D52"); NAVY_2 = colors.HexColor("#1A3C5E")
    SOFT = colors.HexColor("#E8EEF4"); SHADE = colors.HexColor("#F0F4F8")
    DANGER = colors.HexColor("#FFE5E5"); DANGER_FG = colors.HexColor("#B91C1C")
    GOLD = colors.HexColor("#FFF1C2"); GREY = colors.HexColor("#6B7280")

    page_w, page_h = landscape(A4); margin = 12 * mm
    styles = getSampleStyleSheet()
    h_title = ParagraphStyle("title", parent=styles["Heading1"], fontName="Helvetica-Bold",
                             fontSize=18, textColor=colors.white, alignment=TA_CENTER, leading=22)
    h_sub = ParagraphStyle("sub", parent=styles["Normal"], fontName="Helvetica-Oblique",
                           fontSize=9, textColor=colors.white, alignment=TA_CENTER, leading=12)
    p_tile_label = ParagraphStyle("tile_l", fontName="Helvetica-Bold", fontSize=7,
                                  textColor=NAVY_2, alignment=TA_CENTER, leading=9)
    p_tile_val = ParagraphStyle("tile_v", fontName="Helvetica-Bold", fontSize=12,
                                textColor=NAVY, alignment=TA_CENTER, leading=14)
    p_cell = ParagraphStyle("cell", fontName="Helvetica", fontSize=7.5,
                            textColor=colors.HexColor("#1A1A2E"), leading=9, wordWrap="CJK")
    p_cell_r = ParagraphStyle("cell_r", parent=p_cell, alignment=TA_RIGHT)
    p_cell_c = ParagraphStyle("cell_c", parent=p_cell, alignment=TA_CENTER)
    p_cell_ret = ParagraphStyle("cell_ret", parent=p_cell, textColor=DANGER_FG, fontName="Helvetica-Bold")

    title_t = Table(
        [[Paragraph("PHARMACY CREDIT OUTSTANDING REPORT", h_title)],
         [Paragraph(f"{TENANT_DISPLAY_NAME} &nbsp; • &nbsp; Tenant: {args.tenant} &nbsp; • &nbsp; "
                    f"Period: {args.from_date} → {args.to_date}", h_sub)]],
        colWidths=[page_w - 2 * margin])
    title_t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), NAVY),
        ("BACKGROUND", (0, 1), (0, 1), NAVY_2),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    tile_data = [
        ("Bills Scanned", f"{n_pharmacy}"),
        ("Pharmacy Bills", f"{n_pharmacy}"),
        ("Credit-Mode Bills", f"{n_credit}"),
        ("Outstanding (Gross)", f"INR {totals['gross']:,.2f}"),
        ("Outstanding (Rounded)", f"INR {totals['rounded']:,.2f}"),
    ]
    tiles_t = Table(
        [[Paragraph(l.upper(), p_tile_label) for l, _ in tile_data],
         [Paragraph(v, p_tile_val) for _, v in tile_data]],
        colWidths=[(page_w - 2 * margin) / len(tile_data)] * len(tile_data),
        rowHeights=[12, 22])
    tiles_t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SOFT),
        ("BACKGROUND", (0, 1), (-1, 1), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D0D8E4")),
    ]))

    header_cells = [Paragraph(f"<b>{h}</b>", ParagraphStyle(
        "h", parent=p_cell, fontName="Helvetica-Bold", textColor=colors.white,
        fontSize=8, alignment=TA_CENTER)) for h in HEADER]
    data = [header_cells]; return_indices = []
    for ri, row in enumerate(rows, start=1):
        is_return = row[-1] == "Return"
        if is_return: return_indices.append(ri)
        cells = []
        for ci, val in enumerate(row):
            if ci in (9, 10, 11):
                txt = f"{float(val):,.2f}"
                style = (ParagraphStyle("retr", parent=p_cell_r, textColor=DANGER_FG,
                                        fontName="Helvetica-Bold")
                         if is_return else p_cell_r)
            elif ci in (0, 14):
                txt = str(val); style = p_cell_ret if is_return else p_cell_c
            else:
                txt = str(val); style = p_cell_ret if is_return else p_cell
            cells.append(Paragraph(str(txt), style))
        data.append(cells)

    totals_cells = [Paragraph("", p_cell)] * 9
    totals_cells[0] = Paragraph("<b>TOTAL</b>", ParagraphStyle(
        "totl", parent=p_cell, fontName="Helvetica-Bold", alignment=TA_RIGHT, fontSize=9))
    totals_cells += [
        Paragraph(f"<b>{totals['gross']:,.2f}</b>",
                  ParagraphStyle("t1", parent=p_cell_r, fontName="Helvetica-Bold", fontSize=9)),
        Paragraph(f"<b>{totals['total']:,.2f}</b>",
                  ParagraphStyle("t2", parent=p_cell_r, fontName="Helvetica-Bold", fontSize=9)),
        Paragraph(f"<b>{totals['rounded']:,.2f}</b>",
                  ParagraphStyle("t3", parent=p_cell_r, fontName="Helvetica-Bold", fontSize=9)),
    ] + [Paragraph("", p_cell)] * 3
    data.append(totals_cells); totals_row_idx = len(data) - 1

    weights = [0.035, 0.085, 0.075, 0.065, 0.055, 0.105, 0.110, 0.060, 0.110,
               0.060, 0.060, 0.065, 0.055, 0.060, 0.035]
    col_widths = [w * (page_w - 2 * margin) for w in weights]

    table = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
        ("VALIGN", (0, 1), (-1, -1), "MIDDLE"),
        ("FONTSIZE", (0, 1), (-1, -1), 7.5),
        ("TOPPADDING", (0, 1), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 3),
        ("LEFTPADDING", (0, 1), (-1, -1), 3),
        ("RIGHTPADDING", (0, 1), (-1, -1), 3),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#D0D8E4")),
    ]
    for ri in range(1, len(data) - 1):
        if ri in return_indices:
            style_cmds.append(("BACKGROUND", (0, ri), (-1, ri), DANGER))
        elif ri % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, ri), (-1, ri), SHADE))
        else:
            style_cmds.append(("BACKGROUND", (0, ri), (-1, ri), colors.white))
    style_cmds += [
        ("BACKGROUND", (0, totals_row_idx), (-1, totals_row_idx), GOLD),
        ("SPAN", (0, totals_row_idx), (8, totals_row_idx)),
        ("FONTNAME", (0, totals_row_idx), (-1, totals_row_idx), "Helvetica-Bold"),
        ("ALIGN", (0, totals_row_idx), (8, totals_row_idx), "RIGHT"),
        ("LINEABOVE", (0, totals_row_idx), (-1, totals_row_idx), 1.2, NAVY),
        ("TOPPADDING", (0, totals_row_idx), (-1, totals_row_idx), 6),
        ("BOTTOMPADDING", (0, totals_row_idx), (-1, totals_row_idx), 6),
    ]
    table.setStyle(TableStyle(style_cmds))

    def chrome(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(NAVY); canvas.setLineWidth(0.6)
        canvas.rect(margin - 4, margin - 4,
                    page_w - 2 * (margin - 4), page_h - 2 * (margin - 4))
        canvas.setFont("Helvetica-Oblique", 7); canvas.setFillColor(GREY)
        canvas.drawString(margin, margin - 8,
                          f"Generated {datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S IST')}")
        canvas.drawRightString(page_w - margin, margin - 8, f"Page {doc.page}")
        canvas.setFont("Helvetica", 7)
        canvas.drawCentredString(page_w / 2, margin - 8,
                                 "eCare360 MIS  •  Pharmacy Credit Outstanding")
        canvas.restoreState()

    doc = BaseDocTemplate(
        path, pagesize=landscape(A4),
        leftMargin=margin, rightMargin=margin, topMargin=margin, bottomMargin=margin,
        title="Pharmacy Credit Outstanding Report", author="eCare360 MIS")
    doc.addPageTemplates([PageTemplate(
        id="main",
        frames=[Frame(margin, margin, page_w - 2 * margin, page_h - 2 * margin,
                      leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)],
        onPage=chrome)])
    doc.build([title_t, Spacer(1, 4), tiles_t, Spacer(1, 8), table])
    return path

# ── main ─────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    print(f"Pharmacy Credit Outstanding Report")
    print(f"  Tenant : {args.tenant}")
    print(f"  Period : {args.from_date} → {args.to_date}")
    print(f"  DB     : {args.db}")

    pharmacy_bills, orders, payments, transactions = fetch_from_mongo(args)
    rows, totals, n_credit = build_rows(pharmacy_bills, orders, payments, transactions)
    if not rows:
        print("No credit pharmacy bills found. Exiting without writing files.")
        return

    ts = datetime.now(IST).strftime("%Y%m%d_%H%M%S")
    csv_path  = write_csv(rows, totals, args, ts)
    xlsx_path = write_xlsx(rows, totals, len(pharmacy_bills), n_credit, args, ts)
    pdf_path  = write_pdf(rows, totals, len(pharmacy_bills), n_credit, args, ts)

    print(f"\nDone.")
    print(f"  CSV : {csv_path}")
    print(f"  XLSX: {xlsx_path}")
    print(f"  PDF : {pdf_path}")
    print(f"  Outstanding (Gross)   : INR {totals['gross']:,.2f}")
    print(f"  Outstanding (Rounded) : INR {totals['rounded']:,.2f}")

if __name__ == "__main__":
    main()
