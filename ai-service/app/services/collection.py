from typing import List, Dict, Tuple
from sqlalchemy.orm import Session
from app.models.database import AICollectionRun, AICollectionPriority, AIPriorityFactor, AIRecommendation
from datetime import datetime, date
import json
from app.services.foms_client import FomsClient

def calculate_collection_priorities(db: Session, foms_client: FomsClient, trace_id: str = None) -> Tuple[int, int]:
    """
    On-demand generation of collection priorities.
    Fetches latest aging data, accounts receivable, and collection history from FOMS.
    Generates a new AICollectionRun and ranks invoices.
    """
    ar_data = foms_client.get_accounts_receivable()
    collection_history = foms_client.get_collection_history()
    
    # Map collection history by invoiceId
    history_map = {}
    for hist in collection_history:
        inv_id = hist.get("invoiceId")
        if inv_id:
            if inv_id not in history_map:
                history_map[inv_id] = []
            history_map[inv_id].append(hist)
            
    # Create the run
    run = AICollectionRun(
        as_of_date=datetime.utcnow(),
        model_version="1.0.0",
        status="IN_PROGRESS",
        record_count=len(ar_data),
        trace_id=trace_id
    )
    db.add(run)
    db.flush()

    processed_count = 0
    updated_count = 0
    current_date = date(2026, 7, 20) # Current simulated system date

    for ar in ar_data:
        invoice_id = ar["invoiceId"]
        client_id = ar["clientId"]
        outstanding_balance = ar.get("outstandingBalance", 0)
        
        # Parse due date
        due_date_str = ar.get("dueDate", current_date.strftime("%Y-%m-%d"))
        try:
            due_date = datetime.strptime(due_date_str, "%Y-%m-%d").date()
        except ValueError:
            due_date = current_date

        days_overdue = (current_date - due_date).days
        
        # Explainable Rule-Based Scoring
        score = 0.0
        priority_level = "LOW"
        explanation = []
        factors = []

        # Factor 1: High Balance
        is_large_amount = outstanding_balance >= 50000.00
        if is_large_amount:
            score += 40.0
            factors.append({"name": "High Outstanding Balance", "value": f"PHP {outstanding_balance:,.2f}", "contribution": 40.0})
            explanation.append(f"High outstanding balance of PHP {outstanding_balance:,.2f}.")
        else:
            factors.append({"name": "Outstanding Balance", "value": f"PHP {outstanding_balance:,.2f}", "contribution": 0.0})

        # Factor 2: Overdue Status
        if days_overdue > 30:
            score += 50.0
            factors.append({"name": "Severely Overdue", "value": f"{days_overdue} days", "contribution": 50.0})
            explanation.append(f"Invoice is severely overdue by {days_overdue} days.")
            priority_level = "HIGH"
        elif days_overdue > 0:
            score += 30.0
            factors.append({"name": "Overdue", "value": f"{days_overdue} days", "contribution": 30.0})
            explanation.append(f"Invoice is overdue by {days_overdue} days.")
            priority_level = "HIGH" if score >= 70 else "MEDIUM"
        elif 0 <= (due_date - current_date).days <= 7:
            score += 10.0
            factors.append({"name": "Due Soon", "value": f"{(due_date - current_date).days} days left", "contribution": 10.0})
            explanation.append(f"Invoice is due soon.")
            priority_level = "MEDIUM" if score >= 40 else "LOW"
        else:
            factors.append({"name": "Not Due", "value": f"{(due_date - current_date).days} days left", "contribution": 0.0})

        # Factor 3: Collection History (Unresolved)
        inv_history = history_map.get(invoice_id, [])
        unresolved = any(h.get("outcome") == "Unresolved" for h in inv_history)
        if unresolved:
            score += 15.0
            factors.append({"name": "Unresolved History", "value": "Yes", "contribution": 15.0})
            explanation.append("Previous follow-up was unresolved.")
            priority_level = "HIGH" if score >= 60 else priority_level

        # Ensure score is capped
        score = min(score, 100.0)
        
        # Recommendations
        if priority_level == "HIGH":
            rec_text = "Initiate formal collection reminder and escalate."
            notice = "Priority: HIGH based on overdue status and balance."
        elif priority_level == "MEDIUM":
            rec_text = "Send official overdue warning email."
            notice = "Priority: MEDIUM. Monitor closely."
        else:
            rec_text = "Monitor invoice aging."
            notice = "Priority: LOW. No immediate action required."

        # Save Priority Result
        priority = AICollectionPriority(
            run_id=run.id,
            invoice_id=invoice_id,
            client_id=client_id,
            score=score,
            priority=priority_level,
            explanation=" ".join(explanation) if explanation else "Invoice is current and in good standing."
        )
        db.add(priority)
        db.flush()
        
        # Save Factors
        for f in factors:
            factor_rec = AIPriorityFactor(
                priority_result_id=priority.id,
                factor_name=f["name"],
                factor_value=str(f["value"]),
                contribution=f["contribution"]
            )
            db.add(factor_rec)
            
        # Save Recommendation
        recommendation = AIRecommendation(
            priority_result_id=priority.id,
            recommendation_text=rec_text,
            decision_support_notice=notice,
            status="Pending Review"
        )
        db.add(recommendation)

        processed_count += 1
        updated_count += 1

    run.status = "COMPLETED"
    db.commit()
    return processed_count, updated_count
