(() => {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  const LABEL_TEXT    = 'Premium requests';
  const CARD_ID       = 'copilot-premium-pace-card';
  const STYLE_ID      = 'copilot-premium-pace-style';
  const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Default: Mon–Fri working (Sun=0, Sat=6 excluded)
  const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

  const STATE = {
    observer:     null,
    refreshTimer: null,
    scheduled:    false,
    refs:         null,
    started:      false,
    config:       null   // populated by loadConfig()
  };

  // ── Config loading ────────────────────────────────────────────────────────

  function buildConfig(workingDays) {
    // workingDays = array of day indices that ARE working (0=Sun … 6=Sat)
    const allDays = [0, 1, 2, 3, 4, 5, 6];
    const excludedWeekdays = allDays.filter((d) => !workingDays.includes(d));
    return normalizeConfig({
      targetPercent:    100,
      excludedWeekdays,
      excludedDates:    [],
      tolerancePercent: 1.5,
      highRiskPercent:  8,
      clockRefreshMs:   60000
    });
  }

  function loadConfig(callback) {
    chrome.storage.sync.get({ workingDays: DEFAULT_WORKING_DAYS }, ({ workingDays }) => {
      STATE.config = buildConfig(workingDays);
      if (callback) callback();
    });
  }

  function normalizeConfig(rawConfig) {
    const targetPercent      = clamp(Number(rawConfig.targetPercent) || 0, 0, 100);
    const tolerancePercent   = Math.max(0, Number(rawConfig.tolerancePercent) || 0);
    const highRiskPercent    = Math.max(tolerancePercent, Number(rawConfig.highRiskPercent) || 0);
    const clockRefreshMs     = Math.max(15000, Number(rawConfig.clockRefreshMs) || 60000);
    const excludedWeekdays   = Array.from(new Set(
      (rawConfig.excludedWeekdays || []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    ));
    const excludedDates = new Set(
      (rawConfig.excludedDates || [])
        .map((v) => String(v).trim())
        .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
    );

    return { targetPercent, excludedWeekdays, excludedDates, tolerancePercent, highRiskPercent, clockRefreshMs };
  }

  // ── Convenience accessor ──────────────────────────────────────────────────
  function cfg() {
    return STATE.config;
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${CARD_ID} {
        margin-top: 16px; padding: 16px;
        border-top: 1px solid #30363d; background: #0d1117;
        color: #e6edf3;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        line-height: 1.4;
      }
      #${CARD_ID}[hidden] { display: none !important; }

      #${CARD_ID} .cpp-header {
        display: flex; align-items: flex-start; justify-content: space-between;
        margin-bottom: 12px; gap: 12px;
      }
      #${CARD_ID} .cpp-title-wrap {
        display: flex; flex-direction: column; gap: 2px;
      }
      #${CARD_ID} .cpp-title { font-size: 14px; font-weight: 600; color: #e6edf3; }
      #${CARD_ID} .cpp-meta { font-size: 12px; color: #8b949e; }

      #${CARD_ID} .cpp-pill {
        display: inline-flex; align-items: center; padding: 4px 10px;
        border-radius: 999px; font-size: 12px; font-weight: 600;
        border: 1px solid transparent; white-space: nowrap;
      }
      #${CARD_ID} .cpp-pill.behind { color: #3fb950; background: rgba(46,160,67,.1); border-color: rgba(46,160,67,.4); }
      #${CARD_ID} .cpp-pill.track  { color: #58a6ff; background: rgba(56,139,253,.1); border-color: rgba(56,139,253,.4); }
      #${CARD_ID} .cpp-pill.ahead  { color: #d29922; background: rgba(210,153,34,.1); border-color: rgba(210,153,34,.4); }
      #${CARD_ID} .cpp-pill.high   { color: #f85149; background: rgba(248,81,73,.1); border-color: rgba(248,81,73,.4); }
      #${CARD_ID} .cpp-pill.unavailable { color: #8b949e; background: rgba(139,148,158,.1); border-color: rgba(139,148,158,.4); }

      #${CARD_ID} .cpp-primary {
        font-size: 20px; font-weight: 600; margin-bottom: 4px; color: #c9d1d9;
      }
      #${CARD_ID} .cpp-secondary {
        font-size: 13px; color: #8b949e; margin-bottom: 16px;
      }

      #${CARD_ID} .cpp-bar-wrap { margin-bottom: 16px; }
      #${CARD_ID} .cpp-bar-progress {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; margin-bottom: 8px; font-size: 12px; color: #8b949e;
      }
      #${CARD_ID} .cpp-bar-progress strong {
        color: #c9d1d9; font-weight: 600;
      }
      #${CARD_ID} .cpp-bar {
        --cpp-day-count: 1;
        --cpp-day-width: calc(100% / var(--cpp-day-count));
        position: relative; height: 14px;
        background: linear-gradient(180deg, #20262e 0%, #161b22 100%);
        border: 1px solid #30363d; border-radius: 999px; overflow: hidden;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
      }
      #${CARD_ID} .cpp-bar-elapsed {
        position: absolute; left: 0; top: 0; height: 100%; width: 0;
        background: linear-gradient(90deg, rgba(110,118,129,0.18) 0%, rgba(110,118,129,0.08) 100%);
        z-index: 1;
      }
      #${CARD_ID} .cpp-bar-fill {
        position: absolute; left: 0; top: 0; height: 100%; width: 0;
        background: linear-gradient(90deg, #1f6feb 0%, #58a6ff 100%);
        border-top-left-radius: 999px; border-bottom-left-radius: 999px; z-index: 2;
      }
      #${CARD_ID} .cpp-bar-grid {
        position: absolute; inset: 0;
        background-image: repeating-linear-gradient(
          to right,
          transparent 0,
          transparent calc(var(--cpp-day-width) - 1px),
          rgba(240,246,252,0.12) calc(var(--cpp-day-width) - 1px),
          rgba(240,246,252,0.12) var(--cpp-day-width)
        );
        z-index: 3; pointer-events: none;
      }
      #${CARD_ID} .cpp-bar-gap {
        position: absolute; top: 1px; bottom: 1px; left: 0; width: 0;
        border: 1px solid transparent;
        pointer-events: none; z-index: 4;
      }
      #${CARD_ID} .cpp-bar-gap.to-right {
        border-radius: 0 999px 999px 0;
      }
      #${CARD_ID} .cpp-bar-gap.to-left {
        border-radius: 999px 0 0 999px;
      }
      #${CARD_ID} .cpp-bar-gap.behind {
        background: repeating-linear-gradient(
          135deg,
          rgba(63,185,80,0.22) 0,
          rgba(63,185,80,0.22) 6px,
          rgba(63,185,80,0.08) 6px,
          rgba(63,185,80,0.08) 12px
        );
      }
      #${CARD_ID} .cpp-bar-gap.track {
        background: repeating-linear-gradient(
          135deg,
          rgba(240,246,252,0.18) 0,
          rgba(240,246,252,0.18) 6px,
          rgba(240,246,252,0.08) 6px,
          rgba(240,246,252,0.08) 12px
        );
        border-color: rgba(240,246,252,0.25);
      }
      #${CARD_ID} .cpp-bar-gap.ahead {
        background: repeating-linear-gradient(
          135deg,
          rgba(210,153,34,0.24) 0,
          rgba(210,153,34,0.24) 6px,
          rgba(210,153,34,0.09) 6px,
          rgba(210,153,34,0.09) 12px
        );
        border-color: rgba(210,153,34,0.35);
      }
      #${CARD_ID} .cpp-bar-gap.high {
        background: repeating-linear-gradient(
          135deg,
          rgba(248,81,73,0.26) 0,
          rgba(248,81,73,0.26) 6px,
          rgba(248,81,73,0.1) 6px,
          rgba(248,81,73,0.1) 12px
        );
        border-color: rgba(248,81,73,0.38);
      }
      #${CARD_ID} .cpp-bar-gap[hidden] {
        display: none;
      }
      #${CARD_ID} .cpp-bar-today {
        position: absolute; top: 1px; bottom: 1px; left: 0; width: 0;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(240,246,252,0.05) 0%, rgba(240,246,252,0.02) 100%);
        box-shadow: inset 0 0 0 1px rgba(240,246,252,0.12);
        z-index: 1; pointer-events: none;
      }
      #${CARD_ID} .cpp-bar-today[hidden] {
        display: none;
      }
      #${CARD_ID} .cpp-bar-marker {
        position: absolute; top: -1px; width: 4px; height: 14px; left: 0;
        background: #f0f6fc; box-shadow: 0 0 0 1px rgba(13,17,23,0.35), 0 0 6px rgba(240,246,252,0.18);
        transform: translateX(-50%); z-index: 6;
      }
      #${CARD_ID} .cpp-bar-labels {
        display: flex; align-items: center; gap: 16px; margin-top: 6px;
        font-size: 12px; color: #8b949e;
      }
      #${CARD_ID} .cpp-swatch {
        display: inline-block; width: 8px; height: 8px;
        border-radius: 2px; margin-right: 4px; vertical-align: baseline;
      }
      #${CARD_ID} .cpp-swatch.fill { background: #1f6feb; }
      #${CARD_ID} .cpp-swatch.marker { background: #f0f6fc; width: 3px; }

      #${CARD_ID} .cpp-primary-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 10px; margin-bottom: 12px;
      }
      #${CARD_ID} .cpp-item {
        padding: 10px 12px; background: #161b22;
        border: 1px solid #30363d; border-radius: 6px;
      }
      #${CARD_ID} .cpp-label { font-size: 12px; color: #8b949e; margin-bottom: 2px; }
      #${CARD_ID} .cpp-value { font-size: 18px; font-weight: 600; color: #e6edf3; }
      #${CARD_ID} .cpp-value.behind { color: #3fb950; }
      #${CARD_ID} .cpp-value.track  { color: #58a6ff; }
      #${CARD_ID} .cpp-value.ahead  { color: #d29922; }
      #${CARD_ID} .cpp-value.high   { color: #f85149; }

      #${CARD_ID} .cpp-secondary-metrics {
        display: flex; flex-wrap: wrap; gap: 8px 16px;
        padding: 10px 12px; background: #0d1117; border-top: 1px dashed #30363d;
        font-size: 12px; color: #8b949e;
      }
      #${CARD_ID} .cpp-sec-item { display: flex; gap: 4px; }
      #${CARD_ID} .cpp-sec-value { color: #c9d1d9; font-weight: 500; }

      #${CARD_ID} .cpp-footer-settings {
        margin-top: 8px; border-top: 1px solid #21262d; padding-top: 10px;
      }
      #${CARD_ID} .cpp-settings-summary {
        display: flex; align-items: center; justify-content: space-between;
        font-size: 12px; color: #8b949e;
      }
      #${CARD_ID} .cpp-settings-btn {
        background: transparent; border: 1px solid transparent; color: #58a6ff;
        cursor: pointer; padding: 4px 8px; font-size: 12px; border-radius: 4px;
        transition: background 0.12s;
      }
      #${CARD_ID} .cpp-settings-btn:hover { background: rgba(88,166,255,0.1); border-color: rgba(88,166,255,0.2); }

      #${CARD_ID} .cpp-settings-panel {
        margin-top: 12px; padding: 14px 16px; background: #161b22;
        border: 1px solid #30363d; border-radius: 6px;
      }
      #${CARD_ID} .cpp-settings-panel[hidden] { display: none !important; }

      #${CARD_ID} .cpp-settings-section-label {
        font-size: 11px; font-weight: 600; color: #8b949e;
        text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;
      }
      #${CARD_ID} .cpp-settings-hint { font-size: 11px; color: #6e7681; margin-bottom: 10px; }

      #${CARD_ID} .cpp-days-grid {
        display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 12px;
      }
      #${CARD_ID} .cpp-day-chip { position: relative; cursor: pointer; user-select: none; }
      #${CARD_ID} .cpp-day-chip input { position: absolute; opacity: 0; width: 0; height: 0; }
      #${CARD_ID} .cpp-day-chip span {
        display: flex; align-items: center; justify-content: center; height: 30px;
        border-radius: 4px; font-size: 11px; font-weight: 500;
        background: #0d1117; border: 1px solid #30363d; color: #8b949e;
        cursor: pointer; transition: background 0.12s, border-color 0.12s, color 0.12s;
      }
      #${CARD_ID} .cpp-day-chip input:checked + span {
        background: rgba(31, 111, 235, 0.18); border-color: #1f6feb; color: #58a6ff; font-weight: 600;
      }
      #${CARD_ID} .cpp-day-chip span:hover { border-color: #58a6ff; color: #c9d1d9; }

      #${CARD_ID} .cpp-settings-actions { display: flex; align-items: center; gap: 10px; }
      #${CARD_ID} .cpp-save-btn {
        padding: 5px 14px; background: #238636; color: #fff; border: 1px solid rgba(240,246,252,0.1);
        border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer;
      }
      #${CARD_ID} .cpp-save-btn:hover { background: #2ea043; }
      #${CARD_ID} .cpp-save-status {
        font-size: 12px; color: #3fb950; font-weight: 500; opacity: 0; transition: opacity 0.15s;
      }
      #${CARD_ID} .cpp-save-status.visible { opacity: 1; }
    `;

    document.head.appendChild(style);
  }

  // ── Math helpers ──────────────────────────────────────────────────────────

  function round(value, digits) {
    return Number(Number(value).toFixed(digits == null ? 1 : digits));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function formatPercent(value, digits) {
    return `${round(value, digits)}%`;
  }

  function formatSignedPercent(value, digits) {
    const v = round(value, digits);
    return `${v > 0 ? '+' : ''}${v}%`;
  }

  function formatWorkingDays(value) {
    return String(round(value, 1));
  }

  function formatRenderTimestamp(now) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }).format(now);
  }

  // ── Date helpers ──────────────────────────────────────────────────────────

  function getDaysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function getDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function isWorkingDay(date) {
    return !cfg().excludedWeekdays.includes(date.getDay()) && !cfg().excludedDates.has(getDateKey(date));
  }

  function getMonthWorkingDayContext(now) {
    const year       = now.getFullYear();
    const monthIndex = now.getMonth();
    const todayDate  = now.getDate();
    const lastDay    = getDaysInMonth(year, monthIndex);
    const dayProgress = clamp(
      (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400,
      0, 1
    );

    let totalWorkingDays       = 0;
    let elapsedWorkingDays     = 0;
    let remainingWorkingDays   = 0;
    let isTodayWorkingDay      = false;
    let currentWorkingDayProgress = 0;

    for (let day = 1; day <= lastDay; day++) {
      const date = new Date(year, monthIndex, day);
      if (!isWorkingDay(date)) continue;

      totalWorkingDays += 1;

      if (day < todayDate) {
        elapsedWorkingDays += 1;
      } else if (day > todayDate) {
        remainingWorkingDays += 1;
      } else {
        isTodayWorkingDay        = true;
        currentWorkingDayProgress = dayProgress;
        elapsedWorkingDays       += dayProgress;
        remainingWorkingDays     += 1 - dayProgress;
      }
    }

    return { totalWorkingDays, elapsedWorkingDays, remainingWorkingDays, isTodayWorkingDay, currentWorkingDayProgress };
  }

  // ── Core metrics ──────────────────────────────────────────────────────────

  function calculatePaceMetrics(actualUsedRaw, now) {
    const actualUsed        = clamp(Number(actualUsedRaw) || 0, 0, 100);
    const wdc               = getMonthWorkingDayContext(now);
    const idealDaily        = wdc.totalWorkingDays > 0 ? cfg().targetPercent / wdc.totalWorkingDays : 0;
    const idealByNow        = idealDaily * wdc.elapsedWorkingDays;
    const remainingToTarget = Math.max(0, cfg().targetPercent - actualUsed);
    const recommendedDaily  = wdc.remainingWorkingDays > 0 ? remainingToTarget / wdc.remainingWorkingDays : 0;
    const averageDaily      = wdc.elapsedWorkingDays > 0 ? actualUsed / wdc.elapsedWorkingDays : 0;
    const projectedMonthEnd = averageDaily * wdc.totalWorkingDays;
    const paceGap           = actualUsed - idealByNow;

    return {
      actualUsed:          round(actualUsed),
      targetPercent:       cfg().targetPercent,
      idealDaily:          round(idealDaily),
      idealByNow:          round(idealByNow),
      remainingToTarget:   round(remainingToTarget),
      remainingToTargetRaw:round(cfg().targetPercent - actualUsed),
      recommendedDaily:    round(recommendedDaily),
      averageDaily:        round(averageDaily),
      projectedMonthEnd:   round(projectedMonthEnd),
      paceGap:             round(paceGap),
      totalWorkingDays:    wdc.totalWorkingDays,
      elapsedWorkingDays:  wdc.elapsedWorkingDays,
      remainingWorkingDays:wdc.remainingWorkingDays,
      isTodayWorkingDay:   wdc.isTodayWorkingDay,
      currentDayProgress:  round(wdc.currentWorkingDayProgress, 3)
    };
  }

  function getStatus(metrics) {
    if (metrics.remainingToTargetRaw <= 0 && metrics.remainingWorkingDays > 0.25) {
      return { key: 'high', label: 'Target reached early' };
    }
    if (metrics.paceGap > cfg().highRiskPercent)    return { key: 'high',   label: 'At risk of exhausting early' };
    if (metrics.paceGap < -cfg().tolerancePercent)  return { key: 'behind', label: 'Comfortably below pace' };
    if (metrics.paceGap > cfg().tolerancePercent)   return { key: 'ahead',  label: 'Slightly ahead of pace' };
    return { key: 'track', label: 'On track' };
  }

  function getPrimaryText(statusKey, recommendedDaily, hasReachedTarget) {
    if (hasReachedTarget) return 'Target reached for this cycle';
    return `Safe pace: ${formatPercent(Math.max(recommendedDaily, 0))} per working day`;
  }

  function getSecondaryText(metrics, status) {
    if (status.key === 'high' && metrics.remainingToTargetRaw <= 0) {
      return `You have already reached the ${formatPercent(metrics.targetPercent)} target before the end of the working month.`;
    }
    const gapAbs = formatPercent(Math.abs(metrics.paceGap));
    const proj = formatPercent(metrics.projectedMonthEnd);
    
    if (status.key === 'behind') {
      return `You’re ${gapAbs} points below today’s target pace. At this pace, you’ll finish the month around ${proj}.`;
    }
    if (status.key === 'ahead') {
      return `You’re ${gapAbs} points above today’s target pace. At this pace, you’ll finish the month around ${proj}.`;
    }
    if (status.key === 'high') {
      return `You’re ${gapAbs} points above today’s target pace, risking exhausting early. Projected: ${proj}.`;
    }
    return `You're closely matching the target pace. At this pace, you'll finish the month around ${proj}.`;
  }

  function getCompactCalendarSummary() {
    const wd = [0,1,2,3,4,5,6].filter(d => !cfg().excludedWeekdays.includes(d));
    if (wd.length === 5 && wd[0] === 1 && wd[4] === 5 && wd.every((v,i) => v===i+1)) return 'Mon–Fri';
    if (wd.length === 6 && wd[0] === 1 && wd[5] === 6 && wd.every((v,i) => v===i+1)) return 'Mon–Sat';
    if (wd.length === 7) return 'Every day';
    if (wd.length === 0) return 'None';
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return wd.map(d => names[d]).join(', ');
  }

  // ── DOM scanning ──────────────────────────────────────────────────────────

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function collectExactTextParents(root, text) {
    const matches = [];
    const walker  = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement || node.parentElement.closest(`#${CARD_ID}`)) {
          return NodeFilter.FILTER_REJECT;
        }
        return normalizeText(node.textContent) === text
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      }
    });
    while (walker.nextNode()) {
      matches.push(walker.currentNode.parentElement);
    }
    return Array.from(new Set(matches));
  }

  function collectStandalonePercentMatches(root) {
    const matches = [];
    const walker  = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement || node.parentElement.closest(`#${CARD_ID}`)) {
          return NodeFilter.FILTER_REJECT;
        }
        const text = normalizeText(node.textContent);
        return /^\d+(?:\.\d+)?%$/.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    while (walker.nextNode()) {
      const text = normalizeText(walker.currentNode.textContent);
      matches.push({ element: walker.currentNode.parentElement, value: parseFloat(text) });
    }
    return matches;
  }

  function extractPercentFromProgressElement(element) {
    if (element.matches('progress')) {
      const max = Number(element.max) || 100;
      const val = Number(element.value);
      if (!Number.isNaN(val) && max > 0) return (val / max) * 100;
    }
    const valueNow = Number(element.getAttribute('aria-valuenow'));
    if (!Number.isNaN(valueNow)) {
      const valueMax = Number(element.getAttribute('aria-valuemax')) || 100;
      return valueMax > 0 ? (valueNow / valueMax) * 100 : valueNow;
    }
    return null;
  }

  function scorePremiumSection(section) {
    const text             = normalizeText(section.innerText || section.textContent);
    const standalonePercents = collectStandalonePercentMatches(section);
    if (!standalonePercents.length) return -1;

    let score = 0;
    if (text.length >= 60  && text.length <= 2500) score += 2;
    if (text.length >= 120 && text.length <= 1800) score += 2;
    if (section.querySelector('progress, [role="progressbar"], [aria-valuenow]')) score += 2;
    if (/premium request entitlement|premium requests/i.test(text)) score += 1;
    if (/update your copilot premium request budget/i.test(text)) score += 2;
    if (standalonePercents.length <= 3) score += 1;
    return score;
  }

  function findPremiumSection() {
    const root = document.querySelector('main') || document.body;
    if (!root) return null;

    const labelParents = collectExactTextParents(root, LABEL_TEXT);
    let bestSection = null;
    let bestScore   = -1;

    for (const labelParent of labelParents) {
      let current = labelParent;
      let depth   = 0;
      while (current && current !== root.parentElement && depth < 8) {
        const score = scorePremiumSection(current);
        if (score > bestScore) { bestScore = score; bestSection = current; }
        current = current.parentElement;
        depth += 1;
      }
    }
    return bestScore >= 2 ? bestSection : null;
  }

  function parseUsedPercent(section) {
    const progressElements = Array.from(section.querySelectorAll('progress, [role="progressbar"], [aria-valuenow]'));
    for (const el of progressElements) {
      const value = extractPercentFromProgressElement(el);
      if (value != null && value >= 0 && value <= 100) return value;
    }
    const standalonePercents = collectStandalonePercentMatches(section);
    return standalonePercents.length ? standalonePercents[0].value : null;
  }

  // ── Card building ─────────────────────────────────────────────────────────

  function buildSettingsPanel() {
    const DAYS = [
      { value: 1, name: 'Mon' },
      { value: 2, name: 'Tue' },
      { value: 3, name: 'Wed' },
      { value: 4, name: 'Thu' },
      { value: 5, name: 'Fri' },
      { value: 6, name: 'Sat' },
      { value: 0, name: 'Sun' },
    ];

    const panel = document.createElement('div');
    panel.className = 'cpp-settings-panel';
    panel.hidden = true;

    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'cpp-settings-section-label';
    sectionLabel.textContent = 'Working Days';

    const hint = document.createElement('div');
    hint.className = 'cpp-settings-hint';
    hint.textContent = 'Select which days count toward your monthly pace calculation.';

    const daysGrid = document.createElement('div');
    daysGrid.className = 'cpp-days-grid';

    const checkboxes = DAYS.map(({ value, name }) => {
      const chip = document.createElement('label');
      chip.className = 'cpp-day-chip';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = String(value);
      const span = document.createElement('span');
      span.textContent = name;
      chip.append(cb, span);
      daysGrid.appendChild(chip);
      return cb;
    });

    const actions = document.createElement('div');
    actions.className = 'cpp-settings-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'cpp-save-btn';
    saveBtn.textContent = 'Save';

    const saveStatus = document.createElement('span');
    saveStatus.className = 'cpp-save-status';
    saveStatus.textContent = 'Saved ✓';

    let saveTimer = null;
    saveBtn.addEventListener('click', () => {
      const workingDays = checkboxes
        .filter((cb) => cb.checked)
        .map((cb) => Number(cb.value));
      chrome.storage.sync.set({ workingDays }, () => {
        STATE.config = buildConfig(workingDays);
        scheduleRefresh();
        saveStatus.classList.add('visible');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveStatus.classList.remove('visible'), 2000);
      });
    });

    actions.append(saveBtn, saveStatus);
    panel.append(sectionLabel, hint, daysGrid, actions);

    function loadSettings() {
      chrome.storage.sync.get({ workingDays: DEFAULT_WORKING_DAYS }, ({ workingDays }) => {
        checkboxes.forEach((cb) => { cb.checked = workingDays.includes(Number(cb.value)); });
      });
    }

    return { panel, loadSettings };
  }

  function createMetricItem(label) {
    const item         = document.createElement('div');
    item.className     = 'cpp-item';
    const labelEl      = document.createElement('div');
    labelEl.className  = 'cpp-label';
    labelEl.textContent = label;
    const valueEl      = document.createElement('div');
    valueEl.className  = 'cpp-value';
    valueEl.textContent = '--';
    item.appendChild(labelEl);
    item.appendChild(valueEl);
    return { item, labelElement: labelEl, valueElement: valueEl };
  }

  function createSecondaryMetricItem(label) {
    const item = document.createElement('div');
    item.className = 'cpp-sec-item';
    const labelEl = document.createElement('div');
    labelEl.textContent = label + ':';
    const valueEl = document.createElement('div');
    valueEl.className = 'cpp-sec-value';
    valueEl.textContent = '--';
    item.appendChild(labelEl);
    item.appendChild(valueEl);
    return { item, valueElement: valueEl };
  }

  function buildCard() {
    const card = document.createElement('section');
    card.id    = CARD_ID;
    card.setAttribute('aria-live', 'polite');

    const header = document.createElement('div'); header.className = 'cpp-header';
    const titleWrap = document.createElement('div'); titleWrap.className = 'cpp-title-wrap';
    const title = document.createElement('div'); title.className = 'cpp-title'; title.textContent = 'Premium Request Pace';
    const meta = document.createElement('div'); meta.className = 'cpp-meta';
    meta.textContent = 'Resets at the start of next month. Usage may be delayed slightly.';
    titleWrap.append(title, meta);

    const pill = document.createElement('div'); pill.className = 'cpp-pill track';
    header.append(titleWrap, pill);

    const primary = document.createElement('div'); primary.className = 'cpp-primary';
    const secondary = document.createElement('div'); secondary.className = 'cpp-secondary';

    const barWrap = document.createElement('div'); barWrap.className = 'cpp-bar-wrap';
    const barProgress = document.createElement('div'); barProgress.className = 'cpp-bar-progress';
    const dayElapsed = document.createElement('div');
    const dayRemaining = document.createElement('div');
    barProgress.append(dayElapsed, dayRemaining);

    const bar = document.createElement('div'); bar.className = 'cpp-bar';
    const barElapsed = document.createElement('div'); barElapsed.className = 'cpp-bar-elapsed';
    const barFill = document.createElement('div'); barFill.className = 'cpp-bar-fill';
    const barGrid = document.createElement('div'); barGrid.className = 'cpp-bar-grid';
    const barGap = document.createElement('div'); barGap.className = 'cpp-bar-gap';
    const barToday = document.createElement('div'); barToday.className = 'cpp-bar-today';
    const barMarker = document.createElement('div'); barMarker.className = 'cpp-bar-marker';
    bar.append(barElapsed, barFill, barGrid, barGap, barToday, barMarker);

    const barLabels = document.createElement('div'); barLabels.className = 'cpp-bar-labels';
    const labelUsed = document.createElement('div');
    labelUsed.innerHTML = '<span class="cpp-swatch fill"></span> Used';
    const labelTarget = document.createElement('div');
    labelTarget.innerHTML = '<span class="cpp-swatch marker"></span> Target now';
    const barStamp = document.createElement('div');
    barStamp.style.cssText = 'margin-left:auto;font-size:11px;color:#6e7681;';
    
    barLabels.append(labelUsed, labelTarget, barStamp);
    barWrap.append(barProgress, bar, barLabels);

    const primaryGrid = document.createElement('div'); primaryGrid.className = 'cpp-primary-grid';
    const secondaryList = document.createElement('div'); secondaryList.className = 'cpp-secondary-metrics';

    const pDefs = {
      used:       'Used',
      targetNow:  'Target now',
      paceGap:    'Pace gap',
      projection: 'Projected month-end'
    };
    const sDefs = {
      daysLeft:   'Working days left',
      recommended:'Recommended / day',
      average:    'Avg used / day',
      remaining:  'Remaining to 100%'
    };

    const metricRefs = {};
    Object.entries(pDefs).forEach(([key, label]) => {
      const m = createMetricItem(label);
      primaryGrid.appendChild(m.item);
      metricRefs[key] = m;
    });
    Object.entries(sDefs).forEach(([key, label]) => {
      const m = createSecondaryMetricItem(label);
      secondaryList.appendChild(m.item);
      metricRefs[key] = m;
    });

    const footerWrap = document.createElement('div'); footerWrap.className = 'cpp-footer-settings';
    const settingsSummary = document.createElement('div'); settingsSummary.className = 'cpp-settings-summary';

    const summaryText = document.createElement('div');

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'cpp-settings-btn';
    settingsBtn.textContent = '⚙ Settings';

    settingsSummary.append(summaryText, settingsBtn);

    const { panel: settingsPanel, loadSettings } = buildSettingsPanel();
    settingsBtn.addEventListener('click', () => {
      settingsPanel.hidden = !settingsPanel.hidden;
      if (!settingsPanel.hidden) loadSettings();
    });

    footerWrap.append(settingsSummary, settingsPanel);

    card.append(header, primary, secondary, barWrap, primaryGrid, secondaryList, footerWrap);

    return {
      card,
      pill,
      summaryText,
      primary,
      secondary,
      bar,
      barElapsed,
      barFill,
      barGap,
      barToday,
      barMarker,
      barStamp,
      dayElapsed,
      dayRemaining,
      metrics: metricRefs,
      settingsBtn
    };
  }

  function ensureCard(section) {
    if (!STATE.refs) STATE.refs = buildCard();
    const { card } = STATE.refs;
    if (card.parentNode !== section.parentNode || card.previousElementSibling !== section) {
      section.insertAdjacentElement('afterend', card);
    }
    card.hidden = false;
    return STATE.refs;
  }

  function hideCard() {
    if (STATE.refs) STATE.refs.card.hidden = true;
  }

  function setMetric(metricRef, value, tone) {
    if (metricRef.valueElement) {
      metricRef.valueElement.textContent = value;
      metricRef.valueElement.className = metricRef.item.classList.contains('cpp-sec-item') 
        ? 'cpp-sec-value' 
        : 'cpp-value';
      if (tone) metricRef.valueElement.classList.add(tone);
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function renderUnavailable(section, message) {
    const refs      = ensureCard(section);
    const renderedAt = formatRenderTimestamp(new Date());

    refs.pill.className    = 'cpp-pill unavailable';
    refs.pill.textContent  = 'Waiting for data';
    refs.primary.textContent  = 'Unable to read current premium request usage';
    refs.secondary.textContent = message;
    refs.bar.style.setProperty('--cpp-day-count', '1');
    refs.barElapsed.style.width = '0%';
    refs.barFill.style.width   = '0%';
    refs.barGap.hidden         = true;
    refs.barGap.className      = 'cpp-bar-gap';
    refs.barGap.style.width    = '0%';
    refs.barToday.hidden       = true;
    refs.barToday.style.width  = '0%';
    refs.barMarker.style.left  = '0%';
    refs.barMarker.title       = '';
    refs.barFill.title         = '';
    refs.bar.title             = '';
    refs.dayElapsed.innerHTML  = '<strong>--</strong> working days elapsed';
    refs.dayRemaining.innerHTML = '-- left';
    refs.barStamp.textContent  = `Rendered ${renderedAt}`;
    Object.values(refs.metrics).forEach((m) => setMetric(m, '--'));
    refs.summaryText.textContent = `Working days: ${getCompactCalendarSummary()}`;
  }

  function renderMetrics(section, metrics) {
    const refs         = ensureCard(section);
    const renderedAt   = formatRenderTimestamp(new Date());
    const status       = getStatus(metrics);
    const projTone     = metrics.projectedMonthEnd > metrics.targetPercent + cfg().tolerancePercent
      ? metrics.projectedMonthEnd > metrics.targetPercent + cfg().highRiskPercent ? 'high' : 'ahead'
      : metrics.projectedMonthEnd < metrics.targetPercent - cfg().tolerancePercent ? 'behind' : 'track';
    const gapTone      = metrics.paceGap > cfg().tolerancePercent
      ? metrics.paceGap > cfg().highRiskPercent ? 'high' : 'ahead'
      : metrics.paceGap < -cfg().tolerancePercent ? 'behind' : 'track';

    refs.pill.className    = `cpp-pill ${status.key}`;
    refs.pill.textContent  = status.label;
    refs.primary.textContent  = getPrimaryText(status.key, metrics.recommendedDaily, metrics.remainingToTargetRaw <= 0);
    refs.secondary.textContent = getSecondaryText(metrics, status);
    
    const usedPct = clamp(metrics.actualUsed, 0, 100);
    const targetPct = clamp(metrics.idealByNow, 0, 100);
    const totalDays = Math.max(metrics.totalWorkingDays, 1);
    const elapsedDays = clamp(metrics.elapsedWorkingDays, 0, totalDays);
    const elapsedPct = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;
    const completedDays = Math.floor(elapsedDays);
    const hasCurrentDay = Boolean(metrics.isTodayWorkingDay);
    const todayLeftPct = totalDays > 0 ? (completedDays / totalDays) * 100 : 0;
    const todayWidthPct = totalDays > 0 ? (100 / totalDays) : 0;
    const gapStartPct = Math.min(usedPct, targetPct);
    const gapWidthPct = Math.abs(targetPct - usedPct);
    const gapDirectionClass = targetPct >= usedPct ? 'to-right' : 'to-left';
    
    refs.bar.style.setProperty('--cpp-day-count', String(totalDays));
    refs.barElapsed.style.width = `${elapsedPct}%`;
    refs.barFill.style.width   = `${usedPct}%`;
    refs.barGap.hidden         = gapWidthPct < 0.2;
    refs.barGap.className      = `cpp-bar-gap ${gapTone} ${gapDirectionClass}`;
    refs.barGap.style.left     = `${gapStartPct}%`;
    refs.barGap.style.width    = `${gapWidthPct}%`;
    refs.barGap.title          = `Pace gap: ${formatSignedPercent(metrics.paceGap)}`;
    refs.barToday.hidden       = !hasCurrentDay;
    if (hasCurrentDay) {
      refs.barToday.style.left = `${todayLeftPct}%`;
      refs.barToday.style.width = `${todayWidthPct}%`;
      refs.barToday.title = `Today: ${formatWorkingDays(metrics.currentDayProgress)} of 1 working day elapsed`;
    } else {
      refs.barToday.title = '';
    }
    refs.barMarker.style.left  = `${targetPct}%`;
    refs.barMarker.title       = `Target now: ${formatPercent(metrics.idealByNow)}`;
    refs.barFill.title         = `Used: ${formatPercent(metrics.actualUsed)}`;
    refs.bar.title             = `${formatWorkingDays(metrics.elapsedWorkingDays)} of ${formatWorkingDays(metrics.totalWorkingDays)} working days elapsed`;
    refs.dayElapsed.innerHTML  = `<strong>${formatWorkingDays(metrics.elapsedWorkingDays)}</strong> of ${formatWorkingDays(metrics.totalWorkingDays)} working days elapsed`;
    refs.dayRemaining.innerHTML = `${formatWorkingDays(metrics.remainingWorkingDays)} days left`;
    refs.barStamp.textContent  = `Rendered ${renderedAt}`;

    setMetric(refs.metrics.used,        formatPercent(metrics.actualUsed));
    setMetric(refs.metrics.targetNow,   formatPercent(metrics.idealByNow));
    setMetric(refs.metrics.paceGap,     formatSignedPercent(metrics.paceGap), gapTone);
    setMetric(refs.metrics.projection,  formatPercent(metrics.projectedMonthEnd), projTone);

    setMetric(refs.metrics.remaining,   formatPercent(metrics.remainingToTarget));
    setMetric(refs.metrics.daysLeft,    formatWorkingDays(metrics.remainingWorkingDays));
    setMetric(refs.metrics.recommended, formatPercent(metrics.recommendedDaily));
    setMetric(refs.metrics.average,     formatPercent(metrics.averageDaily));

    refs.summaryText.textContent = `Working days: ${getCompactCalendarSummary()}`;
  }

  // ── Refresh loop ──────────────────────────────────────────────────────────

  function refreshCard() {
    if (!STATE.config) return; // config not loaded yet

    const section = findPremiumSection();
    if (!section) { hideCard(); return; }

    const actualUsed = parseUsedPercent(section);
    if (actualUsed == null) {
      renderUnavailable(section, 'GitHub rendered the section, but no usage value was found yet.');
      return;
    }
    renderMetrics(section, calculatePaceMetrics(actualUsed, new Date()));
  }

  function scheduleRefresh() {
    if (STATE.scheduled) return;
    STATE.scheduled = true;
    requestAnimationFrame(() => {
      STATE.scheduled = false;
      refreshCard();
    });
  }

  function startObservers() {
    if (!document.body || STATE.observer) return;

    STATE.observer = new MutationObserver(() => scheduleRefresh());
    STATE.observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    document.addEventListener('visibilitychange', scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);
    window.addEventListener('popstate', scheduleRefresh);
    document.addEventListener('turbo:load', scheduleRefresh);
    document.addEventListener('turbo:render', scheduleRefresh);
    document.addEventListener('pjax:end', scheduleRefresh);

    STATE.refreshTimer = window.setInterval(scheduleRefresh, cfg().clockRefreshMs);
  }

  // ── Storage change listener (live reload when popup saves) ────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.workingDays) return;
    loadConfig(() => scheduleRefresh());
  });

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  function init() {
    if (STATE.started) { scheduleRefresh(); return; }
    STATE.started = true;
    injectStyles();
    startObservers();
    scheduleRefresh();
  }

  // Load config first, then init
  loadConfig(() => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  });
})();
