from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import hashlib
import base64
import bcrypt
import jwt
import httpx
import asyncio
import io
import pandas as pd
from fpdf import FPDF
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal, Set
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Mongo
mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
db_name = os.environ.get("DB_NAME", "laundry_db")
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Settings
JWT_SECRET = os.environ.get("JWT_SECRET", "laundry-pos-super-secret-key-change-me")
JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = 24 * 7

MIDTRANS_SERVER_KEY = os.environ.get("MIDTRANS_SERVER_KEY", "SB-Mid-server-DEMO-PLACEHOLDER")
MIDTRANS_IS_PRODUCTION = os.environ.get("MIDTRANS_IS_PRODUCTION", "false").lower() == "true"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Laundry POS API")
api = APIRouter(prefix="/api")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ------------------------ WebSocket Manager ------------------------
class WSManager:
    def __init__(self) -> None:
        self.active: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self.active.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self.active.discard(ws)

    async def broadcast(self, event: str, payload: Optional[dict] = None) -> None:
        msg = {"type": event, "payload": payload or {}, "ts": now_iso()}
        dead: List[WebSocket] = []
        # snapshot to avoid mutation during iteration
        async with self._lock:
            conns = list(self.active)
        for ws in conns:
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for d in dead:
                    self.active.discard(d)


ws_manager = WSManager()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ------------------------ Models ------------------------
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: Literal["owner", "cashier"] = "cashier"


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class CustomerIn(BaseModel):
    name: str
    phone: str
    address: Optional[str] = ""


class Customer(CustomerIn):
    id: str
    created_at: str


class ServiceIn(BaseModel):
    name: str
    price: float
    unit: Literal["kg", "pcs"] = "kg"
    category: Literal["reguler", "express", "satuan"] = "reguler"


class Service(ServiceIn):
    id: str


class OrderItemIn(BaseModel):
    service_id: str
    service_name: str
    price: float
    unit: str
    quantity: float


class OrderIn(BaseModel):
    customer_id: str
    customer_name: str
    items: List[OrderItemIn]
    notes: Optional[str] = ""


class Order(BaseModel):
    id: str
    order_no: str
    customer_id: str
    customer_name: str
    items: List[OrderItemIn]
    total: float
    status: Literal["diterima", "dicuci", "siap", "selesai", "diambil"]
    payment_status: Literal["unpaid", "paid"]
    payment_method: Optional[str] = None
    notes: Optional[str] = ""
    created_by: str
    created_at: str
    snap_token: Optional[str] = None
    snap_redirect_url: Optional[str] = None


class StatusUpdate(BaseModel):
    status: Literal["diterima", "dicuci", "siap", "selesai", "diambil"]


class PaymentUpdate(BaseModel):
    payment_status: Literal["unpaid", "paid"]
    payment_method: Optional[str] = "cash"


# ------------------------ Helpers ------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserPublic:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return UserPublic(**{k: user[k] for k in ("id", "email", "full_name", "role")})


def require_owner(user: UserPublic = Depends(get_current_user)) -> UserPublic:
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="Owner role required")
    return user


# ------------------------ Auth ------------------------
@api.post("/auth/register", response_model=UserPublic)
async def register(payload: UserCreate, _current=Depends(require_owner)):
    """Only owner can register new users (cashier/staff)."""
    exists = await db.users.find_one({"email": payload.email})
    if exists:
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    user_doc = {
        "id": new_id(),
        "email": payload.email,
        "full_name": payload.full_name,
        "role": payload.role,
        "hashed_password": hash_password(payload.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    return UserPublic(id=user_doc["id"], email=user_doc["email"], full_name=user_doc["full_name"], role=user_doc["role"])


@api.post("/auth/login", response_model=Token)
async def login(payload: LoginIn):
    logger.info(f"Login attempt for email: {payload.email}")
    user = await db.users.find_one({"email": payload.email}, {"_id": 0})
    if not user:
        logger.warning(f"User not found: {payload.email}")
        raise HTTPException(status_code=401, detail="Email atau password salah")
    
    is_valid = verify_password(payload.password, user["hashed_password"])
    logger.info(f"Password valid for {payload.email}: {is_valid}")
    
    if not is_valid:
        raise HTTPException(status_code=401, detail="Email atau password salah")

    token = create_token(user["id"], user["role"])
    return Token(
        access_token=token,
        user=UserPublic(id=user["id"], email=user["email"], full_name=user["full_name"], role=user["role"]),
    )


@api.get("/auth/me", response_model=UserPublic)
async def me(user: UserPublic = Depends(get_current_user)):
    return user


@api.get("/users", response_model=List[UserPublic])
async def list_users(_owner=Depends(require_owner)):
    users = await db.users.find({}, {"_id": 0, "hashed_password": 0, "created_at": 0}).to_list(1000)
    return [UserPublic(**u) for u in users]


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, owner: UserPublic = Depends(require_owner)):
    if user_id == owner.id:
        raise HTTPException(status_code=400, detail="Tidak bisa hapus akun sendiri")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


# ------------------------ Customers ------------------------
@api.get("/customers", response_model=List[Customer])
async def list_customers(_user=Depends(get_current_user)):
    items = await db.customers.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Customer(**i) for i in items]


