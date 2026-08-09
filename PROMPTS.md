# PROMPTS.md

# Nyvora — Vibe Coding Prompt History

> This file documents the AI-assisted development process used to build
> Nyvora during the hackathon.
>
> Primary AI development tool: Google AI Studio
>
> The prompts below cover the major development stages, feature
> requirements, debugging, UI/UX refinement, and hackathon compliance.

---

# 1. Project Concept & Hackathon Requirements

## Prompt

Build an autonomous AI and technology persona for the hackathon.

The agent must operate independently after initialization and must not
require additional human prompts.

Core capabilities:

- Discover AI and technology topics from live information sources
- Decide whether a topic is worth publishing
- Maintain a consistent editorial persona
- Remember previously published content
- Publish new content autonomously over time
- Provide publishing rationale
- Provide genuine source URLs
- Continue operating without additional human input

The agent must expose:

POST /api/agent/init

and:

GET /api/agent/feed?agentId=...

The feed must return:

- unique post ID
- ISO 8601 UTC timestamp
- generated post text
- publishing rationale
- source URLs

Previously published posts must remain available.

Publishing must happen over time rather than generating everything during
initialization.

Simulated publishing is acceptable, but the autonomous behavior must be
real.

---

# 2. Nyvora Persona

## Prompt

Create an original AI and technology persona named:

Nyvora

Domain:

AI & Technology

Identity:

Autonomous AI & Technology Observer

Nyvora should have:

- a recognizable identity
- stable interests
- consistent writing style
- distinct editorial opinions
- coherent voice

Nyvora should focus on meaningful developments in AI and technology.

Editorial principle:

"Don't report what's loud. Report what changes how AI is built or used."

Writing style:

- Technical but understandable
- Concise
- Analytical
- Evidence-driven
- Low-hype
- No clickbait
- Focused on meaningful technological change

All generated posts should sound like the same persona.

---

# 3. Autonomous Agent Architecture

## Prompt

Build Nyvora as a genuinely autonomous agent rather than a static
dashboard.

The autonomous lifecycle should be:

DISCOVER
→ EVALUATE
→ MEMORY CHECK
→ REJECT / SELECT
→ WRITE
→ PUBLISH
→ PERSIST
→ WAIT
→ REPEAT

After:

POST /api/agent/init

the agent must continue operating without additional user prompts.

The browser must not need to remain open.

The evaluator must be able to initialize the agent once and then only
query the feed endpoint.

The frontend must not be responsible for generating autonomous posts.

The backend must continue the autonomous process independently.

---

# 4. Live Topic Discovery

## Prompt

Implement live AI and technology topic discovery.

Use genuine live information sources such as:

- technology news
- AI research
- open-source projects
- Hacker News
- developer platforms
- research publications
- primary technical sources

Every discovered candidate should retain its genuine source URL.

Do not fabricate sources.

Prevent duplicate processing of the same source item.

Discovery should be performed by the autonomous backend rather than by
manual user interaction.

---

# 5. Editorial Judgment

## Prompt

Implement editorial judgment so Nyvora does not publish every topic it
discovers.

Evaluate candidates using factors such as:

- Technical significance
- Novelty
- Timeliness
- AI/technology relevance
- Source credibility
- Practical impact
- Developer relevance
- Similarity to previously covered topics

Use an editorial threshold.

Candidates below the threshold should intentionally be rejected.

Store rejected topics and the reasons for rejection.

The system should demonstrate that Nyvora actively decides what deserves
publication.

---

# 6. Persistent Memory

## Prompt

Implement persistent memory for Nyvora.

Nyvora should remember:

- Previously published topics
- Previously rejected topics
- Covered themes
- Similar topics
- Publishing history

Before publishing a candidate, compare it against previous content.

If the candidate is substantially similar to previous content, reject it
and record the reason.

Previously published posts must remain available after:

- browser refresh
- server restart
- future autonomous cycles

Memory must be stored persistently rather than only in frontend state.

---

# 7. Autonomous Publishing

## Prompt

Implement autonomous publishing over time.

Do not generate all posts during initialization.

After initialization, Nyvora should independently:

1. Discover candidates
2. Deduplicate candidates
3. Evaluate candidates
4. Check memory
5. Select suitable candidates
6. Generate an original post
7. Generate publishing rationale
8. Persist the post
9. Schedule the next cycle

A failed cycle must not permanently stop the autonomous agent.

Only one autonomous worker should exist for each initialized agent.

Prevent duplicate workers and overlapping cycles.

The evaluator should be able to close the browser and Nyvora should
continue operating.

---

# 8. Publishing Rationale

## Prompt

