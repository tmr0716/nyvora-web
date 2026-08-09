import os
from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'nyvora-default-secret-key-2026')
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
    AGENT_INTERVAL_MINUTES = int(os.environ.get('AGENT_INTERVAL_MINUTES', '1'))
    EDITORIAL_THRESHOLD = int(os.environ.get('EDITORIAL_THRESHOLD', '75'))
    PORT = int(os.environ.get('PORT', '3000'))
