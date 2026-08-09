import sqlite3
import os
import json
import uuid
from datetime import datetime, timezone

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
DB_PATH = os.path.join(DB_DIR, 'nyvora.db')

def get_db():
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Agents table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT NOT NULL,
        interests TEXT,
        voice TEXT,
        instructions TEXT,
        interval_minutes INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        status TEXT DEFAULT 'AUTONOMOUS',
        last_cycle TEXT,
        next_cycle TEXT,
        topics_discovered INTEGER DEFAULT 0,
        topics_evaluated INTEGER DEFAULT 0,
        topics_rejected INTEGER DEFAULT 0,
        topics_published INTEGER DEFAULT 0
    )
    ''')

    # Posts table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        text TEXT NOT NULL,
        rationale TEXT NOT NULL,
        sources TEXT NOT NULL,
        category TEXT,
        editorial_score INTEGER,
        FOREIGN KEY (agent_id) REFERENCES agents (id)
    )
    ''')

    # Editorial decisions table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS editorial_decisions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        title TEXT NOT NULL,
        decision TEXT NOT NULL,
        score INTEGER NOT NULL,
        reason TEXT NOT NULL,
        source_url TEXT,
        FOREIGN KEY (agent_id) REFERENCES agents (id)
    )
    ''')

    # Activity logs table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        event TEXT NOT NULL,
        details TEXT,
        FOREIGN KEY (agent_id) REFERENCES agents (id)
    )
    ''')

    # Memory table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        topic_title TEXT NOT NULL,
        status TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        keywords TEXT,
        FOREIGN KEY (agent_id) REFERENCES agents (id)
    )
    ''')

    conn.commit()
    conn.close()

def create_agent(name, domain, interests="", voice="Technical & Analytical", instructions="", interval_minutes=1):
    init_db()
    conn = get_db()
    cursor = conn.cursor()
    agent_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    
    cursor.execute('''
    INSERT INTO agents (id, name, domain, interests, voice, instructions, interval_minutes, created_at, status, last_cycle, next_cycle)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        agent_id,
        name,
        domain,
        interests,
        voice,
        instructions,
        interval_minutes,
        now_iso,
        'AUTONOMOUS',
        None,
        now_iso
    ))
    conn.commit()
    conn.close()
    
    log_activity(agent_id, "Agent Created", f"Persona: {name} | Domain: {domain}")
    return agent_id

def get_agent(agent_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM agents WHERE id = ?', (agent_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def get_all_agents():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM agents')
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_agent_direction(agent_id, new_instructions):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE agents SET instructions = ? WHERE id = ?', (new_instructions, agent_id))
    conn.commit()
    conn.close()
    log_activity(agent_id, "Direction Updated", f"New instructions: {new_instructions[:100]}")

def update_agent_cycle_info(agent_id, last_cycle, next_cycle, disc_add=0, eval_add=0, rej_add=0, pub_add=0):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
    UPDATE agents 
    SET last_cycle = ?,
        next_cycle = ?,
        topics_discovered = topics_discovered + ?,
        topics_evaluated = topics_evaluated + ?,
        topics_rejected = topics_rejected + ?,
        topics_published = topics_published + ?
    WHERE id = ?
    ''', (last_cycle, next_cycle, disc_add, eval_add, rej_add, pub_add, agent_id))
    conn.commit()
    conn.close()

def save_post(agent_id, text, rationale, sources, category="AI & Tech", editorial_score=85):
    conn = get_db()
    cursor = conn.cursor()
    post_id = f"p-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    sources_json = json.dumps(sources) if isinstance(sources, list) else json.dumps([sources])
    
    cursor.execute('''
    INSERT INTO posts (id, agent_id, created_at, text, rationale, sources, category, editorial_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (post_id, agent_id, now_iso, text, rationale, sources_json, category, editorial_score))
    
    conn.commit()
    conn.close()
    log_activity(agent_id, "Post Published", f"Post ID: {post_id} | Score: {editorial_score}")
    return post_id

def get_posts(agent_id, limit=50):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
    SELECT id, created_at AS createdAt, text, rationale, sources, category, editorial_score
    FROM posts 
    WHERE agent_id = ? 
    ORDER BY created_at DESC, id DESC 
    LIMIT ?
    ''', (agent_id, limit))
    rows = cursor.fetchall()
    conn.close()
    
    posts = []
    for r in rows:
        post_dict = dict(r)
        try:
            post_dict['sources'] = json.loads(post_dict['sources'])
        except Exception:
            post_dict['sources'] = [post_dict['sources']]
        posts.append(post_dict)
    return posts

def record_decision(agent_id, title, decision, score, reason, source_url=""):
    conn = get_db()
    cursor = conn.cursor()
    decision_id = f"dec-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    
    cursor.execute('''
    INSERT INTO editorial_decisions (id, agent_id, timestamp, title, decision, score, reason, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (decision_id, agent_id, now_iso, title, decision, score, reason, source_url))
    
    # Save to memory
    keywords = " ".join([w.lower() for w in title.split() if len(w) > 3])
    cursor.execute('''
    INSERT INTO memory (agent_id, topic_title, status, timestamp, keywords)
    VALUES (?, ?, ?, ?, ?)
    ''', (agent_id, title, decision, now_iso, keywords))
    
    conn.commit()
    conn.close()

def get_decisions(agent_id, limit=20):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
    SELECT * FROM editorial_decisions 
    WHERE agent_id = ? 
    ORDER BY datetime(timestamp) DESC 
    LIMIT ?
    ''', (agent_id, limit))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def log_activity(agent_id, event, details=""):
    conn = get_db()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute('''
    INSERT INTO activity_logs (agent_id, timestamp, event, details)
    VALUES (?, ?, ?, ?)
    ''', (agent_id, now_iso, event, details))
    conn.commit()
    conn.close()

def get_activity_logs(agent_id, limit=30):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
    SELECT * FROM activity_logs 
    WHERE agent_id = ? 
    ORDER BY id DESC 
    LIMIT ?
    ''', (agent_id, limit))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_memory(agent_id, limit=30):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
    SELECT * FROM memory 
    WHERE agent_id = ? 
    ORDER BY id DESC 
    LIMIT ?
    ''', (agent_id, limit))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]
