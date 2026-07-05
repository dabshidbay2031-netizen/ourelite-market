# Generates "Mogarenta - Feature Inventory.pdf": every feature in the app
# and what it does (not how). Run: python scripts/gen-feature-inventory.py
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)
from reportlab.lib.enums import TA_LEFT

INDIGO  = colors.HexColor("#4F46E5")
DARK    = colors.HexColor("#1F2937")
GREY    = colors.HexColor("#6B7280")
LIGHTBG = colors.HexColor("#EEF2FF")
BORDER  = colors.HexColor("#E5E7EB")
ZEBRA   = colors.HexColor("#F9FAFB")

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Title"], textColor=INDIGO, fontSize=26, spaceAfter=4, alignment=TA_LEFT)
SUB = ParagraphStyle("SUB", parent=styles["Normal"], textColor=GREY, fontSize=10.5, spaceAfter=2)
SECTION = ParagraphStyle("SECTION", parent=styles["Heading1"], textColor=colors.white, fontSize=13,
                         leading=16, spaceBefore=0, spaceAfter=0, leftIndent=6)
INTRO = ParagraphStyle("INTRO", parent=styles["Normal"], textColor=DARK, fontSize=10, leading=14, spaceAfter=8)
CELL_F = ParagraphStyle("CELL_F", parent=styles["Normal"], fontSize=9.2, leading=12, textColor=DARK, fontName="Helvetica-Bold")
CELL_D = ParagraphStyle("CELL_D", parent=styles["Normal"], fontSize=9.2, leading=12.5, textColor=DARK)
NOTE = ParagraphStyle("NOTE", parent=styles["Normal"], fontSize=8.5, leading=11, textColor=GREY, spaceBefore=2)

