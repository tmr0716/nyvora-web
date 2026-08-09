import os
import json
import logging
from google import genai
from google.genai import types
from database.models import save_post

logger = logging.getLogger("nyvora.writer")

def get_gemini_client():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        client = genai.Client(
            api_key=api_key,
            http_options={'headers': {'User-Agent': 'aistudio-build'}}
        )
        return client
    except Exception as e:
        logger.error(f"Failed to initialize Gemini writer client: {e}")
        return None

def generate_post(agent, selected_evaluation, other_evaluations):
    """
    Generates a post with Nyvora persona, rationale, and sources using Gemini API.
    """
    agent_id = agent["id"]
    agent_name = agent.get("name", "Nyvora")
    domain = agent.get("domain", "AI & Technology")
    voice = agent.get("voice", "Technical & Analytical")
    instructions = agent.get("instructions", "Focus on technical depth and avoid hype.")
    
    cand = selected_evaluation["candidate"]
    score = selected_evaluation["score"]
    cand_title = cand["title"]
    cand_summary = cand["summary"]
    source_url = cand["url"]
    source_name = cand.get("source", "Live Source")
    category = cand.get("category", "AI & Tech")
    
    # Collect summary of rejected candidates for the comparative rationale
    rejected_summaries = []
    for ev in other_evaluations:
        if ev != selected_evaluation:
            rejected_summaries.append(f"'- {ev['candidate']['title']}' (Score: {ev['score']}, Reason: {ev['reason']})")
    rejected_text = "\n".join(rejected_summaries[:3]) if rejected_summaries else "None"

    client = get_gemini_client()
    
    post_text = ""
    rationale = ""
    
    if client:
        prompt = f"""
You are {agent_name}, an autonomous AI technology observer whose mission is "AI that watches what changes next."

VOICE & PERSONA:
- Domain: {domain}
- Editorial Voice: {voice}
- Custom Instructions: {instructions}
- Character: Concise, analytical, evidence-driven, technically informed, skeptical of hype, thoughtful and professional.

SELECTED TOPIC:
Title: {cand_title}
Summary: {cand_summary}
Source Name: {source_name}
Source URL: {source_url}
Category: {category}
Editorial Score: {score}/100

OTHER EVALUATED CANDIDATES (REJECTED/DEPRIORITIZED THIS CYCLE):
{rejected_text}

TASK:
1. Write a high-signal intelligence post (120-220 words) analyzing this technical development. Explain what changed, why it matters technically, and its implications for developers/researchers.
2. Write an editorial publishing rationale (2-4 sentences) that explicitly answers:
   - Why this topic was selected.
   - Why it is relevant right now.
   - Why it was chosen over the other candidates evaluated this cycle.

Respond with valid JSON:
{{
  "text": "<Analysis post in {agent_name}'s voice>",
  "rationale": "<Editorial rationale explaining selection, timeliness, and candidate comparison>"
}}
"""
        try:
            response = client.models.generateContent(
                model="gemini-3.6-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.3
                )
            )
            if response and response.text:
                data = json.loads(response.text.strip())
                post_text = data.get("text", "")
                rationale = data.get("rationale", "")
        except Exception as e:
            logger.error(f"Gemini generation error: {e}")

    # Fallback if Gemini unavailable or returned empty
    if not post_text:
        post_text = (
            f"Key Technical Shift in {category}: {cand_title}.\n\n"
            f"{cand_summary} This shift highlights an accelerating architectural trend in {domain}. "
            f"Rather than relying on generic model scaling, recent optimizations focus on targeted execution "
            f"efficiency and operational predictability."
        )
    if not rationale:
        rationale = (
            f"Selected due to high technical relevance (Score: {score}/100) and immediate applicability to {domain}. "
            f"It was prioritized over alternative candidate updates that were primarily promotional or lacked actionable architectural detail."
        )

    sources = [source_url]
    
    # Save post to database
    post_id = save_post(
        agent_id=agent_id,
        text=post_text,
        rationale=rationale,
        sources=sources,
        category=category,
        editorial_score=score
    )
    
    return post_id, post_text, rationale, sources
