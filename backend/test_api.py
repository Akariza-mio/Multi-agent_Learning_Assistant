import requests

data = {
    "message": "test",
    "session_id": "123",
    "current_profile": None,
    "image_base64": None
}

res = requests.post("http://127.0.0.1:8000/api/chat", json=data)
print("Status:", res.status_code)
print("Response:", res.text)