# Each section: (emoji+title, intro, [ (feature, what it does), ... ])
SECTIONS = [
    ("1. Account Types & Access Control",
     "Who can see what. The app derives one of five roles from the signed-in account and gates pages accordingly.",
     [
        ("Guest (signed out)", "Can browse the catalog, search, view products, build a cart and read storefronts. Cannot checkout-as-self, chat, view orders, or open any business page."),
        ("Consumer ('user')", "Standard shopper. Buys, reviews, chats, tracks own orders, keeps a wishlist. No business pages."),
        ("Business", "Store operator. Full access to Dashboard, POS, Inventory, Customers, Supplier sourcing, and Staff, plus everything a consumer can do."),
        ("Supplier", "Wholesale seller. Manages its own catalog and storefront via Profile; receives bulk-order inquiries. No POS/Dashboard."),
        ("Field Agent", "Shops like a consumer but is tagged as an agent (product registrar). No business pages."),
        ("Admin", "Platform staff (listed in the admins table). Reviews and approves/rejects businesses and manages users."),
        ("Route guarding", "Business-only URLs (/dashboard, /pos, /inventory, /customers, /suppliers, /admin, /staff) show a 'restricted' screen with a role-appropriate call-to-action to anyone who isn't allowed."),
     ]),

    ("2. Shopping & Product Discovery",
     "The consumer-facing storefront - how products are found and viewed.",
     [
        ("Explore home", "Landing grid with a hot-deals banner, category chips, a Best Sellers row, and the full product grid."),
        ("Live search", "Typing in the header search box filters the grid instantly by name, description, SKU, brand and tags."),
        ("Category filter", "Tapping a category chip narrows the grid to that category and updates the item count."),
        ("Product card", "Shows photo, name, rating, price, discount %, VAT badge, wishlist heart and an Add-to-Cart button."),
        ("Product detail", "Full page: photo gallery, price/discount, stock status, description, tags, SKU, supplier link, quantity stepper, Add-to-Cart and Buy-Now."),
        ("Photo gallery + zoom", "Multiple product photos in a swipeable carousel with thumbnails and dots; tapping opens a full-screen lightbox with arrows and a counter."),
        ("Reviews", "Signed-in users leave a star rating + comment; the product's average rating and review count update. One review per user per product."),
        ("Wishlist", "Heart toggle saves products; persists locally for guests and syncs to the account when signed in."),
        ("Similar products", "Product detail shows a horizontal row of other items in the same category."),
        ("B2B visibility", "Products flagged business-to-business are hidden from guests/consumers and shown only to business and supplier accounts."),
        ("VAT badges", "Each product shows its tax treatment: no badge (tax-free), green 'VAT incl.', or amber '+5% VAT'."),
     ]),

    ("3. Cart & Checkout",
     "Turning a basket into a placed order. All prices are recomputed by the server at checkout.",
     [
        ("Cart drawer", "Slide-in panel listing items with quantity steppers, unit prices and a running subtotal."),
        ("Checkout summary", "Subtotal, VAT line (when applicable), discount line and final total."),
        ("5% VAT", "For 'tax-excluded' products, 5% is added on top as a separate VAT line; 'included' and 'none' products add nothing extra."),
        ("Coupons", "Enter a code to apply a discount; invalid, expired or below-minimum coupons are rejected with a clear message. Validated and consumed server-side."),
        ("GPS delivery address", "'Use my current location' captures the buyer's coordinates as the delivery point."),
        ("Payment methods", "Waafi (mobile money, simulated demo flow), Cash, and Card."),
        ("Server-authoritative pricing", "Order totals are computed from database prices - tampered client prices are ignored."),
        ("Stock guard", "An order for more than the available stock is rejected; stock is decremented only after the order is saved."),
        ("Order confirmation", "On success the cart clears, stock drops, and the order appears under Orders with an ORD- id."),
     ]),

    ("4. Orders & Receipts",
     "Tracking and managing orders after they're placed.",
     [
        ("My Orders", "Signed-in buyers see their own orders, newest first, expandable to line items."),
        ("Order tracking", "Per-order timeline (Placed -> Processing -> Shipped -> Delivered) with the current step highlighted."),
        ("Business order management", "Businesses see all orders across customers and can change an order's status."),
        ("Soft delete", "Deleting an order never removes the row - its status is set to 'deleted' and it keeps a grey badge, preserving the record."),
        ("Revenue exclusion", "Deleted, cancelled and refunded orders are excluded from every revenue figure."),
        ("Receipt + QR", "Checkout and POS sales produce a receipt with a QR code that links to the live order record (re-scanning always shows current status)."),
        ("Bulk-order inquiries", "Wholesale bulk requests create a BULK- order in 'bulk_pending' status without touching stock."),
     ]),

    ("5. Chat & Messaging",
     "Real-time conversations between buyers and sellers.",
     [
        ("Conversations list", "All of a user's chats, newest first, each showing the last message and unread count."),
        ("Direct messaging", "One-to-one text chat that updates in near real-time via Supabase Realtime."),
        ("Image messages", "Send a photo from the device; it uploads and appears as an image bubble."),
        ("Image zoom", "Tapping a chat photo opens it full-screen in a lightbox (tap backdrop or X to close)."),
        ("Read receipts", "Sent/read indicators on your own messages; opening a chat marks incoming messages read."),
        ("Profile peek", "Tapping the other person shows their profile: name, type badge, bio and tap-to-call contact numbers."),
        ("Message a store", "A 'Message' button on a storefront opens (or creates) a conversation with that seller."),
     ]),

    ("6. Notifications, Search Page & Settings",
     "Cross-cutting utilities.",
     [
        ("Notifications", "Bell with an unread badge; opening the list marks everything read and clears the badge."),
        ("Search page", "A dedicated results page that can be deep-linked with a query (e.g. /search?q=phone)."),
        ("Language", "Switch UI language (English / Arabic / Somali); Arabic flips layout to right-to-left. Persists across reloads."),
        ("Dark mode", "Toggles a full dark theme across the app; persists across reloads."),
        ("Currency", "Currency display preference in settings."),
     ]),

    ("7. Business - Dashboard",
     "The store operator's analytics home (business accounts only).",
     [
        ("Revenue stats", "Total revenue, today's revenue and this-month revenue (excluding deleted/cancelled/refunded)."),
        ("Operational stats", "Orders this month, units sold, and supplier count."),
        ("Revenue chart", "A multi-month revenue trend chart."),
        ("Category breakdown", "A category pie/share of sales."),
        ("Recent orders", "A live list of the most recent orders."),
     ]),

    ("8. Business - Point of Sale (POS)",
     "In-person selling at the counter (business accounts only).",
     [
        ("Build a sale", "Tap products to add them to a POS cart with live totals."),
        ("Barcode scan", "Scan a product barcode with the camera to add it; unknown codes report 'not found'."),
        ("Discounts", "Apply a discount to the POS sale."),
        ("Payment methods", "Complete a sale with Cash, Waafi or Card, including split payments."),
        ("Cash drawer / sessions", "Open and close a register session; closing shows the expected-vs-counted discrepancy."),
        ("Hold sale", "Park an in-progress sale to resume later."),
        ("Receipt", "Generates a printable receipt with QR code; stock decrements on completion."),
     ]),

    ("9. Business - Inventory",
     "Stock and catalog management (business accounts only).",
     [
        ("Stock adjust", "Minus/plus buttons change stock instantly; bulk restock via a quantity prompt."),
        ("Add / edit product", "A full product form: name, price, original price, category, stock, SKU, description, supplier, brand, tags, images."),
        ("VAT / tax picker", "Per-product choice of No Tax, Tax Included or Tax Excluded, reflected as a badge in the storefront."),
        ("Barcode field + scan", "Type or scan a barcode into the product; scanning a known barcode opens that product for editing."),
        ("Image URL + preview", "Add product image links with a live thumbnail preview."),
        ("AI description", "Generate a product description automatically (uses the Anthropic API key)."),
     ]),

    ("10. Business - Customers, Sourcing & Staff",
     "The rest of the back office (business accounts only).",
     [
        ("Customer directory", "Add, edit and delete customer records."),
        ("Supplier sourcing", "Browse the supplier directory (filter by verified / category) and send bulk-order inquiries."),
        ("Staff / cashiers", "Add and remove cashiers; a cashier can sign in at a dedicated cashier login with limited privileges."),
     ]),

    ("11. Supplier Features",
     "Tools for wholesale sellers (supplier accounts).",
     [
        ("Supplier dashboard", "Store header with product / order / revenue stats and Products, Sales and Settings tabs (opened from Profile)."),
        ("Catalog management", "Add regular and B2B products (with tier pricing / minimum order quantity) and import products via CSV."),
        ("Public storefront", "A shareable store page (/:slug or /supplier/:id) showing store info, products and a Message button."),
        ("Store profile + photo", "Editable store name, bio, location and profile photo."),
        ("Store map & directions", "When the store sets a map pin, its profile shows an interactive map with the store location, a driving route from the customer's current location (distance + ETA), and an 'Open in Google Maps' button."),
        ("Bulk-order intake", "Receives bulk-order inquiries from businesses with its bulk-discount applied."),
        ("Verification & badges", "Verified badge and custom badge shown on the storefront."),
     ]),

    ("12. Admin",
     "Platform governance (admin accounts).",
     [
        ("Business approvals", "Review businesses, see who's requested approval, and Approve or Reject them."),
        ("User management", "View platform users and admins."),
        ("Platform stats", "Aggregate revenue / supplier / user figures."),
     ]),

    ("13. Authentication",
     "Signing in and account creation (Supabase Auth).",
     [
        ("Email sign-up / sign-in", "Create an account or sign in with email + password (email confirmation currently off)."),
        ("Account type at signup", "Choose Consumer, Business, Supplier or Field Agent; the correct role and access apply immediately."),
        ("Google OAuth", "Sign in with Google, returning through a callback screen to the app signed-in."),
        ("Session persistence", "Stays signed in across reloads without flashing the guest UI."),
        ("Sign out", "Returns the whole app to the guest state everywhere."),
     ]),

    ("14. Platform & Technical",
     "App-wide behaviours that aren't a single screen.",
     [
        ("Hash-routed SPA", "The whole app runs as a single page using /#/ routes; back/forward and reload all work and OAuth token hashes are ignored as routes."),
        ("Mobile-first layout", "Responsive down to small phones with a fixed bottom navigation bar (visible in portrait and landscape) and a swipe-in side drawer."),
        ("Resilience", "If the database is unavailable the catalog shows an empty state rather than crashing; failed actions show a toast and keep the cart intact."),
        ("PWA install", "The app can be installed to the home screen and launched standalone."),
        ("Referrals", "A referral code/link system for inviting others."),
        ("Free-trial gate", "A trial/approval gate for business & supplier accounts exists in the codebase but is currently disabled (everyone gets immediate access)."),
     ]),
]

