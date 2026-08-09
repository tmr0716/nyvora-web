import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

// Types
export interface AgentPersona {
  name: string;
  domain: string;
}

export interface AgentConfig {
  id: string;
  persona: AgentPersona;
  interests: string;
  voice: string;
  instructions: string;
  interval_minutes: number;
  createdAt: string;
}

export interface IntelligencePost {
  id: string;
  agentId: string;
  createdAt: string;
  text: string;
  rationale: string;
  sources: string[];
  category: string;
  editorial_score: number;
}

export interface DecisionCriteria {
  technical_significance: boolean;
  timely: boolean;
  strong_source: boolean;
  persona_relevance: boolean;
}

export interface EditorialDecision {
  id: string;
  agentId: string;
  timestamp: string;
  title: string;
  decision: 'PUBLISHED' | 'REJECTED';
  score: number;
  reason: string;
  source_url?: string;
  criteria?: DecisionCriteria;
}

export interface ActivityLog {
  id: string;
  agentId: string;
  timestamp: string;
  event: string;
  details?: string;
}

export interface MemoryRecord {
  id: string;
  agentId: string;
  topic_title: string;
  summary: string;
  status: 'PUBLISHED' | 'REJECTED';
  timestamp: string;
}

export type AgentStatus = 'INITIALIZING' | 'RESEARCHING' | 'EVALUATING' | 'PUBLISHING' | 'WAITING' | 'ERROR' | 'OFFLINE';

export interface DBData {
  agents: Record<string, AgentConfig>;
  posts: IntelligencePost[];
  decisions: EditorialDecision[];
  activities: ActivityLog[];
  memories: MemoryRecord[];
  metrics: Record<string, {
    discovered: number;
    evaluated: number;
    rejected: number;
    published: number;
    status?: AgentStatus;
    last_cycle?: string;
    next_cycle?: string;
  }>;
}

// Database Persistence Layer
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'nyvora.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial: DBData = {
      agents: {},
      posts: [],
      decisions: [],
      activities: [],
      memories: [],
      metrics: {}
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  }
}

function loadDB(): DBData {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) as DBData;
  } catch (e) {
    return {
      agents: {},
      posts: [],
      decisions: [],
      activities: [],
      memories: [],
      metrics: {}
    };
  }
}

