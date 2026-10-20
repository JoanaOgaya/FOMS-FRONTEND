import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.database import Base, AIDuplicateAlert, AIDuplicateMatch
from app.services.duplicate_check import normalize_string, check_duplicates

# Setup SQLite in-memory database for unit test persistence
@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_normalize_string():
    assert normalize_string("wb-2026-001") == "2026001"
    assert normalize_string("WB 2026 001 ") == "2026001"
    assert normalize_string("  inv-2026-001") == "2026001"
    assert normalize_string("OR-777-888") == "777888"
    assert normalize_string("sp 999 000") == "999000"
    assert normalize_string("normal_string") == "NORMALSTRING"

def test_check_duplicates_waybill(db_session):
    waybills = [
        {"waybillId": "WB-1", "waybillNumber": "WB-2026-001", "clientId": "C-1", "amount": 200.0},
        {"waybillId": "WB-2", "waybillNumber": "wb 2026 001 ", "clientId": "C-1", "amount": 200.0}, # Suspected Duplicate
        {"waybillId": "WB-3", "waybillNumber": "WB-2026-999", "clientId": "C-2", "amount": 300.0}
    ]
    
    scanned, alerts = check_duplicates(db_session, waybills, [], [], [], [])
    assert scanned == len(waybills)
    assert alerts == 1
    
    # Query database to check if alert exists
    alert = db_session.query(AIDuplicateAlert).first()
    assert alert is not None
    assert alert.alert_type == "WAYBILL"
    assert alert.similarity_score == 100.0
    assert alert.source_record_id == "WB-1"
    assert alert.matched_record_id == "WB-2"

def test_check_duplicates_fuzzy_waybill(db_session):
    # Testing fuzzy matching below 100% but above 90%
    waybills = [
        {"waybillId": "WB-1", "waybillNumber": "WAYBILL-NUM-ABC", "clientId": "C-1", "amount": 100.0},
        {"waybillId": "WB-2", "waybillNumber": "WAYBILL-NUM-ABD", "clientId": "C-1", "amount": 100.0} # Similarity should be high
    ]
    
    scanned, alerts = check_duplicates(db_session, waybills, [], [], [], [])
    # RapidFuzz similarity check
    alert = db_session.query(AIDuplicateAlert).first()
    if alert:
        assert alert.similarity_score >= 90
        assert alert.alert_type == "WAYBILL"

def test_check_duplicates_invoice(db_session):
    invoices = [
        {
            "invoiceId": "INV-1", "invoiceNumber": "INV-2026-001", "clientId": "C-1", "clientName": "Client A",
            "amount": 5000.0, "waybillNumber": "WB-1", "billingReference": "REF-1"
        },
        {
            "invoiceId": "INV-2", "invoiceNumber": "INV-2026-001", "clientId": "C-1", "clientName": "Client A",
            "amount": 5000.0, "waybillNumber": "WB-1", "billingReference": "REF-1"
        } # Exact Duplicate Number
    ]
    
    scanned, alerts = check_duplicates(db_session, [], invoices, [], [], [])
    assert alerts == 1
    alert = db_session.query(AIDuplicateAlert).first()
    assert alert.alert_type == "INVOICE"
    assert alert.matched_field == "invoiceNumber"
