import asyncio
import os
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

async def reset():
    load_dotenv(Path(__file__).parent / ".env")
    client = AsyncIOMotorClient(os.getenv("MONGO_URL"))
    db = client[os.getenv("DB_NAME", "laundry_db")]

    # Update Owner
    await db.users.update_one(
        {"email": "owner@laundry.com"},
        {"$set": {"hashed_password": hash_password("owner123")}}
    )
    # Update Kasir
    await db.users.update_one(
        {"email": "kasir@laundry.com"},
        {"$set": {"hashed_password": hash_password("kasir123")}}
    )
    print("Password berhasil direset!")
    client.close()

if __name__ == "__main__":
    asyncio.run(reset())