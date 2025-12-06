    async function loadCSV(path){
      if (location.protocol === 'file:'){
        console.warn('Serve via http(s) to load CSVs');
        return [];
      }
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) return [];
      return parseCSV(await res.text());
    }

    function parseCSV(text){
      const src = text.replace(/^\uFEFF/, '');
      const rows = [];
      let row = [], field = '', inQuotes = false;

      for (let i = 0; i < src.length; i++){
        const c = src[i], n = src[i+1];
        if (inQuotes){
          if (c === '"' && n === '"'){ field += '"'; i++; }
          else if (c === '"'){ inQuotes = false; }
          else { field += c; }
        } else {
          if (c === '"'){ inQuotes = true; }
          else if (c === ','){ row.push(field); field=''; }
          else if (c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
          else if (c === '\r'){ }
          else { field += c; }
        }
      }
      if (field.length || row.length){ row.push(field); rows.push(row); }
      if (!rows.length) return [];
      const headers = rows.shift().map(h => h.trim());
      return rows
        .filter(r => r.some(x => x && String(x).trim().length))
        .map(r => {
          const o = {};
          headers.forEach((h, i) => o[h] = (r[i] ?? '').trim());
          return o;
        });
    }

    // Shared helpers / constants
    const $ = s => document.querySelector(s);
    const q = new URLSearchParams(location.search);
    const id = q.get('a') || (/#a=([^&]+)/.exec(location.hash) || [])[1] || '';

    if (!id){
      location.href = 'content.html';
    }

const aidEl = $('#aid');
if (aidEl && id){
  // Short vanity version
  const prettyId =
    id.length > 16 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;

  aidEl.textContent = `Ref ID: ${prettyId}`;
  aidEl.setAttribute('title', `Full reference: ${id}`);
  aidEl.dataset.fullId = id;   // keep the real one around if needed
}


    // Radar styling to match welcome page
const RADAR_BORDER = '#37e0ff';
const RADAR_FILL   = 'rgba(141,233,255,0.20)';
const RADAR_POINT  = '#c7f4ff';
const RADAR_GRID   = 'rgba(141,233,255,0.18)';
const RADAR_ANGLE  = 'rgba(141,233,255,0.25)';

const RADAR_LABEL_OVERRIDES = {
  'Adaptability, Extensibility, Agility & Creativity': [
    'Adaptability, Extensibility,',
    'Agility & Creativity'
  ],
  'Availability, Reliability & Durability': [
    'Availability, Reliability',
    '& Durability'
  ]
};

// Chart.js global defaults to match DRMA look
Chart.defaults.font.family = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
Chart.defaults.color = '#cddcf1';

    const BUSINESS = [
      "Improve Service Uptime","Accelerate Incident Response","Reduce Regulatory Risk",
      "Lower Operating Cost","Speed Digital Change","Compliance / Assurance"
    ];
    const OPERATIONAL = [
      "Payments & Billing","User Authentication","Data Backup & Restore",
      "Public Website / Apps","Third-Party Integrations","DORA"
    ];

    const LOOKUPS = {
      PRACTICES: 'data/drma_practices.csv',
      DORA:      'data/drma_dora_cards.csv',
      GUIDANCE:  'data/drma_guidance.csv'
    };

    let PRACTICES = [];
    let DORA_ONLY = [];
    let GUIDANCE = {};   // axis -> guidance row
    let deckMode = 'P';  // 'P' (DRMA) or 'D' (DORA)

    const key = `drma:${id}`;

    // Core state
    let state = {
      id,
      when: null,
      business: '',
      operational: '',
      maxLevel: 1,
      evidence: {} // { short_id: 'no'|'splunk'|'other' }
    };

    function normGuidance(r){
      return {
        axis: (r.axis || '').trim(),
        why: r.why_it_matters || '',
        actions: r.actions || '',
        metrics: r.metrics || '',
        evidence: r.evidence || ''
      };
    }

    function normPractice(r){
      return {
        short_id: r.short_id || r.practice_id || '',
        id:       r.practice_id || r.short_id || '',
        axis:     (r.domain ? String(r.domain).trim() : 'General'),
        level:    +(r.level || 1),
        title:    r.title || '',
        desc:     r.description || ''
      };
    }

    function currentDeck(){
      return deckMode === 'D' ? DORA_ONLY : PRACTICES;
    }

    function sortedDeck(mode){
      const deck = mode === 'D' ? DORA_ONLY : PRACTICES;
      return deck.slice().sort((a,b) => {
        if (a.axis !== b.axis) return a.axis.localeCompare(b.axis);
        return String(a.short_id).localeCompare(String(b.short_id));
      });
    }

    function inferMaxLevelFromEvidence(deck){
  const rows = deck || currentDeck();
  let maxLevel = 1;

  rows.forEach(pr => {
    const st = state.evidence[pr.short_id];
    if (st && st !== 'no'){
      const lvl = pr.level || 1;
      if (lvl > maxLevel){
        maxLevel = lvl;
      }
    }
  });

  return maxLevel;
}

    // Decode the encoded ID
// Decode the encoded ID
function decodeFromCode(code){
  try{
    const json = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    if (!payload || payload.v !== 1) return false;

    deckMode = payload.d === 'D' ? 'D' : 'P';

state.businessCustom    = payload.b_custom || '';
state.operationalCustom = payload.o_custom || '';

state.business    = BUSINESS[payload.b] || '';
state.operational = OPERATIONAL[payload.o] || '';

if (state.businessCustom){
  state.business = state.businessCustom;
}
if (state.operationalCustom){
  state.operational = state.operationalCustom;
}

    state.id          = code;
    state.evidence    = {};
    state.when        = null;

    const deck = sortedDeck(deckMode);
    (payload.a || []).forEach((val, idx) => {
      const pr = deck[idx];
      if (!pr) return;
      let st = 'no';
      if (val === 'yes_splunk') st = 'splunk';
      else if (val === 'yes_other') st = 'other';
      state.evidence[pr.short_id] = st;
    });

    // New: set max level based on encoded level OR evidence, whichever is higher
    const encodedLevel = payload.l || 0;
    const inferredLevel = inferMaxLevelFromEvidence(deck);
    state.maxLevel = Math.max(encodedLevel || 1, inferredLevel || 1);

    return true;
  } catch(e){
    console.error('Failed to decode assessment code', e);
    return false;
  }
}

    function persist(){
      try{
        state.when = new Date().toISOString();
        localStorage.setItem(key, JSON.stringify(state));
        if (state.when){
        }
      } catch(e){
        console.warn('Could not persist assessment state', e);
      }
    }

    function nav(page){
      location.href = `${page}.html?a=${encodeURIComponent(id)}`;
    }
    window.nav = nav;

    // Levels
function renderLevels(){
  const box = $('#levels');
  box.innerHTML = '';
  const max = deckMode === 'D' ? 3 : 5;
  for (let i = 1; i <= max; i++){
    const b = document.createElement('button');
    b.className = 'btn' + (i === (state.maxLevel || 1) ? ' active' : '');
    b.textContent = i;

    // No click handler on assessment: purely indicative
    // b.onclick = ...  // removed

    box.appendChild(b);
  }
}

    // Visible cards
    function visibleRows(){
      const deck = currentDeck();
      if (deckMode === 'D') return deck;
      return deck.filter(r => r.level <= (state.maxLevel || 1));
    }

    function groupByAxis(rows){
      const g = new Map();
      rows.forEach(r => {
        if (!g.has(r.axis)) g.set(r.axis, []);
        g.get(r.axis).push(r);
      });
      return Array.from(g.entries()).sort((a,b) => a[0].localeCompare(b[0]));
    }

    function statusFor(id){
      return state.evidence[id] || 'no';
    }

    function computeStats(){
      const rows = visibleRows();
      const stats = {
        total: rows.length,
        yesSplunk: 0,
        yesOther: 0,
        no: 0,
        perAxis: {}
      };

      rows.forEach(r => {
        const st = statusFor(r.short_id);
        if (st === 'splunk') stats.yesSplunk++;
        else if (st === 'other') stats.yesOther++;
        else stats.no++;

        const ax = r.axis;
        const axStat = stats.perAxis[ax] || (stats.perAxis[ax] = {
          total: 0,
          yes: 0,
          splunk: 0,
          other: 0,
          no: 0
        });

        axStat.total++;
        if (st === 'splunk'){
          axStat.yes++; axStat.splunk++;
        } else if (st === 'other'){
          axStat.yes++; axStat.other++;
        } else {
          axStat.no++;
        }
      });

      return stats;
    }

    function computeFocusAreas(maxItems = 5){
      const rows = visibleRows();
      const gaps = rows.filter(r => statusFor(r.short_id) === 'no');

      const scored = gaps.map(r => ({
        practice: r,
        score: r.level || 1
      }));

      scored.sort((a,b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.practice.axis !== b.practice.axis){
          return a.practice.axis.localeCompare(b.practice.axis);
        }
        return String(a.practice.short_id).localeCompare(String(b.practice.short_id));
      });

      return scored.slice(0, maxItems).map(s => s.practice);
    }

    function truncate(str, max){
      if (!str) return '';
      if (str.length <= max) return str;
      return str.slice(0, max).replace(/\s+\S*$/, '') + '…';
    }

    function buildHeadline(){
      const b = state.business;
      const o = state.operational;

      if (b === 'Compliance / Assurance' && o === 'DORA'){
        return 'This assessment focuses on your readiness for the EU DORA regulation across the digital resilience domains.';
      }
      if (b && o){
        return `This assessment looks at how well "${o}" supports the business objective "${b}".`;
      }
      if (b){
        return `This assessment looks at your resilience posture for the business objective "${b}".`;
      }
      if (o){
        return `This assessment focuses on the "${o}" service.`;
      }
      return 'Select a business objective and operational outcome in the overview to see a tailored summary.';
    }

    function renderOverview(){
      const headlineEl = $('#overview_headline');
      const statsEl    = $('#overview_stats');
      const domainsEl  = $('#overview_domains');

      const stats = computeStats();

      headlineEl.textContent = buildHeadline();

      if (!stats.total){
        statsEl.textContent = 'No practices are currently in scope for this assessment.';
      } else {
        const implemented = stats.yesSplunk + stats.yesOther;
        const pctImpl = Math.round((implemented / stats.total) * 100);
        statsEl.textContent =
          `In scope: ${stats.total} practices. ` +
          `Implemented: ${implemented} (${pctImpl}% total), ` +
          `${stats.yesSplunk} via Splunk and ${stats.yesOther} via other tooling. ` +
          `Not yet implemented: ${stats.no}.`;
      }

      domainsEl.innerHTML = '';
      const entries = Object.entries(stats.perAxis).sort((a,b) => a[0].localeCompare(b[0]));

      entries.forEach(([axis, axStat]) => {
        const li = document.createElement('li');
        const yesRatio = axStat.total ? axStat.yes / axStat.total : 0;

        let tone;
        if (yesRatio >= 0.7){
          tone = 'strong coverage in most core practices.';
        } else if (yesRatio <= 0.3){
          tone = 'limited coverage and several foundational gaps.';
        } else {
          tone = 'a mix of established practices and remaining gaps.';
        }

        const g = GUIDANCE[axis];
        const whySnippet = g && g.why ? ' ' + truncate(g.why, 140) : '';

        li.innerHTML =
          `<strong>${escapeHtml(axis)}:</strong> ` +
          `${tone} ${axStat.yes} of ${axStat.total} practices are in place.${whySnippet}`;

        domainsEl.appendChild(li);
      });

      if (!entries.length){
        const li = document.createElement('li');
        li.textContent = 'No domains are currently in scope at this level.';
        domainsEl.appendChild(li);
      }
    }

    function renderFocusAreas(){
      const introEl = $('#focus_intro');
      const listEl  = $('#focus_list');

      const rows = visibleRows();
      const gaps = rows.filter(r => statusFor(r.short_id) === 'no');

      listEl.innerHTML = '';

      if (!rows.length){
        introEl.textContent = 'No practices are currently in scope at this level.';
        return;
      }

      if (!gaps.length){
        introEl.textContent = 'All in scope practices are currently marked as implemented.';
        const li = document.createElement('li');
        li.textContent = 'You can raise the level above to explore more advanced practices.';
        listEl.appendChild(li);
        return;
      }

      introEl.textContent = 'These are the highest level practices you have not yet implemented. They are good candidates for your next steps.';

      const top = computeFocusAreas(5);

      top.forEach(pr => {
        const li = document.createElement('li');
        const g = GUIDANCE[pr.axis];

        const whySnippet = g && g.why ? truncate(g.why, 160) : '';
        const actionsSnippet = g && g.actions ? truncate(g.actions, 160) : '';

        li.innerHTML =
          `<strong>${escapeHtml(pr.axis)} - ${escapeHtml(pr.title)} (Level ${pr.level})</strong><br/>` +
          (whySnippet ? `<span>Why this matters: ${escapeHtml(whySnippet)}</span><br/>` : '') +
          (actionsSnippet ? `<span>Suggested actions: ${escapeHtml(actionsSnippet)}</span>` : '');

        listEl.appendChild(li);
      });
    }

        function buildPrompt(){
      const stats = computeStats();
      const rows = visibleRows();
      const top = computeFocusAreas(5);
      const deckLabel = deckMode === 'D' ? 'DORA' : 'DRMA';

      const lines = [];

      lines.push('You are an expert in digital resilience, SRE and security operations.');
      lines.push('Use the data below to produce a clear, non-technical summary of this assessment, plus 3–5 concrete next actions.');
      lines.push('');
      lines.push(`Assessment ID: ${id}`);
      lines.push(`Model: ${deckLabel}`);
      lines.push(`Business objective: ${state.business || '(not set)'}`);
      lines.push(`Operational outcome: ${state.operational || '(not set)'}`);
      lines.push(`Level in scope: ${state.maxLevel || 1}`);
      lines.push('');

      // Overall stats
      lines.push('Overall coverage:');
      if (!stats.total){
        lines.push('- No practices are currently in scope at this level.');
      } else {
        const implemented = stats.yesSplunk + stats.yesOther;
        const pctImpl = Math.round((implemented / stats.total) * 100);
        lines.push(`- Practices in scope: ${stats.total}`);
        lines.push(`- Implemented: ${implemented} (${pctImpl}% total), ${stats.yesSplunk} via Splunk, ${stats.yesOther} via other tooling`);
        lines.push(`- Not implemented: ${stats.no}`);
      }
      lines.push('');

      // Per-domain stats with guidance
      lines.push('Per-domain summary (with guidance):');
      const entries = Object.entries(stats.perAxis).sort((a,b) => a[0].localeCompare(b[0]));
      if (!entries.length){
        lines.push('- No domains in scope.');
      } else {
        entries.forEach(([axis, axStat]) => {
          const yesRatio = axStat.total ? axStat.yes / axStat.total : 0;
          let tone;
          if (yesRatio >= 0.7) tone = 'strong coverage in most core practices';
          else if (yesRatio <= 0.3) tone = 'limited coverage with several foundational gaps';
          else tone = 'mixed coverage with both strengths and gaps';

          const g = GUIDANCE[axis];
          const why = g && g.why ? truncate(g.why, 200) : '';
          const actions = g && g.actions ? truncate(g.actions, 200) : '';

          lines.push(`- Domain: ${axis}`);
          lines.push(`  Coverage: ${axStat.yes}/${axStat.total} practices implemented (${tone}).`);
          if (why)     lines.push(`  Why it matters: ${why}`);
          if (actions) lines.push(`  Typical actions: ${actions}`);
        });
      }
      lines.push('');

      // Top focus areas (gaps)
      lines.push('Top focus practices (not yet implemented):');
      if (!top.length){
        lines.push('- None: all in-scope practices are already implemented.');
      } else {
        top.forEach(pr => {
          const st = statusFor(pr.short_id);
          const g = GUIDANCE[pr.axis];
          const actions = g && g.actions ? truncate(g.actions, 160) : '';
          lines.push(`- [${pr.axis}] ${pr.title} (Level ${pr.level}, status: ${st})`);
          lines.push(`  Description: ${pr.desc}`);
          if (actions) lines.push(`  Suggested actions: ${actions}`);
        });
      }
      lines.push('');

      // Raw practice-level data
      lines.push('Raw practice-level data (for reference):');
      rows.forEach(pr => {
        const st = statusFor(pr.short_id);
        lines.push(
          `- ${pr.short_id} | axis=${pr.axis} | level=${pr.level} | status=${st} | title="${pr.title}" | description="${pr.desc}"`
        );
      });

      lines.push('');
      lines.push('Please now:');
      lines.push('1. Give a concise executive summary (1–2 short paragraphs).');
      lines.push('2. Highlight the 3–5 most important focus areas for the next 6–12 months, in priority order.');
      lines.push('3. For each focus area, list 2–3 concrete actions and what evidence would show it is done.');
      lines.push('Avoid jargon and keep the tone practical and helpful.');

      return lines.join('\n');
    }

function setStatus(id, status){
  state.evidence[id] = status;
  persist();      // save immediately on change
  render();       // re-render overview, radar, etc
}

    function escapeHtml(s){
      return String(s || '').replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      })[c]);
    }

    function renderPrintTable(){
  const panel = document.getElementById('print_table_panel');
  if (!panel) return;

  const rows = visibleRows();
  if (!rows.length){
    panel.innerHTML = '<p class="muted">No practices are currently in scope at this level.</p>';
    return;
  }

  const groups = groupByAxis(rows); // [axis, items[]]

  let html = `
    <h3 style="margin:0 0 6px;">Practices summary</h3>
    <table class="print-table">
      <thead>
        <tr>
          <th>Domain</th>
          <th>Practice</th>
          <th>Level</th>
          <th>Status</th>
          <th>Title</th>
        </tr>
      </thead>
      <tbody>
  `;

  groups.forEach(([axis, items]) => {
    items.forEach(pr => {
      const st = statusFor(pr.short_id);
      let label = 'No';
      if (st === 'splunk') label = 'Yes - Splunk';
      else if (st === 'other') label = 'Yes - Other';

      html += `
        <tr>
          <td>${escapeHtml(axis)}</td>
          <td>${escapeHtml(pr.short_id)}</td>
          <td>L${pr.level}</td>
          <td>${escapeHtml(label)}</td>
          <td>${escapeHtml(pr.title)}</td>
        </tr>
      `;
    });
  });

  html += `
      </tbody>
    </table>
  `;

  panel.innerHTML = html;
}

