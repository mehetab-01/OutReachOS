import os
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
from fastapi import Header, HTTPException
from dotenv import load_dotenv

load_dotenv()

_sa_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "firebase-service-account.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(_sa_path)
    firebase_admin.initialize_app(cred)


async def get_current_user(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded  # has uid, email, name, picture
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Firebase token: {e}")