Every published post must include transparent publishing rationale.

The rationale should explain:

1. Why the topic was selected
2. Why it is relevant now
3. Why it was chosen over other candidates

Every post must also contain genuine source URLs.

The API response should expose:

- id
- createdAt
- text
- rationale
- sources

Do not fabricate source URLs or publishing reasons.

---

# 9. Required API

## Prompt

Implement the exact hackathon API contract.

Initialization:

POST /api/agent/init

Request:

{
  "persona": {
    "name": "Nyvora",
    "domain": "AI & Technology"
  }
}

Response:

{
  "agentId": "..."
}

Feed:

GET /api/agent/feed?agentId=...

Response:

{
  "posts": [
    {
      "id": "...",
      "createdAt": "...",
      "text": "...",
      "rationale": "...",
      "sources": [
        "https://..."
      ]
    }
  ]
}

Requirements:

- Posts must be newest first
- Every post must have a unique ID
- createdAt must be ISO 8601 UTC
- Previously returned posts must remain available
- Empty feed must return {"posts": []}

The feed endpoint must be read-only.

GET /api/agent/feed must never:

- trigger discovery
- trigger generation
- create posts
- start an autonomous cycle
- increment metrics

---

# 10. Interactive Nyvora Intelligence Dashboard

## Prompt

Create a responsive interactive dashboard called:

NYVORA INTELLIGENCE

Use the tagline:

"AI that watches what changes next."

The dashboard should allow users to observe Nyvora's autonomous activity.

Include:

- Autonomous status
- Next cycle countdown
- Published Intelligence Feed
- Editorial Decisions
- Memory & Themes
- Research Direction
- Autonomous Activity
- Agent ID
- Live metrics

The dashboard must use actual backend data.

Do not hardcode live statistics.

The interface should communicate that Nyvora is operating autonomously
rather than behaving like a conventional admin dashboard.

---

# 11. User Input / Research Direction

## Prompt

The dashboard must be interactive.

Add a research-direction input where the user can provide guidance such
as:

"Focus on AI security, open-source agents, model efficiency..."

When submitted:

1. Send the research direction to the backend
2. Persist it
3. Update Nyvora's research configuration
4. Use it during future discovery cycles
5. Update the interface without a full page reload

Show a confirmation such as:

"Research direction updated. Nyvora will use this focus in future cycles."

Updating the research direction must not manually generate a post.

Nyvora must remain autonomous.

---

# 12. Responsive UI

## Prompt

Make the entire Nyvora Intelligence interface genuinely responsive.

It must work at:

- 320px
- 375px
- 390px
- 430px
- 768px
- 1024px
- 1440px
- 1920px

Mobile requirements:

- Hamburger navigation
- Single-column layout
- No horizontal scrolling
- No clipped text
- No overflowing buttons
- Touch-friendly controls
- Naturally scrolling page
- No unnecessary nested scrollbars

Interactive elements must continue working on mobile.

Do not simply shrink the desktop layout.

Create a genuinely responsive interface.

---

# 13. Visual Design

## Prompt

Use a dark intelligence aesthetic for Nyvora.

Design direction:

- Dark navy / black background
- Cyan accents
- Subtle green autonomous indicators
- Technical typography
- Clean borders
- Minimal glow
- Premium AI research system appearance
- Professional polish
- Sleek interface

Avoid excessive cyberpunk styling or gaming aesthetics.

The application should feel like an autonomous AI intelligence system.

---

# 14. Published Intelligence Feed

## Prompt

Create a Published Intelligence Feed using real backend data.

Each post should display:

- Topic/category
- Editorial score
- Timestamp
- Generated post
- Why selected
- Why relevant now
- Why chosen over alternatives
- Source URLs

Implement:

Read More
Read Less

The complete generated post must remain available.

Read More should reveal the complete original post rather than
generating another truncated version.

Do not create unnecessary nested scrolling inside the feed.

The feed must remain newest-first.

---

# 15. Editorial Decisions

## Prompt

Add an Editorial Decisions section showing both accepted and rejected
topics.

For rejected candidates show:

- Topic
- Editorial score
- Rejection reason
- Duplicate/memory reason when applicable
- Timestamp

Make it clear that Nyvora intentionally rejects information instead of
publishing everything it discovers.

All displayed decisions must come from the real backend.

---

# 16. Memory & Themes

## Prompt

Add a Memory & Themes section.

Display real persistent information such as:

- Active themes
- Previously covered topics
- Recent rejections
- Duplicate detection
- Publishing history

The interface should make it clear that Nyvora remembers previous
coverage.

Do not create fake memory entries.

---

# 17. Autonomous Activity

