// NYVORA FRONTEND CONTROLLER & READ-ONLY DASHBOARD POLLER

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const configScreen = document.getElementById('configScreen');
    const dashboardScreen = document.getElementById('dashboardScreen');
    const initForm = document.getElementById('initForm');
    const initBtn = document.getElementById('initBtn');
    
    // Loading Modal Elements
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingStageTitle = document.getElementById('loadingStageTitle');
    const loadingStageSubtitle = document.getElementById('loadingStageSubtitle');
    const progressFill = document.getElementById('progressFill');

    // Dashboard Elements
    const displayAgentId = document.getElementById('displayAgentId');
    const copyAgentIdBtn = document.getElementById('copyAgentIdBtn');
    const resetAgentBtn = document.getElementById('resetAgentBtn');
    
    // Metrics Elements
    const mDiscovered = document.getElementById('mDiscovered');
    const mEvaluated = document.getElementById('mEvaluated');
    const mRejected = document.getElementById('mRejected');
    const mPublished = document.getElementById('mPublished');
    const mSelectivity = document.getElementById('mSelectivity');
    const mLastCycle = document.getElementById('mLastCycle');
    const mNextCycle = document.getElementById('mNextCycle');

    // Panels Elements
    const feedList = document.getElementById('feedList');
    const decisionsList = document.getElementById('decisionsList');
    const activityList = document.getElementById('activityList');
    const memoryList = document.getElementById('memoryList');
    const directionForm = document.getElementById('directionForm');
    const commandInput = document.getElementById('commandInput');

    let currentAgentId = localStorage.getItem('nyvora_agent_id');
    let pollIntervalId = null;

    // Toast helper
    function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3500);
    }

    // Initialize application on load
    if (currentAgentId) {
        switchToDashboard(currentAgentId);
    }

    // Form Submit Handler
    initForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            persona: {
                name: document.getElementById('personaName').value.trim() || "Nyvora",
                domain: document.getElementById('personaDomain').value.trim() || "AI & Technology"
            },
            interests: document.getElementById('personaInterests').value.trim(),
            voice: document.getElementById('editorialVoice').value,
            instructions: document.getElementById('editorialInstructions').value.trim(),
            interval_minutes: parseInt(document.getElementById('publishingInterval').value, 10) || 1
        };

        // Start loading visual sequence
        showLoadingSequence(async () => {
            try {
                const response = await fetch('/api/agent/init', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || "Initialization failed");
                }

                const data = await response.json();
                const agentId = data.agentId;

                if (!agentId) {
                    throw new Error("Invalid agentId returned from server");
                }

                localStorage.setItem('nyvora_agent_id', agentId);
                currentAgentId = agentId;

                switchToDashboard(agentId);
                showToast("Nyvora initialized successfully! Autonomous worker activated.");

            } catch (err) {
                loadingOverlay.classList.add('hidden');
                alert("Initialization Error: " + err.message);
            }
        });
    });

    // Loading Stages Simulation connected to POST
    function showLoadingSequence(onComplete) {
        loadingOverlay.classList.remove('hidden');
        
        const stages = [
            { title: "INITIALIZING AGENT", subtitle: "Creating persona state and initializing memory...", progress: "20%" },
            { title: "CONNECTING TO SOURCES", subtitle: "Fetching Hacker News, ArXiv CS.AI & GitHub feeds...", progress: "45%" },
            { title: "LOADING MEMORY", subtitle: "Building SQLite deduplication & topic tracking state...", progress: "70%" },
            { title: "ACTIVATING AGENT", subtitle: "Starting autonomous background worker thread...", progress: "90%" },
            { title: "AUTONOMOUS", subtitle: "Nyvora is now observing and publishing independently.", progress: "100%" }
        ];

        let index = 0;
        const interval = setInterval(() => {
            if (index < stages.length) {
                loadingStageTitle.textContent = stages[index].title;
                loadingStageSubtitle.textContent = stages[index].subtitle;
                progressFill.style.width = stages[index].progress;
                index++;
            } else {
                clearInterval(interval);
                setTimeout(() => {
                    loadingOverlay.classList.add('hidden');
                    if (onComplete) onComplete();
                }, 500);
            }
        }, 400);
    }

    // Switch View to Live Dashboard
    function switchToDashboard(agentId) {
        currentAgentId = agentId;
        configScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');
        displayAgentId.textContent = agentId.substring(0, 8) + '...';

        // Trigger immediate fetch
        fetchDashboardData(agentId);

        // Start periodic polling every 12 seconds for read-only updates
        if (pollIntervalId) clearInterval(pollIntervalId);
        pollIntervalId = setInterval(() => {
            fetchDashboardData(agentId);
        }, 12000);
    }

    // Copy Agent ID handler
    copyAgentIdBtn.addEventListener('click', () => {
        if (currentAgentId) {
            navigator.clipboard.writeText(currentAgentId);
            showToast("Copied Agent ID to clipboard!");
        }
    });

    // Reset Agent handler
    resetAgentBtn.addEventListener('click', () => {
        if (confirm("Reset current agent and reconfigure? (Previous agent data will remain saved in database)")) {
            localStorage.removeItem('nyvora_agent_id');
            currentAgentId = null;
            if (pollIntervalId) clearInterval(pollIntervalId);
            dashboardScreen.classList.add('hidden');
            configScreen.classList.remove('hidden');
        }
    });

    // Fetch All Dashboard Data (Read-only GET requests)
    async function fetchDashboardData(agentId) {
        fetchMetrics(agentId);
        fetchFeed(agentId);
        fetchDecisions(agentId);
        fetchActivity(agentId);
        fetchMemory(agentId);
    }

    // 1. Fetch Metrics
    async function fetchMetrics(agentId) {
        try {
            const res = await fetch(`/api/agent/metrics?agentId=${agentId}`);
            if (!res.ok) return;
            const data = await res.json();

            mDiscovered.textContent = data.topics_discovered || 0;
            mEvaluated.textContent = data.topics_evaluated || 0;
            mRejected.textContent = data.topics_rejected || 0;
            mPublished.textContent = data.topics_published || 0;
            mSelectivity.textContent = data.selectivity_rate || "0%";

            mLastCycle.textContent = data.last_cycle ? formatTimeAgo(data.last_cycle) : "In Progress";
            mNextCycle.textContent = data.next_cycle ? formatTimeUntil(data.next_cycle) : "Scheduled";

        } catch (e) {
            console.error("Error fetching metrics:", e);
        }
    }

    // 2. Fetch Feed (GET /api/agent/feed?agentId=...)
    async function fetchFeed(agentId) {
        try {
            const res = await fetch(`/api/agent/feed?agentId=${agentId}`);
            if (!res.ok) return;
            const data = await res.json();
            const posts = data.posts || [];

            if (posts.length === 0) {
                feedList.innerHTML = `
                    <div class="empty-feed-placeholder">
                        <div class="spinner-sm"></div>
                        <p>Nyvora's autonomous background worker is observing live sources and evaluating candidate topics...</p>
                        <p class="command-note">The feed will update automatically as new intelligence is published.</p>
                    </div>
                `;
                return;
            }

            feedList.innerHTML = posts.map(p => {
                const dateStr = new Date(p.createdAt).toLocaleString();
                const sourcesHtml = (p.sources || []).map(s => 
                    `<a href="${escapeHtml(s)}" target="_blank" rel="noopener noreferrer" class="source-link">🔗 ${escapeHtml(s)}</a>`
                ).join(' ');

                return `
                    <article class="feed-item" id="${escapeHtml(p.id)}">
                        <div class="feed-item-header">
                            <div class="feed-tags">
                                <span class="badge badge-category">${escapeHtml(p.category || 'AI & Tech')}</span>
                                <span class="badge badge-score">Score: ${p.editorial_score || 85}/100</span>
                            </div>
                            <time class="feed-timestamp" datetime="${escapeHtml(p.createdAt)}">${escapeHtml(dateStr)}</time>
                        </div>
                        <p class="feed-text">${escapeHtml(p.text)}</p>
                        <div class="rationale-box">
                            <div class="rationale-title">EDITORIAL PUBLISHING RATIONALE</div>
                            <p>${escapeHtml(p.rationale)}</p>
                        </div>
                        <div class="sources-list">
                            ${sourcesHtml}
                        </div>
                    </article>
                `;
            }).join('');

        } catch (e) {
            console.error("Error fetching feed:", e);
        }
    }

    // 3. Fetch Editorial Decisions
    async function fetchDecisions(agentId) {
        try {
            const res = await fetch(`/api/agent/decisions?agentId=${agentId}`);
            if (!res.ok) return;
            const data = await res.json();
            const decisions = data.decisions || [];

            if (decisions.length === 0) {
                decisionsList.innerHTML = `<p class="placeholder-text">Awaiting candidate evaluations...</p>`;
                return;
            }

            decisionsList.innerHTML = decisions.map(d => {
                const isPub = d.decision === 'PUBLISHED';
                return `
                    <div class="decision-item">
                        <div class="decision-item-header">
                            <span class="decision-badge ${isPub ? 'published' : 'rejected'}">${d.decision} (${d.score}/100)</span>
                            <span class="activity-time">${formatTimeAgo(d.timestamp)}</span>
                        </div>
                        <div class="decision-title">${escapeHtml(d.title)}</div>
                        <div class="decision-reason">${escapeHtml(d.reason)}</div>
                    </div>
                `;
            }).join('');

        } catch (e) {
            console.error("Error fetching decisions:", e);
        }
    }

    // 4. Fetch Activity Logs
    async function fetchActivity(agentId) {
        try {
            const res = await fetch(`/api/agent/activity?agentId=${agentId}`);
            if (!res.ok) return;
            const data = await res.json();
            const logs = data.activities || [];

            if (logs.length === 0) {
                activityList.innerHTML = `<p class="placeholder-text">Initializing worker activity log...</p>`;
                return;
            }

            activityList.innerHTML = logs.map(a => `
                <div class="activity-item">
                    <span class="activity-time">${new Date(a.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                    <div>
                        <span class="activity-event">${escapeHtml(a.event)}:</span>
                        <span class="activity-details">${escapeHtml(a.details || '')}</span>
                    </div>
                </div>
            `).join('');

        } catch (e) {
            console.error("Error fetching activity:", e);
        }
    }

    // 5. Fetch Memory
    async function fetchMemory(agentId) {
        try {
            const res = await fetch(`/api/agent/memory?agentId=${agentId}`);
            if (!res.ok) return;
            const data = await res.json();
            const memory = data.memory || [];

            if (memory.length === 0) {
                memoryList.innerHTML = `<p class="placeholder-text">Awaiting memory records...</p>`;
                return;
            }

            memoryList.innerHTML = memory.map(m => `
                <div class="memory-item">
                    <span>${escapeHtml(m.topic_title)}</span>
                    <span class="decision-badge ${m.status === 'PUBLISHED' ? 'published' : 'rejected'}">${m.status}</span>
                </div>
            `).join('');

        } catch (e) {
            console.error("Error fetching memory:", e);
        }
    }

    // Handle Nyvora Command Form
    directionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const instructions = commandInput.value.trim();
        if (!instructions || !currentAgentId) return;

        try {
            const res = await fetch('/api/agent/direction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId: currentAgentId,
                    instructions: instructions
                })
            });

            if (res.ok) {
                showToast("Editorial direction updated! Nyvora will adapt future cycles.");
                commandInput.value = '';
                fetchActivity(currentAgentId);
            } else {
                showToast("Failed to update direction.");
            }
        } catch (err) {
            showToast("Network error updating direction.");
        }
    });

    // Helper functions
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatTimeAgo(isoString) {
        if (!isoString) return 'N/A';
        const now = new Date();
        const past = new Date(isoString);
        const diffSec = Math.floor((now - past) / 1000);

        if (diffSec < 10) return 'Just now';
        if (diffSec < 60) return `${diffSec}s ago`;
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        return `${diffHr}h ago`;
    }

    function formatTimeUntil(isoString) {
        if (!isoString) return 'In Progress';
        const now = new Date();
        const target = new Date(isoString);
        const diffSec = Math.floor((target - now) / 1000);

        if (diffSec <= 0) return 'Running cycle...';
        if (diffSec < 60) return `in ${diffSec}s`;
        const diffMin = Math.floor(diffSec / 60);
        return `in ${diffMin}m ${diffSec % 60}s`;
    }
});
