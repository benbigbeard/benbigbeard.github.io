require([
  'jquery',
  'splunkjs/mvc',
  'splunkjs/mvc/searchmanager',
  'splunkjs/mvc/simplexml/ready!'
], function ($, mvc, SearchManager) {
  console.log('drma JS (clean: radios + counter + save + history + report)');

  /* =========================================================
     Strip chrome from the specific text-only panel (left intro)
     ========================================================= */
  $('.drma-intro-panel-marker').each(function(){
    $(this).closest('.dashboard-panel').addClass('drma-nochrome');
  });

  // Gate helper: in normal mode, require both Step 1 + Step 2
function hasBothSelections(){
  return !!(selectedBusiness && selectedOperational);
}

  /* =========================
     Lookups (filenames)
     ========================= */
  const LOOKUP_CURRENT = 'drma_evidence_current.csv';
  const LOOKUP_HISTORY = 'drma_evidence_history.csv';
  const DORA_LOOKUP = 'drma_dora_cards.csv';

  // --- NEW: separate DORA evidence stores
const DORA_EVIDENCE_CURRENT = 'dora_evidence_current.csv';
const DORA_EVIDENCE_HISTORY = 'dora_evidence_history.csv';


// Which store an assessment id belongs to: { "<id>": "dora"|"normal" }
let assessmentIdSource = {};

// Active lookups depend on mode
function activeCurrentLookup(){
  return isDoraMode() ? DORA_EVIDENCE_CURRENT : LOOKUP_CURRENT;
}
function activeHistoryLookup(){
  return isDoraMode() ? DORA_EVIDENCE_HISTORY : LOOKUP_HISTORY;
}

// Short-ids for currently active mode (for saving/counters)
function activeShortIdSet(){
  const src = isDoraMode() ? (Array.isArray(doraRows)?doraRows:[]) : (Array.isArray(allRows)?allRows:[]);
  return new Set(src.map(r => String(r.short_id||r.practice_id||'').trim()).filter(Boolean));
}


  // Reusable trash icon SVG (24px)
const TRASH_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 3h6a1 1 0 0 1 1 1v1h4v2h-1v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7H4V5h4V4a1 1 0 0 1 1-1Zm1 2h4V5h-4ZM7 7v12h10V7H7Zm3 2h2v8h-2V9Zm4 0h2v8h-2V9Z"/>
  </svg>`;


  // Reusable eye icons (24px)
const EYE_OPEN_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5c5.05 0 9.27 3.11 10.94 7.5C21.27 16.89 17.05 20 12 20S2.73 16.89 1.06 12.5C2.73 8.11 6.95 5 12 5Zm0 2C7.9 7 4.31 9.47 3 12.5 4.31 15.53 7.9 18 12 18s7.69-2.47 9-5.5C19.69 9.47 16.1 7 12 7Zm0 2.5A3.5 3.5 0 1 1 8.5 13 3.5 3.5 0 0 1 12 9.5Zm0 2a1.5 1.5 0 1 0 1.5 1.5A1.5 1.5 0 0 0 12 11.5Z"/>
  </svg>`;
const EYE_OFF_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3.28 2.22 21.78 20.7l-1.06 1.06-3.01-3.01A11.64 11.64 0 0 1 12 20C6.95 20 2.73 16.89 1.06 12.5c.79-2.03 2.16-3.77 3.9-5.06L2.22 3.28 3.28 2.22ZM12 7c4.1 0 7.69 2.47 9 5.5-.53 1.25-1.35 2.37-2.38 3.3l-1.45-1.45c.79-.67 1.45-1.49 1.92-2.39C18.75 9.84 15.55 8 12 8a9.3 9.3 0 0 0-1.5.12L8.98 6.6A12.45 12.45 0 0 1 12 7Zm0 2.5c.27 0 .52.03.77.08l-3.19-3.19A3.5 3.5 0 0 0 12 16.5c.6 0 1.16-.15 1.65-.41l-1.2-1.2A1.5 1.5 0 0 1 10.5 13c0-.83.67-1.5 1.5-1.5Z"/>
  </svg>`;

  function setTok(k, v){
  const def = mvc.Components.getInstance('default');
  const sub = mvc.Components.getInstance('submitted');
  if (v == null){ def?.unset(k); sub?.unset(k); }
  else          { def?.set(k, v); sub?.set(k, v); }
}

function handleAssessmentChange(sel){
  sel = (sel || '').trim();
  const src = assessmentIdSource[sel]; // 'dora' | 'normal' | undefined

  if (!sel){
    // clear tokens fully (NOT empty strings)
    setTok('assess_id',   null);
    setTok('show_normal', null);
    setTok('show_dora',   null);
    setTok('is_dora',     '0');

    window.drmaAssessmentId = null;
    try { mvc.Components.get('drma_overview_html').startSearch(); } catch(e) {}
    return;
  }

  // set tokens for a real selection
  setTok('assess_id', sel);
  if (src === 'dora'){
    setTok('show_dora','1'); setTok('show_normal',null); setTok('is_dora','1');
  } else {
    setTok('show_normal','1'); setTok('show_dora',null); setTok('is_dora','0');
  }

  // keep your UX state in sync (DORA mode chips etc.)
  if (src === 'dora'){
    if (selectedOperational !== 'DORA' || selectedBusiness !== 'Compliance / Assurance'){
      selectedBusiness = 'Compliance / Assurance';
      selectedOperational = 'DORA';
      renderOutcomeSelectors(); drawLevelButtons(); render();
    }
  } else {
    if (selectedOperational === 'DORA'){
      selectedOperational = null;
      if (selectedBusiness === 'Compliance / Assurance') selectedBusiness = null;
      renderOutcomeSelectors(); drawLevelButtons(); render();
    }
  }

  $('#drma_assessment_select').val(sel);
  $('#assessment_id_input').val(sel);
  window.drmaAssessmentId = sel;
  refreshSubmitEnabled();
  try { mvc.Components.get('drma_overview_html').startSearch(); } catch(e) {}
  loadOutcomesForAssessment(sel);
  loadEvidenceForAssessment(sel);
  refreshLastUpdateFor(sel);
}

// bind once
$(document).off('change.drmaAssess')
           .on('change.drmaAssess', '#drma_assessment_select', function(){
             handleAssessmentChange(this.value);
           });

  function setTok(k, v){
  const def = mvc.Components.getInstance('default');
  const sub = mvc.Components.getInstance('submitted');
  if (v == null) { def && def.unset(k); sub && sub.unset(k); }
  else { def && def.set(k, v); sub && sub.set(k, v); }
}

$(document)
  .off('change.drmaAssess')
  .on('change.drmaAssess', '#drma_assessment_select', function(){
    const sel = (this.value || '').trim();
    const src = assessmentIdSource[sel]; // 'dora' | 'normal' | undefined

    if (!sel){
      // fully clear tokens so the placeholder shows and panel stays mounted
      setTok('assess_id',   null);
      setTok('show_normal', null);
      setTok('show_dora',   null);
      setTok('is_dora',     '0');   // optional reset

      window.drmaAssessmentId = null;
      // (optional) refresh overview/searches that depend on assess_id
      try { mvc.Components.get('drma_overview_html').startSearch(); } catch(e) {}
      return; // placeholder HTML (rejects="$assess_id$") becomes visible again
    }

    // real selection
    setTok('assess_id', sel);
    if (src === 'dora'){
      setTok('show_dora', '1');  setTok('show_normal', null); setTok('is_dora','1');
    } else {
      setTok('show_normal','1'); setTok('show_dora',   null); setTok('is_dora','0');
    }

    // keep your existing UX sync below if you want (business/operational, render(), etc.)
  });

function setAssessmentToken(val){
  const def = mvc.Components.getInstance('default');
  const sub = mvc.Components.getInstance('submitted');
  if (val) {
    def && def.set('assess_id', val);
    sub && sub.set('assess_id', val);
  } else {
    def && def.unset('assess_id');   // key: truly remove, not ""
    sub && sub.unset('assess_id');
  }
}

function setRadarModeTokens(src){
  const def = mvc.Components.getInstance('default');
  const sub = mvc.Components.getInstance('submitted');

  // clear both first
  def && def.unset('show_normal');  sub && sub.unset('show_normal');
  def && def.unset('show_dora');    sub && sub.unset('show_dora');

  if (src === 'normal') { def && def.set('show_normal','1'); sub && sub.set('show_normal','1'); }
  if (src === 'dora')   { def && def.set('show_dora','1');   sub && sub.set('show_dora','1'); }
}

  (function injectGateBarCSS(){
  if (document.getElementById('drma-gatebar-css')) return;
  const s = document.createElement('style');
  s.id = 'drma-gatebar-css';
  s.textContent = `
    /* Gate message shown INSIDE the Step 3 bar (center area) */
    .drma-gate-msg{
      display:flex; flex-direction:column; align-items:center; text-align:center;
      padding:4px 8px;
    }
    .drma-gate-msg .title{ font-size:14px; color:#d6e7ff; }
    .drma-gate-msg .sub{ font-size:12px; color:#cfe0ff; opacity:.9; }
  `;
  document.head.appendChild(s);
})();

// Helper: publish a "is_dora" token = "1" (DORA) / "0" (normal)
function setIsDoraTokenFor(assessmentId){
  const src = assessmentIdSource[assessmentId] || 'normal';
  const val = (src === 'dora') ? '1' : '0';
  const def = mvc.Components.getInstance('default');
  const sub = mvc.Components.getInstance('submitted');
  const setTok = (k,v)=>{ def?.set(k,v); sub?.set(k,v); };

  setTok('is_dora', val);

  if (assessmentId) {
    if (val === '1') { setTok('show_dora','1'); setTok('show_normal',null); }
    else             { setTok('show_normal','1'); setTok('show_dora',null); }
  } else {
    // nothing selected yet → keep only the placeholder visible
    setTok('show_normal', null);
    setTok('show_dora',   null);
  }
}


(function(){
  const d = mvc.Components.getInstance('default');
  const s = mvc.Components.getInstance('submitted');
  console.log('[DRMA] tokens present?', { hasDefault: !!d, hasSubmitted: !!s });
})();

  // === Loader (spinner) CSS + container =======================================
(function injectLoaderCSS(){
  if (document.getElementById('drma-loader-css')) return;
  const s = document.createElement('style');
  s.id = 'drma-loader-css';
  s.textContent = `
    /* Compact loader that fits inside the Step 3 bar center */
    #drma_main_loader{
      display:none;
      min-height:40px;
      margin:0;
      background:transparent !important;
      border:0 !important;
      box-shadow:none !important;
      border-radius:0 !important;
      text-align:center;
    }
    #drma_main_loader .loader-wrap{
      display:flex; align-items:center; justify-content:center; flex-direction:column;
      gap:8px; padding:4px 8px;
    }
    .drma-spinner{
      border:6px solid rgba(255,255,255,.08);
      border-top:6px solid #cfe0ff;
      border-radius:50%;
      width:36px; height:36px;
      animation: drma-spin 1s linear infinite;
      will-change: transform;
    }
    @keyframes drma-spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
    .drma-loader-msg{ color:#d6e7ff; font-size:14px; opacity:.95; }
    .drma-loader-sub{ color:#cfe0ff; font-size:12px; opacity:.85; }
  `;
  document.head.appendChild(s);
})();

function ensureMainLoader(){
  if (!document.getElementById('drma_main_loader')) {
    const $levels = $('#drma_levels');
    if ($levels.length){
      $levels.html(
        `<div id="drma_main_loader" role="status" aria-live="polite">
           <div class="loader-wrap">
             <div class="drma-spinner" aria-hidden="true"></div>
             <div class="drma-loader-msg">Loading cards…</div>
             <div class="drma-loader-sub">Fetching practices and evidence</div>
           </div>
         </div>`
      );
    }
  }
}

function showMainLoader(){
  ensureMainLoader();
  setLevelsVisible(true);          // keep Step 3 bar visible
  $('#drma_main_loader').show();   // show loader in the center of the bar
  $('#drma_sections').hide();      // keep the grid hidden while loading
}


function hideMainLoader(){
  $('#drma_main_loader').remove(); // clear loader so buttons/gate can render
  $('#drma_sections').show();
}

showMainLoader();

// Compact icon button style for Step 3 top-right (eye toggle)
(function injectToggleAllCSS(){
  if (document.getElementById('drma-toggleall-css')) return;
  const s = document.createElement('style');
  s.id = 'drma-toggleall-css';
  s.textContent = `
    #drma_toggle_all {
      position:absolute; top:8px; right:10px;
      display:inline-flex; align-items:center; justify-content:center;
      width:28px; height:28px; padding:0; border:0; border-radius:8px;
      background:transparent; cursor:pointer;
      box-shadow:inset 0 0 0 1px rgba(126,163,214,.25);
      transition: background .15s ease, box-shadow .15s ease, opacity .15s ease;
      opacity:.9;
    }
    #drma_toggle_all:hover{ background: rgba(255,255,255,.06); box-shadow:inset 0 0 0 1px rgba(126,163,214,.45); }
    #drma_toggle_all svg{ width:16px; height:16px; fill:#cfe0ff; opacity:.95; }
    .drma-levels-container{ position:relative; } /* ensure absolute positioning anchor */
  `;
  document.head.appendChild(s);
})();

  /* =========================
     State
     ========================= */
  let lookupEvidence = {};      // { short_id: 'splunk'|'other'|'no' }
  let workingChanges = {};      // { short_id: 'splunk'|'other'|'no' }
  function isValid(v){ return v==='splunk'||v==='other'||v==='no'; }

// Data sets must be declared BEFORE any function that might read them runs
let allRows = [];   // practices
let doraRows = [];  // DORA cards


    /* =========================
     Outcome selectors (local state only for now)
     ========================= */
  const BUSINESS_OPTIONS = [
    'Improve Service Uptime',
    'Accelerate Incident Response',
    'Reduce Regulatory Risk',
    'Lower Operating Cost',
    'Speed Digital Change',
    'Compliance / Assurance'
  ];

  const OPERATIONAL_OPTIONS = [
    'Payments & Billing',
    'User Authentication',
    'Data Backup & Restore',
    'Public Website / Apps',
    'Third-Party Integrations',
    'DORA'
  ];

  let selectedBusiness = null;
  let selectedOperational = null;

  /* =========================
   DORA mode (chapters only)
   ========================= */
const DORA_CHAPTERS = [
  "General provisions",
  "ICT risk management",
  "ICT-related incident management, classification and reporting",
  "Digital operational resilience testing",
  "Managing of ICT third-party risk",
  "Information-sharing arrangements",
  "Competent authorities",
  "Delegated acts",
  "Transitional and final provisions"
];

function isDoraMode() {
  return selectedBusiness === "Compliance / Assurance" &&
         selectedOperational === "DORA";
}

// --- bring back compact "hide levels" behavior ------------------------------
(function injectLevelsHiddenCSS(){
  if (document.getElementById('drma-levels-hidden-css')) return;
  const s = document.createElement('style');
  s.id = 'drma-levels-hidden-css';
  s.textContent = `
    /* Keep Step 3 bar height consistent so text never gets cropped */
    .drma-levels-container{ position:relative; min-height:48px; padding:6px 0; }
    /* When hidden, only hide the buttons row—not the bar nor the left/right labels */
    .drma-levels-container.levels-hidden #drma_levels{ display:none !important; }
  `;
  document.head.appendChild(s);
})();

function gatedNow(){ 
  return !isDoraMode() && !hasBothSelections(); 
}

function setLevelsVisible(show){
  const $container = $('.drma-levels-container');
  if (!$container.length) return;
  $container.toggleClass('levels-hidden', !show);
}

  // Expose current picks for future integration (and easy console debugging)
  window.drmaState = window.drmaState || {};
  Object.defineProperties(window.drmaState, {
    business: { get(){ return selectedBusiness; } },
    operational: { get(){ return selectedOperational; } }
  });

  (function injectSelectCSS(){
    if (document.getElementById('drma-select-css')) return;
    const css = `
      .drma-select-container { padding: 12px 10px 8px; }
      .drma-select-title { margin: 4px 0 2px; font-size: 18px; color: #d6e7ff; }
      .drma-select-container .drma-subtitle { margin: 0 0 10px; color: #cfe0ff; opacity: .9; }
      .drma-select-group { display: flex; flex-wrap: wrap; gap: 8px; }
      .drma-chip {
        display:inline-flex; align-items:center; border:1px solid rgba(126,163,214,.35);
        background: rgba(255,255,255,.04); color:#e9f2ff; border-radius: 999px;
        padding: 6px 10px; font-size: 13px; line-height: 1; cursor: pointer; user-select:none;
        transition: box-shadow .15s ease, background .15s ease, border-color .15s ease;
      }
      .drma-chip input { display:none; }
      .drma-chip:hover { box-shadow: 0 0 0 2px rgba(126,163,214,.25) inset; }
      .drma-chip.active { background: rgba(126,163,214,.25); border-color: rgba(126,163,214,.65); }
      .drma-pick { margin-top: 8px; font-size: 12px; color:#cfe0ff; opacity: .95; }
            /* allow top-right utility buttons inside select containers */
      .drma-select-container { position: relative; }

      /* Step-1 clear button */
      .drma-clear-btn{
        position:absolute; top:8px; right:10px;
        display:inline-flex; align-items:center; justify-content:center;
        width:28px; height:28px; padding:0; border:0; border-radius:8px;
        background:transparent; cursor:pointer;
        box-shadow:inset 0 0 0 1px rgba(126,163,214,.25);
        transition: background .15s ease, box-shadow .15s ease, opacity .15s ease;
        opacity:.9;
      }
      .drma-clear-btn:hover{ background: rgba(255,255,255,.06); box-shadow:inset 0 0 0 1px rgba(126,163,214,.45); }
      .drma-clear-btn svg{ width:16px; height:16px; fill:#cfe0ff; opacity:.95; }
      .drma-clear-btn[hidden]{ display:none; }
      @media (max-width:720px){ .drma-select-group { gap: 6px; } .drma-chip{ padding:6px 9px; } }
    `;
    const s = document.createElement('style');
    s.id = 'drma-select-css';
    s.textContent = css;
    document.head.appendChild(s);
  })();


     //var utils = require("splunkjs/mvc/utils");
     //$(document).ready(function () {
       //  var l = document.getElementsByClassName("dashboard-title dashboard-header-title");
         //l[0].innerHTML = "";
     //});

  (function injectAssessmentCSS(){
  if (document.getElementById('drma-assessment-css')) return;
  const s = document.createElement('style');
  s.id = 'drma-assessment-css';
  s.textContent = `
    /* Step 4 three-column layout: left | center | right */
    #drma_step4 { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    #drma_step4 .drma-step4-left { flex: 0 1 auto; min-width:260px; }
    #drma_assessment_center { flex: 1 1 320px; display:flex; justify-content:center; }
    #drma_actions { flex: 0 1 auto; display:flex; gap:12px; align-items:center; justify-content:flex-end; }

    /* Field styling */
    .drma-field { display:flex; flex-direction:column; gap:6px; min-width:280px; max-width:420px; width:100%; }
    .drma-field label { font-size:13px; color:#d6e7ff; }
    .drma-input {
      width:100%; padding:10px 12px; border-radius:8px;
      border:1px solid rgba(126,163,214,.35);
      background:rgba(255,255,255,.04); color:#e9f2ff;
      outline:none; transition: box-shadow .15s ease, border-color .15s ease;
    }
    .drma-input:focus { box-shadow:0 0 0 2px rgba(126,163,214,.25) inset; border-color:rgba(126,163,214,.65); }
    .drma-help { font-size:12px; color:#cfe0ff; opacity:.9; }
    .drma-error { font-size:12px; color:#ffb3b3; display:none; }
    .drma-input.is-invalid { border-color:#ff8a8a; box-shadow:0 0 0 2px rgba(255,138,138,.2) inset; }
    @media (max-width:720px){
      #drma_step4 { justify-content:center; }
      #drma_actions { justify-content:center; }
    }

    /* Prevent placeholder clipping in inputs (and keep height comfy) */
.drma-input{
  box-sizing: border-box;          /* <-- key: makes padding part of the height */
  min-height: 40px;                /* or 42px if you like it taller */
  line-height: 1.35;               /* keeps placeholder vertically centered */
  font-size: 14px;                 /* explicit, avoids odd browser defaults */
}

/* placeholder color + ensure it uses the same line-height */
.drma-input::placeholder{ color:#cfe0ff; opacity:.75; line-height:1.35; }
.drma-input::-webkit-input-placeholder{ color:#cfe0ff; opacity:.75; line-height:1.35; }
.drma-input::-moz-placeholder{ color:#cfe0ff; opacity:.75; line-height:1.35; }
.drma-input:-ms-input-placeholder{ color:#cfe0ff; opacity:.75; line-height:1.35; }
.drma-input::-ms-input-placeholder{ color:#cfe0ff; opacity:.75; line-height:1.35; }

/* If your dropdown <select> also uses .drma-input, keep its text from clipping too */
select.drma-input{
  min-height: 40px;
  line-height: 1.35;
  /* optional: nicer look across browsers
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  */
}
  `;
  document.head.appendChild(s);
})();

function isValidAssessmentId(v){ return /^[a-z0-9]{3,64}$/.test(String(v||'')); }
function refreshSubmitEnabled(){
  $('#drma_update_btn').prop('disabled', !isValidAssessmentId(window.drmaAssessmentId));
}


  // When a chip is selected, let it look exactly like a drma button
(function injectChipAsBtnCSS(){
  if (document.getElementById('drma-chip-as-btn')) return;
  const s = document.createElement('style');
  s.id = 'drma-chip-as-btn';
  s.textContent = `
    /* only affect selected chips we upgrade to drma-btn */
    .drma-chip.drma-btn{
      /* let the .drma-btn styles take over cleanly */
      border: 0;
      background: none;
      box-shadow: none;
      padding: 6px 12px;          /* match your button comfort */
      border-radius: 8px;
    }
    /* optional: keep text weight similar to buttons */
    .drma-chip.drma-btn span{ font-weight:600; }
  `;
  document.head.appendChild(s);
})();

  function renderSelectGroup(containerId, options, currentValue, onChange){
    const $root = $('#' + containerId);
    if (!$root.length) return;
    const $group = $root.find('.drma-select-group');
    $group.empty();

    options.forEach((opt, idx) => {
      const id = `${containerId}_${idx}`;
      const $chip = $(`
        <label class="drma-chip" for="${id}" role="radio" aria-checked="${currentValue===opt?'true':'false'}" tabindex="0">
          <input type="radio" id="${id}" name="${containerId}" value="${opt}">
          <span>${opt}</span>
        </label>
      `);
      if (currentValue === opt) $chip.addClass('active drma-btn');
      if (currentValue === opt) $chip.addClass('active');
      $chip.on('click keydown', (e) => {
        if (e.type==='keydown' && !(e.key==='Enter'||e.key===' ')) return;
        onChange(opt);
      });
      $group.append($chip);
    });

    // Selection summary line (optional, just visual confirmation)
    if ($root.find('.drma-pick').length === 0) {
      $root.append('<div class="drma-pick"></div>');
    }
    $root.find('.drma-pick').text(currentValue ? `Selected: ${currentValue}` : 'Selected: —');
  }

function ensureAssessmentDropdown(){
  const $sel = $('#drma_assessment_select');
  if (!$sel || !$sel.length) return;

  const comp = mvc.Components.get('drma_assessment_list');
  const searchUnion = [
    `| inputlookup ${LOOKUP_HISTORY} | eval src="normal"`,
    `| append [ | inputlookup ${DORA_EVIDENCE_HISTORY} | eval src="dora" ]`,
    `| where isnotnull(assessment_id) AND trim(assessment_id)!=""`,
    `| stats latest(updated_at) AS last_updated, values(src) AS src by assessment_id`,
    `| sort 0 - last_updated`,
    `| fields assessment_id src`
  ].join(' ');

  if (!comp){
    new SearchManager({
      id: 'drma_assessment_list',
      search: searchUnion,
      earliest_time: '0', latest_time: 'now', autostart: true
    }).data('results', {count:0}).on('data', function(){
      const rows = this.collection().toJSON() || [];

      // remember existing selection
      const submittedTokens = mvc.Components.getInstance('submitted');
      const currentTokenSel = submittedTokens && submittedTokens.get('assess_id');
      const currentSel = $sel.val() || currentTokenSel || '';

      // rebuild options + id→source map
      assessmentIdSource = {};
      $sel.find('option:not([value=""])').remove();
      const seen = new Set();

      rows.forEach(r=>{
        const idRaw = r.assessment_id;
        const id = String(idRaw||'').trim();
        // src can be multi-valued; prefer "dora" if present
        let src = r.src;
        if (Array.isArray(src)) {
          src = src.includes('dora') ? 'dora' :
                (src.includes('normal') ? 'normal' : (src[0] || 'normal'));
        }
        src = src || 'normal';

        if (id && !seen.has(id)){
          seen.add(id);
          assessmentIdSource[id] = (src === 'dora') ? 'dora' : 'normal';
          $sel.append('<option value="'+id+'">'+id+'</option>');
        }
      });

      // restore selection if still present
      if (currentSel && seen.has(currentSel)) {
        $sel.val(currentSel);
      }
    });
  } else {
    comp.settings.set('search', searchUnion);
    try { comp.startSearch(); } catch(e){}
  }
}

function clearEvidence(){
  lookupEvidence = {};
  workingChanges = {};
  $('#drma_updated').text(`${updatedCount()} cards updated`);
  render();
}

function loadEvidenceForAssessment(assessmentId){
  const safe = String(assessmentId || '').replace(/"/g, '\\"');
  const hist = activeHistoryLookup();

  const q = [
    `| inputlookup ${hist}`,
    `| search assessment_id="${safe}"`,
    '| stats latest(evidence) AS evidence by short_id',
    '| table short_id evidence'
  ].join(' ');

  evidenceSM.settings.set('search', q);
  try { evidenceSM.startSearch(); } catch(e) { console.warn('evidenceSM start failed', e); }
}


// === Loading state ===========================================================
let loadingState = { practices: true, dora: true }; // start as loading

function settleAndMaybeHide(){
  const gated = !isDoraMode() && !hasBothSelections();

if (gated){
  // Keep the Step 3 bar visible so the gate message can live there
  hideMainLoader();
  setLevelsVisible(true);
  return;
}

  const needDora = isDoraMode();
  const ready = needDora ? !loadingState.dora : !loadingState.practices;
  const hasAnySection = $('#drma_sections .drma-section').length > 0;

  // Only show the buttons when sections exist
  setLevelsVisible(hasAnySection);

  if (ready && hasAnySection){
    hideMainLoader();
    // ensure the buttons render once data+sections are ready
    drawLevelButtons();
  } else {
    showMainLoader();
  }
}

function renderOutcomeSelectors(){
  renderSelectGroup('drma_business', BUSINESS_OPTIONS, selectedBusiness, (opt)=>{
    // Picking Compliance alone should NOT switch modes.
    selectedBusiness = opt;
    // If user unselects away from Compliance while DORA is selected, keep it normal.
    renderOutcomeSelectors();
    drawLevelButtons();
    render();                 // normal or DORA decided purely by isDoraMode()
    settleAndMaybeHide();
    if (window.drmaAssessmentId) {
  loadEvidenceForAssessment(window.drmaAssessmentId);  // use the active (DORA/normal) lookup
  refreshLastUpdateFor(window.drmaAssessmentId);
}
    console.log('[DRMA] Business outcome selected:', opt);
  });
  ensureBusinessClearButton();

  renderSelectGroup('drma_operational', OPERATIONAL_OPTIONS, selectedOperational, (opt)=>{
    selectedOperational = opt;

    // If they choose DORA, auto-select Compliance / Assurance
    if (opt === 'DORA' && selectedBusiness !== 'Compliance / Assurance') {
      selectedBusiness = 'Compliance / Assurance';
    }

    renderOutcomeSelectors();
    drawLevelButtons();
    render();
    settleAndMaybeHide();
    if (window.drmaAssessmentId) {
  loadEvidenceForAssessment(window.drmaAssessmentId);  // use the active (DORA/normal) lookup
  refreshLastUpdateFor(window.drmaAssessmentId);
}
    console.log('[DRMA] Operational outcome selected:', opt);
  });
  ensureOperationalClearButton();
  ensureAssessmentDropdown();
}

(function bootstrapFromTokens(){
  const submittedTokens = mvc.Components.getInstance('submitted');
  const sel = submittedTokens && (submittedTokens.get('assess_id') || '');
  if (sel){
    setIsDoraTokenFor(sel);          // <-- add this line
    $('#drma_assessment_select').val(sel);
    $('#assessment_id_input').val(sel);
    window.drmaAssessmentId = sel;
    refreshSubmitEnabled();
    loadOutcomesForAssessment(sel);
    loadEvidenceForAssessment(sel);
  }
})();

  /* =========================
     Current user (for history)
     ========================= */
  let currentUser = 'unknown';
  const userSM = new SearchManager({
    id: 'drma_user_ctx',
    search: '| rest /services/authentication/current-context splunk_server=local | table username',
    earliest_time: '0', latest_time: 'now', autostart: true
  });
  userSM.data('results', {count:1}).on('data', function(){
    try {
      const rows = this.collection().toJSON();
      if (rows && rows[0] && rows[0].username) currentUser = String(rows[0].username);
    } catch(e){}
  });


  // === Left-panel overview injector ===
function renderOverviewPanel() {
  var target = document.getElementById('drma-overview-html');
  if (!target) return; // panel not on this page

  var sm = mvc.Components.get('drma_overview_html');
  if (!sm) { target.innerHTML = "<p class='drma-subtitle'>Search manager not found.</p>"; return; }

  try { sm.startSearch(); } catch(e) {}

  var results = sm.data('results', { count: 1 });

  function fetchAndRender() {
    results.fetch({
      success: function() {
        var data = results.data();
        var fields = (data && data.fields) ? data.fields : [];
        var rows   = (data && data.rows)   ? data.rows   : [];
        var idx    = fields.indexOf('html');
        var html   = (rows.length && idx >= 0) ? rows[0][idx] : "";
        target.innerHTML = html || "<p class='drma-subtitle'>No overview available.</p>";
      },
      error: function() {
        ///target.innerHTML = "<p class='drma-subtitle'>Error fetching results.</p>";
        target.innerHTML = "<p class='drma-subtitle'>Analysing results</p>";
      }
    });
  }

  fetchAndRender();                // first load
  sm.on('search:done', fetchAndRender);
  sm.on('search:error', function(){ target.innerHTML = "<p class='drma-subtitle'>Search error.</p>"; });
}

function ensureBusinessClearButton(){
  const $root = $('#drma_business');
  if (!$root.length) return;

  if ($('#drma_business_clear').length === 0){
    const trashSVG = TRASH_SVG;
    $root.append(
      `<button id="drma_business_clear"
               class="drma-clear-btn"
               type="button"
               title="Clear selection"
               aria-label="Clear business objective">${TRASH_SVG}</button>`
    );
    $('#drma_business_clear').on('click', function(e){
      e.preventDefault();
      window.getSelection?.().removeAllRanges?.();

      selectedBusiness = null;
      selectedOperational = null;             // ✅ also clear Step 2
      // (optional) if you want to visually unselect the Step 2 chips immediately:
      // $('#drma_operational .drma-chip').removeClass('active drma-btn');  // not required, re-render handles it

      renderOutcomeSelectors();               // re-renders both steps
      render();
      drawLevelButtons();
      ensureAssessmentDropdown();
    });
  }

  $('#drma_business_clear').prop('hidden', !selectedBusiness);
}

// allow absolute-positioned clear buttons inside sections
(function(){
  if (document.getElementById('drma-sec-clear-css')) return;
  const s = document.createElement('style');
  s.id = 'drma-sec-clear-css';
  s.textContent = '.drma-section{ position:relative; } .drma-section .drma-clear-btn{ top:8px; right:10px; }';
  document.head.appendChild(s);
})();

function ensureOperationalClearButton(){
  const $root = $('#drma_operational');
  if (!$root.length) return;

  // create once
  if ($('#drma_operational_clear').length === 0){
const trashSVG = TRASH_SVG; // or just inline ${TRASH_SVG}
    $root.append(
      `<button id="drma_operational_clear"
               class="drma-clear-btn"
               type="button"
               title="Clear selection"
               aria-label="Clear operational outcome">${TRASH_SVG}</button>`
    );
    $('#drma_operational_clear').on('click', function(e){
      e.preventDefault();
      window.getSelection?.().removeAllRanges?.();
      selectedOperational = null;
      renderOutcomeSelectors();
      render(); 
      drawLevelButtons(); 
    });
  }

  // show only when something is selected
  $('#drma_operational_clear').prop('hidden', !selectedOperational);
}

function updatedCount(){
  const activeIds = activeShortIdSet();
  return Object.keys(workingChanges).filter(k => activeIds.has(k)).length;
}

function updateSectionClearVisibility(domain){
  const rows = isDoraMode() ? doraRows : allRows;
  const hasUnsaved = rows.some(r => {
    const id = String(r.short_id || r.practice_id || '').trim();
    return (r.domain || 'Other') === domain && !!workingChanges[id];
  });
  $(`.drma-section[data-domain="${domain}"] .drma-section-clear`).prop('hidden', !hasUnsaved);
}

  /* =========================
     Levels UI (centered) + right rail (counter + last updated + Update)
     ========================= */
  const levels = [1,2,3,4,5];
  let selectedMaxLevel = 1;
  const $levels = $('#drma_levels');
  setLevelsVisible(false); // keep buttons hidden until sections/cards exist

(function injectLevelsCSS(){
  if (document.getElementById('drma-levels-css-v2')) return; // force a fresh style tag
  const css = `
    .drma-levels-container{ position:relative; }
    .drma-levels{ display:inline-flex; gap:10px; flex-wrap:wrap; justify-content:center; }

    /* LEFT: title + subtitle stacked; wrap to a comfortable line length */
    .drma-levels-left{
      position:absolute; left:0; top:50%; transform:translateY(-50%);
      display:flex; flex-direction:column; gap:2px; padding-left:6px;
      max-width:38ch;              /* natural line length, not % of bar */
      white-space:normal; word-break:normal;
    }
    .drma-lbl-title{ font-size:14px; color:#d6e7ff; }
    .drma-lbl-sub  { font-size:12px; color:#cfe0ff; opacity:.9; }

    /* RIGHT: last update / counter / button */
    .drma-levels-right{
      position:absolute; right:0; top:50%; transform:translateY(-50%);
      display:flex; flex-direction:column; align-items:flex-end; gap:6px; padding-right:4px;
    }
    .drma-updated{ font-size:12px; color:#cfe0ff; white-space:nowrap; line-height:1.2; }
    .drma-lastupdate{ font-size:12px; color:#9fb6d9; opacity:.9; white-space:nowrap; line-height:1.2; }
    #drma_update_btn{ white-space:nowrap; min-width:84px; }

    /* Mobile: stack everything */
    @media (max-width:720px){
      .drma-levels-left,
      .drma-levels-right{
        position:static; transform:none; max-width:100%;
        display:flex; align-items:center; justify-content:center; text-align:center; padding:0; margin:6px 0;
      }
      .drma-levels-container{ text-align:center; }
    }
  `;
  const s = document.createElement('style');
  s.id = 'drma-levels-css-v2';
  s.textContent = css;
  document.head.appendChild(s);
})();

(function injectLevelsSpacerCSS(){
  if (document.getElementById('drma-levels-spacer-css')) return;
  const s = document.createElement('style');
  s.id = 'drma-levels-spacer-css';
  s.textContent = `
    .drma-levels-container{ min-height:48px; padding:6px 0; } /* keeps vertical space */
    .drma-levels-spacer{ height:40px; width:100%; }            /* center placeholder */
  `;
  document.head.appendChild(s);
})();

// Lightweight override for the Step 3 label (safe to add alongside existing CSS)
(function injectStep3LabelCSS(){
  if (document.getElementById('drma-step3-css')) return;
  var s = document.createElement('style');
  s.id = 'drma-step3-css';
  s.textContent =
    '.drma-levels-left{position:absolute;left:0;top:50%;transform:translateY(-50%);' +
    'display:flex;flex-direction:column;gap:2px;padding-left:6px;max-width:40ch;' +
    'white-space:normal;word-break:normal;}' +
    '.drma-lbl-title{font-size:14px;color:#d6e7ff;}' +
    '.drma-lbl-sub{font-size:12px;color:#cfe0ff;opacity:.9;}' +
    '@media (max-width:720px){.drma-levels-left{position:static;transform:none;max-width:100%;' +
    'align-items:center;text-align:center;margin:6px 0;}}';
  document.head.appendChild(s);
})();

  // History-driven "Last update"
const lastUpdateSM = new SearchManager({
  id: 'drma_last_update',
  search: '| makeresults | head 0',     // neutral; we set the real search later
  earliest_time: '0', latest_time: 'now', autostart: false
});

  lastUpdateSM.data('results', {count:1}).on('data', function(){
    try{
      const rows = this.collection().toJSON() || [];
      if (rows.length && rows[0].updated_at){
        const ts = Date.parse(rows[0].updated_at);
        const formatted = isNaN(ts) ? rows[0].updated_at : new Date(ts).toLocaleString();
        $('#drma_lastupdate').text('Last update: ' + formatted);
      } else {
        $('#drma_lastupdate').text('');  // blank when no selection or no data
      }
    } catch(e){
      console.error('Error parsing last update:', e);
      $('#drma_lastupdate').text('');
    }
  });
  function refreshLastUpdate(){
    try { lastUpdateSM.startSearch(); } catch(e) { console.warn('lastUpdateSM start failed', e); }
  }

function refreshLastUpdateFor(id){
  const safe = String(id || '').replace(/"/g, '\\"');
  const hist = activeHistoryLookup();
  const search = id
    ? `| inputlookup ${hist} | search assessment_id="${safe}" | fields updated_at | sort 0 - updated_at | head 1`
    : `| makeresults | head 1`;
  lastUpdateSM.settings.set('search', search);
  try { lastUpdateSM.startSearch(); } catch(e){}
}

function ensureRightUI(){
  const $levelsContainer = $('.drma-levels-container');
  if (!$levelsContainer.length) return;

  // Step 3 label (unchanged)
  if ($('#drma_levels_left').length === 0){
    $levelsContainer.append(
      '<div id="drma_levels_left" class="drma-levels-left">' +
        '<div class="drma-lbl-title"><strong>Step 3</strong> - Complete the DRMA assessment</div>' +
        '<div class="drma-lbl-sub">Select the appropriate response for the individual controls for each level</div>' +
      '</div>'
    );
    ensureGlobalCollapseToggle();
  }

  // ---- Step 4 layout: left title/subtitle + right actions on one row ----
  const $step4 = $('#drma_step4');
  if ($step4.length){
    // Wrap the h2 + p into a left container (do once)
    if ($step4.find('.drma-step4-left').length === 0){
      const $left = $('<div class="drma-step4-left"/>');
      const $h2   = $step4.find('h2.drma-select-title').first();
      const $p    = $step4.find('p.drma-subtitle').first();
      if ($h2.length) $left.append($h2.detach());
      if ($p.length)  $left.append($p.detach());
      $step4.prepend($left);
    }

    // Move/create the actions to the right side
    if ($('#drma_levels_right').length){
      const $moved = $('#drma_levels_right').detach();
      if ($('#drma_actions').length === 0) $step4.append('<div id="drma_actions"></div>');
      $('#drma_actions').empty().append($moved);
      $moved.removeClass('drma-levels-right'); // drop absolute positioning class
    }
    if (!$('#drma_lastupdate').length || !$('#drma_update_btn').length){
      if ($('#drma_actions').length === 0) $step4.append('<div id="drma_actions"></div>');
  $('#drma_actions').html(
    '<div id="drma_levels_right">' +
      '<div id="drma_lastupdate" class="drma-lastupdate"></div>' +
      '<div id="drma_updated" class="drma-updated">0 cards updated</div>' +
      '<button id="drma_update_btn" class="drma-btn">Submit</button>' +
    '</div>'
  );
      $('#drma_update_btn').off('click').on('click', onSaveEvidence);
      refreshLastUpdate();
    }
    $('#drma_updated').text(`${updatedCount()} cards updated`);
  }
  refreshSubmitEnabled();
  ensureAssessmentCenter();
}

function ensureAssessmentCenter(){
  const $step4 = $('#drma_step4');
  if (!$step4.length) return;

  // Ensure center container order: left | center | right
  if ($('#drma_assessment_center').length === 0){
    if ($('#drma_actions').length){
      $('<div id="drma_assessment_center"></div>').insertBefore('#drma_actions');
    } else {
      $step4.append('<div id="drma_assessment_center"></div>');
    }
  } else if ($('#drma_actions').length){
    const $center = $('#drma_assessment_center');
    if ($center.next()[0] !== $('#drma_actions')[0]) $center.insertBefore('#drma_actions');
  }

  if ($('#assessment_id_input').length === 0){
    $('#drma_assessment_center').html(`
      <div class="drma-field" id="drma-assessment-id">
        <label for="assessment_id_input">Enter Unique ID</label>
        <input id="assessment_id_input" type="text" class="drma-input"
               placeholder="e.g. service1" value="" />
        <div class="drma-help">Lowercase letters and numbers only. 3–64 characters. No spaces or symbols.</div>
      </div>
    `);

    const $in = $('#assessment_id_input');

    function validFormat(v){
      return /^[a-z0-9]{3,64}$/.test(v);
    }
function validate(){
  let v = $in.val().trim();
  v = v.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (v !== $in.val()) $in.val(v);
  const ok = /^[a-z0-9]{3,64}$/.test(v);
  $in.toggleClass('is-invalid', !ok);
  window.drmaAssessmentId = ok ? v : null;
  refreshSubmitEnabled();          // ⬅️ NEW: keep Submit in sync
  return ok;
}

    $in.on('input blur', validate);
    validate(); // run immediately so empty field starts red
  }
}

// Clear ONLY unsaved changes (workingChanges) for the section that was clicked
$(document).on('click', '.drma-section-clear', function(e){
  e.preventDefault();
  const $sec   = $(this).closest('.drma-section');
  const domain = $sec.attr('data-domain') || '';
  if (!domain) return;

  const srcRows = isDoraMode() ? doraRows : allRows;

  const idsInDomain = srcRows
    .filter(r => (r.domain || 'Other') === domain)
    .map(r => String(r.short_id || r.practice_id || '').trim())
    .filter(Boolean);

  // remove unsaved overrides for ids in this domain
  idsInDomain.forEach(id => { if (workingChanges[id]) delete workingChanges[id]; });

  // reset radios + status pill on the currently rendered cards in this section
  idsInDomain.forEach(id => {
    const base = lookupEvidence[id];               // persisted value (may be undefined)
    const $card = $sec.find(`.drma-card:has(input[name="evidence-${id}"])`);
    if ($card.length){
      const $inputs = $card.find(`input[name="evidence-${id}"]`);
      $inputs.prop('checked', false);
      if (isValid(base)){
        $card.find(`input[name="evidence-${id}"][value="${base}"]`).prop('checked', true);
      }
      // refresh pill using the card's original status + (new) effective evidence
      const row = srcRows.find(r => String(r.short_id || r.practice_id || '') === id);
      const originalKey = normalizeStatus(row && row.status);
      applyPill($card, effectiveStatusKey(originalKey, base));
    }
  });

  // refresh the updated counter
  $('#drma_updated').text(`${updatedCount()} cards updated`);
  updateSectionClearVisibility(domain);
});

(function injectStep4LayoutCSS(){
  if (document.getElementById('drma-step4-layout-css')) return;
  const s = document.createElement('style');
  s.id = 'drma-step4-layout-css';
  s.textContent = `
    #drma_step4{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    #drma_step4 .drma-step4-left{ display:flex; flex-direction:column; gap:2px; }
    #drma_actions{ display:flex; gap:12px; align-items:center; justify-content:flex-end; margin-top:0; }
    @media (max-width:720px){
      #drma_step4{ justify-content:center; }
      #drma_actions{ justify-content:center; flex-wrap:wrap; }
    }
  `;
  document.head.appendChild(s);
})();

// Show/Hide for the top panel
$(document).on('click', '#drma_assess_toggle', function(e){
  e.preventDefault();
  const $panel = $('#drma_assess_panel');
  const isHidden = !$panel.is(':visible');
  $panel.toggle(isHidden);
  $(this).text(isHidden ? 'Hide previous assessments' : 'Show previous assessments');
});

function drawLevelButtons(){
  const hasSections = $('#drma_sections .drma-section').length > 0;
  const gated = (!isDoraMode() && !hasBothSelections());

  // If gated, leave the gate message that render() injected and keep the bar visible
  if (gated){
    setLevelsVisible(true);
    return;
  }

  // If not gated but sections aren’t ready yet, hide the buttons row for now
  if (!hasSections){
    $levels.empty();
    setLevelsVisible(false);
    return;
  }

  // DORA: spacer only
  if (isDoraMode()){
    $levels.empty().append('<div class="drma-levels-spacer" aria-hidden="true"></div>');
    setLevelsVisible(true);
    ensureRightUI();
    return;
  }

  // Normal (ungated + sections exist): render the 5 buttons
  $levels.empty();
  levels.forEach(l=>{
    const isActive = l <= selectedMaxLevel;
    const $b = $('<button/>', { class:'drma-btn'+(isActive?' active':''), text:`Level ${l}` });
    $b.on('click', ()=>{ selectedMaxLevel=l; drawLevelButtons(); render(); });
    $levels.append($b);
  });
  setLevelsVisible(true);
  ensureRightUI();
}
  drawLevelButtons();

const practicesSM = new SearchManager({
  id: 'drma_lookup',
  search: '| inputlookup drma_practices',
  earliest_time: '0',
  latest_time: 'now',
  autostart: false     // ← ensure we can hook start/done first
});

// Loader hooks for practices
practicesSM.on('search:start', function(){
  loadingState.practices = true;
  showMainLoader();
});
practicesSM.on('search:done', function(){
  loadingState.practices = false;
  settleAndMaybeHide();
});

const evidenceSM = new SearchManager({
  id: 'drma_evidence_current',
  search: '| makeresults | head 1',     
  earliest_time: '0',
  latest_time: 'now',
  autostart: false
});

const doraSM = new SearchManager({
  id: 'drma_dora_cards',
  search: `| inputlookup ${DORA_LOOKUP} | table domain practice_id short_id level title description`,
  earliest_time: '0', latest_time: 'now'
});
// Loader hooks for DORA
doraSM.on('search:start', function(){
  loadingState.dora = true;
  showMainLoader();
});
doraSM.on('search:done', function(){
  loadingState.dora = false;
  settleAndMaybeHide();
});

try { doraSM.startSearch(); } catch(e){}

doraSM.data('results', {count:0}).on('data', function(){
  doraRows = this.collection().toJSON() || [];
  if (isDoraMode()) render(); drawLevelButtons();   // re-render when DORA data arrives
});

  practicesSM.data('results',{count:0}).on('data', function(){
    allRows = this.collection().toJSON();
    drawLevelButtons(); 
    render();
  });

  try { practicesSM.startSearch(); } catch (e) {}

  evidenceSM.data('results', {count:0}).on('data', function () {
    const rows = this.collection().toJSON() || [];

    // Seed authoritative map
    lookupEvidence = {};
    rows.forEach(r=>{
      const id = String(r.short_id || r.practice_id || '').trim();
      const ev = String(r.evidence || '').trim().toLowerCase();
      if (id && isValid(ev)) lookupEvidence[id] = ev;
    });

    // Clear unsaved diffs
    workingChanges = {};

    // Refresh counter & UI
    $('#drma_updated').text(`${updatedCount()} cards updated`);
    if (allRows.length) render();
  });

  /* =========================
     Collapsed domains memory
     ========================= */
  const LS_KEY = 'drma_collapsed_domains';
  let collapsedDomains = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    if (Array.isArray(saved)) collapsedDomains = new Set(saved);
  } catch(e){}
  function persistCollapsed(){ try { localStorage.setItem(LS_KEY, JSON.stringify(Array.from(collapsedDomains))); } catch(e){} }

  /* =========================
     Status helpers (front pill)
     ========================= */
  function normalizeStatus(raw){
    const s = String(raw||'not configured').trim().toLowerCase();
    if (s==='configured'||s==='done'||s==='complete') return 'configured';
    if (s==='needs review'||s==='needs-review'||s==='review') return 'needs-review';
    return 'not-configured';
  }
  function statusLabelFromKey(k){
    return k==='configured' ? 'Configured'
         : k==='needs-review' ? 'Needs review'
         : 'Not configured';
  }
  function effectiveStatusKey(originalKey, ev){
    if (ev==='splunk' || ev==='other') return 'configured';
    return originalKey;
  }
  function applyPill($card, key){
    const $pill = $card.find('.drma-status');
    $pill
      .removeClass('status-configured status-needs-review status-not-configured')
      .addClass(`status-${key}`)
      .text(statusLabelFromKey(key));
  }

  /* =========================
     Render sections + cards
     ========================= */
function render(){
  const $root = $('#drma_sections').empty();

  // Gate: in normal (non-DORA) mode, don’t render cards until both picks are made
// Gate: in normal (non-DORA) mode, don’t render cards until both picks are made
if (!isDoraMode() && !hasBothSelections()){
  // Put the gate message INSIDE the Step 3 bar (center), so it aligns with the Step 3 text
  $('#drma_main_loader').hide();

  $levels.empty().append(`
    <div class="drma-gate-msg">
      <div class="title">Select both Step 1 and Step 2</div>
      <div class="sub">Pick a Business Outcome and an Operational Scope to load all practices.</div>
    </div>
  `);

  setLevelsVisible(true);          // keep the bar visible so the gate sits in it
  $('#drma_sections').show().empty();   // no duplicate gate below
  ensureRightUI();
  return;
}

  // === DORA MODE: show 9 chapters, no cards ===
// === DORA MODE: chapters + cards from lookup ===
if (isDoraMode()){
  const DORA_LS_KEY = 'drma_collapsed_dora';
  let doraCollapsed = new Set();
  try { doraCollapsed = new Set(JSON.parse(localStorage.getItem(DORA_LS_KEY) || '[]')); } catch(e){}

  // Group cards by chapter
  const byChapter = (doraRows || []).reduce((m,r)=>{
    const chap = r.domain || 'Other';
    (m[chap]=m[chap]||[]).push(r);
    return m;
  }, {});

  DORA_CHAPTERS.forEach(chapter=>{
    const safeId = chapter.replace(/\W+/g, '-');
    const isCollapsed = doraCollapsed.has(chapter);
    const items = byChapter[chapter] || [];

    const $section = $('<div class="drma-section"/>').attr('data-domain', chapter);
    if (isCollapsed) $section.addClass('is-collapsed');

    $section.append('<div class="drma-section-divider" role="presentation"></div>');
    $section.append(`
      <button class="drma-section-header" type="button" aria-expanded="${!isCollapsed}" aria-controls="grid-${safeId}">
        <span class="drma-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M8.12 9.29 12 13.17l3.88-3.88 1.41 1.42L12 16l-5.29-5.29z"/></svg>
        </span>
        <span class="drma-section-title">${chapter}</span>
        <span class="drma-count"><span class="drma-count-current">${items.length||0}</span>/<span class="drma-count-total">${items.length||0}</span></span>
      </button>
    `);

    const $grid = $(`<div class="drma-grid" id="grid-${safeId}"></div>`);
    items.forEach(r => $grid.append(cardEl(r)));
    if (isCollapsed) $grid.hide();
    $section.append($grid);
    $root.append($section);
  });

  // toggling + persistence (unchanged)
  $root.off('click.drma').on('click.drma', '.drma-section-header', function(){
    const $sec = $(this).closest('.drma-section');
    const domain = $sec.attr('data-domain') || '';
    const $grid = $sec.find('.drma-grid').first();
    const willExpand = !$sec.hasClass('is-collapsed');
    if (willExpand){
      $sec.addClass('is-collapsed'); $(this).attr('aria-expanded','false'); doraCollapsed.add(domain); $grid.stop(true,true).slideUp(160);
    } else {
      $sec.removeClass('is-collapsed'); $(this).attr('aria-expanded','true'); doraCollapsed.delete(domain); $grid.stop(true,true).slideDown(160);
    }
    try { localStorage.setItem('drma_collapsed_dora', JSON.stringify(Array.from(doraCollapsed))); } catch(e){}
  });

  // keep Step 3 chrome + right rail, but show/hide the 5 buttons as before
  drawLevelButtons();
  setLevelsVisible(true);
  ensureRightUI();
  return;
}

  // === NORMAL MODE (your existing logic) ===
  const rows = allRows.filter(r => {
    const lvl = parseInt(r.level,10);
    return Number.isFinite(lvl) && lvl <= selectedMaxLevel;
  });

  const byDomain = rows.reduce((m,r)=>{
    const d = r.domain || 'Other';
    (m[d]=m[d]||[]).push(r);
    return m;
  },{});
  let domains = Object.keys(byDomain);

  if (!domains.length){
    $root.html('<div class="alert">No practices for these levels.</div>');
    ensureRightUI();
    return;
  }

  const domainOrder = [
    "Access Control","Asset Management","Auditability","Awareness and Training",
    "Configuration Management","Identification and Authentication",
    "Capacity & Elasticity","Efficiency & Cost","Performance & Quality",
    "Security & Safety","Adaptability, Extensibility, Agility & Creativity",
    "Usability & Operability"
  ].map(s=>s.toLowerCase());
  domains.sort((a,b)=>{
    const ia=domainOrder.indexOf(String(a).toLowerCase());
    const ib=domainOrder.indexOf(String(b).toLowerCase());
    return (ia===-1&&ib===-1)?a.localeCompare(b):(ia===-1)?1:(ib===-1)?-1:ia-ib;
  });

  domains.forEach(domain=>{
    const items = byDomain[domain];
    const totalCount = allRows.filter(r => (r.domain||'Other')===domain).length;
    const isCollapsed = collapsedDomains.has(domain);

    const $section = $('<div class="drma-section"/>').attr('data-domain', domain);
    if (isCollapsed) $section.addClass('is-collapsed');

    $section.append('<div class="drma-section-divider" role="presentation"></div>');
    $section.append(`
      <button class="drma-section-header" type="button" aria-expanded="${!isCollapsed}" aria-controls="grid-${domain.replace(/\W+/g,'-')}">
        <span class="drma-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M8.12 9.29 12 13.17l3.88-3.88 1.41 1.42L12 16l-5.29-5.29z"/></svg>
        </span>
        <span class="drma-section-title">${domain}</span>
        <span class="drma-count"><span class="drma-count-current">${items.length}</span>/<span class="drma-count-total">${totalCount}</span></span>
      </button>
    `);

    const trashSVG = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3h6a1 1 0 0 1 1 1v1h4v2h-1v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7H4V5h4V4a1 1 0 0 1 1-1Zm1 2h4V5h-4ZM7 7v12h10V7H7Zm3 2h2v8h-2V9Zm4 0h2v8h-2V9Z"/>
      </svg>`;
    $section.append(
      `<button type="button"
               class="drma-clear-btn drma-section-clear no-flip"
               hidden
               title="Clear unsaved changes in ${domain}"
               aria-label="Clear changes in ${domain}">${trashSVG}</button>`
    );

    const $grid = $(`<div class="drma-grid" id="grid-${domain.replace(/\W+/g,'-')}"></div>`);
    items.forEach(r => $grid.append(cardEl(r)));
    if (isCollapsed) $grid.hide();
    $section.append($grid);

    $root.append($section);

    updateSectionClearVisibility(domain);
  });

  $root.off('click.drma').on('click.drma', '.drma-section-header', function(){
    const $sec = $(this).closest('.drma-section');
    const domain = $sec.attr('data-domain') || '';
    const $grid = $sec.find('.drma-grid').first();
    const willExpand = !$sec.hasClass('is-collapsed');
    if (willExpand){
      $sec.addClass('is-collapsed'); $(this).attr('aria-expanded','false'); collapsedDomains.add(domain); $grid.stop(true,true).slideUp(160);
    } else {
      $sec.removeClass('is-collapsed'); $(this).attr('aria-expanded','true'); collapsedDomains.delete(domain); $grid.stop(true,true).slideDown(160);
    }
    persistCollapsed();
  });

  ensureRightUI();
}

// After render builds sections, try to hide if ready
const originalRender = render;
render = function(){
  showMainLoader();                 // in case render runs before data completes
  originalRender.apply(this, arguments);
  settleAndMaybeHide();             // hide once sections exist & data is ready
};

function cardEl(r){
  const short  = r.short_id || r.practice_id || '';
  const title  = r.title || '';
  const desc   = r.description || '';
  const domain = r.domain || '';

  // Level is optional (blank for DORA)
  const lvlNum   = parseInt(r.level, 10);
  const hasLevel = Number.isFinite(lvlNum);
  const lvlClass = hasLevel ? ` lvl-${lvlNum}` : '';
  const levelBadge = hasLevel
    ? `<div class="drma-card-level"><span class="level-chip">Level ${lvlNum}</span></div>`
    : '';

  const originalKey   = normalizeStatus(r.status);
  const originalLabel = statusLabelFromKey(originalKey);

  const iconSVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.21 0-6 1.11-6 3.33V19h12v-2.67C22 14.11 18.21 13 16 13Zm-8 0C5.79 13 2 14.11 2 16.33V19h8v-2.67C10 14.11 6.21 13 4 13Z"/>
    </svg>`;

  const $card = $(`
    <div class="drma-card${lvlClass}">
      <div class="drma-flip-inner">

        <!-- FRONT -->
        <div class="drma-face drma-front">
          <div class="drma-pad">
            <div class="drma-card-head">
              <div class="drma-card-icon">${iconSVG}</div>
              <div class="drma-card-short">${short}</div>
            </div>

            ${levelBadge}

            <div class="drma-card-body">
              <div class="drma-card-title"><strong>${title}</strong></div>
              <div class="drma-card-meta">${domain}</div>
              <p class="drma-card-desc">${desc}</p>
            </div>

            <div class="drma-card-footer">
              <span class="drma-status status-${originalKey}">${originalLabel}</span>
            </div>
          </div>
        </div>

        <!-- BACK -->
        <div class="drma-face drma-back">
          <div class="drma-pad">
            <h4 style="margin:0 0 12px; color:#cddcf1;">Why this matters</h4>
            <p style="margin:0 0 6px; color:#cddcf1;">Explain impact of this practice.</p>

            <h4 style="margin:16px 0 6px; color:#cddcf1;">Evidence examples</h4>
            <ul style="list-style:none; padding:0; margin:0 0 8px; color:#cddcf1;">
              <li>• Logs / metrics</li>
              <li>• Policies / runbooks</li>
              <li>• Incident records</li>
            </ul>

            <hr style="border:0; border-top:1px solid rgba(126,163,214,.25); margin:4px 0;" />

            <form class="drma-evidence no-flip" aria-label="Evidence availability">
              <div class="drma-evidence-label">Evidence available?</div>
              <div class="choices" style="display:flex; gap:6px; flex-wrap:wrap;">
                <label class="drma-choice" style="flex:1;">
                  <input type="radio" name="evidence-${short}" value="splunk">
                  <span>Yes - Splunk</span>
                </label>
                <label class="drma-choice" style="flex:1;">
                  <input type="radio" name="evidence-${short}" value="other">
                  <span>Yes - Other</span>
                </label>
                <label class="drma-choice" style="flex:1;">
                  <input type="radio" name="evidence-${short}" value="no">
                  <span>No - TBC</span>
                </label>
              </div>
            </form>
          </div>
        </div>

      </div>
    </div>
  `);

  const fromLookup = lookupEvidence[short];
  if (isValid(fromLookup)) {
    $card.find(`input[name="evidence-${short}"][value="${fromLookup}"]`).prop('checked', true);
  }

  applyPill($card, effectiveStatusKey(originalKey, fromLookup));

  $card.on('click', function(e){
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag==='a'||tag==='button'||tag==='input'||tag==='select'||tag==='textarea'||tag==='label'||
        e.target.closest('.no-flip')||e.target.closest('.drma-status')) return;
    $(this).toggleClass('flipped');
  });

  $card.find(`input[name="evidence-${short}"]`).on('change', function(){
    const ev = this.value;
    const base = lookupEvidence[short];
    if (ev === base) { delete workingChanges[short]; }
    else { workingChanges[short] = ev; }
    applyPill($card, effectiveStatusKey(originalKey, ev));
    $('#drma_updated').text(`${updatedCount()} cards updated`);
    updateSectionClearVisibility(domain);
  });

  return $card;
}

  /* =========================
     Save to current + append to history
     ========================= */
function buildSaveSearchCurrent(rows, assessmentId, currentUser, business, operational){
  const idEsc   = String(assessmentId || '').replace(/"/g,'\\"');
  const userEsc = String(currentUser  || 'unknown').replace(/"/g,'\\"');
  const bizEsc  = String(business     || '').replace(/"/g,'\\"');
  const opsEsc  = String(operational  || '').replace(/"/g,'\\"');

  const base =
    '| makeresults ' +
    '| eval short_id="", evidence="", assessment_id="", updated_by="", updated_at="", ' +
    '      business_outcome="", operational_outcome="" ' +
    '| where 1=2 ' +
    '| fields short_id evidence assessment_id updated_by updated_at business_outcome operational_outcome';

  const appends = rows.map(r=>{
    const sid = String(r.short_id).replace(/"/g,'\\"');
    const ev  = String(r.evidence).replace(/"/g,'\\"');
    return `| append [ | makeresults | eval short_id="${sid}", evidence="${ev}", assessment_id="${idEsc}", business_outcome="${bizEsc}", operational_outcome="${opsEsc}" | fields short_id evidence assessment_id business_outcome operational_outcome ]`;
  }).join(' ');

  // Always write one meta row so outcomes persist even with 0 cards
  const meta =
    `| append [ | makeresults | eval short_id="__meta__", evidence="", assessment_id="${idEsc}", business_outcome="${bizEsc}", operational_outcome="${opsEsc}" | fields short_id evidence assessment_id business_outcome operational_outcome ]`;

  return [
    base,
    appends,
    meta,
    `| eval updated_by="${userEsc}", updated_at=strftime(now(),"%Y-%m-%d %H:%M:%S")`,
    '| fields short_id evidence assessment_id updated_by updated_at business_outcome operational_outcome',
    `| outputlookup ${LOOKUP_CURRENT}`
  ].join(' ');
}

if (window.drmaAssessmentId) {
  loadEvidenceForAssessment(window.drmaAssessmentId);    // swap to the mode’s lookup
  refreshLastUpdateFor(window.drmaAssessmentId);
}

function buildSaveSearchHistory(rows, assessmentId, currentUser, business, operational){
  const idEsc   = String(assessmentId || '').replace(/"/g,'\\"');
  const userEsc = String(currentUser  || 'unknown').replace(/"/g,'\\"');
  const bizEsc  = String(business     || '').replace(/"/g,'\\"');
  const opsEsc  = String(operational  || '').replace(/"/g,'\\"');

  const base =
    '| makeresults ' +
    '| eval short_id="", evidence="", assessment_id="", updated_by="", updated_at="", ' +
    '      business_outcome="", operational_outcome="" ' +
    '| where 1=2 ' +
    '| fields short_id evidence assessment_id updated_by updated_at business_outcome operational_outcome';

  const appends = rows.map(r=>{
    const sid = String(r.short_id).replace(/"/g,'\\"');
    const ev  = String(r.evidence).replace(/"/g,'\\"');
    return `| append [ | makeresults | eval short_id="${sid}", evidence="${ev}", assessment_id="${idEsc}", business_outcome="${bizEsc}", operational_outcome="${opsEsc}" | fields short_id evidence assessment_id business_outcome operational_outcome ]`;
  }).join(' ');

  const meta =
    `| append [ | makeresults | eval short_id="__meta__", evidence="", assessment_id="${idEsc}", business_outcome="${bizEsc}", operational_outcome="${opsEsc}" | fields short_id evidence assessment_id business_outcome operational_outcome ]`;

  return [
    base,
    appends,
    meta,
    `| eval updated_by="${userEsc}", updated_at=strftime(now(),"%Y-%m-%d %H:%M:%S")`,
    '| table short_id evidence assessment_id updated_by updated_at business_outcome operational_outcome',
    `| outputlookup append=true ${LOOKUP_HISTORY}`
  ].join(' ');
}

function buildSaveSearchCurrentTo(lookupName, rows, assessmentId, currentUser, business, operational){
  const idEsc   = String(assessmentId || '').replace(/"/g,'\\"');
  const userEsc = String(currentUser  || 'unknown').replace(/"/g,'\\"');
  const bizEsc  = String(business     || '').replace(/"/g,'\\"');
  const opsEsc  = String(operational  || '').replace(/"/g,'\\"');

  const base =
    '| makeresults ' +
    '| eval short_id="", evidence="", assessment_id="", updated_by="", updated_at="", ' +
    '      business_outcome="", operational_outcome="" ' +
    '| where 1=2 ' +
    '| fields short_id evidence assessment_id updated_by updated_at business_outcome operational_outcome';

  const appends = rows.map(r=>{
    const sid = String(r.short_id).replace(/"/g,'\\"');
    const ev  = String(r.evidence).replace(/"/g,'\\"');
    return `| append [ | makeresults | eval short_id="${sid}", evidence="${ev}", assessment_id="${idEsc}", business_outcome="${bizEsc}", operational_outcome="${opsEsc}" | fields short_id evidence assessment_id business_outcome operational_outcome ]`;
  }).join(' ');

  const meta =
    `| append [ | makeresults | eval short_id="__meta__", evidence="", assessment_id="${idEsc}", business_outcome="${bizEsc}", operational_outcome="${opsEsc}" | fields short_id evidence assessment_id business_outcome operational_outcome ]`;

  return [
    base, appends, meta,
    `| eval updated_by="${userEsc}", updated_at=strftime(now(),"%Y-%m-%d %H:%M:%S")`,
    '| fields short_id evidence assessment_id updated_by updated_at business_outcome operational_outcome',
    `| outputlookup ${lookupName}`
  ].join(' ');
}

function buildSaveSearchHistoryTo(lookupName, rows, assessmentId, currentUser, business, operational){
  const idEsc   = String(assessmentId || '').replace(/"/g,'\\"');
  const userEsc = String(currentUser  || 'unknown').replace(/"/g,'\\"');
  const bizEsc  = String(business     || '').replace(/"/g,'\\"');
  const opsEsc  = String(operational  || '').replace(/"/g,'\\"');

  const base =
    '| makeresults ' +
    '| eval short_id="", evidence="", assessment_id="", updated_by="", updated_at="", ' +
    '      business_outcome="", operational_outcome="" ' +
    '| where 1=2 ' +
    '| fields short_id evidence assessment_id updated_by updated_at business_outcome operational_outcome';

  const appends = rows.map(r=>{
    const sid = String(r.short_id).replace(/"/g,'\\"');
    const ev  = String(r.evidence).replace(/"/g,'\\"');
    return `| append [ | makeresults | eval short_id="${sid}", evidence="${ev}", assessment_id="${idEsc}", business_outcome="${bizEsc}", operational_outcome="${opsEsc}" | fields short_id evidence assessment_id business_outcome operational_outcome ]`;
  }).join(' ');

  const meta =
    `| append [ | makeresults | eval short_id="__meta__", evidence="", assessment_id="${idEsc}", business_outcome="${bizEsc}", operational_outcome="${opsEsc}" | fields short_id evidence assessment_id business_outcome operational_outcome ]`;

  return [
    base, appends, meta,
    `| eval updated_by="${userEsc}", updated_at=strftime(now(),"%Y-%m-%d %H:%M:%S")`,
    '| table short_id evidence assessment_id updated_by updated_at business_outcome operational_outcome',
    `| outputlookup append=true ${lookupName}`
  ].join(' ');
}

(function injectSubmitGreenCSS(){
  if (document.getElementById('drma-submit-green-css')) return;
  const s = document.createElement('style');
  s.id = 'drma-submit-green-css';
  s.textContent = `
    /* Force the Submit button to bright green */
    #drma_update_btn {
      background: #0ADD08;
      color: #fff;
      font-weight: 600;
      border: none;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.2), 0 2px 8px rgba(0,0,0,.25);
      transition: background .15s ease, transform .1s ease;
    }
    #drma_update_btn:hover {
      background: #09c307;
    }
    #drma_update_btn:active {
      background: #08ac06;
      transform: translateY(1px);
    }
    #drma_update_btn:disabled {
      background: #0ADD08;
      opacity: .6;
      cursor: not-allowed;
      box-shadow: none;
    }
  `;
  document.head.appendChild(s);
})();

function onSaveEvidence(){
  const assessmentId = window.drmaAssessmentId || '';
  if (!isValidAssessmentId(assessmentId)){
    refreshSubmitEnabled();
    return;
  }

  const activeIds = activeShortIdSet();

  // Merge & filter to active mode only
  const merged = Object.assign({}, lookupEvidence);
  Object.keys(workingChanges).forEach(k=>{ merged[k] = workingChanges[k]; });

  const rows = Object.keys(merged)
    .filter(k => activeIds.has(k) && isValid(merged[k]))
    .map(k => ({ short_id:k, evidence:merged[k] }));

  const business = selectedBusiness || '';
  const operational = selectedOperational || '';

  const $btn = $('#drma_update_btn').prop('disabled', true).text('Submitting…');

  const curLookup  = activeCurrentLookup();
  const histLookup = activeHistoryLookup();

  const searchCurrent = buildSaveSearchCurrentTo(curLookup, rows, assessmentId, currentUser, business, operational);
  const searchHistory = buildSaveSearchHistoryTo(histLookup, rows, assessmentId, currentUser, business, operational);

  const saverCurrent = new SearchManager({
    id: `drma_save_current_${Date.now()}`,
    search: searchCurrent, earliest_time: '0', latest_time: 'now', autostart: true, preview: false
  });

  function restoreOK(){
    $btn.text('Saved ✓');
    setTimeout(()=>{ $btn.prop('disabled', false).text('Submit'); refreshSubmitEnabled(); }, 1000);
  }
  function restoreErr(){
    $btn.text('Retry');
    setTimeout(()=>{ $btn.prop('disabled', !isValidAssessmentId(window.drmaAssessmentId)).text('Submit'); }, 800);
  }

  saverCurrent.on('search:done', function(){
    const saverHistory = new SearchManager({
      id: `drma_save_history_${Date.now()}`,
      search: searchHistory, earliest_time: '0', latest_time: 'now', autostart: true, preview: false
    });
    saverHistory.on('search:done', function(){
      // re-pull from the active history lookup
      if (window.drmaAssessmentId) {
        loadEvidenceForAssessment(window.drmaAssessmentId);
        refreshLastUpdateFor(window.drmaAssessmentId);
      }
      restoreOK();
      try { mvc.Components.get('drma_overview_html').startSearch(); } catch(e) {}
    });
    saverHistory.on('search:error', function(e){ console.error('Save(history) error', e); restoreErr(); });
    saverHistory.on('search:failed', function(e){ console.error('Save(history) failed', e); restoreErr(); });
  });

  saverCurrent.on('search:error', function(e){ console.error('Save(current) error', e); restoreErr(); });
  saverCurrent.on('search:failed', function(e){ console.error('Save(current) failed', e); restoreErr(); });
}

  /* =========================
     Report export (Print / PNG / Email helper)
     ========================= */
function buildReportHTML(evidenceRows, chartDataUrl){
  const now = new Date().toLocaleString();

  // Top hero (same as before)
  const $hero = $('.drma-hero--frameless').first();
  const heroTitle = $hero.find('h1').text().trim() || 'Assessment';
  const heroSub   = $hero.find('.drma-subtitle').text().trim() || '';

  // Left panel
  const $left = $('.drma-intro-panel-marker').first();
  const leftTitle = $left.find('h1,h2').first().text().trim() || '';
  const leftSub   = $left.find('.drma-subtitle').first().text().trim() || '';

  // Safely capture any extra HTML beyond title/subtitle
  let leftExtraHTML = '';
  try {
    const el = $left.get(0);
    if (el) {
      // clone into a detached node so we never touch the live DOM
      const tmp = el.cloneNode(true);
      const t = tmp.querySelector('h1,h2');        if (t) t.remove();
      const s = tmp.querySelector('.drma-subtitle'); if (s) s.remove();
      leftExtraHTML = (tmp.innerHTML || '').trim();
    }
  } catch (e) {
    leftExtraHTML = '';
  }

  // Fallback summary if no extra body exists
  if (!leftExtraHTML) {
    const total = (evidenceRows || []).length;
    const yes   = (evidenceRows || []).filter(r => String(r.evidence||'').startsWith('Yes')).length;
    const pct   = total ? Math.round((yes/total)*100) : 0;
    const lastText = ($('#drma_lastupdate').text() || '').replace(/^Last update:\s*/, '') || 'never';
    leftExtraHTML = `
      <ul class="bullets">
        <li><strong>${yes}</strong> of <strong>${total}</strong> practices have evidence (${pct}%).</li>
        <li>Last update: ${lastText}</li>
      </ul>`;
  }

  // Build table rows (unchanged)
  const rowsHtml = (evidenceRows||[]).map(r=>`
    <tr>
      <td>${r.short_id||''}</td>
      <td>${r.title||''}</td>
      <td>${r.domain||''}</td>
      <td>${r.level||''}</td>
      <td>${r.evidence||''}</td>
    </tr>`).join('') || `<tr><td colspan="5" style="opacity:.75">No selections yet.</td></tr>`;

  const styles = `
    <style>
      *{box-sizing:border-box}
      body{margin:0;background:#0e1d33;color:#e9f2ff;font:14px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial}
      .wrap{padding:18px 22px}
      .card{background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.02));border-radius:12px;padding:14px 16px;margin:12px 0;box-shadow:inset 0 0 0 1px rgba(126,163,214,.28), 0 6px 18px rgba(0,0,0,.45)}
      h1{font-size:24px;margin:0 0 6px}
      h2{font-size:18px;margin:0 0 8px;color:#d6e7ff}
      p.sub{margin:0;color:#cfe0ff;opacity:.9}
      .row{display:flex;gap:16px;align-items:flex-start}
      .col{flex:1}
      .chart{text-align:center}
      .chart img{max-width:100%;height:auto;border-radius:10px}
      table{width:100%;border-collapse:collapse;margin-top:6px}
      th,td{padding:8px 10px;border-bottom:1px solid rgba(126,163,214,.25)}
      th{text-align:left;color:#cfe0ff}
      .muted{color:#cfe0ff;opacity:.85;font-size:12px}
      .bullets{margin:8px 0 0 18px;padding:0}
      .bullets li{margin:0 0 6px}
      @media print{.wrap{padding:0 8mm}}
    </style>`;

  return `
<!doctype html>
<html><head><meta charset="utf-8"><title>${heroTitle} report</title>${styles}</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${heroTitle}</h1>
      <p class="sub">${heroSub}</p>
      <div class="muted">Generated: ${now}</div>
    </div>
    <div class="card row">
      <div class="col">
        ${leftTitle ? `<h2>${leftTitle}</h2>`:''}
        ${leftSub ? `<p class="sub">${leftSub}</p>`:''}
        ${leftExtraHTML}
      </div>
      <div class="col chart">
        ${chartDataUrl ? `<img alt="Radar chart" src="${chartDataUrl}">` : '<div class="muted">Chart unavailable.</div>'}
      </div>
    </div>
    <div class="card">
      <h2>Current evidence selections</h2>
      <table>
        <thead><tr><th>Practice</th><th>Title</th><th>Domain</th><th>Level</th><th>Evidence</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  </div>
</body></html>`;
}

function fetchReportRows(){
  return new Promise(function(resolve){
    const sm = new SearchManager({
      id: 'drma_report_rows_' + Date.now(),
      search: `
| inputlookup ${activeCurrentLookup()}
| join type=left short_id [
    | inputlookup drma_practices
    | eval axis=coalesce(axis, domain)
    | fields short_id axis domain level title description
  ]
| eval evidence = case(
    evidence="splunk","Yes - Splunk",
    evidence="other","Yes - Other Tool",
    evidence="no","Not at this time",
    true(), evidence
  )
| table short_id title domain level evidence description
      `,
      earliest_time: '0', latest_time: 'now', autostart: true
    });
    sm.data('results',{count:0}).on('data', function(){
      resolve(this.collection().toJSON() || []);
    });
  });
}

const outcomesSM = new SearchManager({
  id: 'drma_outcomes_loader',
  search: '| makeresults | head 1',  // replaced on demand
  earliest_time: '0', latest_time: 'now', autostart: false
});

outcomesSM.data('results', {count:1}).on('data', function(){
  try{
    const rows = this.collection().toJSON() || [];
    const r = rows[0] || {};
    // Only set if present, otherwise leave current picks alone
    if (r.business_outcome)    selectedBusiness   = r.business_outcome;
    if (r.operational_outcome) selectedOperational= r.operational_outcome;
    renderOutcomeSelectors();
    render();
    drawLevelButtons();
  }catch(e){}
});

function loadOutcomesForAssessment(assessmentId){
  const safe = String(assessmentId || '').replace(/"/g,'\\"');
  const hist = activeHistoryLookup();
  const q = `
    | inputlookup ${hist}
    | search assessment_id="${safe}"
    | stats latest(business_outcome) as business_outcome, latest(operational_outcome) as operational_outcome
  `;
  outcomesSM.settings.set('search', q);
  try { outcomesSM.startSearch(); } catch(e){}
}

  function getChartDataURL(){
    const $canvas = $('#radar_viz').find('canvas').first();
    if ($canvas.length) {
      try { return $canvas[0].toDataURL('image/png'); } catch(e){}
    }
    return null;
  }

  // Print helper window (also used for Save-as-PDF via browser print)
  function openReportWindow({ autoPrint = false, docTitle = 'DRMA report' } = {}){
    const w = window.open('', '_blank');
    if (!w) return;

    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${docTitle}</title></head>
    <body style="background:#0e1d33;color:#e9f2ff;font-family:sans-serif;padding:24px;">Preparing report…</body></html>`);
    w.document.close();

    Promise.all([fetchReportRows(), getChartDataURL()])
      .then(([rows, chartUrl])=>{
        const html = buildReportHTML(rows, chartUrl);
        w.document.open(); w.document.write(html); w.document.close();
        if (autoPrint){
          setTimeout(()=>{ try{ w.focus(); w.print(); }catch(e){} }, 300);
        }
      })
      .catch(err=>{
        w.document.body.innerHTML = `<div style="color:#f99">Failed to build report: ${String(err)}</div>`;
      });
  }

  // Buttons
  $(document).on('click', '#drma_btn_save', function(){
    openReportWindow({ autoPrint: true, docTitle: 'DRMA report (Save as PDF)' });
  });

  $(document).on('click', '#drma_btn_png', function(){
    const url = getChartDataURL();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = 'drma_radar.png';
    document.body.appendChild(a); a.click(); a.remove();
  });

  $(document).on('click', '#drma_btn_email', function(){
    const $help = $('#drma_email_help').toggle();
    if ($help.is(':visible')) {
      const subject = encodeURIComponent('DRMA assessment report');
      const body = encodeURIComponent('Hi,\n\nPlease find the attached Digital Resilience report.\n\nFrom the dashboard: click “Save PDF”, then attach the saved PDF here.\n\nThanks.');
      $('#drma_mailto').attr('href', `mailto:?subject=${subject}&body=${body}`);
    }
  });

  // Persist keys (reuse your existing ones for per-section; add an "all" preference)
const DORA_ALL_KEY = 'drma_all_collapsed_dora';
const NORMAL_ALL_KEY = 'drma_all_collapsed_normal';

function isAllCollapsedNow(){
  const $secs = $('#drma_sections .drma-section');
  if (!$secs.length) return false;       // nothing yet -> treat as expanded
  return $secs.filter('.is-collapsed').length === $secs.length;
}

function setAllCollapsed(collapse){
  const $secs = $('#drma_sections .drma-section');
  const isDora = isDoraMode();

  // Update DOM quickly (no animation to avoid long page jank)
  $secs.each(function(){
    const $sec = $(this);
    const $hdr = $sec.find('.drma-section-header').first();
    const $grid = $sec.find('.drma-grid').first();
    if (collapse){
      $sec.addClass('is-collapsed');
      $hdr.attr('aria-expanded','false');
      $grid.hide();
    } else {
      $sec.removeClass('is-collapsed');
      $hdr.attr('aria-expanded','true');
      $grid.show();
    }
  });

  // Persist your per-section sets in localStorage to match UI
  if (isDora){
    // write all current domain names when collapsing, else clear
    const domains = $('#drma_sections .drma-section').map(function(){ return $(this).attr('data-domain')||''; }).get();
    try {
      localStorage.setItem('drma_collapsed_dora', JSON.stringify(collapse ? domains : []));
      localStorage.setItem(DORA_ALL_KEY, JSON.stringify(!!collapse));
    } catch(e){}
  } else {
    const domains = $('#drma_sections .drma-section').map(function(){ return $(this).attr('data-domain')||''; }).get();
    try {
      localStorage.setItem('drma_collapsed_domains', JSON.stringify(collapse ? domains : []));
      localStorage.setItem(NORMAL_ALL_KEY, JSON.stringify(!!collapse));
    } catch(e){}
  }

  refreshToggleAllIcon();  // keep the icon in sync
}

function refreshToggleAllIcon(){
  const $btn = $('#drma_toggle_all');
  if (!$btn.length) return;
  const collapsed = isAllCollapsedNow();
  $btn.html(collapsed ? EYE_OPEN_SVG : EYE_OFF_SVG)
      .attr('title', collapsed ? 'Expand all sections' : 'Collapse all sections')
      .attr('aria-label', collapsed ? 'Expand all sections' : 'Collapse all sections');
}

function ensureGlobalCollapseToggle(){
  const $container = $('.drma-levels-container'); // Step 3 bar container
  if (!$container.length) return;

  if ($('#drma_toggle_all').length === 0){
    $container.append(
      `<button id="drma_toggle_all" type="button" title="Collapse all sections" aria-label="Collapse all sections">${EYE_OFF_SVG}</button>`
    );
    // Click handler
    $(document).off('click.drmaToggleAll').on('click.drmaToggleAll', '#drma_toggle_all', function(e){
      e.preventDefault();
      const collapse = !isAllCollapsedNow();
      setAllCollapsed(collapse);
    });
  }

  // Sync icon with current state on load/rerender
  refreshToggleAllIcon();
}

  // Optional: populate "Last update" early even before levels UI appears
  refreshLastUpdateFor(null);

  renderOverviewPanel();
    // Bootstrap the new selectors (purely visual/local state for now)
  renderOutcomeSelectors();

});