const API = '';
let currentSessionId = null;
let currentChatMode = 'ollama';
let currentModel = 'llama3.2:3b';
let isStreaming = false;
let abortController = null;
let currentNoteId = null;
let attachedFiles = [];
let storedExcelFile = null;

document.addEventListener('DOMContentLoaded', () => {
  initStatus();
  loadModels();
  initChat();
  initOverview();
  initVault();
  initGraph();
  initHealth();
  initModels();
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
    const data = await api('/api');
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

function isBinaryFile(name) {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'pdf' || ext === 'xlsx' || ext === 'xls' || ['jpg','jpeg','png','gif','webp'].includes(ext);
}

function mimeTypeFor(name) {
  const ext = name.toLowerCase().split('.').pop();
  const mimeMap = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  return mimeMap[ext] || 'text/plain';
}

function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function onFileSelect() {
  const input = document.getElementById('chatFileInput');
  for (const file of input.files) {
    const isBinary = isBinaryFile(file.name);
    const content = isBinary ? bufferToBase64(await file.arrayBuffer()) : await file.text();
    attachedFiles.push({
      name: file.name,
      content,
      size: file.size,
      mimeType: mimeTypeFor(file.name),
      encoding: isBinary ? 'base64' : undefined,
    });
    if (isBinary && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      storedExcelFile = { name: file.name, content };
      document.getElementById('applyExcelBtn').style.display = 'inline-block';
      document.getElementById('autoFillExcelBtn').style.display = 'inline-block';
    }
  }
  input.value = '';
  renderFileChips();
}
window.onFileSelect = onFileSelect;

function removeFile(index) {
  attachedFiles.splice(index, 1);
  renderFileChips();
}
window.removeFile = removeFile;

function renderFileChips() {
  const chips = document.getElementById('chatFileChips');
  if (attachedFiles.length === 0) {
    chips.innerHTML = '';
    chips.classList.remove('has-files');
    return;
  }
  chips.classList.add('has-files');
  chips.innerHTML = attachedFiles.map((f, i) =>
    `<span class="file-chip">${esc(f.name)} (${formatSize(f.size)}) <button class="file-chip-remove" onclick="removeFile(${i})">&times;</button></span>`
  ).join('');
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}

async function applyExcelEdits() {
  if (!storedExcelFile) { showToast('No Excel file attached', true); return; }
  const jsonStr = prompt('Enter cell edits as JSON array, e.g. [{"cell":"A1","value":"hello"}]:');
  if (!jsonStr) return;
  let edits;
  try { edits = JSON.parse(jsonStr); } catch { showToast('Invalid JSON', true); return; }
  try {
    const res = await fetch(`${API}/chat/apply-excel-edits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: storedExcelFile, edits }),
    });
    if (!res.ok) { showToast('Failed to apply edits', true); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = storedExcelFile.name;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Excel saved!');
  } catch (e) { showToast('Error: ' + e.message, true); }
}
window.applyExcelEdits = applyExcelEdits;

async function autoFillExcel() {
  if (!storedExcelFile) { showToast('No Excel file attached', true); return; }
  const input = document.getElementById('chatInput');
  const prompt = input.value.trim() || 'Fill the Excel template according to the attached reference files';
  const btn = document.getElementById('autoFillExcelBtn');
  btn.disabled = true;
  btn.textContent = 'Filling...';
  try {
    const allFiles = [{ name: storedExcelFile.name, content: storedExcelFile.content, encoding: 'base64' }];
    const chips = document.getElementById('chatFileChips');
    const fileInput = document.getElementById('chatFileInput');
    for (const f of attachedFiles) {
      allFiles.push({ name: f.name, content: f.content, encoding: f.encoding });
    }
    const res = await fetch(`${API}/chat/fill-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, files: allFiles }),
    });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Auto-fill failed', true);
      if (err.llmResponse) {
        const msgs = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = 'msg msg-assistant msg-error';
        div.innerHTML = `<div class="msg-content"><p>LLM raw response (could not parse edits):</p><pre style="font-size:11px;white-space:pre-wrap">${esc(JSON.stringify(err.llmResponse, null, 2))}</pre></div>`;
        msgs.appendChild(div);
      }
      return;
    }
    const blob = await res.blob();
    const editCount = res.headers.get('X-Edit-Count') || '?';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = storedExcelFile.name;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Excel saved — ${editCount} edits applied`);
  } catch (e) { showToast('Error: ' + e.message, true); }
  finally {
    btn.disabled = false;
    btn.textContent = 'Auto-Fill Excel';
  }
}
window.autoFillExcel = autoFillExcel;

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
    let userHtml = `<div class="msg-content"><p>${esc(q)}</p></div>`;
    if (attachedFiles.length > 0) {
      userHtml += `<div class="msg-attachments">${attachedFiles.map(f => `<span class="file-chip">${esc(f.name)} (${formatSize(f.size)})</span>`).join('')}</div>`;
    }
    userDiv.innerHTML = userHtml;
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

    const filesPayload = attachedFiles.map(f => ({
      name: f.name,
      content: f.content,
      mimeType: f.mimeType,
      encoding: f.encoding,
    }));
    attachedFiles = [];
    renderFileChips();

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
          files: filesPayload.length > 0 ? filesPayload : undefined,
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

function showToast(text, isError) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:20px;right:20px;background:${isError ? '#3d1f1f' : '#21252b'};border:1px solid ${isError ? 'rgba(255,80,80,0.2)' : 'rgba(255,255,255,0.06)'};border-radius:10px;padding:12px 18px;font-size:13px;z-index:200;box-shadow:0 4px 12px rgba(0,0,0,0.4)`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function showLoading(el, loading) {
  if (loading) {
    el.dataset.prevHtml = el.innerHTML;
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text3)"><div class="spinner"></div><div style="margin-top:8px;font-size:12px">Loading...</div></div>';
  } else if (el.dataset.prevHtml) {
    el.innerHTML = el.dataset.prevHtml;
    delete el.dataset.prevHtml;
  }
}

