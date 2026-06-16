const API = '';
let currentSessionId = null;
let currentChatMode = 'ollama';
let currentModel = 'llama3.2:3b';
let isStreaming = false;
let abortController = null;

document.addEventListener('DOMContentLoaded', () => {
  initStatus();
  loadModels();
  initChat();
  initOverview();
  initVault();
  initGraph();
  initHealth();
  initModal();
  let pollTimer = setInterval(pollStats, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(pollTimer);
      pollTimer = null;
    } else if (!pollTimer) {
      pollStats();
      pollTimer = setInterval(pollStats, 15000);
    }
  });
  switchTab('chat');
});

function api(path, opts = {}) {
  return fetch(`${API}${path}`, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(r => r.json());
}

function switchTab(name) {
  document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.nav-btn[data-tab="${name}"]`)?.classList.add('active');
  document.getElementById(`tab-${name}`)?.classList.add('active');
  if (name === 'chat') document.getElementById('chatInput')?.focus();
}
window.switchTab = switchTab;

async function initStatus() {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const badge = document.getElementById('chatModeBadge');
  try {
    const data = await api('/');
    if (data.status === 'running') {
      dot.style.background = 'var(--green)';
      text.textContent = 'Connected';
      badge.textContent = data.chatMode === 'opencode' ? 'OpenCode' : 'Ollama';
    }
  } catch {
    dot.style.background = 'var(--red)';
    text.textContent = 'Offline';
  }
}

function onModeChange() {
  currentChatMode = document.getElementById('chatModeSelect').value;
  const modelSelect = document.getElementById('chatModelSelect');
  const badge = document.getElementById('chatModeBadge');
  if (currentChatMode === 'opencode') {
    modelSelect.style.display = 'none';
    badge.textContent = 'OpenCode';
  } else {
    modelSelect.style.display = 'inline-block';
    currentModel = modelSelect.value;
    badge.textContent = 'Ollama';
  }
}
window.onModeChange = onModeChange;

async function loadModels() {
  const sel = document.getElementById('chatModelSelect');
  try {
    const data = await api('/chat/models');
    if (data.ok && data.models.length > 0) {
      sel.innerHTML = data.models.map(m => {
        const short = m.replace(/:latest$/, '');
        const selected = short === currentModel || m === currentModel;
        return `<option value="${esc(m)}"${selected ? ' selected' : ''}>${esc(short)}</option>`;
      }).join('');
      if (!sel.value) sel.selectedIndex = 0;
      currentModel = sel.value;
    }
  } catch (e) { console.warn('[UI] loadModels failed:', e); }
}

async function initChat() {
  const input = document.getElementById('chatInput');
  const btn = document.getElementById('chatSendBtn');
  const messages = document.getElementById('chatMessages');
  const modeSelect = document.getElementById('chatModeSelect');
  const modelSelect = document.getElementById('chatModelSelect');

  currentChatMode = modeSelect.value;
  currentModel = modelSelect.value;

  modeSelect.addEventListener('change', onModeChange);
  modelSelect.addEventListener('change', () => { currentModel = modelSelect.value; });

  async function send() {
    const q = input.value.trim();
    if (!q || isStreaming) return;
    input.value = '';
    input.style.height = 'auto';

    if (!currentSessionId) {
      const sessionRes = await api('/session/start', {
        method: 'POST',
        body: { project: 'brainstorm-chat' },
      });
      if (sessionRes.ok) {
        currentSessionId = sessionRes.context.sessionId;
        document.getElementById('chatSessionLabel').textContent = `Session: ${currentSessionId.slice(0, 8)}`;
      }
    }

    const userDiv = document.createElement('div');
    userDiv.className = 'msg msg-user';
    userDiv.innerHTML = `<div class="msg-content"><p>${esc(q)}</p></div>`;
    messages.appendChild(userDiv);

    const labelDiv = document.createElement('div');
    labelDiv.className = 'msg-label';
    labelDiv.textContent = currentChatMode === 'opencode' ? 'OpenCode' : currentModel;
    messages.appendChild(labelDiv);

    const assistantDiv = document.createElement('div');
    assistantDiv.className = 'msg msg-assistant msg-streaming';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'msg-content';
    contentDiv.textContent = '';
    assistantDiv.appendChild(contentDiv);
    messages.appendChild(assistantDiv);
    messages.scrollTop = messages.scrollHeight;

    isStreaming = true;
    btn.disabled = true;
    abortController = new AbortController();

    try {
      const response = await fetch(`${API}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: q }],
          mode: currentChatMode,
          model: currentModel,
          sessionId: currentSessionId,
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        assistantDiv.classList.remove('msg-streaming');
        assistantDiv.classList.add('msg-error');
        contentDiv.textContent = `Error: ${response.status} ${text}`;
        isStreaming = false;
        btn.disabled = false;
        messages.scrollTop = messages.scrollHeight;
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              fullText += data.token;
              contentDiv.textContent = fullText;
              messages.scrollTop = messages.scrollHeight;
            }
            if (data.done) break;
            if (data.error) {
              assistantDiv.classList.remove('msg-streaming');
              assistantDiv.classList.add('msg-error');
              contentDiv.textContent = `Error: ${data.error}`;
            }
          } catch (e) { console.warn('[UI] SSE parse error:', e); }
        }
      }

      assistantDiv.classList.remove('msg-streaming');
      showContextNotes(q);
    } catch (err) {
      if (err.name !== 'AbortError') {
        assistantDiv.classList.remove('msg-streaming');
        assistantDiv.classList.add('msg-error');
        contentDiv.textContent = `Error: ${err.message}`;
      }
    }

    isStreaming = false;
    btn.disabled = false;
    messages.scrollTop = messages.scrollHeight;
  }

  btn.addEventListener('click', send);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
}

