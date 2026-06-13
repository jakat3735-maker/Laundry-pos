import asyncio
import os
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception as e:
        print(f"Verify error: {e}")
        return False

async def debug():
    load_dotenv(Path(__file__).parent / ".env")
    client = AsyncIOMotorClient(os.getenv("MONGO_URL"))
    db = client[os.getenv("DB_NAME", "laundry_db")]
    
    email = "owner@laundry.com"
    password = "owner123"
    
    user = await db.users.find_one({"email": email})
    if not user:
        print(f"User {email} not found in DB!")
        return

    stored_hash = user.get("hashed_password")
    print(f"User found: {user.get('email')}")
    print(f"Stored hash: {stored_hash}")
    
    is_valid = verify_password(password, stored_hash)
    print(f"Manual verification for '{password}': {is_valid}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(debug())