async function initOverview() {
  const data = await api('/vault/stats');
  if (!data.ok) { showToast('Failed to load vault stats', true); return; }
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

  let vaultPage = 0;
  const pageSize = 40;

  async function load() {
    const type = typeEl.value;
    const filter = searchEl.value.toLowerCase().trim();
    showLoading(grid, true);

    let notes;
    let total;
    if (type === 'all') {
      const promises = ['learning', 'decision', 'concept', 'session', 'project'].map(t =>
        api(`/memory/list?type=${t}&limit=${pageSize}&offset=${vaultPage * pageSize}`).then(r => r.ok ? r.notes : [])
      );
      notes = (await Promise.all(promises)).flat();
      total = notes.length;
    } else {
      const data = await api(`/memory/list?type=${type}&limit=${pageSize}&offset=${vaultPage * pageSize}`);
      notes = data.ok ? data.notes : [];
      total = data.total || notes.length;
    }

    notes.sort((a, b) => new Date(b.updated) - new Date(a.updated));

    if (filter) {
      notes = notes.filter(n =>
        n.title.toLowerCase().includes(filter) ||
        (n.body || '').toLowerCase().includes(filter)
      );
    }

    showLoading(grid, false);

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
  const svgEl = document.getElementById('graphSvg');
  const hideOrphans = document.getElementById('hideOrphans');
  let sim = null;

  async function draw() {
    svgEl.innerHTML = '';
    document.getElementById('graphNodeCount').textContent = '0';
    document.getElementById('graphEdgeCount').textContent = '0';

    if (sim) {
      sim.stop();
      sim = null;
    }

    const data = await api('/knowledge/graph');
    let nodes = data.ok ? data.nodes.slice() : [];
    let edges = data.ok ? data.edges.slice() : [];

    document.getElementById('graphNodeCount').textContent = nodes.length;
    document.getElementById('graphEdgeCount').textContent = edges.length;

    if (nodes.length === 0) {
      svgEl.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#5f6368" font-size="13">No connections yet</text>';
      return;
    }

    let orphans = [];
    if (hideOrphans.checked) {
      const h = await api('/health/report');
      if (h.ok) orphans = h.report.orphans.map(o => o.path);
    }

    const width = svgEl.clientWidth || 800;
    const height = 520;

    const svg = d3.select('#graphSvg');
    svg.selectAll('*').remove();

    const zoom = d3.zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => g.attr('transform', event.transform));

    svg.call(zoom);

    const g = svg.append('g');

    const orphanPaths = new Set(orphans);
    const visibleNodes = nodes.filter(n => n.type !== 'index');
    const filteredNodeIds = new Set(
      hideOrphans.checked
        ? visibleNodes.filter(n => !orphanPaths.has(n.path)).map(n => n.id)
        : visibleNodes.map(n => n.id)
    );

    const filteredEdges = edges.filter(e =>
      filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
    );

    const linkData = filteredEdges.map(e => ({
      source: e.source,
      target: e.target,
      kind: e.kind,
    }));
    const nodeData = visibleNodes.filter(n => filteredNodeIds.has(n.id));

    sim = d3.forceSimulation(nodeData)
      .force('link', d3.forceLink(linkData).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(25))
      .alphaDecay(0.02);

    const link = g.append('g')
      .selectAll('line')
      .data(linkData)
      .join('line')
      .attr('class', d => `link link-${d.kind}`);

    const node = g.append('g')
      .selectAll('g')
      .data(nodeData)
      .join('g')
      .attr('class', d => `node node-${d.type}`)
      .attr('data-id', d => d.id)
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    node.append('circle')
      .attr('r', 6);

    node.append('text')
      .text(d => (d.title || '?').slice(0, 22))
      .attr('x', 10)
      .attr('y', 4);

    node.on('mouseenter', function (event, d) {
      const connected = new Set();
      connected.add(d.id);
      for (const e of filteredEdges) {
        if (e.source === d.id) connected.add(e.target);
        if (e.target === d.id) connected.add(e.source);
      }
      node.attr('class', n => `node node-${n.type}${connected.has(n.id) ? '' : ' node-dimmed'}`);
      link.attr('class', e => {
        const cls = `link link-${e.kind}`;
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        return src === d.id || tgt === d.id ? cls : `${cls} link-dimmed`;
      });
    });

    node.on('mouseleave', function () {
      node.attr('class', n => `node node-${n.type}`);
      link.attr('class', e => `link link-${e.kind}`);
    });

    node.on('click', function (event, d) {
      if (event.defaultPrevented) return;
      showNote(d.id);
    });

    sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    svg.call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
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
  currentNoteId = id;
  const titleEl = document.getElementById('modalTitle');
  const bodyEl = document.getElementById('modalBody');
  const metaEl = document.getElementById('modalMeta');
  const breadcrumbEl = document.getElementById('modalBreadcrumb');
  const editBtn = document.getElementById('modalEditBtn');
  const deleteBtn = document.getElementById('modalDeleteBtn');
  editBtn.style.display = '';
  deleteBtn.style.display = '';
  titleEl.textContent = 'Loading...';
  bodyEl.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div></div>';
  metaEl.textContent = '';
  breadcrumbEl.textContent = '';

  try {
    const data = await api(`/memory/read?id=${encodeURIComponent(id)}`);
    if (!data.ok || !data.note) {
      titleEl.textContent = 'Not found';
      bodyEl.textContent = 'This note could not be found.';
      return;
    }
    const n = data.note;
    titleEl.textContent = n.title;
    breadcrumbEl.textContent = `vault/${n.path}`;
    metaEl.innerHTML = [
      `<span class="type-badge type-${n.type}">${n.type}</span>`,
      new Date(n.updated).toLocaleString(),
      n.frontmatter?.project ? `Project: ${esc(n.frontmatter.project)}` : '',
      `${n.wordCount} words`,
      n.tags?.length ? `Tags: ${n.tags.join(', ')}` : '',
    ].filter(Boolean).join(' \u00B7 ');
    bodyEl.innerHTML = `<div>${esc(n.body || n.content || '')}</div>`;
  } catch (e) {
    titleEl.textContent = 'Error';
    bodyEl.textContent = `Failed to load note: ${e.message}`;
    showToast('Failed to load note', true);
  }
}
window.showNote = showNote;

function showNewNoteForm() {
  document.getElementById('newNoteForm').style.display = 'block';
  document.getElementById('newNoteTitle').focus();
  document.getElementById('newNoteBody').value = '';
  document.getElementById('newNoteTitle').value = '';
  document.getElementById('newNoteProject').value = '';
}
window.showNewNoteForm = showNewNoteForm;

function cancelNewNote() {
  document.getElementById('newNoteForm').style.display = 'none';
}
window.cancelNewNote = cancelNewNote;

async function saveNewNote() {
  const type = document.getElementById('newNoteType').value;
  const title = document.getElementById('newNoteTitle').value.trim();
  const body = document.getElementById('newNoteBody').value.trim();
  const project = document.getElementById('newNoteProject').value.trim() || undefined;

  if (!title || !body) {
    showToast('Title and body are required', true);
    return;
  }

  const data = await api('/memory/save', {
    method: 'POST',
    body: { type, title, body, project },
  });

  if (data.ok) {
    showToast('Note saved');
    document.getElementById('newNoteForm').style.display = 'none';
    initVault();
    if (data.note) showNote(data.note.id);
  } else {
    showToast(data.error || 'Failed to save note', true);
  }
}
window.saveNewNote = saveNewNote;

function editNote() {
  const modal = document.getElementById('noteModal');
  const bodyEl = document.getElementById('modalBody');
  const textarea = document.createElement('textarea');
  textarea.id = 'editTextarea';
  textarea.style.cssText = 'width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);padding:10px;font-size:13px;font-family:var(--font);min-height:200px;resize:vertical;outline:none';
  textarea.value = bodyEl.textContent;
  bodyEl.innerHTML = '';
  bodyEl.appendChild(textarea);

  const btnBar = document.createElement('div');
  btnBar.style.cssText = 'display:flex;gap:6px;margin-top:8px';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'action-btn';
  saveBtn.textContent = 'Save';
  saveBtn.onclick = async () => {
    const newBody = textarea.value.trim();
    if (!newBody) { showToast('Body cannot be empty', true); return; }
    const data = await api('/memory/update', {
      method: 'PUT',
      body: { id: currentNoteId, body: newBody },
    });
    if (data.ok) {
      showToast('Note updated');
      showNote(currentNoteId);
    } else {
      showToast(data.error || 'Update failed', true);
    }
  };
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'action-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'background:var(--bg3);color:var(--text2)';
  cancelBtn.onclick = () => showNote(currentNoteId);
  btnBar.appendChild(saveBtn);
  btnBar.appendChild(cancelBtn);
  bodyEl.appendChild(btnBar);

  document.getElementById('modalEditBtn').style.display = 'none';
  document.getElementById('modalDeleteBtn').style.display = 'none';
}
window.editNote = editNote;

async function deleteNote() {
  if (!confirm('Delete this note permanently?')) return;
  const data = await api(`/memory/delete?id=${encodeURIComponent(currentNoteId)}`);
  if (data.ok) {
    showToast('Note deleted');
    document.getElementById('noteModal').style.display = 'none';
    initVault();
  } else {
    showToast(data.error || 'Delete failed', true);
  }
}
window.deleteNote = deleteNote;

async function initModels() {
  try {
    const hw = await api('/ollama/hwinfo');
    if (hw.ok) {
      document.getElementById('hwCpu').textContent = hw.hardware.cpu;
      document.getElementById('hwCores').textContent = hw.hardware.cores;
      document.getElementById('hwRam').textContent = hw.hardware.ramGB + ' GB';
      document.getElementById('hwFreeRam').textContent = hw.hardware.freeRamGB + ' GB';
      document.getElementById('hwGpu').textContent = hw.hardware.gpu || 'None detected';
      document.getElementById('hwVram').textContent = hw.hardware.vramGB ? hw.hardware.vramGB + ' GB' : 'N/A';
      document.getElementById('hwDisk').textContent = hw.hardware.diskFreeGB + ' GB';
      document.getElementById('hwPlatform').textContent = hw.hardware.platform;
    }
  } catch (e) { console.warn('[Models] hwinfo failed:', e); }

  const uc = document.getElementById('modelsUseCase');
  uc.addEventListener('change', recommendModels);
  document.getElementById('modelsPreferSpeed').addEventListener('change', recommendModels);
  document.getElementById('modelsMaxRam').addEventListener('input', recommendModels);
  recommendModels();
  loadAllModels();
}

async function recommendModels() {
  const useCase = document.getElementById('modelsUseCase').value;
  const preferSpeed = document.getElementById('modelsPreferSpeed').checked;
  const maxRam = parseInt(document.getElementById('modelsMaxRam').value) || undefined;
  const results = document.getElementById('modelsResults');

  try {
    const data = await api('/ollama/recommend', {
      method: 'POST',
      body: { useCase, preferSpeed, maxRam },
    });

    if (!data.ok || !data.recommendations || data.recommendations.length === 0) {
      results.innerHTML = '<div class="models-empty">No models match your hardware constraints.</div>';
      return;
    }

    results.innerHTML = data.recommendations.map((m, i) => {
      const classes = m.installed ? 'model-row installed' : 'model-row';
      const top = i === 0 ? ' top' : '';
      return `<div class="${classes}${top}">
        <div class="model-name">${esc(m.name)}</div>
        <div class="model-params">${esc(m.params)}</div>
        <div class="model-use-case">${esc(m.useCase)}</div>
        <div class="model-stats">${esc(m.reason)}</div>
        <div class="model-score">${m.score.toFixed(2)}</div>
        ${m.installed ? '<span class="model-badge installed">Installed</span>' : '<button class="model-dl-btn" onclick="pullModel(\'' + esc(m.name) + '\')">Download</button>'}
      </div>`;
    }).join('');
  } catch (e) {
    results.innerHTML = '<div class="models-empty">Failed to fetch recommendations.</div>';
    console.warn('[Models] recommend failed:', e);
  }
}
window.recommendModels = recommendModels;

async function loadAllModels() {
  const wrap = document.getElementById('allModelsWrap');
  try {
    const data = await api('/ollama/models');
    if (!data.ok || !data.models) { wrap.innerHTML = '<div class="models-empty">Failed to load models.</div>'; return; }

    wrap.innerHTML = data.models.map(m => {
      const installed = m.installed ? 'model-row installed' : 'model-row';
      return `<div class="${installed}">
        <div class="model-name">${esc(m.name)}</div>
        <div class="model-params">${esc(m.params)}</div>
        <div class="model-use-case">${esc(m.useCase)}</div>
        <div class="model-stats">${m.minRamGB}GB RAM${m.minVramGB ? ' / ' + m.minVramGB + 'GB VRAM' : ''} / ${m.diskGB}GB disk</div>
        <div style="flex:1"></div>
        ${m.installed ? '<span class="model-badge installed">Installed</span>' : '<button class="model-dl-btn" onclick="pullModel(\'' + esc(m.name) + '\')">Download</button>'}
      </div>`;
    }).join('');
  } catch (e) {
    wrap.innerHTML = '<div class="models-empty">Failed to load model list.</div>';
    console.warn('[Models] list failed:', e);
  }
}
window.loadAllModels = loadAllModels;

async function pullModel(name) {
  if (!confirm('Download ' + name + '? (may be large — check disk space)')) return;
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Downloading...';
  try {
    const data = await api('/ollama/pull', { method: 'POST', body: { model: name } });
    if (data.ok) {
      showToast('Downloaded ' + name);
      btn.textContent = 'Installed';
      btn.style.opacity = '0.5';
      btn.disabled = true;
      recommendModels();
      loadAllModels();
    } else {
      showToast(data.error || 'Download failed', true);
      btn.disabled = false;
      btn.textContent = 'Retry';
    }
  } catch (e) {
    showToast('Download error: ' + e.message, true);
    btn.disabled = false;
    btn.textContent = 'Retry';
  }
}
window.pullModel = pullModel;

async function refreshModels() {
  recommendModels();
  loadAllModels();
}
window.refreshModels = refreshModels;

function esc(s) {
  if (typeof s !== 'string') return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
