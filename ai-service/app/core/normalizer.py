import re

def normalize_reference(value: str | None) -> str:
    if not value:
        return ""

    normalized = value.strip().upper()
    # Replace spaces and underscores with hyphens
    normalized = re.sub(r"[_\s]+", "-", normalized)
    # Condense multiple consecutive hyphens to a single hyphen
    normalized = re.sub(r"-+", "-", normalized)
    # Remove all characters except A-Z, 0-9, and hyphens
    normalized = re.sub(r"[^A-Z0-9-]", "", normalized)

    return normalized

def normalize_invoice(value: str | None) -> str:
    normalized = normalize_reference(value)
    if not normalized:
        return ""
    
    # Strip all hyphens to examine alphanumeric parts
    compact = normalized.replace("-", "")
    
    # Matches INV + 4-digit year + sequence (e.g., INV2026001)
    match = re.match(r"^INV(\d{4})(\d+)$", compact)
    if not match:
        return normalized
        
    year, sequence = match.groups()
    return f"INV-{year}-{sequence.zfill(3)}"
