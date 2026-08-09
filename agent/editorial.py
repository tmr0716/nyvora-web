import os
import json
import logging
from google import genai
from google.genai import types
from agent.memory import is_duplicate_or_similar
from database.models import record_decision

logger = logging.getLogger("nyvora.editorial")

def get_gemini_client():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY not found in environment.")
        return None
    try:
        client = genai.Client(
            api_key=api_key,
            http_options={'headers': {'User-Agent': 'aistudio-build'}}
        )
        return client
    except Exception as e:
        logger.error(f"Failed to initialize Gemini client: {e}")
        return None

def evaluate_candidates(agent, candidates):
    """
    Evaluates each candidate topic.
    Returns (selected_candidate, evaluated_count, rejected_count, evaluations_list)
    """
    agent_id = agent["id"]
    agent_name = agent.get("name", "Nyvora")
    domain = agent.get("domain", "AI & Technology")
    interests = agent.get("interests", "AI agents, LLMs, AI security, AI infrastructure")
    instructions = agent.get("instructions", "Focus on technical depth and avoid hype.")
    threshold = int(os.environ.get("EDITORIAL_THRESHOLD", "75"))

    client = get_gemini_client()
    evaluations = []
    
    for candidate in candidates:
        title = candidate["title"]
        summary = candidate["summary"]
        source_url = candidate["url"]
        
        # 1. Check SQLite Memory for duplicates first
        is_dup, dup_reason = is_duplicate_or_similar(agent_id, title, summary)
        if is_dup:
            score = 45
            decision = "REJECTED"
            reason = f"Memory Check: {dup_reason}"
            record_decision(agent_id, title, decision, score, reason, source_url)
            evaluations.append({
                "candidate": candidate,
                "score": score,
                "decision": decision,
                "reason": reason
            })
            continue

        # 2. Score candidate using Gemini or heuristic scoring fallback
        score = 70
        reason = "Evaluated against editorial guidelines."
        
        if client:
            prompt = f"""
You are the Chief Editorial Director for {agent_name}, an autonomous AI technology observer focused on {domain}.

AGENT INTERESTS: {interests}
EDITORIAL INSTRUCTIONS: {instructions}

CANDIDATE TOPIC TO EVALUATE:
Title: {title}
Summary: {summary}
Source: {candidate.get('source', 'Web Feed')}

Evaluate this topic on a scale of 0 to 100 based on:
1. Technical Significance & Architecture Impact
2. Relevance to persona and domain ({domain})
3. Novelty & Timeliness
4. Non-promotional, non-hype value
5. Practical usefulness for developers/researchers

Provide your evaluation as valid JSON only:
{{
  "score": <integer 0-100>,
  "reason": "<1-2 sentence explanation of why it scored this way and why it should be published or rejected>"
}}
"""
            try:
                response = client.models.generateContent(
                    model="gemini-3.6-flash",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.2
                    )
                )
                if response and response.text:
                    data = json.loads(response.text.strip())
                    score = int(data.get("score", 70))
                    reason = data.get("reason", "Evaluated by AI Editorial engine.")
            except Exception as e:
                logger.warning(f"Gemini evaluation fallback for '{title}': {e}")
                # Fallback rule-based score adjustment
                if "open source" in title.lower() or "architecture" in title.lower() or "arxiv" in candidate.get("source", "").lower():
                    score = 88
                    reason = "High technical novelty and developer relevance."
                elif "promotional" in summary.lower() or "announcing" in title.lower():
                    score = 60
                    reason = "Primarily promotional announcement lacking technical depth."
                else:
                    score = 78
                    reason = "Meets core technical relevance criteria."

        # Decision threshold check
        if score >= threshold:
            decision = "PUBLISHED"
        else:
            decision = "REJECTED"

        record_decision(agent_id, title, decision, score, reason, source_url)
        evaluations.append({
            "candidate": candidate,
            "score": score,
            "decision": decision,
            "reason": reason
        })

    # Sort candidates by score descending
    evaluations.sort(key=lambda x: x["score"], reverse=True)
    
    # Select top candidate if it meets threshold
    selected = None
    rejected_count = 0
    for ev in evaluations:
        if ev["decision"] == "PUBLISHED" and selected is None:
            selected = ev
        else:
            rejected_count += 1
            
    evaluated_count = len(candidates)
    return selected, evaluated_count, rejected_count, evaluations