async function showContextNotes(query) {
  const panel = document.getElementById('chatContextPanel');
  const list = document.getElementById('contextList');
  panel.classList.add('visible');

  const data = await api('/memory/search', { method: 'POST', body: { query, limit: 5 } });
  if (!data.ok || !data.results || data.results.length === 0) {
    list.innerHTML = '<div class="context-empty">No vault context matched</div>';
    return;
  }

  list.innerHTML = data.results.map(r => `
    <div class="context-item" onclick="showNote('${esc(r.note.id)}')">
      <div class="context-item-title">${esc(r.note.title)}</div>
      <div class="context-item-meta">
        <span class="type-badge type-${r.note.type}">${r.note.type}</span>
        Score ${r.score.toFixed(1)}
      </div>
    </div>
  `).join('');
}

async function newSession() {
  if (isStreaming && abortController) {
    abortController.abort();
    isStreaming = false;
    document.getElementById('chatSendBtn').disabled = false;
  }

  const project = prompt('Project (optional):') || 'brainstorm-chat';
  const data = await api('/session/start', { method: 'POST', body: { project } });
  if (data.ok) {
    currentSessionId = data.context.sessionId;
    document.getElementById('chatSessionLabel').textContent = `Session: ${currentSessionId.slice(0, 8)}`;
    document.getElementById('chatMessages').innerHTML = `
      <div class="msg msg-system">
        <div class="msg-content"><p>New session started. Ask Brainstorm anything.</p></div>
      </div>`;
    document.getElementById('chatContextPanel').classList.remove('visible');
    document.getElementById('contextList').innerHTML = '<div class="context-empty">No context loaded yet</div>';
    switchTab('chat');
    document.getElementById('chatInput').focus();
    showToast(`Session started for "${project}"`);
  }
}
window.newSession = newSession;

function showToast(text) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#21252b;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px 18px;font-size:13px;z-index:200;box-shadow:0 4px 12px rgba(0,0,0,0.4)';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

async function initOverview() {
  const data = await api('/vault/stats');
  if (!data.ok) return;
  const s = data.stats;
  document.getElementById('stTotal').textContent = s.totalNotes;
  document.getElementById('stLearnings').textContent = s.byType.learning || 0;
  document.getElementById('stDecisions').textContent = s.byType.decision || 0;
  document.getElementById('stSessions').textContent = s.byType.session || 0;
  document.getElementById('stLinks').textContent = s.totalWikilinks || 0;

  const h = await api('/health/summary');
  if (h.ok) document.getElementById('stWords').textContent = h.summary.stats.avgWordCount;

  const sessions = await api('/memory/list?type=session');
  const sEl = document.getElementById('recentSessions');
  if (sessions.ok && sessions.notes.length > 0) {
    sEl.innerHTML = sessions.notes.slice(0, 8).map(n => renderCard(n)).join('');
    addCardListeners(sEl);
  } else {
    sEl.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:8px 0">No sessions yet. Start chatting!</p>';
  }

  const learnings = await api('/memory/list?type=learning');
  const lEl = document.getElementById('recentLearnings');
  if (learnings.ok && learnings.notes.length > 0) {
    lEl.innerHTML = learnings.notes.slice(0, 8).map(n => renderCard(n)).join('');
    addCardListeners(lEl);
  } else {
    lEl.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:8px 0">No learnings yet.</p>';
  }
}

