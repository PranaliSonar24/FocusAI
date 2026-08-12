import argparse
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://focus_user:focus_password@localhost:5432/focus_db"
engine = create_async_engine(DATABASE_URL, echo=False)

async def create_admin(username, password, full_name, email):
    async with engine.begin() as conn:
        # Check if user exists
        res = await conn.execute(text("SELECT id FROM users WHERE username = :u"), {"u": username})
        if res.fetchone():
            print(f"❌ Error: User '{username}' already exists.")
            return

        # Insert user with Role 2 (Host) which has Admin dashboard access
        await conn.execute(text(
            "INSERT INTO users (username, password, full_name, email, role_id) VALUES (:u, :p, :f, :e, 2)"
        ), {"u": username, "p": password, "f": full_name, "e": email})
        
        print(f"✅ Successfully created Admin account for: {full_name}")
        print(f"   Username: {username}")
        print(f"   Password: {password}")
        print(f"   They can now log in to the dashboard using these credentials!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create a new Admin/Host account for a school or college.")
    parser.add_argument("--username", required=True, help="Username for the new admin (e.g., bits_pilani)")
    parser.add_argument("--password", required=True, help="Password for the new admin")
    parser.add_argument("--name", required=True, help="Full Name of the school or admin (e.g., 'BITS Pilani Admin')")
    parser.add_argument("--email", required=True, help="Email address")
    
    args = parser.parse_args()
    
    asyncio.run(create_admin(args.username, args.password, args.name, args.email))