## Prompt

Add an Autonomous Activity section showing the actual lifecycle of Nyvora.

Possible activity states:

DISCOVERY
EDITORIAL
MEMORY
DECISION
PUBLISH
WAIT

Use real backend activity logs.

Do not fabricate activity.

The status should reflect actual backend state where possible.

---

# 18. Worker Safety

## Prompt

Make the autonomous worker safe against duplicate execution.

Prevent:

- Multiple workers for the same agent
- Duplicate initialization
- Overlapping cycles
- Recursive timers
- Repeated processing of identical sources
- Duplicate posts

Only one cycle should run at a time.

A new cycle should only begin after the previous cycle has completed and
the configured interval has elapsed.

Frontend polling must never create autonomous work.

---

# 19. Dashboard Metrics

## Prompt

All dashboard metrics must come from actual backend/database activity.

Metrics include:

- Topics discovered
- Topics evaluated
- Topics rejected
- Topics published
- Selectivity rate
- Last published
- Next autonomous cycle

Do not use fake counters.

Do not randomly increase statistics.

Do not create fake activity to make the dashboard appear more active.

If the database is empty, display zero or an appropriate empty state.

---

# 20. Error Handling

## Prompt

Make the autonomous system resilient.

If live discovery fails:

"Discovery temporarily unavailable. Nyvora will retry automatically."

If Gemini fails, use the configured fallback mechanism where available.

If a source is unavailable, skip it instead of fabricating information.

If one autonomous cycle fails, the worker must continue scheduling future
cycles.

A single error must never permanently stop Nyvora.

---

# 21. Hackathon Compliance Review

## Prompt

Review the complete Nyvora project against the hackathon requirements.

Verify:

- Live topic discovery
- Editorial judgment
- Intentional rejection
- Consistent persona
- Persistent memory
- Autonomous publishing
- Publishing rationale
- Source attribution
- Required initialization endpoint
- Required feed endpoint
- Unique post IDs
- ISO 8601 UTC timestamps
- Reverse chronological feed
- Persistent previous posts
- Responsive interactive UI

The evaluator will call:

POST /api/agent/init

exactly once.

After initialization, the evaluator will only call:

GET /api/agent/feed?agentId=...

New posts must appear over time without additional human prompts.

Do not require the evaluator to use the dashboard or press any buttons.

---

# 22. Final UI / UX Refinement

## Prompt

Refine the existing Nyvora Intelligence interface without rebuilding the
application from scratch.

Keep the existing autonomous backend, API endpoints, memory, discovery,
editorial engine, publishing logic, and database.

Improve:

- Responsive behavior
- Mobile navigation
- Feed readability
- Read More / Read Less
- Autonomous status
- Activity timeline
- Research direction interaction
- Visual hierarchy
- Empty states
- Error states
- Mobile touch interactions

Do not turn the application into a static mockup.

Do not replace backend data with hardcoded frontend data.

---

# 23. Final Evaluation Readiness

## Prompt

Perform a final evaluation-readiness pass.

Verify the following sequence:

1. Initialize Nyvora once.
2. Receive an agentId.
3. Start the autonomous process.
4. Close the browser.
5. Wait for the configured autonomous interval.
6. Query the feed endpoint.
7. Confirm that new posts can appear without human interaction.
8. Confirm that previous posts remain available.
9. Confirm that posts contain rationale and genuine sources.
10. Confirm that the feed is newest-first.
11. Confirm that memory prevents unnecessary repetition.
12. Confirm that rejected candidates are actually recorded.
13. Confirm that the dashboard reflects real backend state.
14. Confirm that mobile interactions work.
15. Confirm that no secrets are exposed in the repository.

The final project must be a working autonomous AI application, not a
static visual demonstration.

---

# 24. Final Identity

## Prompt

Use the final product identity:

# NYVORA INTELLIGENCE

Tagline:

"AI that watches what changes next."

Description:

"An autonomous AI & technology observer that discovers, evaluates,
remembers, and publishes meaningful signals from the technology
ecosystem."

Nyvora should feel like the intelligence itself, not a dashboard that
requires a human operator.

The user observes Nyvora.

Nyvora does not depend on the user.

---

# Development Notes

The project was developed iteratively using AI-assisted "vibe coding".

Human decisions included:

- Project concept
- Nyvora name and identity
- Persona direction
- Editorial philosophy
- Feature requirements
- Hackathon requirements
- UI/UX preferences
- Testing decisions
- Deployment decisions
- Final acceptance of generated changes

AI assistance was used to implement, refine, debug, and improve the
application based on these requirements.

This file is provided for hackathon authenticity and transparency.
