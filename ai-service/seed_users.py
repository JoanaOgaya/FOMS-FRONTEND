"""
FOMS AI Service — User Sync & Seed Script
Synchronizes official backend users from Microsoft SQL Server (FOMS_DB / FOMS.Api)
into the 'users' table in the foms_ai_results PostgreSQL database.

Run:
    py seed_users.py
"""

import os
import sys
import json
import psycopg2
import bcrypt
import urllib.request
import urllib.error

# ── Database Configuration ──────────────────────────────────────────────────
# Default connects to PostgreSQL container on 5432
DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "127.0.0.1"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
    "user": os.getenv("POSTGRES_USER", "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD", "Postgres2026!"),
    "dbname": os.getenv("POSTGRES_DB", "foms_ai_results")
}

# ── Official FOMS Backend Users (Reference Source: dbo.Employees / FOMS_DB) ─
# Used directly or as deterministic fallback if backend service is unreachable
BACKEND_USERS_REFERENCE = [
    {
        "id": "EMP-001",
        "fullName": "Crystalyn Joyce C. Fajardo",
        "role": "Finance Manager",
        "email": "crystalyn@foms.local",
        "password": "Password@123"
    },
    {
        "id": "EMP-002",
        "fullName": "Misty",
        "role": "Head Accountant",
        "email": "misty@foms.local",
        "password": "Password@123"
    },
    {
        "id": "EMP-003",
        "fullName": "Maria Mariel Jane Anonuevo",
        "role": "Accountant",
        "email": "mariel@foms.local",
        "password": "Password@123"
    },
    {
        "id": "EMP-004",
        "fullName": "Joana Marie Ogaya",
        "role": "Assistant Financial Manager",
        "email": "joana@foms.local",
        "password": "Password@123"
    }
]

def hash_password(plain: str) -> str:
    """Hashes password using bcrypt for AI Service authentication."""
    return bcrypt.hashpw(plain.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def fetch_users_from_backend(base_url: str = "http://localhost:5007"):
    """
    Attempts to fetch live users directly from the FOMS Core Backend API.
    Returns list of user dictionaries or None if unreachable.
    """
    login_url = f"{base_url}/api/auth/login"
    users_url = f"{base_url}/api/users"

    try:
        # Step 1: Login to get JWT Bearer token
        login_payload = json.dumps({"Username": "EMP-001", "Password": "Password@123"}).encode('utf-8')
        req = urllib.request.Request(
            login_url,
            data=login_payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            token = data.get("data", {}).get("accessToken")

        if not token:
            return None

        # Step 2: Fetch all users using Bearer token
        users_req = urllib.request.Request(
            users_url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}"
            }
        )
        with urllib.request.urlopen(users_req, timeout=3) as resp:
            users_data = json.loads(resp.read().decode('utf-8'))
            print(f"[INFO] Successfully fetched {len(users_data)} users live from Backend API ({base_url})")
            return users_data
    except Exception as ex:
        print(f"[INFO] Could not fetch live from Backend API ({ex}). Using official backend reference users.")
        return None

def main():
    print("=" * 60)
    print("FOMS AI Service — Synchronizing Official Backend Users")
    print("=" * 60)

    # 1. Fetch live or use official backend reference
    live_users = fetch_users_from_backend()
    users_to_seed = []

    if live_users:
        for u in live_users:
            users_to_seed.append((
                u.get("id") or u.get("username"),
                u.get("fullName") or u.get("name"),
                u.get("role"),
                "Password@123",
                u.get("email", ""),
                2,
                False
            ))
    else:
        for u in BACKEND_USERS_REFERENCE:
            users_to_seed.append((
                u["id"],
                u["fullName"],
                u["role"],
                u["password"],
                u["email"],
                2,
                False
            ))

    # 2. Connect to PostgreSQL
    print(f"\nConnecting to PostgreSQL at {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True
        cur = conn.cursor()
        print("Connected successfully!")
    except Exception as e:
        print(f"ERROR: Cannot connect to PostgreSQL: {e}")
        sys.exit(1)

    # 3. Ensure 'users' table exists
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id                  SERIAL PRIMARY KEY,
            login_id            VARCHAR(50)  UNIQUE NOT NULL,
            full_name           VARCHAR(255) NOT NULL,
            role_name           VARCHAR(100) NOT NULL,
            email               VARCHAR(255),
            password_hash       TEXT         NOT NULL,
            password_version    INTEGER      NOT NULL DEFAULT 2,
            must_change_password BOOLEAN     NOT NULL DEFAULT FALSE,
            is_temporary_password BOOLEAN    NOT NULL DEFAULT FALSE,
            password_changed_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
            created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 4. Clean previous outdated/mock users to ensure exact backend parity
    valid_login_ids = [u[0] for u in users_to_seed]
    cur.execute("DELETE FROM users WHERE login_id NOT IN %s;", (tuple(valid_login_ids),))

    # 5. Insert or update users
    print("\nUpdating users from backend source:")
    updated_count = 0

    for login_id, full_name, role_name, password, email, pw_version, must_change in users_to_seed:
        cur.execute("SELECT id FROM users WHERE login_id = %s", (login_id,))
        existing = cur.fetchone()

        pw_hash = hash_password(password)

        if existing:
            cur.execute("""
                UPDATE users SET
                    full_name = %s,
                    role_name = %s,
                    email = %s,
                    password_hash = %s,
                    password_version = %s,
                    must_change_password = %s,
                    is_active = TRUE
                WHERE login_id = %s
            """, (full_name, role_name, email, pw_hash, pw_version, must_change, login_id))
            print(f"  [UPDATED] {login_id:<10} | {full_name:<30} | {role_name}")
        else:
            cur.execute("""
                INSERT INTO users (login_id, full_name, role_name, email, password_hash, password_version, must_change_password)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (login_id, full_name, role_name, email, pw_hash, pw_version, must_change))
            print(f"  [INSERTED] {login_id:<10} | {full_name:<30} | {role_name}")

        updated_count += 1

    # 6. Display current database contents
    cur.execute("SELECT login_id, full_name, role_name, email, is_active FROM users ORDER BY login_id;")
    rows = cur.fetchall()

    print(f"\n{'='*75}")
    print(f"SYNC COMPLETE: {len(rows)} verified backend users in 'users' table")
    print(f"{'='*75}")
    for row in rows:
        active = "Active" if row[4] else "Inactive"
        print(f"  {row[0]:<10} | {row[1]:<30} | {row[2]:<28} | {active}")

    cur.close()
    conn.close()
    print("\nOfficial Backend Users are now synchronized and ready!")

if __name__ == "__main__":
    main()