function renderCard(n) {
  const body = (n.body || n.content || '').slice(0, 120);
  return `<div class="card" data-id="${esc(n.id)}">
    <div class="card-title">${esc(n.title)}</div>
    <div class="card-meta">
      <span class="type-badge type-${n.type}">${n.type}</span>
      <span>${new Date(n.updated).toLocaleDateString()}</span>
      ${n.frontmatter?.project ? esc(n.frontmatter.project) : ''}
    </div>
    <div class="card-excerpt">${esc(body)}</div>
  </div>`;
}

function addCardListeners(container) {
  container.querySelectorAll('.card').forEach(c => {
    c.addEventListener('click', () => showNote(c.dataset.id));
  });
}

async function pollStats() {
  try {
    const data = await api('/vault/stats');
    if (data.ok) document.getElementById('stTotal').textContent = data.stats.totalNotes;
  } catch (e) { console.warn('[UI] pollStats failed:', e); }
}

async function initVault() {
  const typeEl = document.getElementById('browserTypeFilter');
  const searchEl = document.getElementById('browserSearch');
  const grid = document.getElementById('vaultGrid');

  async function load() {
    const type = typeEl.value;
    const filter = searchEl.value.toLowerCase().trim();

    let notes;
    if (type === 'all') {
      const promises = ['learning', 'decision', 'concept', 'session', 'project'].map(t =>
        api(`/memory/list?type=${t}`).then(r => r.ok ? r.notes : [])
      );
      notes = (await Promise.all(promises)).flat();
    } else {
      const data = await api(`/memory/list?type=${type}`);
      notes = data.ok ? data.notes : [];
    }

    notes.sort((a, b) => new Date(b.updated) - new Date(a.updated));

    if (filter) {
      notes = notes.filter(n =>
        n.title.toLowerCase().includes(filter) ||
        (n.body || '').toLowerCase().includes(filter)
      );
    }

    if (notes.length === 0) {
      grid.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:16px 0">No notes found</p>';
      return;
    }

    grid.innerHTML = notes.map(n => renderCard(n)).join('');
    addCardListeners(grid);
  }

  typeEl.addEventListener('change', load);
  searchEl.addEventListener('input', load);
  load();
}

async function initGraph() {
  const svg = document.getElementById('graphSvg');
  const hideOrphans = document.getElementById('hideOrphans');

  async function draw() {
    const data = await api('/knowledge/graph');
    let nodes = data.ok ? data.nodes : [];
    let edges = data.ok ? data.edges : [];

    document.getElementById('graphNodeCount').textContent = nodes.length;
    document.getElementById('graphEdgeCount').textContent = edges.length;

    if (nodes.length === 0) {
      svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#5f6368" font-size="13">No connections yet</text>';
      return;
    }

    const width = svg.clientWidth || 800;
    const height = 460;
    let orphans = [];
    if (hideOrphans.checked) {
      const h = await api('/health/report');
      if (h.ok) orphans = h.report.orphans.map(o => o.path);
    }

    const cx = width / 2, cy = height / 2;
    const radius = Math.min(width, height) / 2 - 60;
    const angles = {};
    nodes.forEach((n, i) => { angles[n.id] = (2 * Math.PI * i) / nodes.length; });
    const pos = {};
    nodes.forEach(n => {
      const a = angles[n.id];
      pos[n.id] = { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
    });

    let html = '';
    for (const e of edges) {
      const s = pos[e.source], t = pos[e.target];
      if (s && t) html += `<line class="${e.kind === 'tag' ? 'link-tag' : 'link'}" x1="${s.x}" y1="${s.y}" x2="${t.x}" y2="${t.y}" />`;
    }

    const filtered = hideOrphans.checked ? nodes.filter(n => !orphans.some(o => n.path?.includes(o))) : nodes;
    for (const n of filtered) {
      const p = pos[n.id];
      if (!p) continue;
      html += `<g class="node node-${n.type}" data-id="${esc(n.id)}">
        <circle cx="${p.x}" cy="${p.y}" r="5" />
        <text x="${p.x + 9}" y="${p.y + 3}">${esc((n.title || '?').slice(0, 22))}</text>
      </g>`;
    }

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.innerHTML = html;
    svg.querySelectorAll('.node').forEach(g => {
      g.addEventListener('click', () => showNote(g.dataset.id));
      g.style.cursor = 'pointer';
    });
  }

  hideOrphans.addEventListener('change', draw);
  draw();
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(draw, 300); });
}

