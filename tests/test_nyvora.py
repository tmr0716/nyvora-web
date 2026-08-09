import unittest
import json
import os
import sys

# Add parent directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database.models import init_db, create_agent, save_post, get_posts, record_decision, get_memory

class NyvoraTestCase(unittest.TestCase):

    def setUp(self):
        app.config['TESTING'] = True
        self.client = app.test_client()
        init_db()

    def test_agent_init_success(self):
        payload = {
            "persona": {
                "name": "Nyvora Test",
                "domain": "AI & Technology"
            },
            "interests": "AI security, Agents",
            "voice": "Technical & Analytical",
            "instructions": "Avoid hype",
            "interval_minutes": 1
        }
        res = self.client.post('/api/agent/init', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn('agentId', data)
        self.assertTrue(len(data['agentId']) > 5)

    def test_agent_init_minimal_evaluator_payload(self):
        payload = {
            "persona": {
                "name": "Nyvora",
                "domain": "AI & Technology"
            }
        }
        res = self.client.post('/api/agent/init', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn('agentId', data)

    def test_agent_init_invalid_payload(self):
        payload = {"persona": {}}
        res = self.client.post('/api/agent/init', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, 400)

    def test_feed_empty_for_new_agent(self):
        agent_id = create_agent(name="Nyvora Test", domain="AI")
        res = self.client.get(f'/api/agent/feed?agentId={agent_id}')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data, {"posts": []})

    def test_feed_missing_agent_id(self):
        res = self.client.get('/api/agent/feed')
        self.assertEqual(res.status_code, 400)

    def test_feed_non_existent_agent(self):
        res = self.client.get('/api/agent/feed?agentId=unknown-id-123')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data, {"posts": []})

    def test_post_persistence_and_newest_first_order(self):
        agent_id = create_agent(name="Nyvora Test", domain="AI")
        
        post_id_1 = save_post(
            agent_id=agent_id,
            text="First intelligence post on autonomous LLM agents.",
            rationale="Selected for high technical value.",
            sources=["https://arxiv.org/abs/2401.0001"],
            category="AI Agents",
            editorial_score=88
        )
        import time
        time.sleep(0.02)
        
        post_id_2 = save_post(
            agent_id=agent_id,
            text="Second intelligence post on distillation.",
            rationale="Selected for cost performance breakthrough.",
            sources=["https://github.com/topics/distillation"],
            category="Open Source AI",
            editorial_score=92
        )

        res = self.client.get(f'/api/agent/feed?agentId={agent_id}')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        posts = data['posts']
        self.assertEqual(len(posts), 2)
        
        # Newest first: second post created should be first in feed
        self.assertEqual(posts[0]['id'], post_id_2)
        self.assertEqual(posts[1]['id'], post_id_1)
        self.assertIn('https://github.com/topics/distillation', posts[0]['sources'])

    def test_memory_recording(self):
        agent_id = create_agent(name="Nyvora Test", domain="AI")
        record_decision(
            agent_id=agent_id,
            title="Benchmark Analysis of Multimodal Agents",
            decision="PUBLISHED",
            score=91,
            reason="High technical relevance.",
            source_url="https://arxiv.org"
        )
        mem = get_memory(agent_id)
        self.assertTrue(len(mem) > 0)
        self.assertEqual(mem[0]['topic_title'], "Benchmark Analysis of Multimodal Agents")

if __name__ == '__main__':
    unittest.main()