KNOWN_GAPS = [
    "Store map pin needs two new DB columns (suppliers.latitude / longitude) - run migration_v3_1.sql section 6 to enable it on the live database.",
    "VAT (products.tax_mode), profile avatar_url/bio, and addresses GPS columns also depend on migration_v3_1.sql being fully run.",
    "Payment is a simulated demo flow (Waafi) - no real money is moved.",
    "The free-trial / approval gate is intentionally disabled in components/TrialGate.tsx.",
    "Email confirmation is OFF in Supabase Auth; sign-ups land signed-in immediately.",
]


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(GREY)
    canvas.drawString(18*mm, 12*mm, "Mogarenta - Feature Inventory")
    canvas.drawRightString(A4[0]-18*mm, 12*mm, f"Page {doc.page}")
    canvas.setStrokeColor(BORDER)
    canvas.line(18*mm, 15*mm, A4[0]-18*mm, 15*mm)
    canvas.restoreState()


def section_block(title, intro, rows):
    flow = []
    # Section header bar
    bar = Table([[Paragraph(title, SECTION)]], colWidths=[A4[0]-36*mm])
    bar.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), INDIGO),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
    ]))
    flow.append(bar)
    flow.append(Spacer(1, 5))
    if intro:
        flow.append(Paragraph(intro, INTRO))
    # Feature table
    data = [[Paragraph("Feature", CELL_F), Paragraph("What it does", CELL_F)]]
    for f, d in rows:
        data.append([Paragraph(f, CELL_F), Paragraph(d, CELL_D)])
    t = Table(data, colWidths=[48*mm, (A4[0]-36*mm)-48*mm], repeatRows=1)
    ts = [
        ("BACKGROUND", (0,0), (-1,0), LIGHTBG),
        ("TEXTCOLOR", (0,0), (-1,0), INDIGO),
        ("GRID", (0,0), (-1,-1), 0.5, BORDER),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING", (0,0), (-1,-1), 7),
        ("RIGHTPADDING", (0,0), (-1,-1), 7),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            ts.append(("BACKGROUND", (0,i), (-1,i), ZEBRA))
    t.setStyle(TableStyle(ts))
    flow.append(t)
    flow.append(Spacer(1, 12))
    return flow


def build():
    doc = SimpleDocTemplate(
        "Mogarenta - Feature Inventory.pdf", pagesize=A4,
        leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=20*mm,
        title="Mogarenta - Feature Inventory", author="Mogarenta",
    )
    story = []
    story.append(Paragraph("Mogarenta", H1))
    story.append(Paragraph("Feature Inventory - every feature and what it does", SUB))
    story.append(Paragraph("Generated for fixing &amp; review | A catalog of current functionality (what, not how).", SUB))
    story.append(Spacer(1, 10))

    total = sum(len(r) for _, _, r in SECTIONS)
    story.append(Paragraph(
        f"This document lists <b>{total} features</b> across <b>{len(SECTIONS)} areas</b> of the app, "
        "describing what each one does. Use it as a checklist to decide what to fix or change.",
        INTRO))
    story.append(Spacer(1, 6))

    for i, (title, intro, rows) in enumerate(SECTIONS):
        story += section_block(title, intro, rows)

    # Known gaps / caveats
    story.append(PageBreak())
    bar = Table([[Paragraph("Known Gaps &amp; Caveats", SECTION)]], colWidths=[A4[0]-36*mm])
    bar.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),colors.HexColor("#B45309")),
                             ("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),
                             ("LEFTPADDING",(0,0),(-1,-1),6)]))
    story.append(bar)
    story.append(Spacer(1, 6))
    for g in KNOWN_GAPS:
        story.append(Paragraph(f"•&nbsp; {g}", INTRO))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print("Wrote: Mogarenta - Feature Inventory.pdf")


if __name__ == "__main__":
    build()