function saveDB(data: DBData) {
  ensureDataDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Gemini AI Setup
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

// Memory Duplication Check
function isMemoryDuplicate(candidateTitle: string, candidateSummary: string, memories: MemoryRecord[], posts: IntelligencePost[]): boolean {
  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const candNorm = normalize(candidateTitle);
  const candWords = new Set(candNorm.split(/\s+/).filter(w => w.length > 3));

  if (candWords.size === 0) return false;

  for (const mem of memories) {
    const memNorm = normalize(mem.topic_title);
    const memWords = memNorm.split(/\s+/).filter(w => w.length > 3);
    if (memWords.length === 0) continue;

    let matchCount = 0;
    for (const w of memWords) {
      if (candWords.has(w)) matchCount++;
    }
    const ratio = matchCount / Math.max(candWords.size, memWords.length);
    if (ratio >= 0.5) {
      return true;
    }
  }

  for (const p of posts) {
    const pNorm = normalize(p.text.substring(0, 150));
    const pWords = pNorm.split(/\s+/).filter(w => w.length > 3);
    if (pWords.length === 0) continue;

    let matchCount = 0;
    for (const w of pWords) {
      if (candWords.has(w)) matchCount++;
    }
    const ratio = matchCount / Math.max(candWords.size, pWords.length);
    if (ratio >= 0.5) {
      return true;
    }
  }

  return false;
}

// Extract Active Themes dynamically
function getActiveThemes(db: DBData, agentId: string): string[] {
  const defaultThemes = ['LLM Reasoning', 'AI Agents', 'Open Source AI', 'AI Security', 'Developer Infrastructure'];
  const agentPosts = db.posts.filter(p => p.agentId === agentId);
  const categories = new Set<string>();

  agentPosts.forEach(p => {
    if (p.category) categories.add(p.category);
  });
  defaultThemes.forEach(t => categories.add(t));

  return Array.from(categories).slice(0, 6);
}

// Active Agent Background Timers
const activeTimers: Record<string, NodeJS.Timeout> = {};

// Live Tech Candidate Discovery Engine
async function discoverCandidates(agent: AgentConfig): Promise<Array<{ title: string; url: string; summary: string; source: string }>> {
  const candidates: Array<{ title: string; url: string; summary: string; source: string }> = [];

  // Combine interests and instructions for search query
  const rawTerms = `${agent.interests || ''} ${agent.instructions || ''}`.replace(/[^a-zA-Z0-9\s]/g, ' ');
  const stopWords = new Set(['focus', 'more', 'with', 'about', 'that', 'from', 'have', 'this', 'only', 'than', 'prioritize', 'exclude', 'technical', 'value']);
  const words = Array.from(new Set(rawTerms.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()))));
  const queryWords = words.slice(0, 5).join(' OR ');
  const searchQuery = encodeURIComponent(queryWords || 'AI OR LLM OR agent OR model');

  // Source 1: Hacker News Algolia Search API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const hnRes = await fetch(`https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=10&query=${searchQuery}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NyvoraIntelligence/1.0' }
    });
    clearTimeout(timeoutId);
    if (hnRes.ok) {
      const hnData = await hnRes.json() as { hits?: Array<{ title?: string; url?: string; story_text?: string; objectID?: string }> };
      if (hnData.hits) {
        for (const hit of hnData.hits) {
          if (hit.title) {
            candidates.push({
              title: hit.title,
              url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
              summary: hit.story_text ? hit.story_text.substring(0, 200) : hit.title,
              source: 'Hacker News'
            });
          }
        }
      }
    }
  } catch (e: any) {
    console.warn('Hacker News candidates fetch skipped/failed:', e?.message || e);
  }

  // Source 2: ArXiv CS.AI Research API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const arxivRes = await fetch('https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL&start=0&max_results=5&sortBy=submittedDate&sortOrder=descending', {
      signal: controller.signal,
      headers: { 'User-Agent': 'NyvoraIntelligence/1.0' }
    });
    clearTimeout(timeoutId);
    if (arxivRes.ok) {
      const text = await arxivRes.text();
      const entries = text.split('<entry>');
      for (let i = 1; i < entries.length; i++) {
        const entry = entries[i];
        const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
        const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
        const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);

        if (titleMatch && idMatch) {
          const rawTitle = titleMatch[1].replace(/\n/g, ' ').trim();
          const cleanTitle = rawTitle.replace(/^arXiv:\S+\s*/, '');
          const rawSummary = summaryMatch ? summaryMatch[1].replace(/\n/g, ' ').trim() : cleanTitle;
          const url = idMatch[1].trim().replace('http://', 'https://');
          
          candidates.push({
            title: cleanTitle,
            url,
            summary: rawSummary.substring(0, 300),
            source: 'ArXiv CS.AI'
          });
        }
      }
    }
  } catch (e: any) {
    console.warn('ArXiv candidates fetch skipped/failed:', e?.message || e);
  }

  // Fallback / High-Value Technical Candidates if live APIs return limited results
  if (candidates.length < 3) {
    candidates.push(
      {
        title: "Reasoning Tradeoffs in Test-Time Compute Scaling for Autonomous Agents",
        url: "https://arxiv.org/abs/2403.08291",
        summary: "Empirical study on latency, compute overhead, and decision accuracy across multi-step LLM agent benchmarks.",
        source: "AI Research"
      },
      {
        title: "vLLM 0.7 Release: Speculative Decoding & Chunked Prefill Architecture",
        url: "https://github.com/vllm-project/vllm",
        summary: "High-throughput inference engine optimization reducing TTFT (time-to-first-token) by 40% for 70B parameter models.",
        source: "Open Source AI"
      },
      {
        title: "Secure Sandbox Isolation Protocols for Multi-Tenant LLM Code Execution",
        url: "https://news.ycombinator.com/item?id=3918204",
        summary: "Analysis of WebAssembly and gVisor container virtualization patterns for un-trusted agent code execution.",
        source: "Hacker News"
      }
    );
  }

  return candidates;
}

// Rate Limit & Cooldown Manager for Gemini API
let geminiRateLimitCooldownUntil = 0;

function isGeminiAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY && Date.now() > geminiRateLimitCooldownUntil;
}

function handleGeminiError(err: unknown) {
  const msg = (err as Error)?.message || String(err);
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('Rate limit')) {
    geminiRateLimitCooldownUntil = Date.now() + 60000; // 60s cooldown
    console.warn(`[Gemini API Rate Limit] Quota limit reached (429). Enforcing 60s cooldown. Error: ${msg.substring(0, 150)}`);
  } else {
    console.error("Gemini API error:", msg.substring(0, 200));
  }
}

interface EvalResult {
  score: number;
  reason: string;
  criteria: DecisionCriteria;
}

// Rule-based heuristic candidate evaluator (used as fallback or offline)
function evaluateHeuristically(candidate: { title: string; summary: string; source: string }, agent: AgentConfig): EvalResult {
  const text = (candidate.title + ' ' + candidate.summary).toLowerCase();
  
  const techKeywords = ['benchmark', 'architecture', 'scaling', 'vllm', 'inference', 'arxiv', 'llm', 'agent', 'reasoning', 'transformer', 'gpu', 'eval', 'speculative', 'quantization', 'security', 'isolation', 'open source', 'parameter', 'latency'];
  let matches = 0;
  for (const kw of techKeywords) {
    if (text.includes(kw)) matches++;
  }

  const isArxiv = candidate.source.includes('ArXiv');
  const baseScore = isArxiv ? 65 : 55;
  const matchBonus = Math.min(25, matches * 6);
  
  // Deterministic variance hash based on candidate title
  let hash = 0;
  for (let i = 0; i < candidate.title.length; i++) {
    hash = (hash << 5) - hash + candidate.title.charCodeAt(i);
    hash |= 0;
  }
  const variance = (Math.abs(hash) % 15) - 7; // -7 to +7

  const finalScore = Math.min(95, Math.max(30, baseScore + matchBonus + variance));
  const technical = matches >= 1 || isArxiv;
  const timely = true;
  const strongSource = isArxiv || candidate.source.includes('Hacker News');
  const personaRel = text.includes('ai') || text.includes('agent') || text.includes('model') || text.includes('llm') || text.includes('compute');

  let reason = "Evaluated against current domain priorities.";
  if (finalScore >= 70) {
    reason = `Passed standards: High technical relevance (${matches} key technical concepts matched) and strong source authority (${candidate.source}).`;
  } else {
    reason = `Below threshold: General tech commentary lacking architectural or benchmark gains.`;
  }

  return {
    score: finalScore,
    reason,
    criteria: {
      technical_significance: technical,
      timely,
      strong_source: strongSource,
      persona_relevance: personaRel
    }
  };
}

// Single-prompt batch evaluation to drastically conserve API quota
async function batchEvaluateCandidates(
  candidates: Array<{ title: string; summary: string; source: string }>,
  agent: AgentConfig,
  ai: GoogleGenAI
): Promise<EvalResult[]> {
  if (candidates.length === 0) return [];
  if (!isGeminiAvailable()) {
    return candidates.map(c => evaluateHeuristically(c, agent));
  }

  try {
    const itemsText = candidates.map((c, i) => `[Item ${i}] Title: ${c.title}\nSummary: ${c.summary}\nSource: ${c.source}`).join('\n\n');
    const prompt = `You are ${agent.persona.name}, an expert AI technology observer in domain "${agent.persona.domain}".
User Editorial Direction: ${agent.instructions || "Focus on deep technical merit, benchmark gains, and architectural breakthroughs. Exclude hype."}
Interests: ${agent.interests || "AI agents, LLMs, systems engineering"}

Evaluate these candidate technical items against editorial policy.
Items:
${itemsText}

Respond with JSON only. Return a JSON array where each element corresponds to Item 0, Item 1, etc., in exact order:
[
  {
    "score": <number 0-100>,
    "reason": "<1-2 sentence evaluation>",
    "technical_significance": <boolean>,
    "timely": <boolean>,
    "strong_source": <boolean>,
    "persona_relevance": <boolean>
  }
]`;

    const res = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    if (res.text) {
      const parsedArray = JSON.parse(res.text);
      if (Array.isArray(parsedArray) && parsedArray.length === candidates.length) {
        return parsedArray.map((item, idx) => ({
          score: typeof item.score === 'number' ? item.score : evaluateHeuristically(candidates[idx], agent).score,
          reason: item.reason || evaluateHeuristically(candidates[idx], agent).reason,
          criteria: {
            technical_significance: item.technical_significance ?? true,
            timely: item.timely ?? true,
            strong_source: item.strong_source ?? true,
            persona_relevance: item.persona_relevance ?? true
          }
        }));
      }
    }
  } catch (err) {
    handleGeminiError(err);
  }

  return candidates.map(c => evaluateHeuristically(c, agent));
}

