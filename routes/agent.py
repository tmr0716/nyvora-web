from flask import Blueprint, request, jsonify
from database.models import (
    create_agent, get_agent, get_posts, get_decisions,
    get_activity_logs, get_memory, update_agent_direction
)
from agent.autonomous import start_agent_worker

agent_bp = Blueprint('agent_bp', __name__)

@agent_bp.route('/init', methods=['POST'])
def init_agent():
    data = request.get_json(silent=True) or {}
    
    persona = data.get('persona')
    if not persona or not isinstance(persona, dict):
        return jsonify({"error": "Invalid persona object"}), 400
        
    name = persona.get('name')
    domain = persona.get('domain')
    
    if not name or not domain:
        return jsonify({"error": "Persona name and domain are required"}), 400
        
    interests = data.get('interests', 'AI agents, LLMs, AI security, AI infrastructure, open-source AI, developer tools, robotics')
    voice = data.get('voice', 'Technical & Analytical')
    instructions = data.get('instructions', 'Focus on meaningful technical developments. Avoid generic AI hype, repetitive announcements and purely promotional content.')
    
    interval_minutes = data.get('interval_minutes', 1)
    try:
        interval_minutes = int(interval_minutes)
        if interval_minutes < 1:
            interval_minutes = 1
    except Exception:
        interval_minutes = 1

    # 1. Create and persist agent in SQLite
    agent_id = create_agent(
        name=name,
        domain=domain,
        interests=interests,
        voice=voice,
        instructions=instructions,
        interval_minutes=interval_minutes
    )

    # 2. Start autonomous background worker process/thread
    start_agent_worker(agent_id)

    # 3. Return unique agentId immediately
    return jsonify({"agentId": agent_id}), 200

@agent_bp.route('/feed', methods=['GET'])
def get_feed():
    agent_id = request.args.get('agentId')
    if not agent_id:
        return jsonify({"error": "agentId parameter is required"}), 400
        
    agent = get_agent(agent_id)
    if not agent:
        # If unknown agent ID, return empty feed per spec
        return jsonify({"posts": []}), 200

    # READ ONLY - Reads persisted posts from SQLite
    posts = get_posts(agent_id)
    
    # Clean output formatting
    clean_posts = []
    for p in posts:
        clean_posts.append({
            "id": p["id"],
            "createdAt": p["createdAt"],
            "text": p["text"],
            "rationale": p["rationale"],
            "sources": p["sources"] if isinstance(p["sources"], list) else [p["sources"]],
            "category": p.get("category", "AI & Tech"),
            "editorial_score": p.get("editorial_score", 85)
        })

    return jsonify({"posts": clean_posts}), 200

@agent_bp.route('/metrics', methods=['GET'])
def get_metrics():
    agent_id = request.args.get('agentId')
    if not agent_id:
        return jsonify({"error": "agentId parameter is required"}), 400
        
    agent = get_agent(agent_id)
    if not agent:
        return jsonify({"error": "Agent not found"}), 404

    disc = agent.get("topics_discovered", 0)
    eval_c = agent.get("topics_evaluated", 0)
    rej = agent.get("topics_rejected", 0)
    pub = agent.get("topics_published", 0)

    selectivity_rate = round((rej / eval_c * 100), 1) if eval_c > 0 else 0.0

    return jsonify({
        "agentId": agent_id,
        "name": agent.get("name"),
        "domain": agent.get("domain"),
        "status": agent.get("status", "AUTONOMOUS"),
        "topics_discovered": disc,
        "topics_evaluated": eval_c,
        "topics_rejected": rej,
        "topics_published": pub,
        "selectivity_rate": f"{selectivity_rate}%",
        "last_cycle": agent.get("last_cycle"),
        "next_cycle": agent.get("next_cycle"),
        "interval_minutes": agent.get("interval_minutes")
    }), 200

@agent_bp.route('/decisions', methods=['GET'])
def get_agent_decisions():
    agent_id = request.args.get('agentId')
    if not agent_id:
        return jsonify({"error": "agentId parameter is required"}), 400
        
    decisions = get_decisions(agent_id, limit=20)
    return jsonify({"decisions": decisions}), 200

@agent_bp.route('/activity', methods=['GET'])
def get_agent_activity():
    agent_id = request.args.get('agentId')
    if not agent_id:
        return jsonify({"error": "agentId parameter is required"}), 400
        
    logs = get_activity_logs(agent_id, limit=30)
    return jsonify({"activities": logs}), 200

@agent_bp.route('/memory', methods=['GET'])
def get_agent_memory():
    agent_id = request.args.get('agentId')
    if not agent_id:
        return jsonify({"error": "agentId parameter is required"}), 400
        
    memory_items = get_memory(agent_id, limit=30)
    return jsonify({"memory": memory_items}), 200

@agent_bp.route('/direction', methods=['POST'])
def update_direction():
    data = request.get_json(silent=True) or {}
    agent_id = data.get('agentId')
    instructions = data.get('instructions')
    
    if not agent_id or not instructions:
        return jsonify({"error": "agentId and instructions are required"}), 400
        
    agent = get_agent(agent_id)
    if not agent:
        return jsonify({"error": "Agent not found"}), 404
        
    update_agent_direction(agent_id, instructions)
    return jsonify({"status": "success", "message": "Editorial direction updated."}), 200
