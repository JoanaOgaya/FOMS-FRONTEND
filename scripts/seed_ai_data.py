import psycopg2
import json
from datetime import datetime

CONN_STR = "postgresql://postgres:Crystalyn Joyce@localhost:5432/foms_ai_db"

def seed_ai_data():
    try:
        conn = psycopg2.connect(CONN_STR)
        cur = conn.cursor()
        
        cur.execute("TRUNCATE TABLE ai_collection_runs, ai_collection_priorities, ai_duplicate_alerts, ai_audit_events CASCADE;")
        
        # Insert a collection run
        cur.execute("""
            INSERT INTO ai_collection_runs (as_of_date, model_version, status, record_count, generated_at, trace_id)

            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id;
        """, (datetime.utcnow(), 'v1.0.0', 'Completed', 10, datetime.utcnow(), 'trace-12345'))
        run_id = cur.fetchone()[0]

        # Insert collection priorities
        cur.execute("""
            INSERT INTO ai_collection_priorities (run_id, invoice_id, client_id, score, priority, explanation, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (run_id, 'INV-2026-001', 'CLI-001', 85.5, 'High', 'High risk of default based on payment history', datetime.utcnow()))
        
        cur.execute("""
            INSERT INTO ai_collection_priorities (run_id, invoice_id, client_id, score, priority, explanation, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (run_id, 'INV-2026-002', 'CLI-002', 45.0, 'Medium', 'Average risk, regular follow-up needed', datetime.utcnow()))

        # Insert duplicate alerts
        cur.execute("""
            INSERT INTO ai_duplicate_alerts (alert_type, source_record_id, matched_record_id, confidence_score, severity, matched_fields, match_reason, status, created_at, output_version, trace_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, ('Invoice Duplicate', 'INV-2026-003', 'INV-2026-003-COPY', 98.5, 'High', json.dumps(['amount', 'client_id', 'date']), 'Exact match on amount and client within same week', 'Pending Review', datetime.utcnow(), 'v1.0.0', 'trace-67890'))

        # Insert an audit event
        cur.execute("""
            INSERT INTO ai_audit_events (event_id, occurred_at, user_id, full_name, role_name, event_type, action_description, related_record_type, source_reference, result, ip_address)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, ('EVT-001', datetime.utcnow(), 'EMP-001', 'Demo User', 'Financial Manager', 'Manual Seed', 'Seeded initial AI dashboard data', 'System', 'Seed Script', 'SUCCESS', '127.0.0.1'))

        conn.commit()
        print("Successfully seeded AI Dashboard data into foms_ai_db!")
    except Exception as e:
        print(f"Error seeding database: {e}")
    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()

if __name__ == "__main__":
    seed_ai_data()