// Generate Post Content
async function generateIntelligencePost(
  candidate: { title: string; url: string; summary: string; source: string },
  agent: AgentConfig,
  score: number,
  ai: GoogleGenAI | null
): Promise<{ text: string; whySelected: string; whyRelevantNow: string; whyChosenOverAlternatives: string; category: string }> {
  let text = `Technical Analysis on ${candidate.title}:\n\n${candidate.summary}\n\nKey Engineering Implications: This update reflects active optimization in production AI systems. As workloads shift toward multi-step autonomous execution, resource throughput and benchmark verifiability remain critical parameters for engineering decisions.`;
  let whySelected = `Selected for measurable technical significance and alignment with ${agent.persona.domain}.`;
  let whyRelevantNow = `Addresses current performance and architectural challenges in production LLM/Agent deployment.`;
  let whyChosenOverAlternatives = `Prioritized over surrounding candidates due to verifiable architectural gains rather than promotional announcements.`;
  let category = candidate.source === 'ArXiv CS.AI' ? 'AI Research' : 'AI Infrastructure';

  if (ai && isGeminiAvailable()) {
    try {
      const prompt = `You are ${agent.persona.name}, an autonomous AI technology observer for domain "${agent.persona.domain}".
Voice: ${agent.voice || "Technical, analytical, objective"}
Core principle: "Don't report what's loud. Report what changes how AI is built or used."
Editorial Direction: ${agent.instructions || "Focus on deep technical value and architectural gains."}

Analyze this technical candidate:
Title: ${candidate.title}
Summary: ${candidate.summary}
Source URL: ${candidate.url}

Write a high-quality intelligence post following these strict rules:
1. Do NOT use raw LaTeX, broken escape sequences, unescaped JSON, system prompts, or AI disclaimers ("As an AI model...").
2. Write in clean, authoritative paragraphs in plain text explaining what changed, why it matters, and engineering implications.
3. Provide explicit, detailed publishing rationale containing:
   - WHY SELECTED: (1 sentence explaining technical significance)
   - WHY RELEVANT NOW: (1 sentence explaining current timing)
   - WHY CHOSEN OVER ALTERNATIVES: (1 sentence comparing against candidate pool)

Respond in JSON with exact format:
{
  "text": "<2-3 paragraph sharp technical analysis>",
  "why_selected": "<1 sentence>",
  "why_relevant_now": "<1 sentence>",
  "why_chosen_over_alternatives": "<1 sentence>",
  "category": "<e.g., AI Infrastructure, Agent Architecture, Open Source AI, Systems Security, or LLM Research>"
}`;

      const postRes = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      if (postRes.text) {
        const pData = JSON.parse(postRes.text);
        if (pData.text) text = pData.text;
        if (pData.why_selected) whySelected = pData.why_selected;
        if (pData.why_relevant_now) whyRelevantNow = pData.why_relevant_now;
        if (pData.why_chosen_over_alternatives) whyChosenOverAlternatives = pData.why_chosen_over_alternatives;
        if (pData.category) category = pData.category;
      }
    } catch (err) {
      handleGeminiError(err);
    }
  }

  return { text, whySelected, whyRelevantNow, whyChosenOverAlternatives, category };
}

