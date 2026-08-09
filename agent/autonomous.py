import time
import threading
import logging
from datetime import datetime, timezone, timedelta
from database.models import (
    get_agent, get_all_agents, update_agent_cycle_info, log_activity
)
from agent.discovery import discover_topics
from agent.editorial import evaluate_candidates
from agent.writer import generate_post

logger = logging.getLogger("nyvora.autonomous")

# Global dict of active thread locks to prevent duplicate background workers
_running_workers = {}
_worker_lock = threading.Lock()

def run_agent_cycle(agent_id):
    """
    Executes a single autonomous research & editorial cycle for an agent.
    """
    agent = get_agent(agent_id)
    if not agent:
        logger.error(f"Agent {agent_id} not found.")
        return

    interval_mins = agent.get("interval_minutes", 1) or 1
    now_dt = datetime.now(timezone.utc)
    next_dt = now_dt + timedelta(minutes=interval_mins)
    
    now_iso = now_dt.isoformat()
    next_iso = next_dt.isoformat()

    log_activity(agent_id, "Research cycle started", f"Interval: {interval_mins} min | Domain: {agent.get('domain')}")

    try:
        # 1. Live Discovery
        log_activity(agent_id, "Sources queried", "Fetching Hacker News, ArXiv CS.AI, GitHub Trending & Research Feeds")
        candidates = discover_topics(agent)
        disc_count = len(candidates)
        log_activity(agent_id, "Candidates discovered", f"{disc_count} live topics aggregated")

        if not candidates:
            log_activity(agent_id, "Cycle complete", "No candidates discovered this cycle")
            update_agent_cycle_info(agent_id, now_iso, next_iso, 0, 0, 0, 0)
            return

        # 2. Editorial Evaluation & Scoring
        log_activity(agent_id, "Editorial evaluation started", f"Scoring candidates against persona and instructions")
        selected_eval, eval_count, rej_count, evaluations = evaluate_candidates(agent, candidates)

        # 3. Decision & Post Generation
        pub_count = 0
        if selected_eval:
            pub_count = 1
            cand_title = selected_eval["candidate"]["title"]
            score = selected_eval["score"]
            log_activity(agent_id, "Memory checked & topic selected", f"Selected '{cand_title[:60]}' (Score: {score})")
            
            log_activity(agent_id, "Post generation started", "Generating intelligence analysis and editorial rationale via Gemini")
            post_id, text, rationale, sources = generate_post(agent, selected_eval, evaluations)
            log_activity(agent_id, "Post persisted to database", f"Post ID: {post_id} | Score: {score}")
        else:
            log_activity(agent_id, "Cycle complete", f"All {eval_count} candidates rejected (< 75 threshold or duplicate)")

        # 4. Update agent metrics in SQLite
        update_agent_cycle_info(
            agent_id=agent_id,
            last_cycle=now_iso,
            next_cycle=next_iso,
            disc_add=disc_count,
            eval_add=eval_count,
            rej_add=rej_count,
            pub_add=pub_count
        )

        log_activity(agent_id, "Next cycle scheduled", f"Scheduled for {next_iso}")

    except Exception as e:
        logger.exception(f"Error during autonomous cycle for agent {agent_id}: {e}")
        log_activity(agent_id, "Cycle error", str(e))
        update_agent_cycle_info(agent_id, now_iso, next_iso, 0, 0, 0, 0)

def _worker_loop(agent_id):
    """
    Infinite background loop for an active agent worker.
    """
    logger.info(f"Starting autonomous worker loop for agent {agent_id}")
    
    # Run the first cycle immediately upon initialization
    run_agent_cycle(agent_id)
    
    while True:
        try:
            agent = get_agent(agent_id)
            if not agent or agent.get("status") != "AUTONOMOUS":
                logger.info(f"Agent {agent_id} stopped or removed. Exiting worker loop.")
                break
                
            interval_mins = agent.get("interval_minutes", 1) or 1
            sleep_seconds = max(20, interval_mins * 60)
            
            time.sleep(sleep_seconds)
            
            run_agent_cycle(agent_id)

        except Exception as e:
            logger.exception(f"Exception in worker loop for {agent_id}: {e}")
            time.sleep(30)

def start_agent_worker(agent_id):
    """
    Launches a daemon background thread for the given agent if not already running.
    """
    with _worker_lock:
        if agent_id in _running_workers and _running_workers[agent_id].is_alive():
            logger.info(f"Worker for agent {agent_id} is already running.")
            return False

        t = threading.Thread(target=_worker_loop, args=(agent_id,), daemon=True, name=f"NyvoraWorker-{agent_id[:8]}")
        _running_workers[agent_id] = t
        t.start()
        logger.info(f"Launched autonomous thread for agent {agent_id}.")
        return True

def start_all_active_workers():
    """
    Called on server startup to resume all persisted agents from SQLite.
    """
    agents = get_all_agents()
    for agent in agents:
        if agent.get("status") == "AUTONOMOUS":
            start_agent_worker(agent["id"])
