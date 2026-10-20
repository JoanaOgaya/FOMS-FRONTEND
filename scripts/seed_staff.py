"""
Seed staff users (EMP-001 to EMP-006) into the foms_ai_db PostgreSQL database.
Run from within the project directory or via docker exec.
"""
import psycopg2
import bcrypt

CONN_STR = "postgresql://postgres:hanamarie@localhost:5432/foms_ai_db"

staff = [
    ("EMP-001", "Crystalyn Joyce C. Fajardo",  "Financial Manager"),
    ("EMP-002", "Mariel Maricel Anonuevo",     "Head Accountant"),
    ("EMP-003", "Misty",                       "Accountant"),
    ("EMP-004", "Joana Marie Chan Ogaya",      "Coordinator"),
    ("EMP-005", "Hannah Marie Estrera",        "Assistant of Financial Manager"),
    ("EMP-006", "Client",                      "Client"),
]

PASSWORD = "Password@123"
hashed   = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt()).decode()

conn = psycopg2.connect(CONN_STR)
cur  = conn.cursor()

# Get columns so we know what's required
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='users'")
cols = [r[0] for r in cur.fetchall()]
print("Columns:", cols)

for login_id, full_name, role_name in staff:
    cur.execute("SELECT login_id FROM users WHERE login_id = %s", (login_id,))
    if cur.fetchone():
        print(f"  SKIP {login_id} (already exists)")
        continue

    # Build insert based on available columns
    insert_cols  = ["login_id", "full_name", "role_name", "password_hash"]
    insert_vals  = [login_id, full_name, role_name, hashed]

    if "password_version" in cols:
        insert_cols.append("password_version"); insert_vals.append(2)
    if "must_change_password" in cols:
        insert_cols.append("must_change_password"); insert_vals.append(False)
    if "is_temporary_password" in cols:
        insert_cols.append("is_temporary_password"); insert_vals.append(False)
    if "is_active" in cols:
        insert_cols.append("is_active"); insert_vals.append(True)
    if "email" in cols:
        insert_cols.append("email")
        insert_vals.append(f"{login_id.lower()}@speedex.com")

    placeholders = ", ".join(["%s"] * len(insert_cols))
    col_str      = ", ".join(insert_cols)
    cur.execute(f"INSERT INTO users ({col_str}) VALUES ({placeholders})", insert_vals)
    print(f"  INSERT {login_id} ({role_name})")

conn.commit()
cur.close()
conn.close()
print("\nDone! Staff users seeded successfully.")
