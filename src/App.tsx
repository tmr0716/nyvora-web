import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Cpu,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  Send,
  Terminal,
  Sliders,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Radio,
  Brain,
  Zap,
  Filter,
  Check,
  Menu,
  X,
  Clock,
  AlertTriangle,
  Tag
} from 'lucide-react';

interface IntelligencePost {
  id: string;
  agentId: string;
  createdAt: string;
  text: string;
  rationale: string;
  sources: string[];
  category: string;
  editorial_score: number;
}

interface DecisionCriteria {
  technical_significance: boolean;
  timely: boolean;
  strong_source: boolean;
  persona_relevance: boolean;
}

interface EditorialDecision {
  id: string;
  agentId: string;
  timestamp: string;
  title: string;
  decision: 'PUBLISHED' | 'REJECTED';
  score: number;
  reason: string;
  source_url?: string;
  criteria?: DecisionCriteria;
  memory_match?: boolean;
  memory_similarity?: number;
  match_type?: 'exact' | 'near_duplicate' | 'related' | 'distinct';
  matched_post_id?: string;
  memory_reason?: string;
}

interface ActivityLog {
  id: string;
  agentId: string;
  timestamp: string;
  event: string;
  details?: string;
}

interface MemoryRecord {
  id: string;
  agentId: string;
  topic_title: string;
  summary: string;
  status: 'PUBLISHED' | 'REJECTED';
  timestamp: string;
}

type AgentStatus = 'INITIALIZING' | 'RESEARCHING' | 'EVALUATING' | 'PUBLISHING' | 'WAITING' | 'ERROR' | 'OFFLINE';

interface AgentMetrics {
  status: AgentStatus;
  topics_discovered: number;
  topics_evaluated: number;
  topics_rejected: number;
  topics_published: number;
  selectivity_rate: string;
  rejection_rate?: string;
  last_cycle?: string;
  next_cycle?: string;
}