function renderCard(it){
  const status = statusFor(it.short_id);
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="head">
      <div>
        <div class="title">${escapeHtml(it.title)}</div>
        <div class="meta">${escapeHtml(it.short_id)} · Level ${it.level}</div>
      </div>
      <!-- Level pill now in the header -->
      <span class="pill pill-level pill-level-${it.level}">L${it.level}</span>
    </div>
    <div class="body">${escapeHtml(it.desc || '')}</div>
    <div class="foot">
      <div>
        <label class="muted">
          <input type="radio"
                 name="${it.short_id}"
                 value="no"
                 ${status === 'no' ? 'checked' : ''}
                 disabled /> No
        </label>
        <label class="muted">
          <input type="radio"
                 name="${it.short_id}"
                 value="splunk"
                 ${status === 'splunk' ? 'checked' : ''}
                 disabled /> Splunk
        </label>
        <label class="muted">
          <input type="radio"
                 name="${it.short_id}"
                 value="other"
                 ${status === 'other' ? 'checked' : ''}
                 disabled /> Other
        </label>
      </div>
      <!-- Response pill now in the footer -->
      <span class="status ${status}">${status}</span>
    </div>
  `;
  // Read-only on assessment: no change handlers
  return div;
}

    function renderGroups(){
      const holder = $('#groups');
      holder.innerHTML = '';

      const rows = visibleRows();
      const groups = groupByAxis(rows);
      groups.forEach(([axis, items]) => {
        const det = document.createElement('details');
        det.className = 'group';
        det.open = true;

        const configured = items.filter(it => statusFor(it.short_id) !== 'no').length;
        det.innerHTML = `
          <summary>
            <span class="chev">▶</span>
            <span class="pill">${configured}/${items.length}</span>
            <strong>${escapeHtml(axis)}</strong>
          </summary>
        `;

        const grid = document.createElement('div');
        grid.className = 'grid';
        items.forEach(it => grid.appendChild(renderCard(it)));
        det.appendChild(grid);
        holder.appendChild(det);
      });
    }

    // Radar
    let radar;

    function calcAxisScore(axis){
      const rows = visibleRows().filter(r => r.axis === axis);
      if (!rows.length) return 1;
      let score = 0;
      let max = 0;
      rows.forEach(r => {
        max += 3;
        const st = statusFor(r.short_id);
        const val = st === 'no' ? 1 : 3;
        score += val;
      });
      const pct = (score / max) * 5;
      return Math.max(1, Math.min(5, Math.round(pct)));
    }

function updateRadar(){
  const deck = currentDeck();
  const axes = Array.from(new Set(deck.map(d => d.axis))).sort();
  const data = axes.map(a => calcAxisScore(a));

  // Apply label overrides (adds line breaks for long ones)
  const displayLabels = axes.map(a => RADAR_LABEL_OVERRIDES[a] || a);

  const ctx = $('#radar').getContext('2d');
  if (radar) radar.destroy();

  radar = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: displayLabels,
      datasets: [{
        label: 'Current profile',
        data,
        fill: true,
        borderColor: RADAR_BORDER,
        borderWidth: 2,
        backgroundColor: RADAR_FILL,
        pointRadius: 3,
        pointHoverRadius: 4,
        pointBackgroundColor: RADAR_POINT,
        pointBorderColor: RADAR_BORDER,
        pointBorderWidth: 1,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      scales: {
        r: {
          beginAtZero: true,
          min: 0,
          max: 5,
          ticks: {
            stepSize: 1,
            showLabelBackdrop: false,
            color: '#9fb6d9',
            font: { size: 10 }
          },
          grid: {
            color: RADAR_GRID,
            circular: true
          },
          angleLines: {
            color: RADAR_ANGLE,
            lineWidth: 1
          },
          pointLabels: {
            color: '#cddcf1',
            font: { size: 11, weight: '500' },
            padding: 6
          }
        }
      }
    }
  });
}

function render(){
  $('#biz').textContent = state.business || '–';
  $('#op').textContent  = state.operational || '–';
  renderLevels();
  renderGroups();
  renderPrintTable();   // new: keep table in sync with cards
  updateRadar();
  renderOverview();
  renderFocusAreas();
}

$('#export').onclick = () => {
  const content =
    'The below is your DRMA Assessment ID. This ID can be used to load your results in order to review or update. Use the ID on the assessment page.\n\n' +
    id +
    '\n';

  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'drma-id.txt';
  a.click();
  URL.revokeObjectURL(a.href);
};

    const printBtn = document.getElementById('print_report');
if (printBtn){
  printBtn.onclick = () => {
    window.print();
  };
}

    $('#importFile').onchange = e => {
      const f = e.target.files?.[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try{
          const o = JSON.parse(r.result);
          if (o && o.id){
            state = o;
            deckMode = (state.business === 'Compliance / Assurance' && state.operational === 'DORA') ? 'D' : 'P';
            state.maxLevel = state.maxLevel || 1;
            state.evidence = state.evidence || {};
            persist();
            render();
          }
        } catch(err){
          alert('Failed to parse JSON');
        }
      };
      r.readAsText(f);
    };

        // Prompt modal wiring
    const promptModal  = $('#prompt_modal');
    const promptText   = $('#prompt_text');
    const promptOpen   = $('#prompt_open');
    const promptClose  = $('#prompt_close');
    const promptCopy   = $('#prompt_copy');
    const promptOk     = $('#prompt_ok');

    function openPromptModal(){
      promptText.value = buildPrompt();
      promptModal.style.display = 'flex';
    }
    function closePromptModal(){
      promptModal.style.display = 'none';
    }

    promptOpen.addEventListener('click', openPromptModal);
    promptClose.addEventListener('click', closePromptModal);
    promptOk.addEventListener('click', closePromptModal);
    promptCopy.addEventListener('click', async () => {
      try{
        await navigator.clipboard.writeText(promptText.value);
        promptCopy.textContent = 'Copied!';
        setTimeout(() => { promptCopy.textContent = 'Copy to clipboard'; }, 1200);
      } catch(e){
        alert('Could not copy. Please select and copy manually.');
      }
    });

    // Init
    (async function init(){
      try{
        const stored = JSON.parse(localStorage.getItem(key) || '{}');
      } catch {}

      const [pr, dora, guideRows] = await Promise.all([
        loadCSV(LOOKUPS.PRACTICES),
        loadCSV(LOOKUPS.DORA),
        loadCSV(LOOKUPS.GUIDANCE)
      ]);

      PRACTICES = (pr || []).map(normPractice);
      DORA_ONLY = (dora || []).map(normPractice);
      GUIDANCE  = {};
      (guideRows || []).map(normGuidance).forEach(g => {
        if (g.axis) GUIDANCE[g.axis] = g;
      });

      let decoded = false;
      if (id){
        decoded = decodeFromCode(id);
      }

      if (!decoded){
        try{
          const stored = JSON.parse(localStorage.getItem(key) || '{}');
          if (stored && stored.id){
            state = stored;
            deckMode = (state.business === 'Compliance / Assurance' && state.operational === 'DORA') ? 'D' : 'P';
            state.maxLevel = state.maxLevel || 1;
            state.evidence = state.evidence || {};
          }
        } catch(e){
          console.warn('Could not load stored assessment for', key, e);
        }
      }

      render();
    })();