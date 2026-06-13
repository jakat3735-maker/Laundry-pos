from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, WebSocket, WebSocketDisconnect
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
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal, Set
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Mongo
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

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
    print(f"DEBUG: Login attempt for email: {payload.email}")
    user = await db.users.find_one({"email": payload.email}, {"_id": 0})
    if not user:
        print(f"DEBUG: User not found in DB")
        raise HTTPException(status_code=401, detail="Email atau password salah")
    
    is_valid = verify_password(payload.password, user["hashed_password"])
    print(f"DEBUG: Password valid: {is_valid}")
    
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
    count = await db.orders.count_documents({"order_no": {"$regex": f"^LDR-{today}"}})
    return f"LDR-{today}-{count + 1:04d}"


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
    }


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