export default function App() {
  const [agentId, setAgentId] = useState<string | null>(() => localStorage.getItem('nyvora_agent_id'));
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reconfigureOpen, setReconfigureOpen] = useState(false);
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set());

  // Form State for Agent Initialization & Reconfiguration
  const [personaName, setPersonaName] = useState('Nyvora');
  const [personaDomain, setPersonaDomain] = useState('AI & Technology');
  const [interests, setInterests] = useState('AI agents, LLM inference, AI security, open source frameworks, hardware compute');
  const [voice, setVoice] = useState('Technical, Analytical & Objective');
  const [instructions, setInstructions] = useState('Prioritize technical novelty, benchmark gains, and architectural breakthroughs. Exclude unverified claims, hype, and marketing releases.');
  const [intervalMinutes, setIntervalMinutes] = useState(1);

  // Dashboard Data State
  const [posts, setPosts] = useState<IntelligencePost[]>([]);
  const [decisions, setDecisions] = useState<EditorialDecision[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [memory, setMemory] = useState<MemoryRecord[]>([]);
  const [activeThemes, setActiveThemes] = useState<string[]>(['LLM Reasoning', 'AI Agents', 'Open Source AI', 'AI Security', 'Developer Infrastructure']);
  const [metrics, setMetrics] = useState<AgentMetrics>({
    status: 'WAITING',
    topics_discovered: 0,
    topics_evaluated: 0,
    topics_rejected: 0,
    topics_published: 0,
    selectivity_rate: '0.0%'
  });

  const [commandInput, setCommandInput] = useState('');
  const [directionFeedback, setDirectionFeedback] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [countdownText, setCountdownText] = useState('00:00');
  const [newPostIds, setNewPostIds] = useState<Set<string>>(new Set());

  const prevPostIdsRef = useRef<Set<string>>(new Set());

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadingStages = [
    { title: "INITIALIZING PERSONA ENGINE", sub: "Allocating persistent storage & schema..." },
    { title: "CONNECTING LIVE FEEDS", sub: "Establishing real-time polling to Hacker News, ArXiv CS.AI & GitHub..." },
    { title: "CALIBRATING EDITORIAL MODEL", sub: "Configuring Gemini 3.6 Flash scoring threshold & instructions..." },
    { title: "ACTIVATING DAEMON WORKER", sub: "Starting autonomous background execution loop..." }
  ];

  // Initialize Agent
  const handleInitAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoadingStage(0);

    const stageInterval = setInterval(() => {
      setLoadingStage(prev => {
        if (prev < loadingStages.length - 1) return prev + 1;
        clearInterval(stageInterval);
        return prev;
      });
    }, 600);

    try {
      const res = await fetch('/api/agent/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona: { name: personaName, domain: personaDomain },
          interests,
          voice,
          instructions,
          interval_minutes: Number(intervalMinutes)
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to initialize agent');
      }

      const data = await res.json();
      if (!data.agentId) throw new Error('No agentId returned');

      setTimeout(() => {
        clearInterval(stageInterval);
        localStorage.setItem('nyvora_agent_id', data.agentId);
        setAgentId(data.agentId);
        setLoading(false);
        setIsOffline(false);
        showToast('Nyvora initialized! Autonomous worker is active.');
      }, 2600);

    } catch (err: any) {
      clearInterval(stageInterval);
      setLoading(false);
      alert('Initialization Error: ' + err.message);
    }
  };

  // Open Reconfigure Modal
  const handleOpenReconfigure = async () => {
    if (!agentId) return;
    try {
      const res = await fetch(`/api/agent/config?agentId=${agentId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.agent) {
          setPersonaName(data.agent.persona?.name || 'Nyvora');
          setPersonaDomain(data.agent.persona?.domain || 'AI & Technology');
          setInterests(data.agent.interests || '');
          setVoice(data.agent.voice || 'Technical, Analytical & Objective');
          setInstructions(data.agent.instructions || '');
          setIntervalMinutes(data.agent.interval_minutes || 1);
        }
      }
    } catch (e) {
      console.warn("Error fetching agent config:", e);
    }
    setReconfigureOpen(true);
  };

  // Save Reconfiguration
  const handleSaveReconfigure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentId) return;

    try {
      const res = await fetch('/api/agent/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          persona: { name: personaName, domain: personaDomain },
          interests,
          voice,
          instructions,
          interval_minutes: Number(intervalMinutes)
        })
      });

      if (res.ok) {
        showToast('✓ Agent reconfigured successfully!');
        setReconfigureOpen(false);
        fetchDashboard(agentId);
      } else {
        showToast('Failed to save configuration');
      }
    } catch (e) {
      showToast('Error saving configuration');
    }
  };

  // Fetch Dashboard Data from Backend (Pure Observation)
  const fetchDashboard = async (id: string) => {
    try {
      const parseResponseJson = async (res: Response) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          throw new Error(`Expected JSON but got ${ct}`);
        }
        return await res.json();
      };

      const [pRes, mRes, dRes, aRes, memRes] = await Promise.all([
        fetch(`/api/agent/feed?agentId=${id}`),
        fetch(`/api/agent/metrics?agentId=${id}`),
        fetch(`/api/agent/decisions?agentId=${id}`),
        fetch(`/api/agent/activity?agentId=${id}`),
        fetch(`/api/agent/memory?agentId=${id}`)
      ]);

      const [pData, mData, dData, aData, memData] = await Promise.all([
        parseResponseJson(pRes),
        parseResponseJson(mRes),
        parseResponseJson(dRes),
        parseResponseJson(aRes),
        parseResponseJson(memRes)
      ]);

      setIsOffline(false);

      const fetchedPosts: IntelligencePost[] = pData.posts || [];
      setPosts(fetchedPosts);

      // Detect new post IDs for visual flash
      const currentIds = new Set(fetchedPosts.map(p => p.id));
      const brandNewIds = new Set<string>();
      currentIds.forEach(pId => {
        if (!prevPostIdsRef.current.has(pId) && prevPostIdsRef.current.size > 0) {
          brandNewIds.add(pId);
        }
      });
      if (brandNewIds.size > 0) {
        setNewPostIds(brandNewIds);
        showToast(`New Intelligence post published!`);
      }
      prevPostIdsRef.current = currentIds;

      setMetrics(mData);
      setDecisions(dData.decisions || []);
      setActivities(aData.activities || []);
      setMemory(memData.memory || []);
      if (memData.active_themes) {
        setActiveThemes(memData.active_themes);
      }

      setIsInitialLoading(false);
    } catch (e: any) {
      console.warn('Dashboard fetch offline or retrying:', e?.message || e);
      setIsOffline(true);
      setIsInitialLoading(false);
    }
  };

  // Periodic Polling (Every 10 seconds) - DOES NOT TRIGGER GENERATION
  useEffect(() => {
    if (!agentId) return;
    fetchDashboard(agentId);

    const pollInterval = setInterval(() => {
      fetchDashboard(agentId);
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [agentId]);

  // Real Next Cycle Countdown Calculation
  useEffect(() => {
    if (!metrics.next_cycle) {
      setCountdownText('00:00');
      return;
    }

    const timer = setInterval(() => {
      const nextMs = new Date(metrics.next_cycle!).getTime();
      const nowMs = Date.now();
      const diffSec = Math.max(0, Math.floor((nextMs - nowMs) / 1000));

      if (diffSec <= 0) {
        setCountdownText('00:00');
      } else {
        const mins = Math.floor(diffSec / 60);
        const secs = diffSec % 60;
        setCountdownText(
          `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [metrics.next_cycle]);

  const handleCopyAgentId = () => {
    if (!agentId) return;
    navigator.clipboard.writeText(agentId);
    setCopied(true);
    showToast('Agent ID copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleResetAgent = () => {
    if (confirm('Reset current persona session? Backend database history remains preserved.')) {
      localStorage.removeItem('nyvora_agent_id');
      setAgentId(null);
      setPosts([]);
      setReconfigureOpen(false);
    }
  };

  const handleTriggerCycle = async () => {
    if (!agentId || triggering) return;
    setTriggering(true);
    showToast('Triggering test cycle...');
    try {
      await fetch('/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId })
      });
      setTimeout(() => {
        fetchDashboard(agentId);
        setTriggering(false);
      }, 2000);
    } catch (e) {
      setTriggering(false);
    }
  };

  const handleSendDirection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || !agentId) return;

    try {
      const res = await fetch('/api/agent/direction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          instructions: commandInput.trim()
        })
      });
      if (res.ok) {
        setDirectionFeedback('✓ Research direction updated. Nyvora will use this focus in future cycles.');
        showToast('✓ Research direction updated. Nyvora will use this focus in future cycles.');
        setCommandInput('');
        fetchDashboard(agentId);
        setTimeout(() => setDirectionFeedback(null), 5000);
      } else {
        showToast('Failed to update direction');
      }
    } catch (e) {
      showToast('Failed to update direction');
    }
  };

  const togglePostExpanded = (id: string) => {
    setExpandedPostIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Helper function to render rationale breakdown
  const renderRationale = (rationaleText: string) => {
    if (!rationaleText) return null;
    const lines = rationaleText.split('\n');

    return (
      <div className="bg-[#0b0f19] border-l-4 border-teal-500 rounded-r-lg p-3.5 space-y-1.5 text-xs font-sans">
        <div className="font-mono text-[10px] font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-teal-400" />
          EDITORIAL PUBLISHING RATIONALE
        </div>
        <div className="space-y-1 text-slate-300 leading-relaxed">
          {lines.map((line, idx) => {
            if (line.startsWith('WHY SELECTED:')) {
              return (
                <p key={idx}><strong className="text-cyan-400">WHY SELECTED:</strong> {line.replace('WHY SELECTED:', '').trim()}</p>
              );
            }
            if (line.startsWith('WHY RELEVANT NOW:')) {
              return (
                <p key={idx}><strong className="text-teal-400">WHY RELEVANT NOW:</strong> {line.replace('WHY RELEVANT NOW:', '').trim()}</p>
              );
            }
            if (line.startsWith('WHY CHOSEN OVER ALTERNATIVES:')) {
              return (
                <p key={idx}><strong className="text-amber-400">WHY CHOSEN OVER ALTERNATIVES:</strong> {line.replace('WHY CHOSEN OVER ALTERNATIVES:', '').trim()}</p>
              );
            }
            return <p key={idx}>{line}</p>;
          })}
        </div>
      </div>
    );
  };

  // Get status badge styling
  const getStatusBadge = () => {
    if (isOffline) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-red-400"></span>
          ○ OFFLINE
        </span>
      );
    }

    const status = metrics.status || 'WAITING';

    switch (status) {
      case 'RESEARCHING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs font-bold">
            <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
            ● RESEARCHING
          </span>
        );
      case 'EVALUATING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 font-mono text-xs font-bold">
            <Radio className="w-3 h-3 animate-pulse text-purple-400" />
            ● EVALUATING
          </span>
        );
      case 'PUBLISHING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold">
            <Sparkles className="w-3 h-3 animate-pulse text-emerald-400" />
            ● PUBLISHING
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-xs font-bold">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            ⚠ ERROR
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]"></span>
            ● AUTONOMOUS — WAITING
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-[#f8fafc] font-sans selection:bg-cyan-500/30 overflow-x-hidden">
      {/* Toast Notification */}
      {toastMsg && (
        <div id="toast_notification" className="fixed bottom-6 right-6 z-50 bg-[#1e293b] border border-cyan-500/50 text-slate-100 px-4 py-3 rounded-lg shadow-2xl font-mono text-xs sm:text-sm flex items-center gap-2 animate-bounce max-w-[90vw]">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Backend Offline Alert Banner */}
      {isOffline && agentId && (
        <div className="bg-red-500/15 border-b border-red-500/30 px-4 py-2.5 text-center text-red-300 font-mono text-xs flex items-center justify-center gap-2 flex-wrap">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span><strong>NYVORA BACKEND OFFLINE</strong> — Reconnecting to server...</span>
          <button
            onClick={() => fetchDashboard(agentId)}
            className="px-2.5 py-1 bg-red-600/30 hover:bg-red-600/40 border border-red-500/50 rounded text-red-200 text-[11px] transition ml-2"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Loading Modal Overlay */}
      {loading && (
        <div id="loading_overlay" className="fixed inset-0 z-50 bg-[#0b0f19]/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700/60 rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl">
            <div className="w-12 h-12 border-4 border-slate-800 border-t-cyan-400 rounded-full animate-spin mx-auto mb-6"></div>
            <h3 className="font-mono text-base sm:text-lg font-bold text-cyan-400 tracking-wider mb-2">
              {loadingStages[loadingStage].title}
            </h3>
            <p className="text-slate-400 text-xs sm:text-sm mb-6">
              {loadingStages[loadingStage].sub}
            </p>
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-teal-400 to-cyan-400 h-full transition-all duration-500"
                style={{ width: `${((loadingStage + 1) / loadingStages.length) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Reconfigure Modal Overlay */}
      {reconfigureOpen && (
        <div className="fixed inset-0 z-50 bg-[#0b0f19]/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-mono text-sm sm:text-base font-bold text-cyan-400 flex items-center gap-2">
                <Sliders className="w-4 h-4" />
                Reconfigure Nyvora Agent
              </h3>
              <button
                onClick={() => setReconfigureOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReconfigure} className="space-y-4 font-sans text-xs">
              <div>
                <label className="block font-mono text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Persona Name
                </label>
                <input
                  type="text"
                  value={personaName}
                  onChange={(e) => setPersonaName(e.target.value)}
                  className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Domain Focus
                </label>
                <input
                  type="text"
                  value={personaDomain}
                  onChange={(e) => setPersonaDomain(e.target.value)}
                  className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Core Technical Interests
                </label>
                <input
                  type="text"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Editorial Style
                  </label>
                  <select
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Technical, Analytical & Objective">Technical & Analytical</option>
                    <option value="Critical & Research-Focused">Critical & Research-Focused</option>
                    <option value="Concise Systems Architect Voice">Systems Architect Voice</option>
                  </select>
                </div>

                <div>
                  <label className="block font-mono text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Publishing Interval
                  </label>
                  <select
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                    className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value={1}>Every 1 Minute</option>
                    <option value={5}>Every 5 Minutes</option>
                    <option value={15}>Every 15 Minutes</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-mono text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Custom Editorial Criteria / Anti-Hype Rules
                </label>
                <textarea
                  rows={3}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800 gap-2">
                <button
                  type="button"
                  onClick={handleResetAgent}
                  className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-lg font-mono text-xs font-bold transition min-h-[44px]"
                >
                  Reset Persona
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReconfigureOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-mono text-xs font-bold transition min-h-[44px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-mono text-xs font-bold transition shadow-lg shadow-cyan-500/20 min-h-[44px]"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* VIEW 1: INITIAL CONFIGURATION SCREEN */}
        {!agentId ? (
          <main id="config_screen" className="max-w-3xl mx-auto py-4 sm:py-6">
            <div className="text-center mb-8 sm:mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs font-bold tracking-widest mb-4">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                AUTONOMOUS AI PERSONA
              </div>
              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-400 bg-clip-text text-transparent mb-3">
                Nyvora Intelligence
              </h1>
              <p className="text-teal-400 font-semibold text-base sm:text-lg mb-2">
                "AI that watches what changes next."
              </p>
              <p className="text-slate-400 text-xs sm:text-sm max-w-xl mx-auto leading-relaxed">
                Autonomous AI & Technology Observer • Nyvora independently discovers live technical research, evaluates candidate topics against strict editorial standards, rejects hype, and publishes structured intelligence with verified source links.
              </p>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 sm:p-8 shadow-2xl">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-6 font-mono text-xs font-bold text-slate-400 uppercase tracking-wider">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Configure Persona & Editorial Policy
              </div>

              <form onSubmit={handleInitAgent} className="space-y-5 sm:space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="block font-mono text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Persona Name
                    </label>
                    <input
                      type="text"
                      value={personaName}
                      onChange={(e) => setPersonaName(e.target.value)}
                      className="w-full bg-[#0b0f19] border border-slate-700/80 rounded-lg px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Domain Focus
                    </label>
                    <input
                      type="text"
                      value={personaDomain}
                      onChange={(e) => setPersonaDomain(e.target.value)}
                      className="w-full bg-[#0b0f19] border border-slate-700/80 rounded-lg px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-mono text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Core Technical Interests
                  </label>
                  <input
                    type="text"
                    value={interests}
                    onChange={(e) => setInterests(e.target.value)}
                    className="w-full bg-[#0b0f19] border border-slate-700/80 rounded-lg px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                    placeholder="e.g. AI agents, compiler design, open-source models"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="block font-mono text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Editorial Style
                    </label>
                    <select
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                      className="w-full bg-[#0b0f19] border border-slate-700/80 rounded-lg px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                    >
                      <option value="Technical, Analytical & Objective">Technical & Analytical</option>
                      <option value="Critical & Research-Focused">Critical & Research-Focused</option>
                      <option value="Concise Systems Architect Voice">Concise Systems Architect Voice</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-mono text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Publishing Interval
                    </label>
                    <select
                      value={intervalMinutes}
                      onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                      className="w-full bg-[#0b0f19] border border-slate-700/80 rounded-lg px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                    >
                      <option value={1}>Every 1 Minute (Fast Research)</option>
                      <option value={5}>Every 5 Minutes</option>
                      <option value={15}>Every 15 Minutes</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-mono text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Custom Editorial Criteria / Anti-Hype Rules
                  </label>
                  <textarea
                    rows={3}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="w-full bg-[#0b0f19] border border-slate-700/80 rounded-lg p-3 text-slate-100 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                    placeholder="Instructions for rejecting low quality or promotional candidates..."
                  />
                </div>

                <button
                  type="submit"
                  id="init_agent_button"
                  className="w-full min-h-[44px] py-3.5 px-6 rounded-lg bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 text-white font-mono font-bold text-sm tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition transform active:scale-[0.99]"
                >
                  <Zap className="w-4 h-4 fill-current" />
                  INITIALIZE NYVORA
                </button>
              </form>
            </div>
          </main>
        ) : (
          /* VIEW 2: AUTONOMOUS COMMAND CENTER & BENTO GRID */
          <main id="dashboard_screen" className="space-y-6">
            {/* Header Controls */}
            <header id="overview" className="flex flex-col md:flex-row md:items-center justify-between pb-4 sm:pb-6 border-b border-slate-800 gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-400 bg-clip-text text-transparent">
                      Nyvora Intelligence
                    </h1>
                    {getStatusBadge()}
                  </div>
                  <p className="text-slate-400 text-xs mt-1 font-mono">
                    "AI that watches what changes next." • Autonomous AI & Technology Observer
                  </p>
                </div>

                {/* Mobile Navigation Toggle Button */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden p-2 text-slate-400 hover:text-white bg-slate-800/80 rounded-lg border border-slate-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Toggle Navigation Menu"
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>

              {/* Mobile Drawer Menu */}
              {mobileMenuOpen && (
                <nav className="md:hidden bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-2 font-mono text-xs">
                  <button
                    onClick={() => scrollToSection('overview')}
                    className="w-full text-left px-3 py-2 rounded text-slate-200 hover:bg-slate-800 flex items-center gap-2 min-h-[44px]"
                  >
                    <Activity className="w-4 h-4 text-cyan-400" />
                    Overview
                  </button>
                  <button
                    onClick={() => scrollToSection('feed')}
                    className="w-full text-left px-3 py-2 rounded text-slate-200 hover:bg-slate-800 flex items-center gap-2 min-h-[44px]"
                  >
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    Intelligence Feed
                  </button>
                  <button
                    onClick={() => scrollToSection('console')}
                    className="w-full text-left px-3 py-2 rounded text-slate-200 hover:bg-slate-800 flex items-center gap-2 min-h-[44px]"
                  >
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    Command Console
                  </button>
                  <button
                    onClick={() => scrollToSection('decisions')}
                    className="w-full text-left px-3 py-2 rounded text-slate-200 hover:bg-slate-800 flex items-center gap-2 min-h-[44px]"
                  >
                    <Filter className="w-4 h-4 text-cyan-400" />
                    Editorial Decisions
                  </button>
                  <button
                    onClick={() => scrollToSection('memory')}
                    className="w-full text-left px-3 py-2 rounded text-slate-200 hover:bg-slate-800 flex items-center gap-2 min-h-[44px]"
                  >
                    <Brain className="w-4 h-4 text-cyan-400" />
                    Memory & Themes
                  </button>
                </nav>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleCopyAgentId}
                  id="copy_agent_id_btn"
                  className="inline-flex items-center gap-2 px-3 py-2 bg-[#111827] border border-slate-700/80 rounded-lg text-slate-300 hover:text-white font-mono text-xs transition min-h-[44px]"
                >
                  <span className="text-slate-500">ID:</span>
                  <span>{agentId.substring(0, 10)}...</span>
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                </button>

                <div className="flex flex-col items-start">
                  <button
                    onClick={handleTriggerCycle}
                    disabled={triggering}
                    id="trigger_cycle_btn"
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-600/30 rounded-lg font-mono text-xs font-bold transition disabled:opacity-50 min-h-[44px]"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${triggering ? 'animate-spin text-cyan-400' : ''}`} />
                    {triggering ? 'Running Cycle...' : 'RUN TEST CYCLE'}
                  </button>
                </div>

                <button
                  onClick={handleOpenReconfigure}
                  id="reconfigure_agent_btn"
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800/60 border border-slate-700/80 text-slate-300 hover:text-white rounded-lg font-mono text-xs transition min-h-[44px]"
                >
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  Reconfigure
                </button>
              </div>
            </header>

            {/* Metrics Bar */}
            <section id="metrics_bar" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between">
                <span className="font-mono text-[10px] font-bold text-slate-500 uppercase tracking-wider">Discovered</span>
                <span className="font-mono text-xl sm:text-2xl font-extrabold text-slate-100">{metrics.topics_discovered}</span>
                <span className="text-[11px] text-slate-500">Candidate items</span>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between">
                <span className="font-mono text-[10px] font-bold text-slate-500 uppercase tracking-wider">Evaluated</span>
                <span className="font-mono text-xl sm:text-2xl font-extrabold text-cyan-400">{metrics.topics_evaluated}</span>
                <span className="text-[11px] text-slate-500">Gemini criteria checks</span>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between">
                <span className="font-mono text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rejected</span>
                <span className="font-mono text-xl sm:text-2xl font-extrabold text-amber-400">{metrics.topics_rejected}</span>
                <span className="text-[11px] text-slate-500">Filtered hype/duplicates</span>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between">
                <span className="font-mono text-[10px] font-bold text-slate-500 uppercase tracking-wider">Published</span>
                <span className="font-mono text-xl sm:text-2xl font-extrabold text-emerald-400">{metrics.topics_published}</span>
                <span className="text-[11px] text-slate-500">High-score intelligence</span>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between">
                <span className="font-mono text-[10px] font-bold text-slate-500 uppercase tracking-wider">Selectivity Rate</span>
                <span className="font-mono text-xl sm:text-2xl font-extrabold text-teal-300">{metrics.selectivity_rate}</span>
                <span className="text-[11px] text-slate-500">Published / Evaluated</span>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between font-mono text-xs">
                <span className="font-mono text-[10px] font-bold text-slate-500 uppercase tracking-wider">Next Research</span>
                <div className="text-cyan-400 font-bold text-lg sm:text-xl font-mono flex items-center gap-1">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span>{countdownText}</span>
                </div>
                <span className="text-[10px] text-slate-500">Backend countdown</span>
              </div>
            </section>

            {/* Bento Grid */}
            <section id="bento_grid" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Column 1 & 2: Live Intelligence Feed */}
              <div id="feed" className="lg:col-span-2 space-y-4">
                <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 sm:p-5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <h2 className="font-mono text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider">
                      Published Intelligence Feed ({posts.length})
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-slate-500">Sorted Newest First</span>
                </div>

                <div id="feed_list" className="space-y-4 md:max-h-[750px] md:overflow-y-auto max-h-none overflow-visible pr-0 md:pr-1">
                  {isInitialLoading ? (
                    /* Skeleton Loader */
                    <div className="space-y-4">
                      {[1, 2].map(n => (
                        <div key={n} className="bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-4 animate-pulse">
                          <div className="h-4 bg-slate-800 rounded w-1/3"></div>
                          <div className="h-16 bg-slate-800/60 rounded"></div>
                          <div className="h-12 bg-slate-800/40 rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) : posts.length === 0 ? (
                    <div className="bg-[#111827] border border-slate-800 rounded-2xl p-8 sm:p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                      <div className="w-8 h-8 border-3 border-slate-700 border-t-cyan-400 rounded-full animate-spin"></div>
                      <p className="font-mono text-sm font-semibold text-cyan-400">
                        Nyvora is researching...
                      </p>
                      <p className="text-xs text-slate-400 max-w-md font-mono">
                        Waiting for the first high-confidence signal. Nyvora is continuously discovering and evaluating candidate technical topics from Hacker News, ArXiv CS.AI, and GitHub.
                      </p>
                    </div>
                  ) : (
                    posts.map((p) => {
                      const isNew = newPostIds.has(p.id);
                      const isExpanded = expandedPostIds.has(p.id);
                      const isLong = p.text.length > 380;
                      const displayText = (!isLong || isExpanded) ? p.text : p.text.substring(0, 380) + '...';

                      return (
                        <article
                          key={p.id}
                          id={`post_${p.id}`}
                          className={`bg-[#111827] border border-slate-800 hover:border-cyan-500/50 rounded-2xl p-5 sm:p-6 space-y-4 transition relative h-auto overflow-visible ${
                            isNew ? 'ring-2 ring-cyan-400/80 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : ''
                          }`}
                        >
                          {isNew && (
                            <span className="absolute -top-3 left-6 px-2.5 py-0.5 rounded-full bg-cyan-500 text-[#0b0f19] font-mono text-[10px] font-extrabold uppercase tracking-wider animate-pulse">
                              NEW INTELLIGENCE
                            </span>
                          )}

                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2.5 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs font-bold">
                                {p.category || 'AI & Tech'}
                              </span>
                              <span className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold">
                                Editorial Score: {p.editorial_score}/100
                              </span>
                            </div>
                            <time className="font-mono text-xs text-slate-500">
                              {new Date(p.createdAt).toLocaleString()}
                            </time>
                          </div>

                          <div className="text-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-line font-normal break-words">
                            {displayText}
                            {isLong && (
                              <button
                                onClick={() => togglePostExpanded(p.id)}
                                className="ml-2 text-cyan-400 hover:text-cyan-300 underline font-mono text-xs font-bold inline-block"
                              >
                                {isExpanded ? 'Read Less' : 'Read More'}
                              </button>
                            )}
                          </div>

                          {/* Structured Editorial Rationale */}
                          {renderRationale(p.rationale)}

                          {/* Sources List */}
                          {p.sources && p.sources.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap pt-1">
                              <span className="font-mono text-[11px] text-slate-500">Verified Sources:</span>
                              {p.sources.map((s, idx) => (
                                <a
                                  key={idx}
                                  href={s}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs font-mono text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded hover:bg-cyan-500/20 transition break-all"
                                >
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                  <span>{s}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Column 3: Command Console, Decision Ledger & Memory */}
              <div className="space-y-6">
                {/* Command Direction Console */}
                <div id="console" className="bg-[#111827] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-300 uppercase tracking-wider">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    Editorial Command Console
                  </div>
                  <p className="text-xs text-slate-400 leading-normal">
                    Direct Nyvora's future autonomous cycles by updating its research focus.
                  </p>
                  <form onSubmit={handleSendDirection} className="space-y-2">
                    <input
                      type="text"
                      value={commandInput}
                      onChange={(e) => setCommandInput(e.target.value)}
                      placeholder="Focus on AI security, open-source agents, model efficiency..."
                      className="w-full bg-[#0b0f19] border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 transition min-h-[44px]"
                    />
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 rounded-lg font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition min-h-[44px]"
                    >
                      <Send className="w-3.5 h-3.5" />
                      UPDATE RESEARCH DIRECTION
                    </button>
                    {directionFeedback && (
                      <p className="text-emerald-400 font-mono text-xs font-bold text-center mt-1">
                        {directionFeedback}
                      </p>
                    )}
                  </form>
                </div>

                {/* Editorial Decisions Ledger */}
                <div id="decisions" className="bg-[#111827] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-300 uppercase tracking-wider">
                      <Filter className="w-4 h-4 text-cyan-400" />
                      Editorial Decisions ({decisions.length})
                    </div>
                  </div>

                  <div id="decisions_list" className="space-y-2.5 md:max-h-72 md:overflow-y-auto max-h-none overflow-visible pr-0 md:pr-1">
                    {decisions.length === 0 ? (
                      <p className="font-mono text-xs text-slate-500 text-center py-4">Awaiting candidate evaluations...</p>
                    ) : (
                      decisions.map((d) => (
                        <div key={d.id} className="bg-[#0b0f19] border border-slate-800/80 rounded-xl p-3 text-xs space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <span className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                              d.decision === 'PUBLISHED' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            }`}>
                              {d.decision} ({d.score}/100)
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">
                              {new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div className="font-semibold text-slate-200 text-xs">{d.title}</div>

                          {/* Criteria Checkmarks */}
                          {d.criteria && (
                            <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-400 bg-slate-900/60 p-1.5 rounded">
                              <span className={d.criteria.technical_significance ? 'text-emerald-400' : 'text-slate-500'}>
                                {d.criteria.technical_significance ? '✓' : '✗'} Tech Significance
                              </span>
                              <span className={d.criteria.timely ? 'text-emerald-400' : 'text-slate-500'}>
                                {d.criteria.timely ? '✓' : '✗'} Timely
                              </span>
                              <span className={d.criteria.strong_source ? 'text-emerald-400' : 'text-slate-500'}>
                                {d.criteria.strong_source ? '✓' : '✗'} Credible Source
                              </span>
                              <span className={d.criteria.persona_relevance ? 'text-emerald-400' : 'text-slate-500'}>
                                {d.criteria.persona_relevance ? '✓' : '✗'} Persona Relevance
                              </span>
                            </div>
                          )}

                          {/* Memory Match Tag */}
                          {d.match_type && (
                            <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400 bg-slate-900/40 px-2 py-1 rounded">
                              <span className="text-slate-500">Memory Match:</span>
                              <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${
                                d.match_type === 'exact' || d.match_type === 'near_duplicate'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : d.match_type === 'related'
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}>
                                {d.match_type} {d.memory_similarity !== undefined ? `(${Math.round(d.memory_similarity * 100)}%)` : ''}
                              </span>
                              {d.matched_post_id && (
                                <span className="text-cyan-400 font-semibold">(Post {d.matched_post_id})</span>
                              )}
                            </div>
                          )}

                          <p className="text-slate-300 text-[11px] leading-relaxed">{d.reason}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Memory & Themes Section */}
                <div id="memory" className="bg-[#111827] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-3">
                    <Brain className="w-4 h-4 text-cyan-400" />
                    Memory & Active Themes
                  </div>

                  {/* Active Themes Badges */}
                  <div className="space-y-1.5">
                    <span className="font-mono text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Active Research Themes
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {activeThemes.map((theme, idx) => (
                        <span key={idx} className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 rounded font-mono text-[11px] flex items-center gap-1">
                          <Tag className="w-3 h-3 text-cyan-400" />
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Memory Ledger */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                    <span className="font-mono text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Topic Memory History ({memory.length})
                    </span>
                    <div id="memory_list" className="space-y-1.5 md:max-h-48 md:overflow-y-auto max-h-none overflow-visible text-xs font-mono pr-0 md:pr-1">
                      {memory.length === 0 ? (
                        <p className="text-slate-500 text-center py-2 text-xs">No stored memory records yet.</p>
                      ) : (
                        memory.map((m) => (
                          <div key={m.id} className="bg-[#0b0f19] px-2.5 py-1.5 rounded flex items-center justify-between text-slate-300 gap-2">
                            <span className="truncate text-[11px]">{m.topic_title}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                              m.status === 'PUBLISHED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                            }`}>
                              {m.status}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Activity Logs */}
                <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-3">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    Autonomous Worker Log
                  </div>

                  <div id="activity_list" className="font-mono text-[11px] space-y-2 md:max-h-48 md:overflow-y-auto max-h-none overflow-visible pr-0 md:pr-1">
                    {activities.length === 0 ? (
                      <p className="text-slate-500 text-center py-4 text-xs">Initializing log stream...</p>
                    ) : (
                      activities.map((a) => (
                        <div key={a.id} className="border-b border-slate-800/60 pb-1.5 flex gap-2">
                          <span className="text-slate-500 whitespace-nowrap">
                            {new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                          <span className="text-cyan-400 font-bold shrink-0">{a.event}:</span>
                          <span className="text-slate-400 truncate">{a.details || ''}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          </main>
        )}
      </div>
    </div>
  );
}