// Editorial Evaluation & Generation Cycle
async function runAutonomousCycle(agentId: string) {
  let db = loadDB();
  const agent = db.agents[agentId];
  if (!agent) return;

  const now = new Date().toISOString();

  if (!db.metrics[agentId]) {
    db.metrics[agentId] = { discovered: 0, evaluated: 0, rejected: 0, published: 0 };
  }

  // Update Status -> RESEARCHING
  db.metrics[agentId].status = 'RESEARCHING';
  db.metrics[agentId].last_cycle = now;

  const nextCycleTime = new Date(Date.now() + (agent.interval_minutes * 60 * 1000)).toISOString();
  db.metrics[agentId].next_cycle = nextCycleTime;

  db.activities.unshift({
    id: 'act-' + Math.random().toString(36).substr(2, 9),
    agentId,
    timestamp: now,
    event: 'CYCLE_STARTED',
    details: `Initiating discovery cycle for domain ${agent.persona.domain}.`
  });
  saveDB(db);

  try {
    // 1. Discover Candidates
    const rawCandidates = await discoverCandidates(agent);
    db = loadDB();
    db.metrics[agentId].discovered += rawCandidates.length;

    // Update Status -> EVALUATING
    db.metrics[agentId].status = 'EVALUATING';
    db.activities.unshift({
      id: 'act-' + Math.random().toString(36).substr(2, 9),
      agentId,
      timestamp: new Date().toISOString(),
      event: 'EVALUATING_CANDIDATES',
      details: `Evaluating ${rawCandidates.length} discovered candidates against editorial policy.`
    });
    saveDB(db);

    const agentMemories = db.memories.filter(m => m.agentId === agentId);
    const agentPosts = db.posts.filter(p => p.agentId === agentId);
    const ai = getGeminiClient();

    let publishedThisCycle = 0;
    const MAX_PUBLISH_PER_CYCLE = 1;

    // Filter duplicates first
    const validCandidates: typeof rawCandidates = [];
    for (const candidate of rawCandidates) {
      db = loadDB();
      if (isMemoryDuplicate(candidate.title, candidate.summary, agentMemories, agentPosts)) {
        db.metrics[agentId].evaluated += 1;
        db.decisions.unshift({
          id: 'dec-' + Math.random().toString(36).substr(2, 9),
          agentId,
          timestamp: new Date().toISOString(),
          title: candidate.title,
          decision: 'REJECTED',
          score: 35,
          reason: 'Rejected due to memory duplication with previously covered topic.',
          source_url: candidate.url,
          criteria: {
            technical_significance: true,
            timely: false,
            strong_source: true,
            persona_relevance: true
          }
        });
        db.memories.unshift({
          id: 'mem-' + Math.random().toString(36).substr(2, 9),
          agentId,
          topic_title: candidate.title,
          summary: candidate.summary,
          status: 'REJECTED',
          timestamp: new Date().toISOString()
        });
        db.metrics[agentId].rejected += 1;
        saveDB(db);
      } else {
        validCandidates.push(candidate);
      }
    }

    // Limit candidate pool size per cycle to 8 for efficiency
    const candidatesToEvaluate = validCandidates.slice(0, 8);

    // 2. Batch Evaluation (1 single Gemini prompt or heuristic fallback)
    const evaluations = ai
      ? await batchEvaluateCandidates(candidatesToEvaluate, agent, ai)
      : candidatesToEvaluate.map(c => evaluateHeuristically(c, agent));

    const EDITORIAL_THRESHOLD = parseInt(process.env.EDITORIAL_THRESHOLD || '70', 10);

    // Sort evaluated candidates by score descending to pick top quality post
    const indexed = candidatesToEvaluate.map((cand, idx) => ({ candidate: cand, eval: evaluations[idx] }));
    indexed.sort((a, b) => b.eval.score - a.eval.score);

    for (const item of indexed) {
      const { candidate, eval: evaluation } = item;
      db = loadDB();
      db.metrics[agentId].evaluated += 1;

      const { score, reason, criteria } = evaluation;

      if (score >= EDITORIAL_THRESHOLD && publishedThisCycle < MAX_PUBLISH_PER_CYCLE) {
        db.metrics[agentId].status = 'PUBLISHING';
        saveDB(db);

        // Generate Post
        const postData = await generateIntelligencePost(candidate, agent, score, ai);
        const structuredRationale = `WHY SELECTED: ${postData.whySelected}\nWHY RELEVANT NOW: ${postData.whyRelevantNow}\nWHY CHOSEN OVER ALTERNATIVES: ${postData.whyChosenOverAlternatives}`;

        const newPost: IntelligencePost = {
          id: 'p-' + Math.random().toString(36).substr(2, 8),
          agentId,
          createdAt: new Date().toISOString(),
          text: postData.text,
          rationale: structuredRationale,
          sources: [candidate.url],
          category: postData.category,
          editorial_score: score
        };

        db = loadDB();
        db.posts.unshift(newPost);
        db.decisions.unshift({
          id: 'dec-' + Math.random().toString(36).substr(2, 9),
          agentId,
          timestamp: new Date().toISOString(),
          title: candidate.title,
          decision: 'PUBLISHED',
          score,
          reason,
          source_url: candidate.url,
          criteria
        });
        db.memories.unshift({
          id: 'mem-' + Math.random().toString(36).substr(2, 9),
          agentId,
          topic_title: candidate.title,
          summary: candidate.summary,
          status: 'PUBLISHED',
          timestamp: new Date().toISOString()
        });

        db.metrics[agentId].published += 1;
        publishedThisCycle += 1;

        db.activities.unshift({
          id: 'act-' + Math.random().toString(36).substr(2, 9),
          agentId,
          timestamp: new Date().toISOString(),
          event: 'PUBLISHED_INTELLIGENCE',
          details: `Published: "${candidate.title.substring(0, 50)}..."`
        });

        saveDB(db);
      } else {
        const rejectReason = score >= EDITORIAL_THRESHOLD
          ? 'Passed threshold but deferred due to single-post per cycle publishing limit.'
          : reason;

        db.decisions.unshift({
          id: 'dec-' + Math.random().toString(36).substr(2, 9),
          agentId,
          timestamp: new Date().toISOString(),
          title: candidate.title,
          decision: 'REJECTED',
          score,
          reason: rejectReason,
          source_url: candidate.url,
          criteria
        });
        db.memories.unshift({
          id: 'mem-' + Math.random().toString(36).substr(2, 9),
          agentId,
          topic_title: candidate.title,
          summary: candidate.summary,
          status: 'REJECTED',
          timestamp: new Date().toISOString()
        });
        db.metrics[agentId].rejected += 1;
        saveDB(db);
      }
    }

    // Set Status -> WAITING
    db = loadDB();
    if (db.metrics[agentId]) {
      db.metrics[agentId].status = 'WAITING';
      db.activities.unshift({
        id: 'act-' + Math.random().toString(36).substr(2, 9),
        agentId,
        timestamp: new Date().toISOString(),
        event: 'CYCLE_COMPLETED',
        details: `Cycle finished. Next research cycle scheduled for ${nextCycleTime}.`
      });
      saveDB(db);
    }
  } catch (e) {
    console.error(`Autonomous cycle error for agent ${agentId}:`, e);
    db = loadDB();
    if (db.metrics[agentId]) {
      db.metrics[agentId].status = 'ERROR';
      db.activities.unshift({
        id: 'act-' + Math.random().toString(36).substr(2, 9),
        agentId,
        timestamp: new Date().toISOString(),
        event: 'CYCLE_ERROR',
        details: `Error executing cycle: ${(e as Error).message}`
      });
      saveDB(db);
    }
  }
}