@api.post("/customers", response_model=Customer)
async def create_customer(payload: CustomerIn, _user=Depends(get_current_user)):
    # Check if customer with same phone exists
    existing = await db.customers.find_one({"phone": payload.phone})
    if existing:
        # If it exists, we could either raise an error or just return it. 
        # For simplicity and to avoid "double" creation issues, let's return error.
        raise HTTPException(status_code=400, detail="Nomor HP sudah terdaftar")

    doc = {"id": new_id(), "created_at": now_iso(), **payload.dict()}
    await db.customers.insert_one(doc)
    doc.pop("_id", None)
    await ws_manager.broadcast("customers_updated")
    return Customer(**doc)


@api.put("/customers/{cid}", response_model=Customer)
async def update_customer(cid: str, payload: CustomerIn, _user=Depends(get_current_user)):
    await db.customers.update_one({"id": cid}, {"$set": payload.dict()})
    doc = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Customer not found")
    await ws_manager.broadcast("customers_updated")
    return Customer(**doc)


@api.delete("/customers/{cid}")
async def delete_customer(cid: str, _user=Depends(get_current_user)):
    await db.customers.delete_one({"id": cid})
    await ws_manager.broadcast("customers_updated")
    return {"ok": True}


# ------------------------ Services ------------------------
@api.get("/services", response_model=List[Service])
async def list_services(_user=Depends(get_current_user)):
    items = await db.services.find({}, {"_id": 0}).to_list(1000)
    return [Service(**i) for i in items]


@api.post("/services", response_model=Service)
async def create_service(payload: ServiceIn, _owner=Depends(require_owner)):
    doc = {"id": new_id(), **payload.dict()}
    await db.services.insert_one(doc)
    doc.pop("_id", None)
    await ws_manager.broadcast("services_updated")
    return Service(**doc)


@api.put("/services/{sid}", response_model=Service)
async def update_service(sid: str, payload: ServiceIn, _owner=Depends(require_owner)):
    await db.services.update_one({"id": sid}, {"$set": payload.dict()})
    doc = await db.services.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Service not found")
    await ws_manager.broadcast("services_updated")
    return Service(**doc)


@api.delete("/services/{sid}")
async def delete_service(sid: str, _owner=Depends(require_owner)):
    await db.services.delete_one({"id": sid})
    await ws_manager.broadcast("services_updated")
    return {"ok": True}


# ------------------------ Orders ------------------------
async def _next_order_no() -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = await db.orders.count_documents({"order_no": {"$regex": f"^D3G-{today}"}})
    return f"D3G-{today}-{count + 1:04d}"


@api.get("/orders", response_model=List[Order])
async def list_orders(
    status_filter: Optional[str] = None, _user=Depends(get_current_user)
):
    q = {}
    if status_filter and status_filter != "semua":
        q["status"] = status_filter
    items = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Order(**i) for i in items]


@api.get("/orders/{oid}", response_model=Order)
async def get_order(oid: str, _user=Depends(get_current_user)):
    doc = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Order not found")
    return Order(**doc)


@api.post("/orders", response_model=Order)
async def create_order(payload: OrderIn, user: UserPublic = Depends(get_current_user)):
    total = sum(i.price * i.quantity for i in payload.items)
    doc = {
        "id": new_id(),
        "order_no": await _next_order_no(),
        "customer_id": payload.customer_id,
        "customer_name": payload.customer_name,
        "items": [i.dict() for i in payload.items],
        "total": total,
        "status": "diterima",
        "payment_status": "unpaid",
        "payment_method": None,
        "notes": payload.notes or "",
        "created_by": user.id,
        "created_at": now_iso(),
        "snap_token": None,
        "snap_redirect_url": None,
    }
    await db.orders.insert_one(doc)
    doc.pop("_id", None)
    await ws_manager.broadcast("orders_updated", {"order_no": doc["order_no"]})
    return Order(**doc)