async function initHealth() {
  const btn = document.getElementById('healthBtn');
  const grid = document.getElementById('healthGrid');
  const detail = document.getElementById('healthDetail');

  btn.addEventListener('click', async () => {
    btn.textContent = 'Running...';
    btn.disabled = true;

    const report = await api('/health/report');
    if (!report.ok) {
      detail.innerHTML = '<p style="color:var(--text3)">Health check failed</p>';
      btn.textContent = 'Run Check';
      btn.disabled = false;
      return;
    }
    const r = report.report;

    grid.style.display = 'grid';
    grid.innerHTML = `
      <div class="health-card"><div class="health-num ${r.orphans.length > 0 ? 'health-yellow' : 'health-green'}">${r.orphans.length}</div><div class="health-lbl">Orphans</div></div>
      <div class="health-card"><div class="health-num ${r.brokenLinks.length > 0 ? 'health-red' : 'health-green'}">${r.brokenLinks.length}</div><div class="health-lbl">Broken Links</div></div>
      <div class="health-card"><div class="health-num ${r.stalePages.length > 0 ? 'health-yellow' : 'health-green'}">${r.stalePages.length}</div><div class="health-lbl">Stale Pages</div></div>
      <div class="health-card"><div class="health-num health-green">${r.stats.avgWordCount}</div><div class="health-lbl">Avg Words</div></div>
    `;

    let html = '';
    if (r.brokenLinks.length > 0) {
      html += `<div class="health-section"><h4>Broken Links</h4>`;
      r.brokenLinks.slice(0, 20).forEach(b => {
        html += `<div class="health-item"><span style="color:var(--red)">&#x2716;</span> ${esc(b.source)} <span style="color:var(--text3)">→</span> <span style="color:var(--text3)">${esc(b.target)}</span></div>`;
      });
      html += '</div>';
    }
    if (r.orphans.length > 0) {
      html += `<div class="health-section"><h4>Orphans</h4>`;
      r.orphans.slice(0, 20).forEach(o => {
        html += `<div class="health-item"><span style="color:var(--yellow)">&#x26A0;</span> ${esc(o.title)}</div>`;
      });
      html += '</div>';
    }
    if (!html) html = '<p style="color:var(--green);padding:12px 0">Vault is healthy.</p>';
    detail.innerHTML = html;

    btn.textContent = 'Run Check';
    btn.disabled = false;
  });
}

function initModal() {
  const modal = document.getElementById('noteModal');
  document.getElementById('modalClose').addEventListener('click', () => modal.style.display = 'none');
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.style.display = 'none'; });
}

async function showNote(id) {
  const modal = document.getElementById('noteModal');
  modal.style.display = 'flex';
  document.getElementById('modalTitle').textContent = 'Loading...';
  document.getElementById('modalBody').textContent = '';
  document.getElementById('modalMeta').textContent = '';
  document.getElementById('modalBreadcrumb').textContent = '';

  const data = await api(`/memory/read?id=${encodeURIComponent(id)}`);
  if (!data.ok || !data.note) {
    document.getElementById('modalTitle').textContent = 'Not found';
    document.getElementById('modalBody').textContent = 'This note could not be found.';
    return;
  }
  const n = data.note;
  document.getElementById('modalTitle').textContent = n.title;
  document.getElementById('modalBreadcrumb').textContent = `vault/${n.path}`;
  document.getElementById('modalMeta').innerHTML = [
    `<span class="type-badge type-${n.type}">${n.type}</span>`,
    new Date(n.updated).toLocaleString(),
    n.frontmatter?.project ? `Project: ${esc(n.frontmatter.project)}` : '',
    `${n.wordCount} words`,
    n.tags?.length ? `Tags: ${n.tags.join(', ')}` : '',
  ].filter(Boolean).join(' \u00B7 ');

  document.getElementById('modalBody').innerHTML = `<div>${esc(n.body || n.content || '')}</div>`;
}
window.showNote = showNote;

function esc(s) {
  if (typeof s !== 'string') return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