// Start Autonomous Background Loop for an Agent
function startAgentLoop(agentId: string) {
  if (activeTimers[agentId]) {
    clearInterval(activeTimers[agentId]);
  }

  const db = loadDB();
  const agent = db.agents[agentId];
  if (!agent) return;

  const intervalMs = Math.max(1, agent.interval_minutes) * 60 * 1000;

  // Run first cycle asynchronously after 1.5 seconds
  setTimeout(() => {
    runAutonomousCycle(agentId);
  }, 1500);

  // Recurring loop
  activeTimers[agentId] = setInterval(() => {
    runAutonomousCycle(agentId);
  }, intervalMs);
}

// Resume all existing agents on server startup
function restoreAllAgents() {
  const db = loadDB();
  for (const agentId of Object.keys(db.agents)) {
    startAgentLoop(agentId);
  }
}

// Server Startup
async function startServer() {
  restoreAllAgents();

  const app = express();
  app.use(express.json());

  // Health endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'nyvora', timestamp: new Date().toISOString() });
  });

  // 1. POST /api/agent/init (EXACT CONTRACT PRESERVED)
  app.post('/api/agent/init', (req: Request, res: Response) => {
    const data = req.body || {};
    const persona = data.persona;

    if (!persona || typeof persona !== 'object') {
      return res.status(400).json({ error: "Invalid persona object" });
    }

    const name = persona.name;
    const domain = persona.domain;

    if (!name || !domain) {
      return res.status(400).json({ error: "Persona name and domain are required" });
    }

    const db = loadDB();
    const id = 'ag-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);

    const agent: AgentConfig = {
      id,
      persona: { name, domain },
      interests: data.interests || "AI agents, LLM architectures, systems engineering, open source",
      voice: data.voice || "Technical, Analytical & Objective",
      instructions: data.instructions || "Focus on deep technical value. Exclude promotional material and hype.",
      interval_minutes: parseInt(data.interval_minutes, 10) || 1,
      createdAt: new Date().toISOString()
    };

    db.agents[id] = agent;
    db.metrics[id] = { discovered: 0, evaluated: 0, rejected: 0, published: 0, status: 'WAITING' };
    db.activities.unshift({
      id: 'act-' + Math.random().toString(36).substr(2, 9),
      agentId: id,
      timestamp: new Date().toISOString(),
      event: 'AGENT_INITIALIZED',
      details: `Initialized ${name} for domain ${domain}.`
    });

    saveDB(db);

    // Launch autonomous background worker
    startAgentLoop(id);

    return res.json({ agentId: id });
  });

  // 2. GET /api/agent/feed?agentId=... (EXACT CONTRACT PRESERVED)
  app.get('/api/agent/feed', (req: Request, res: Response) => {
    const agentId = req.query.agentId as string;
    if (!agentId) {
      return res.status(400).json({ error: "agentId query parameter is required" });
    }

    const db = loadDB();
    const posts = db.posts.filter(p => p.agentId === agentId);
    
    // Sort newest first
    posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({ posts });
  });

  // 3. GET /api/agent/metrics?agentId=...
  app.get('/api/agent/metrics', (req: Request, res: Response) => {
    const agentId = req.query.agentId as string;
    if (!agentId) {
      return res.status(400).json({ error: "agentId parameter is required" });
    }

    const db = loadDB();
    const metrics = db.metrics[agentId] || { discovered: 0, evaluated: 0, rejected: 0, published: 0, status: 'WAITING' };

    const evaluated = metrics.evaluated || 0;
    const published = metrics.published || 0;
    const rejected = metrics.rejected || 0;

    // Calculate exact Selectivity Rate = (published / evaluated) * 100
    const selectivityNum = evaluated > 0 ? (published / evaluated) * 100 : 0;
    const selectivityRate = selectivityNum.toFixed(1) + '%';

    // Calculate Rejection Rate = (rejected / evaluated) * 100
    const rejectionNum = evaluated > 0 ? (rejected / evaluated) * 100 : 0;
    const rejectionRate = rejectionNum.toFixed(1) + '%';

    return res.json({
      status: metrics.status || 'WAITING',
      topics_discovered: metrics.discovered,
      topics_evaluated: metrics.evaluated,
      topics_rejected: metrics.rejected,
      topics_published: metrics.published,
      selectivity_rate: selectivityRate,
      rejection_rate: rejectionRate,
      last_cycle: metrics.last_cycle,
      next_cycle: metrics.next_cycle
    });
  });

  // 4. GET /api/agent/status?agentId=...
  app.get('/api/agent/status', (req: Request, res: Response) => {
    const agentId = req.query.agentId as string;
    if (!agentId) return res.status(400).json({ error: "agentId required" });

    const db = loadDB();
    const metrics = db.metrics[agentId];
    return res.json({
      status: metrics?.status || 'WAITING',
      last_cycle: metrics?.last_cycle,
      next_cycle: metrics?.next_cycle
    });
  });

  // 5. GET /api/agent/decisions?agentId=...
  app.get('/api/agent/decisions', (req: Request, res: Response) => {
    const agentId = req.query.agentId as string;
    if (!agentId) return res.status(400).json({ error: "agentId required" });

    const db = loadDB();
    const decisions = db.decisions.filter(d => d.agentId === agentId);
    return res.json({ decisions: decisions.slice(0, 30) });
  });

  // 6. GET /api/agent/activity?agentId=...
  app.get('/api/agent/activity', (req: Request, res: Response) => {
    const agentId = req.query.agentId as string;
    if (!agentId) return res.status(400).json({ error: "agentId required" });

    const db = loadDB();
    const activities = db.activities.filter(a => a.agentId === agentId);
    return res.json({ activities: activities.slice(0, 40) });
  });

  // 7. GET /api/agent/memory?agentId=...
  app.get('/api/agent/memory', (req: Request, res: Response) => {
    const agentId = req.query.agentId as string;
    if (!agentId) return res.status(400).json({ error: "agentId required" });

    const db = loadDB();
    const memory = db.memories.filter(m => m.agentId === agentId);
    const activeThemes = getActiveThemes(db, agentId);
    const published = memory.filter(m => m.status === 'PUBLISHED').slice(0, 10);
    const rejections = memory.filter(m => m.status === 'REJECTED').slice(0, 10);

    return res.json({
      memory: memory.slice(0, 30),
      active_themes: activeThemes,
      recently_published: published,
      recent_rejections: rejections
    });
  });

  // 8. POST /api/agent/direction
  app.post('/api/agent/direction', (req: Request, res: Response) => {
    const { agentId, instructions } = req.body || {};
    if (!agentId || !instructions) return res.status(400).json({ error: "agentId and instructions required" });

    const db = loadDB();
    if (db.agents[agentId]) {
      db.agents[agentId].instructions = instructions;
      db.activities.unshift({
        id: 'act-' + Math.random().toString(36).substr(2, 9),
        agentId,
        timestamp: new Date().toISOString(),
        event: 'DIRECTION_UPDATED',
        details: `Updated research direction: "${instructions.substring(0, 60)}..."`
      });
      saveDB(db);
      return res.json({ success: true, instructions });
    }
    return res.status(404).json({ error: "Agent not found" });
  });

  // 8b. GET & POST /api/agent/config (Reconfigure Persona & Parameters)
  app.get('/api/agent/config', (req: Request, res: Response) => {
    const agentId = req.query.agentId as string;
    if (!agentId) return res.status(400).json({ error: "agentId parameter required" });

    const db = loadDB();
    const agent = db.agents[agentId];
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    return res.json({ agent });
  });

  app.post('/api/agent/config', (req: Request, res: Response) => {
    const { agentId, persona, interests, voice, instructions, interval_minutes } = req.body || {};
    if (!agentId) return res.status(400).json({ error: "agentId required" });

    const db = loadDB();
    const agent = db.agents[agentId];
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    if (persona?.name) agent.persona.name = persona.name;
    if (persona?.domain) agent.persona.domain = persona.domain;
    if (interests) agent.interests = interests;
    if (voice) agent.voice = voice;
    if (instructions) agent.instructions = instructions;
    if (interval_minutes) agent.interval_minutes = parseInt(interval_minutes, 10) || 1;

    db.activities.unshift({
      id: 'act-' + Math.random().toString(36).substr(2, 9),
      agentId,
      timestamp: new Date().toISOString(),
      event: 'CONFIG_UPDATED',
      details: `Reconfigured agent persona (${agent.persona.name}) & research interval (${agent.interval_minutes}m).`
    });

    saveDB(db);

    // Restart background loop with updated configuration
    startAgentLoop(agentId);

    return res.json({ success: true, agent });
  });

  // 9. POST /api/agent/trigger
  app.post('/api/agent/trigger', async (req: Request, res: Response) => {
    const { agentId } = req.body || {};
    if (!agentId) return res.status(400).json({ error: "agentId required" });

    await runAutonomousCycle(agentId);
    return res.json({ success: true });
  });

  // Fallback for unmatched /api routes (prevent returning index.html)
  app.use('/api/*', (req: Request, res: Response) => {
    res.status(404).json({ error: "API route not found" });
  });

  // Setup Vite or Static File Server
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom'
    });
    app.use(vite.middlewares);

    app.use('*', async (req: Request, res: Response, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: "API route not found" });
      }
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nyvora server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start Nyvora server:", err);
});
