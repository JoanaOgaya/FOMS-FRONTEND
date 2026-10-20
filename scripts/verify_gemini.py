import os
import json
import urllib.request
import urllib.parse

key = os.getenv("GEMINI_API_KEY", "")
model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
payload = json.dumps({
    "contents": [{
        "parts": [{"text": "Return JSON {\"ok\": true}"}]
    }],
    "generationConfig": {
        "responseMimeType": "application/json"
    }
}).encode()

req = urllib.request.Request(
    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={urllib.parse.quote(key)}",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)

try:
    with urllib.request.urlopen(req, timeout=40) as r:
        print("status=", r.status)
        print(r.read(400).decode())
except Exception as e:
    body = e.read().decode() if hasattr(e, "read") else str(e)
    print("error=", type(e).__name__)
    print(body[:400])