@api.put("/orders/{oid}/status", response_model=Order)
async def update_status(oid: str, payload: StatusUpdate, _user=Depends(get_current_user)):
    await db.orders.update_one({"id": oid}, {"$set": {"status": payload.status}})
    doc = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Order not found")
    await ws_manager.broadcast("orders_updated", {"order_no": doc["order_no"], "status": doc["status"]})
    return Order(**doc)


@api.put("/orders/{oid}/payment", response_model=Order)
async def update_payment(oid: str, payload: PaymentUpdate, _user=Depends(get_current_user)):
    await db.orders.update_one(
        {"id": oid},
        {"$set": {"payment_status": payload.payment_status, "payment_method": payload.payment_method}},
    )
    doc = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Order not found")
    await ws_manager.broadcast("orders_updated", {"order_no": doc["order_no"], "payment_status": doc["payment_status"]})
    return Order(**doc)


@api.delete("/orders/{oid}")
async def delete_order(oid: str, _owner=Depends(require_owner)):
    await db.orders.delete_one({"id": oid})
    await ws_manager.broadcast("orders_updated")
    return {"ok": True}


# ------------------------ Dashboard ------------------------
@api.get("/dashboard/stats")
async def dashboard_stats(_user=Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    all_orders = await db.orders.find({}, {"_id": 0}).to_list(5000)
    today_orders = [o for o in all_orders if o["created_at"].startswith(today)]
    revenue_today = sum(o["total"] for o in today_orders if o.get("payment_status") == "paid")
    revenue_all = sum(o["total"] for o in all_orders if o.get("payment_status") == "paid")
    by_status = {}
    for o in all_orders:
        by_status[o["status"]] = by_status.get(o["status"], 0) + 1
    return {
        "revenue_today": revenue_today,
        "revenue_total": revenue_all,
        "orders_today": len(today_orders),
        "orders_total": len(all_orders),
        "by_status": by_status,
        "active_orders": [Order(**o).dict() for o in all_orders if o["status"] in ("diterima", "dicuci", "siap")][:10],
        "finished_orders": [Order(**o).dict() for o in all_orders if o["status"] in ("selesai", "diambil")][:10],
    }


# ------------------------ Reports Export ------------------------
@api.get("/reports/pdf")
async def export_pdf(_user=Depends(get_current_user)):
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", "B", 16)
    pdf.cell(0, 10, "Laporan Pesanan Laundry", ln=True, align="C")
    pdf.set_font("Arial", size=10)
    pdf.cell(0, 10, f"Dicetak pada: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", ln=True, align="C")
    pdf.ln(10)
    
    # Table Header
    pdf.set_fill_color(200, 220, 255)
    pdf.set_font("Arial", "B", 9)
    pdf.cell(35, 10, "No. Order", 1, 0, "C", True)
    pdf.cell(45, 10, "Pelanggan", 1, 0, "C", True)
    pdf.cell(30, 10, "Tanggal", 1, 0, "C", True)
    pdf.cell(25, 10, "Status", 1, 0, "C", True)
    pdf.cell(25, 10, "Bayar", 1, 0, "C", True)
    pdf.cell(30, 10, "Total", 1, 1, "C", True)
    
    pdf.set_font("Arial", size=8)
    for o in orders:
        dt = o["created_at"][:10]
        pdf.cell(35, 8, o["order_no"], 1)
        pdf.cell(45, 8, o["customer_name"][:25], 1)
        pdf.cell(30, 8, dt, 1, 0, "C")
        pdf.cell(25, 8, o["status"], 1, 0, "C")
        pdf.cell(25, 8, o["payment_status"], 1, 0, "C")
        pdf.cell(30, 8, f"Rp {int(o['total']):,}", 1, 1, "R")
        
    pdf_bytes = pdf.output()
    
    headers = {
        'Content-Disposition': 'attachment; filename="laporan_laundry.pdf"'
    }
    return StreamingResponse(io.BytesIO(pdf_bytes), headers=headers, media_type="application/pdf")


@api.get("/reports/excel")
async def export_excel(_user=Depends(get_current_user)):
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    df = pd.DataFrame(orders)
    
    # Clean up for Excel
    if not df.empty:
        cols = ["order_no", "customer_name", "created_at", "status", "payment_status", "total"]
        df = df[cols]
        df.columns = ["No. Order", "Pelanggan", "Tanggal", "Status Pesanan", "Status Bayar", "Total Harga"]
        df["Tanggal"] = df["Tanggal"].apply(lambda x: x[:10])
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Laporan")
    
    output.seek(0)
    headers = {
        'Content-Disposition': 'attachment; filename="laporan_laundry.xlsx"'
    }
    return StreamingResponse(output, headers=headers, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@api.get("/orders/{oid}/pdf")
async def export_order_pdf(oid: str, _user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")

    # A5 size or similar small format for receipt
    pdf = FPDF(format='A5') 
    pdf.add_page()
    pdf.set_font("Arial", "B", 16)
    pdf.cell(0, 10, "DIEARMA 3G LAUNDRY", ln=1, align="C")
    pdf.set_font("Arial", "", 10)
    pdf.cell(0, 6, "SAHABAT LAUNDRY PAKAIAN BERSIH DAN WANGI", ln=1, align="C")
    pdf.ln(10)
    
    pdf.set_font("Arial", "B", 10)
    pdf.cell(0, 8, f"NOTA PEMESANAN: {order['order_no']}", ln=True)
    pdf.set_font("Arial", size=10)
    
    label_w = 38
    pdf.cell(label_w, 6, "Nama Pelanggan")
    pdf.cell(0, 6, f": {order['customer_name']}", ln=True)
    pdf.cell(label_w, 6, "Tanggal Pemesanan")
    pdf.cell(0, 6, f": {order['created_at'][:10]} {order['created_at'][11:16]}", ln=True)
    pdf.cell(label_w, 6, "Status Pesanan")
    pdf.cell(0, 6, f": {order['status'].upper()}", ln=True)
    pdf.cell(label_w, 6, "Pembayaran")
    pdf.cell(0, 6, f": {order['payment_status'].upper()} ({order.get('payment_method') or 'CASH'})", ln=True)
    pdf.ln(5)
    
    # Table Header
    pdf.set_fill_color(240, 240, 240)
    pdf.set_font("Arial", "B", 10)
    pdf.cell(50, 8, "Layanan", 1, 0, "L", True)
    pdf.cell(28, 8, "Harga", 1, 0, "C", True)
    pdf.cell(20, 8, "Qty", 1, 0, "C", True)
    pdf.cell(30, 8, "Subtotal", 1, 1, "R", True)
    
    pdf.set_font("Arial", size=10)
    for i in order['items']:
        pdf.cell(50, 8, i['service_name'], 1)
        pdf.cell(28, 8, f"{int(i['price']):,}", 1, 0, "C")
        pdf.cell(20, 8, str(i['quantity']), 1, 0, "C")
        pdf.cell(30, 8, f"{int(i['price'] * i['quantity']):,}", 1, 1, "R")
        
    pdf.set_font("Arial", "B", 11)
    pdf.cell(98, 10, "TOTAL HARGA", 1, 0, "R")
    pdf.cell(30, 10, f"Rp {int(order['total']):,}", 1, 1, "R")
    
    pdf.ln(10)
    pdf.set_font("Arial", "I", 9)
    if order.get("notes"):
        pdf.multi_cell(0, 5, f"Catatan: {order['notes']}")
        pdf.ln(5)
        
    pdf.set_font("Arial", "", 10)
    pdf.cell(0, 6, "Syarat & Ketentuan:", ln=True)
    pdf.cell(0, 5, "1. Pengambilan barang wajib membawa nota ini.", ln=True)
    pdf.cell(0, 5, "2. Barang tidak diambil > 1 bulan di luar tanggung jawab kami.", ln=True)
    pdf.ln(10)
    pdf.cell(0, 10, "Terima kasih sudah Laundry di tempat kami :)", 0, 1, "C")

    pdf_bytes = pdf.output()
    headers = {'Content-Disposition': f'attachment; filename="nota_{order["order_no"]}.pdf"'}
    return StreamingResponse(io.BytesIO(pdf_bytes), headers=headers, media_type="application/pdf")


@api.get("/orders/{oid}/pdf-thermal")
async def export_order_thermal_pdf(oid: str, _user=Depends(get_current_user)):
    try:
        order = await db.orders.find_one({"id": oid}, {"_id": 0})
        if not order:
            raise HTTPException(404, "Order not found")

        # Thermal 58mm width
        items = order.get('items', [])
        items_count = len(items)
        # Estimasi tinggi: Header + Items + Footer
        calculated_h = 100 + (items_count * 12)
        
        # Inisialisasi PDF dengan penanganan error pada format
        try:
            pdf = FPDF(unit='mm', format=(58, calculated_h))
        except Exception:
            pdf = FPDF(unit='mm', format='A4') # Fallback jika format kustom gagal
            
        pdf.add_page()
        pdf.set_auto_page_break(False) # Hindari page break otomatis pada thermal
        pdf.set_margins(4, 4, 4)
        
        # Gunakan font standar 'helvetica' (lowercase sering lebih aman di beberapa versi fpdf)
        font_main = "helvetica"
        
        # Header
        pdf.set_font(font_main, "B", 10)
        pdf.cell(0, 5, "DIEARMA 3G LAUNDRY", ln=1, align="C")
        pdf.set_font(font_main, "", 7)
        pdf.multi_cell(0, 4, "SAHABAT LAUNDRY PAKAIAN BERSIH DAN RAPI", align="C")
        
        # Explicitly move to next line and reset X position for the separator
        pdf.ln(1)
        pdf.set_x(4)
        pdf.set_font("courier", "", 8)
        pdf.cell(0, 4, "-------------------------------", ln=1, align="C")
        
        # Info Order
        pdf.set_font(font_main, "", 8)
        pdf.set_x(4)
        pdf.cell(0, 4, f"No: {order.get('order_no', '-')}", ln=1)
        pdf.set_x(4)
        pdf.cell(0, 4, f"Cst: {str(order.get('customer_name', '-'))[:20]}", ln=1)
        
        created_at = order.get('created_at', "")
        date_str = created_at[:10] if created_at else "-"
        time_str = created_at[11:16] if len(created_at) >= 16 else ""
        pdf.set_x(4)
        pdf.cell(0, 4, f"Time: {date_str} {time_str}", ln=1)
        
        pdf.ln(1)
        pdf.set_x(4)
        pdf.set_font("courier", "", 8)
        pdf.cell(0, 4, "-------------------------------", ln=1, align="C")
        
        # Table Items
        pdf.set_font(font_main, "B", 8)
        pdf.cell(25, 5, "Layanan", 0, 0, "L")
        pdf.cell(8, 5, "Qty", 0, 0, "C")
        pdf.cell(17, 5, "Total", 0, 1, "R")
        
        pdf.set_font(font_main, "", 8)
        for i in items:
            name = str(i.get('service_name', 'Item'))[:15]
            qty = i.get('quantity', 0)
            price = i.get('price', 0)
            pdf.cell(25, 4, name, 0, 0, "L")
            pdf.cell(8, 4, str(qty), 0, 0, "C")
            pdf.cell(17, 4, f"{int(price * qty):,}", 0, 1, "R")
            
        pdf.ln(1)
        pdf.set_x(4)
        pdf.set_font("courier", "", 8)
        pdf.cell(0, 4, "-------------------------------", ln=1, align="C")
        
        # Total
        pdf.set_font(font_main, "B", 9)
        pdf.cell(32, 6, "TOTAL", 0, 0, "R")
        pdf.cell(18, 6, f"Rp {int(order.get('total', 0)):,}", 0, 1, "R")
        
        pdf.ln(2)
        pdf.set_font(font_main, "", 7)
        notes = order.get("notes")
        if notes:
            pdf.multi_cell(0, 3, f"Cat: {notes}", align="L")
            pdf.ln(2)
            
        pdf.cell(0, 4, "Terima kasih :)", ln=1, align="C")
        pdf.cell(0, 4, "Bawa nota saat ambil barang.", ln=1, align="C")

        # Explicitly get bytes
        pdf_output = pdf.output()
        return StreamingResponse(
            io.BytesIO(pdf_output), 
            headers={'Content-Disposition': f'attachment; filename="thermal_{order.get("order_no")}.pdf"'}, 
            media_type="application/pdf"
        )
        
    except Exception as e:
        logger.error(f"Thermal PDF Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Gagal generate PDF: {str(e)}")


# ------------------------ Midtrans ------------------------
def _midtrans_base() -> str:
    return "https://app.midtrans.com" if MIDTRANS_IS_PRODUCTION else "https://app.sandbox.midtrans.com"


def _midtrans_auth() -> str:
    return base64.b64encode((MIDTRANS_SERVER_KEY + ":").encode()).decode()


@api.post("/payments/midtrans/create/{oid}")
async def create_midtrans(oid: str, _user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["payment_status"] == "paid":
        raise HTTPException(400, "Order sudah dibayar")

    payload = {
        "transaction_details": {
            "order_id": order["order_no"],
            "gross_amount": int(round(order["total"])),
        },
        "customer_details": {"first_name": order["customer_name"]},
    }
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Basic {_midtrans_auth()}",
    }
    url = _midtrans_base() + "/snap/v1/transactions"
    try:
        async with httpx.AsyncClient(timeout=20.0) as cli:
            resp = await cli.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            logger.warning("Midtrans error %s: %s", resp.status_code, resp.text)
            raise HTTPException(status_code=502, detail=f"Midtrans gagal: {resp.text}")
        data = resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Midtrans tidak dapat dihubungi: {e}")

    await db.orders.update_one(
        {"id": oid},
        {"$set": {"snap_token": data.get("token"), "snap_redirect_url": data.get("redirect_url")}},
    )
    return {"token": data.get("token"), "redirect_url": data.get("redirect_url")}


@api.post("/payments/midtrans/notification")
async def midtrans_notification(request: Request):
    data = await request.json()
    order_no = data.get("order_id")
    status_code = data.get("status_code", "")
    gross = data.get("gross_amount", "")
    sig = data.get("signature_key", "")
    expected = hashlib.sha512((order_no + status_code + gross + MIDTRANS_SERVER_KEY).encode()).hexdigest()
    if sig != expected:
        raise HTTPException(400, "Invalid signature")
    tstatus = data.get("transaction_status")
    update = {}
    if tstatus in ("settlement", "capture"):
        update = {"payment_status": "paid", "payment_method": "midtrans"}
    elif tstatus in ("cancel", "deny", "expire"):
        update = {"payment_status": "unpaid"}
    if update:
        await db.orders.update_one({"order_no": order_no}, {"$set": update})
    return {"ok": True}


# ------------------------ Seed ------------------------
async def seed():
    # default owner
    if not await db.users.find_one({"email": "owner@laundry.com"}):
        await db.users.insert_one({
            "id": new_id(),
            "email": "owner@laundry.com",
            "full_name": "Owner Laundry",
            "role": "owner",
            "hashed_password": hash_password("owner123"),
            "created_at": now_iso(),
        })
    if not await db.users.find_one({"email": "kasir@laundry.com"}):
        await db.users.insert_one({
            "id": new_id(),
            "email": "kasir@laundry.com",
            "full_name": "Kasir Demo",
            "role": "cashier",
            "hashed_password": hash_password("kasir123"),
            "created_at": now_iso(),
        })
    # default services
    if await db.services.count_documents({}) == 0:
        await db.services.insert_many([
            {"id": new_id(), "name": "Cuci Kering Reguler", "price": 7000, "unit": "kg", "category": "reguler"},
            {"id": new_id(), "name": "Cuci Setrika Reguler", "price": 10000, "unit": "kg", "category": "reguler"},
            {"id": new_id(), "name": "Cuci Setrika Express", "price": 15000, "unit": "kg", "category": "express"},
            {"id": new_id(), "name": "Setrika Saja", "price": 5000, "unit": "kg", "category": "reguler"},
            {"id": new_id(), "name": "Bed Cover", "price": 25000, "unit": "pcs", "category": "satuan"},
            {"id": new_id(), "name": "Jas / Blazer", "price": 20000, "unit": "pcs", "category": "satuan"},
        ])
    # default customers
    if await db.customers.count_documents({}) == 0:
        await db.customers.insert_many([
            {"id": new_id(), "name": "Budi Santoso", "phone": "081234567890", "address": "Jl. Mawar No. 1", "created_at": now_iso()},
            {"id": new_id(), "name": "Siti Aminah", "phone": "081298765432", "address": "Jl. Melati No. 5", "created_at": now_iso()},
        ])


@app.on_event("startup")
async def on_startup():
    try:
        await seed()
        logger.info("Database seeding completed or skipped.")
    except Exception as e:
        logger.error(f"Seeding failed: {e}. Check your MONGO_URL and Network Access.")


@api.get("/")
async def root():
    return {"service": "Laundry POS API", "version": "1.0"}


# ------------------------ WebSocket Endpoint ------------------------
@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    """Real-time event stream. Client connects with ?token=<JWT>.
    Server broadcasts JSON events: {type, payload, ts}."""
    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        await websocket.close(code=4401)
        return
    await ws_manager.connect(websocket)
    try:
        await websocket.send_json({"type": "connected", "payload": {}, "ts": now_iso()})
        while True:
            # Keep alive — client can send "ping", we ignore content
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning("WS error: %s", e)
        await ws_manager.disconnect(websocket)


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
