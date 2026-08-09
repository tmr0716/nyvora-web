import os
import logging
from flask import Flask, render_template, send_from_directory
from flask_cors import CORS
from config import Config
from database.models import init_db
from routes.agent import agent_bp
from agent.autonomous import start_all_active_workers

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s in %(module)s: %(message)s'
)

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config.from_object(Config)

# Enable CORS for local API access
CORS(app)

# Initialize database schema
init_db()

# Register API blueprints
app.register_blueprint(agent_bp, url_prefix='/api/agent')

@app.route('/')
def index():
    return render_template('index.html')

# Healthcheck endpoint
@app.route('/api/health', methods=['GET'])
def health():
    return {"status": "ok", "service": "Nyvora Autonomous Engine"}, 200

# On server boot, resume background workers for all active agents
with app.app_context():
    try:
        start_all_active_workers()
    except Exception as e:
        app.logger.error(f"Failed to resume active agent workers on startup: {e}")

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 3000))
    app.run(host='0.0.0.0', port=port, debug=False)
