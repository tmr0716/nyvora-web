from database.models import get_memory
import re

def clean_words(text):
    words = re.findall(r'\w+', text.lower())
    # ignore common stop words
    stopwords = {'a', 'an', 'the', 'is', 'are', 'was', 'were', 'and', 'or', 'for', 'in', 'on', 'with', 'to', 'of', 'at', 'by', 'ai', 'new'}
    return {w for w in words if len(w) > 2 and w not in stopwords}

def is_duplicate_or_similar(agent_id, title, summary=""):
    """
    Checks SQLite memory for previous published/rejected topics.
    Returns (is_duplicate: bool, similarity_reason: str)
    """
    recent_memory = get_memory(agent_id, limit=50)
    cand_words = clean_words(title)
    
    if not cand_words:
        return False, ""

    for mem in recent_memory:
        mem_title = mem.get("topic_title", "")
        mem_status = mem.get("status", "")
        mem_words = clean_words(mem_title)
        
        if not mem_words:
            continue
            
        # Jaccard similarity between candidate and memory title
        intersection = cand_words.intersection(mem_words)
        union = cand_words.union(mem_words)
        sim = len(intersection) / len(union) if union else 0.0
        
        if sim > 0.4:
            return True, f"Substantially similar to previously {mem_status.lower()} topic: '{mem_title}' (similarity score {int(sim*100)}%)"

    return False, ""
