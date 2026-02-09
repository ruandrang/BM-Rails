// HTML escape utility to prevent XSS via innerHTML
const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Reusable list sorting function (used by members, matches/new, stats views)
function initSortableList(listSelector, itemSelector, defaultDirections) {
  const POSITION_ORDER = { "PG": 1, "SG": 2, "SF": 3, "PF": 4, "C": 5 };
  const list = document.querySelector(listSelector);
  if (!list) return;

  const sortButtons = Array.from(document.querySelectorAll("[data-sort]"));
  if (sortButtons.length === 0) return;

  const sortState = {};

  sortButtons.forEach(btn => {
    if (btn.dataset.sortBoundFor === listSelector) return;

    const baseLabel = btn.textContent.trim().split(" ")[0];
    btn.dataset.sortBoundFor = listSelector;
    btn.dataset.sortBaseLabel = baseLabel;

    btn.addEventListener("click", function() {
      const sortKey = this.dataset.sort;

      if (!sortState[sortKey]) {
        sortState[sortKey] = (defaultDirections && defaultDirections[sortKey]) || "desc";
      } else {
        sortState[sortKey] = sortState[sortKey] === "asc" ? "desc" : "asc";
      }

      const items = Array.from(list.querySelectorAll(itemSelector));

      items.sort((a, b) => {
        let aVal = a.dataset[sortKey];
        let bVal = b.dataset[sortKey];

        if (sortKey === "position") {
          aVal = POSITION_ORDER[aVal] || 99;
          bVal = POSITION_ORDER[bVal] || 99;
        } else if (["height", "jersey", "games", "member-id"].includes(sortKey)) {
          aVal = Number.parseInt(aVal, 10) || 0;
          bVal = Number.parseInt(bVal, 10) || 0;
        } else if (sortKey === "winrate") {
          aVal = Number.parseFloat(aVal) || 0.0;
          bVal = Number.parseFloat(bVal) || 0.0;
        }

        if (aVal === bVal) return 0;
        const modifier = sortState[sortKey] === "asc" ? 1 : -1;
        return aVal > bVal ? modifier : -modifier;
      });

      items.forEach(item => list.appendChild(item));

      sortButtons.forEach(b => {
        b.classList.remove("btn-active", "btn-primary", "text-primary-content");
        b.innerHTML = b.dataset.sortBaseLabel || b.textContent.trim().split(" ")[0];
      });

      this.classList.add("btn-active", "btn-primary", "text-primary-content");
      const arrow = sortState[sortKey] === "asc" ? "↑" : "↓";
      this.innerHTML = `${this.dataset.sortBaseLabel || baseLabel} <span class="ml-1">${arrow}</span>`;
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Flash Messages Auto-dismiss
  const flashMessages = document.getElementById("flash-messages");
  if (flashMessages && flashMessages.children.length > 0) {
    setTimeout(() => {
      // Fade out
      flashMessages.style.transition = "opacity 0.5s ease-out";
      flashMessages.style.opacity = "0";

      // Remove after fade out
      setTimeout(() => {
        flashMessages.remove();
      }, 500);
    }, 3000);
  }

  document.querySelectorAll("[data-href]").forEach((card) => {
    card.addEventListener("click", (event) => {
      const target = event.target;
      if (
        target.closest("a") ||
        target.closest("button") ||
        target.closest("input") ||
        target.closest("select") ||
        target.closest("textarea")
      ) {
        return;
      }
      const href = card.dataset.href;
      if (href) {
        window.location.href = href;
      }
    });
  });



  const scoreboardRoot = document.querySelector("[data-scoreboard-root]");

  if (scoreboardRoot) {

    const role = scoreboardRoot.dataset.scoreboardRole;
    const matchId = scoreboardRoot.dataset.matchId;
    const teams = JSON.parse(scoreboardRoot.dataset.teams || "[]");
    const teamsCount = parseInt(scoreboardRoot.dataset.teamsCount || "2", 10);
    const parsedDefaultPeriodSeconds = parseInt(scoreboardRoot.dataset.defaultPeriodSeconds || "480", 10);
    const defaultPeriodSeconds = Number.isFinite(parsedDefaultPeriodSeconds) && parsedDefaultPeriodSeconds > 0 ? parsedDefaultPeriodSeconds : 480;
    const parseBooleanDataset = (value, fallback = true) => {
      if (value === undefined || value === null || value === "") return fallback;
      const normalized = String(value).trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off"].includes(normalized)) return false;
      return fallback;
    };
    const defaultSoundEnabled = parseBooleanDataset(scoreboardRoot.dataset.soundEnabled, true);
    const defaultVoiceEnabled = parseBooleanDataset(scoreboardRoot.dataset.voiceEnabled, true);
    const POSSESSION_SWITCH_PATTERNS = ["q12_q34", "q13_q24"];
    const defaultPossessionSwitchPattern = POSSESSION_SWITCH_PATTERNS.includes(scoreboardRoot.dataset.possessionSwitchPattern)
      ? scoreboardRoot.dataset.possessionSwitchPattern
      : "q12_q34";

    const cableUrl =
      (window.location.protocol === "https:" ? "wss://" : "ws://") +
      window.location.host +
      "/cable";
    const socket = new WebSocket(cableUrl);
    const identifier = JSON.stringify({ channel: "ScoreboardChannel", match_id: matchId });
    let state = null;
    let mainTimer = null;
    let shotTimer = null;
    let matchupSortInstance = null;
    let isMatchupDragging = false;

    // Colors
    const COLORS = {
      bg: '#0F0F0F',
      cardBg: '#1A1A1A',
      text: '#FAFAF7',
      textMuted: '#999999',
      border: '#E0E0E0',
      homeAccent: '#C41E3A',
      awayAccent: '#3B82F6',
      homeLogoBg: '#1A1A2E',
      awayLogoBg: '#1A2E1A',
      awayLogoBorder: '#4CAF50',
      shotClock: '#FF9800',
      centerBg: '#0F0F0F',
      displayBg: '#0A0A0A',
      displayCardBg: '#141414',
      displayBorder: '#222222'
    };

    const defaultTeams = () => {
      if (teams.length > 0) return teams;
      const labels = ["A", "B", "C"];
      const colors = [COLORS.homeAccent, COLORS.awayAccent, "#22C55E"];
      return Array.from({ length: teamsCount }, (_, index) => ({
        id: `temp-${index + 1}`,
        label: labels[index] || `T${index + 1}`,
        color: colors[index % colors.length],
      }));
    };

    const TOTAL_REGULAR_QUARTERS = 4;

    const formatTime = (seconds) => {
      const min = Math.floor(seconds / 60);
      const sec = Math.max(seconds % 60, 0);
      return `${min}:${sec.toString().padStart(2, "0")}`;
    };

    const parseColorToRgb = (color) => {
      if (!color || typeof color !== "string") return null;
      const value = color.trim().toLowerCase();

      if (value === "white") return { r: 255, g: 255, b: 255 };
      if (value === "black") return { r: 0, g: 0, b: 0 };

      const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (hex) {
        const raw = hex[1];
        const normalized = raw.length === 3
          ? raw.split("").map((ch) => ch + ch).join("")
          : raw;
        return {
          r: parseInt(normalized.slice(0, 2), 16),
          g: parseInt(normalized.slice(2, 4), 16),
          b: parseInt(normalized.slice(4, 6), 16)
        };
      }

      const rgb = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgb) {
        return {
          r: Number.parseInt(rgb[1], 10),
          g: Number.parseInt(rgb[2], 10),
          b: Number.parseInt(rgb[3], 10)
        };
      }

      return null;
    };

    const isLightColor = (color) => {
      const rgb = parseColorToRgb(color);
      if (!rgb) return false;
      const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
      return luminance > 0.85;
    };

    const applyTeamIconColor = (iconEl, color) => {
      if (!iconEl) return;
      const iconColor = String(color || "#111827").trim();
      const isExplicitWhite = /^(white|#fff|#ffffff)$/i.test(iconColor);
      const light = isExplicitWhite || isLightColor(iconColor);

      iconEl.textContent = "";
      iconEl.style.backgroundColor = iconColor;
      iconEl.style.borderColor = light ? "#111827" : iconColor;
      iconEl.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.15)";
    };

    const matchupPairs = () => {
      if (teamsCount === 2) {
        return [[0, 1]];
      }
      return [
        [0, 1],
        [1, 2],
        [2, 0],
      ];
    };

    const roundsPerQuarter = () => matchupPairs().length;

    const maxRotationStep = () => (TOTAL_REGULAR_QUARTERS * roundsPerQuarter()) - 1;

    const quarterForStep = (step) => Math.floor(step / roundsPerQuarter()) + 1;

    const normalizePossession = (value, fallback = "away") => {
      if (value === "home" || value === "away") return value;
      return fallback;
    };

    const normalizePossessionSwitchPattern = (value) => {
      return POSSESSION_SWITCH_PATTERNS.includes(value) ? value : defaultPossessionSwitchPattern;
    };

    const oppositePossession = (value) => (value === "home" ? "away" : "home");

    const isPossessionSwappedQuarter = (quarter, pattern) => {
      const quarterNumber = Number.parseInt(quarter, 10);
      const safeQuarter = Number.isFinite(quarterNumber) && quarterNumber > 0 ? quarterNumber : 1;

      if (pattern === "q13_q24") {
        return safeQuarter % 2 === 0;
      }

      return safeQuarter >= 3;
    };

    const possessionForQuarter = (quarter, basePossession, pattern) => {
      const safeBasePossession = normalizePossession(basePossession, "away");
      const safePattern = normalizePossessionSwitchPattern(pattern);
      if (!isPossessionSwappedQuarter(quarter, safePattern)) return safeBasePossession;
      return oppositePossession(safeBasePossession);
    };

    const basePossessionForSelectedQuarterDirection = (quarter, selectedPossession, pattern) => {
      const safeSelected = normalizePossession(selectedPossession, "away");
      const safePattern = normalizePossessionSwitchPattern(pattern);
      if (!isPossessionSwappedQuarter(quarter, safePattern)) return safeSelected;
      return oppositePossession(safeSelected);
    };

    const defaultMatchupOrder = () => matchupPairs().map((_, index) => index);

    const normalizeMatchupOrder = (rawOrder) => {
      const fallback = defaultMatchupOrder();
      if (!Array.isArray(rawOrder)) return fallback;

      const seen = new Set();
      const normalized = [];

      rawOrder.forEach((value) => {
        const index = Number.parseInt(value, 10);
        if (!Number.isInteger(index)) return;
        if (index < 0 || index >= fallback.length) return;
        if (seen.has(index)) return;
        seen.add(index);
        normalized.push(index);
      });

      fallback.forEach((index) => {
        if (!seen.has(index)) {
          normalized.push(index);
          seen.add(index);
        }
      });

      return normalized;
    };

    const matchupPairById = (matchupId) => {
      const pairs = matchupPairs();
      return pairs[matchupId] || pairs[0] || [ 0, 1 ];
    };

    const matchupIdForStep = (step = state?.rotation_step || 0) => {
      const order = normalizeMatchupOrder(state?.matchup_order);
      const rounds = roundsPerQuarter();
      const slot = ((step % rounds) + rounds) % rounds;
      return order[slot] ?? defaultMatchupOrder()[slot] ?? 0;
    };

    const syncScoresForActiveMatchup = () => {
      if (!state || !Array.isArray(state.teams)) return;

      const activeMatchupId = matchupIdForStep(state.rotation_step || 0);
      const [team1Idx, team2Idx] = matchupPairById(activeMatchupId);
      const savedScores = state.matchup_scores?.[activeMatchupId] || { team1: 0, team2: 0 };

      if (state.teams[team1Idx]) state.teams[team1Idx].score = Number(savedScores.team1) || 0;
      if (state.teams[team2Idx]) state.teams[team2Idx].score = Number(savedScores.team2) || 0;

      if (teamsCount === 3) {
        [ 0, 1, 2 ].forEach((index) => {
          if (index !== team1Idx && index !== team2Idx && state.teams[index]) {
            state.teams[index].score = 0;
          }
        });
      }
    };

    const emptyMatchupScores = () => matchupPairs().map(() => ({ team1: 0, team2: 0 }));

    const defaultState = () => ({
      quarter: 1,
      period_seconds: defaultPeriodSeconds,
      shot_seconds: 24,
      running: false,
      shot_running: false,
      sound_enabled: defaultSoundEnabled,
      voice_enabled: defaultVoiceEnabled,
      matchup_index: 0,
      rotation_step: 0,
      home_fouls: 0,
      away_fouls: 0,
      teams: defaultTeams().map((team) => ({ ...team, score: 0 })),
      matchup_scores: emptyMatchupScores(),
      matchup_order: defaultMatchupOrder(),
      quarter_history: {}, // { pairIdx: { quarterNum: { team1: score, team2: score } } }
      base_possession: "away",
      possession_switch_pattern: defaultPossessionSwitchPattern,
      possession: "away", // 'home' or 'away'
      manual_swap: false
    });

    const isSoundEnabled = () => state?.sound_enabled !== false;
    const isVoiceEnabled = () => state?.voice_enabled !== false;

    const normalizeState = (incomingState) => {
      const base = defaultState();
      if (!incomingState || typeof incomingState !== "object") return base;

      const normalized = { ...base, ...incomingState };

      normalized.teams = Array.isArray(incomingState.teams) && incomingState.teams.length >= 2
        ? incomingState.teams
        : base.teams;

      normalized.matchup_scores = matchupPairs().map((_, index) => {
        const row = incomingState.matchup_scores?.[index];
        return {
          team1: Number.isFinite(Number(row?.team1)) ? Number(row.team1) : 0,
          team2: Number.isFinite(Number(row?.team2)) ? Number(row.team2) : 0
        };
      });

      normalized.matchup_order = normalizeMatchupOrder(incomingState.matchup_order);

      normalized.quarter_history = incomingState.quarter_history && typeof incomingState.quarter_history === "object"
        ? incomingState.quarter_history
        : {};

      normalized.possession_switch_pattern = normalizePossessionSwitchPattern(
        incomingState.possession_switch_pattern || normalized.possession_switch_pattern
      );

      const parsedStep = Number.parseInt(incomingState.rotation_step, 10);
      normalized.rotation_step = Number.isFinite(parsedStep)
        ? Math.max(0, Math.min(parsedStep, maxRotationStep()))
        : 0;

      const parsedQuarter = Number.parseInt(incomingState.quarter, 10);
      normalized.quarter = Number.isFinite(parsedQuarter) ? parsedQuarter : quarterForStep(normalized.rotation_step);
      if (incomingState.base_possession === "home" || incomingState.base_possession === "away") {
        normalized.base_possession = incomingState.base_possession;
      } else {
        normalized.base_possession = basePossessionForSelectedQuarterDirection(
          normalized.quarter,
          normalizePossession(incomingState.possession, "away"),
          normalized.possession_switch_pattern
        );
      }
      normalized.possession = possessionForQuarter(
        normalized.quarter,
        normalized.base_possession,
        normalized.possession_switch_pattern
      );

      return normalized;
    };

    const currentMatchupIndex = () => {
      return state.rotation_step % roundsPerQuarter();
    };

    const currentMatchupId = () => {
      return matchupIdForStep(state.rotation_step || 0);
    };

    const currentQuarter = () => {
      return quarterForStep(state.rotation_step);
    };

    const applyQuarterPossession = (quarter = currentQuarter()) => {
      state.possession = possessionForQuarter(
        quarter,
        state.base_possession,
        state.possession_switch_pattern
      );
    };

    const isSidesSwapped = () => {
      // Automatic swap for Q3/Q4, or manual swap override
      const autoSwap = currentQuarter() >= 3;
      return state.manual_swap ? !autoSwap : autoSwap;
    };

    const currentMatchup = () => {
      const pairIdx = currentMatchupId();
      const [idx1, idx2] = matchupPairById(pairIdx);
      const fallbackTeams = defaultTeams().map((team) => ({ ...team, score: 0 }));
      const firstTeam = state.teams[idx1] || fallbackTeams[0];
      const secondTeam = state.teams[idx2] || fallbackTeams[1] || fallbackTeams[0];

      // Logic:
      // Q1/Q2: idx1 vs idx2 (e.g., A vs B)
      // Q3/Q4: idx2 vs idx1 (e.g., B vs A) -> Swapped

      if (isSidesSwapped()) {
        return [secondTeam, firstTeam]; // Visual Home is Team 2, Visual Away is Team 1
      }
      return [firstTeam, secondTeam]; // Visual Home is Team 1, Visual Away is Team 2
    };

    const setText = (selector, value) => {
      const el = scoreboardRoot.querySelector(selector);
      if (el) el.textContent = value;
    };

    // Control page: Render teams with inline styles
    const renderTeamsControl = () => {
      const wrapper = scoreboardRoot.querySelector("[data-scoreboard-teams]");
      if (!wrapper) return;

      const [home, away] = currentMatchup();

      wrapper.innerHTML = `
        <!-- Home Team -->
        <div style="background: ${COLORS.cardBg}; padding: 24px; border-radius: 2px;" data-team="home">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <span style="color: ${COLORS.homeAccent}; font-size: 10px; font-weight: 600; letter-spacing: 2px; font-family: Inter, sans-serif;">HOME</span>
            <span style="color: ${COLORS.text}; font-size: 14px; font-weight: 600; font-family: Inter, sans-serif;">TEAM ${escapeHtml(home.label)}</span>
          </div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 24px; margin-bottom: 16px;">
            <button style="width: 48px; height: 48px; background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; border-radius: 2px; display: flex; align-items: center; justify-content: center; cursor: pointer;" data-team-action="sub-home">
              <svg xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; color: ${COLORS.text};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4"/>
              </svg>
            </button>
            <span style="color: ${COLORS.text}; font-size: 64px; font-weight: 500; min-width: 120px; text-align: center; font-family: 'Cormorant Garamond', serif;">${String(home.score).padStart(2, '0')}</span>
            <button style="width: 48px; height: 48px; background: ${COLORS.homeAccent}; border: none; border-radius: 2px; display: flex; align-items: center; justify-content: center; cursor: pointer;" data-team-action="add-home">
              <svg xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; color: ${COLORS.text};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
            </button>
          </div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
            <button style="background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; padding: 10px 20px; border-radius: 2px; color: ${COLORS.text}; font-size: 14px; font-weight: 500; font-family: 'JetBrains Mono', monospace; cursor: pointer;" data-team-action="add-home-1">+1</button>
            <button style="background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; padding: 10px 20px; border-radius: 2px; color: ${COLORS.text}; font-size: 14px; font-weight: 500; font-family: 'JetBrains Mono', monospace; cursor: pointer;" data-team-action="add-home-2">+2</button>
            <button style="background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; padding: 10px 20px; border-radius: 2px; color: ${COLORS.text}; font-size: 14px; font-weight: 500; font-family: 'JetBrains Mono', monospace; cursor: pointer;" data-team-action="add-home-3">+3</button>
          </div>
        </div>

        <!-- Away Team -->
        <div style="background: ${COLORS.cardBg}; padding: 24px; border-radius: 2px;" data-team="away">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <span style="color: ${COLORS.awayAccent}; font-size: 10px; font-weight: 600; letter-spacing: 2px; font-family: Inter, sans-serif;">AWAY</span>
            <span style="color: ${COLORS.text}; font-size: 14px; font-weight: 600; font-family: Inter, sans-serif;">TEAM ${escapeHtml(away.label)}</span>
          </div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 24px; margin-bottom: 16px;">
            <button style="width: 48px; height: 48px; background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; border-radius: 2px; display: flex; align-items: center; justify-content: center; cursor: pointer;" data-team-action="sub-away">
              <svg xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; color: ${COLORS.text};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4"/>
              </svg>
            </button>
            <span style="color: ${COLORS.text}; font-size: 64px; font-weight: 500; min-width: 120px; text-align: center; font-family: 'Cormorant Garamond', serif;">${String(away.score).padStart(2, '0')}</span>
            <button style="width: 48px; height: 48px; background: ${COLORS.awayAccent}; border: none; border-radius: 2px; display: flex; align-items: center; justify-content: center; cursor: pointer;" data-team-action="add-away">
              <svg xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; color: ${COLORS.text};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
            </button>
          </div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
            <button style="background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; padding: 10px 20px; border-radius: 2px; color: ${COLORS.text}; font-size: 14px; font-weight: 500; font-family: 'JetBrains Mono', monospace; cursor: pointer;" data-team-action="add-away-1">+1</button>
            <button style="background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; padding: 10px 20px; border-radius: 2px; color: ${COLORS.text}; font-size: 14px; font-weight: 500; font-family: 'JetBrains Mono', monospace; cursor: pointer;" data-team-action="add-away-2">+2</button>
            <button style="background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; padding: 10px 20px; border-radius: 2px; color: ${COLORS.text}; font-size: 14px; font-weight: 500; font-family: 'JetBrains Mono', monospace; cursor: pointer;" data-team-action="add-away-3">+3</button>
          </div>
        </div>
      `;

      // Attach event handlers
      wrapper.querySelectorAll("[data-team-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const action = btn.dataset.teamAction;
          const [homeIdx, awayIdx] = matchupPairById(currentMatchupId());

          if (action === "add-home") state.teams[homeIdx].score += 1;
          else if (action === "sub-home") state.teams[homeIdx].score = Math.max(0, state.teams[homeIdx].score - 1);
          else if (action === "add-home-1") state.teams[homeIdx].score += 1;
          else if (action === "add-home-2") state.teams[homeIdx].score += 2;
          else if (action === "add-home-3") state.teams[homeIdx].score += 3;
          else if (action === "add-away") state.teams[awayIdx].score += 1;
          else if (action === "sub-away") state.teams[awayIdx].score = Math.max(0, state.teams[awayIdx].score - 1);
          else if (action === "add-away-1") state.teams[awayIdx].score += 1;
          else if (action === "add-away-2") state.teams[awayIdx].score += 2;
          else if (action === "add-away-3") state.teams[awayIdx].score += 3;

          render();
          broadcast();
        });
      });
    };

    // Display page: Render with inline styles
    const renderDisplayScores = () => {
      const wrapper = scoreboardRoot.querySelector("[data-scoreboard-display-scores]");
      if (!wrapper) return;

      const [home, away] = currentMatchup();

      wrapper.innerHTML = `
        <!-- Home Team -->
        <div style="width: 280px; height: 300px; background: ${COLORS.displayCardBg}; border: 1px solid ${COLORS.displayBorder}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
          <div style="width: 72px; height: 72px; background: ${COLORS.homeLogoBg}; border: 2px solid #E53935; display: flex; align-items: center; justify-content: center;">
            <span style="color: white; font-size: 22px; font-weight: 800; font-family: Inter, sans-serif;">${escapeHtml(home.label)}</span>
          </div>
          <span style="color: #999999; font-size: 11px; font-weight: 500; letter-spacing: 2px; font-family: Inter, sans-serif;">HOME TEAM</span>
          <span style="color: white; font-size: 18px; font-weight: 700; letter-spacing: 1px; font-family: Inter, sans-serif;">TEAM ${escapeHtml(home.label)}</span>
          <span style="color: white; font-size: 80px; font-weight: 700; line-height: 1; font-family: 'JetBrains Mono', monospace;">${home.score}</span>
          <span style="color: #E53935; font-size: 10px; font-weight: 600; letter-spacing: 2px; font-family: Inter, sans-serif;">HOME</span>
          <div style="width: 40px; height: 40px; background: ${state.possession === 'home' ? '#E53935' : 'transparent'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-top: 8px;">
            ${state.possession === 'home' ? '<span style="color: white; font-size: 24px; font-weight: bold;">◀</span>' : ''}
          </div>
        </div>

        <!-- Center Panel -->
        <div style="flex: 1; height: 300px; background: ${COLORS.centerBg}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
          <div style="width: 80px; height: 32px; background: #E53935; display: flex; align-items: center; justify-content: center; gap: 4px;">
            <span style="color: white; font-size: 10px; font-weight: 600; letter-spacing: 1px; font-family: Inter, sans-serif;">QTR</span>
            <span style="color: white; font-size: 16px; font-weight: 700; font-family: 'JetBrains Mono', monospace;">${state.quarter}</span>
          </div>
          <div style="width: 40px; height: 1px; background: #333333;"></div>
          <span style="color: white; font-size: 56px; font-weight: 700; font-family: 'JetBrains Mono', monospace;">${formatTime(state.period_seconds)}</span>
          <span style="color: #666666; font-size: 9px; font-weight: 500; letter-spacing: 2px; font-family: Inter, sans-serif;">GAME TIME</span>
          <div style="width: 40px; height: 1px; background: #333333;"></div>
          <div style="width: 90px; height: 48px; background: #161616; border: 1px solid #333333; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;">
            <span style="color: ${COLORS.shotClock}; font-size: 22px; font-weight: 700; font-family: 'JetBrains Mono', monospace;">${state.shot_seconds}</span>
            <span style="color: #666666; font-size: 8px; font-weight: 500; letter-spacing: 1px; font-family: Inter, sans-serif;">SHOT CLOCK</span>
          </div>
        </div>

        <!-- Away Team -->
        <div style="width: 280px; height: 300px; background: ${COLORS.displayCardBg}; border: 1px solid ${COLORS.displayBorder}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
          <div style="width: 72px; height: 72px; background: ${COLORS.awayLogoBg}; border: 2px solid ${COLORS.awayLogoBorder}; display: flex; align-items: center; justify-content: center;">
            <span style="color: white; font-size: 22px; font-weight: 800; font-family: Inter, sans-serif;">${escapeHtml(away.label)}</span>
          </div>
          <span style="color: #999999; font-size: 11px; font-weight: 500; letter-spacing: 2px; font-family: Inter, sans-serif;">AWAY TEAM</span>
          <span style="color: white; font-size: 18px; font-weight: 700; letter-spacing: 1px; font-family: Inter, sans-serif;">TEAM ${escapeHtml(away.label)}</span>
          <span style="color: white; font-size: 80px; font-weight: 700; line-height: 1; font-family: 'JetBrains Mono', monospace;">${away.score}</span>
          <span style="color: ${COLORS.awayLogoBorder}; font-size: 10px; font-weight: 600; letter-spacing: 2px; font-family: Inter, sans-serif;">AWAY</span>
          <div style="width: 40px; height: 40px; background: ${state.possession === 'away' ? COLORS.awayLogoBorder : 'transparent'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-top: 8px;">
            ${state.possession === 'away' ? '<span style="color: white; font-size: 24px; font-weight: bold;">▶</span>' : ''}
          </div>
        </div>
      `;
    };

    const renderPreview = () => {
      const [home, away] = currentMatchup();
      setText("[data-preview-matchup]", `팀 ${escapeHtml(home.label)} vs 팀 ${escapeHtml(away.label)}`);
      setText("[data-preview-quarter]", `${state.quarter}Q`);
      setText("[data-preview-timer]", formatTime(state.period_seconds));
      setText("[data-preview-home]", home.score);
      setText("[data-preview-away]", away.score);
      setText("[data-preview-shot]", state.shot_seconds);
    };

    const render = () => {
      const [home, away] = currentMatchup();

      // For display page, swap left/right (Control: A:B, Display: B:A)
      const isDisplayPage = role === 'display';
      const leftTeam = isDisplayPage ? away : home;
      const rightTeam = isDisplayPage ? home : away;
      const leftFouls = isDisplayPage ? (state.away_fouls || 0) : (state.home_fouls || 0);
      const rightFouls = isDisplayPage ? (state.home_fouls || 0) : (state.away_fouls || 0);

      // Quarter and timers
      setText("[data-scoreboard-quarter]", state.quarter);
      setText("[data-scoreboard-timer]", formatTime(state.period_seconds));
      setText("[data-scoreboard-shot]", state.shot_seconds);

      // Team names (for new sports display)
      setText("[data-team-name-left]", leftTeam.name || `TEAM ${leftTeam.label}`);
      setText("[data-team-name-right]", rightTeam.name || `TEAM ${rightTeam.label}`);

      const applyDisplayBadgeStyle = (selector, team) => {
        const badge = scoreboardRoot.querySelector(selector);
        if (!badge) return;
        const teamColor = String(team?.color || "").trim();
        if (!teamColor) return;

        const isExplicitWhite = /^(white|#fff|#ffffff)$/i.test(teamColor);
        const light = isExplicitWhite || isLightColor(teamColor);
        badge.style.backgroundColor = teamColor;
        badge.style.borderColor = light ? "#111827" : teamColor;

        const label = badge.querySelector("span");
        if (label) {
          label.style.color = light ? "#111827" : "#ffffff";
        }
      };

      if (isDisplayPage) {
        applyDisplayBadgeStyle(".team-badge-left", leftTeam);
        applyDisplayBadgeStyle(".team-badge-right", rightTeam);
      }

      // Scores (new display)
      setText("[data-score-left]", leftTeam.score);
      setText("[data-score-right]", rightTeam.score);

      // Fouls (new display) - Fill circles based on count
      const updateFoulCircles = (containerSelector, foulCount) => {
        const container = scoreboardRoot.querySelector(containerSelector);
        if (!container) return;

        const circles = container.querySelectorAll('[data-foul-circle]');
        circles.forEach((circle, index) => {
          if (index < foulCount) {
            circle.style.backgroundColor = '#dc2626'; // red-600
          } else {
            circle.style.backgroundColor = '#1a1a1a'; // dark/empty
          }
        });


      };

      updateFoulCircles('[data-foul-indicators-left]', leftFouls);
      updateFoulCircles('[data-foul-indicators-right]', rightFouls);

      // Possession arrows (new display)
      // Possession arrows (new display)
      const arrowsLeft = scoreboardRoot.querySelectorAll(".possession-arrow-left");
      const arrowsRight = scoreboardRoot.querySelectorAll(".possession-arrow-right");

      const centerText = scoreboardRoot.querySelector(".center-vs-text");
      if (centerText) {
        if (state.possession === 'home' || state.possession === 'away') {
          centerText.classList.add('hidden');
        } else {
          centerText.classList.remove('hidden');
        }
      }

      const showArrows = (arrows, show) => {
        arrows.forEach(a => a.classList.toggle('hidden', !show));
      };

      if (state.possession === 'home' || state.possession === 'away') {
        // Control page uses direction-based UI (left=away, right=home)
        // Display page keeps existing team-based rendering.
        const showLeft = role === 'control'
          ? state.possession === 'away'
          : state.possession === 'home';
        showArrows(arrowsLeft, showLeft);
        showArrows(arrowsRight, !showLeft);
      } else {
        showArrows(arrowsLeft, false);
        showArrows(arrowsRight, false);
      }

      // Legacy display elements
      setText("[data-scoreboard-matchup]", `${home.name || '팀 ' + home.label} vs ${away.name || '팀 ' + away.label}`);
      setText("[data-home-name]", home.name || `TEAM ${home.label}`);
      setText("[data-away-name]", away.name || `TEAM ${away.label}`);
      const homeIconEl = scoreboardRoot.querySelector("[data-home-icon]");
      if (homeIconEl) {
        applyTeamIconColor(homeIconEl, home.color);
      }

      const awayIconEl = scoreboardRoot.querySelector("[data-away-icon]");
      if (awayIconEl) {
        applyTeamIconColor(awayIconEl, away.color);
      }
      setText("[data-home-fouls]", state.home_fouls || 0);
      setText("[data-away-fouls]", state.away_fouls || 0);

      // 마지막 라운드 도달 시 NEXT QUARTER 버튼 상태 변경
      const nextQuarterBtn = scoreboardRoot.querySelector('[data-action="next-quarter"]');
      if (nextQuarterBtn) {
        const finalRotationStep = maxRotationStep();
        if (state.rotation_step === finalRotationStep) {
          nextQuarterBtn.textContent = "점수 확정";
          nextQuarterBtn.classList.add("bg-red-600", "hover:bg-red-700"); // 스타일 강조 (선택사항)
          nextQuarterBtn.style.display = '';
        } else if (state.rotation_step > finalRotationStep) {
          nextQuarterBtn.style.display = 'none';
        } else {
          nextQuarterBtn.textContent = "다음 쿼터";
          nextQuarterBtn.classList.remove("bg-red-600", "hover:bg-red-700");
          nextQuarterBtn.style.display = '';
        }
      }

      const toggleMainBtn = scoreboardRoot.querySelector('[data-action="toggle-main"]');
      if (toggleMainBtn) {
        const span = toggleMainBtn.querySelector('span');
        if (span) span.textContent = state.running ? "경기 멈춤" : "경기 시작";
        toggleMainBtn.style.backgroundColor = state.running ? '#dc2626' : '#22C55E';
      }

      const toggleShotBtn = scoreboardRoot.querySelector('[data-action="toggle-shot"]');
      if (toggleShotBtn) {
        toggleShotBtn.textContent = state.shot_running ? "멈춤" : "시작";
      }

      const possHomeBtn = scoreboardRoot.querySelector('[data-possession-home-btn]');
      const possAwayBtn = scoreboardRoot.querySelector('[data-possession-away-btn]');

      if (possHomeBtn && possAwayBtn) {
        if (state.possession === 'home') {
          possHomeBtn.classList.remove("text-gray-400", "bg-white");
          possHomeBtn.classList.add("bg-[#E53935]", "text-white", "border-[#E53935]");

          possAwayBtn.classList.add("text-gray-400", "bg-white", "border-gray-300");
          possAwayBtn.classList.remove("bg-[#3B82F6]", "text-white", "border-[#3B82F6]");
        } else {
          possAwayBtn.classList.remove("text-gray-400", "bg-white");
          possAwayBtn.classList.add("bg-[#3B82F6]", "text-white", "border-[#3B82F6]");

          possHomeBtn.classList.add("text-gray-400", "bg-white", "border-gray-300");
          possHomeBtn.classList.remove("bg-[#E53935]", "text-white", "border-[#E53935]");
        }
      }

      const renderRoster = () => {
        const rosterEl = scoreboardRoot.querySelector("[data-roster-display]");
        if (!rosterEl) return;

        const positionColors = {
          "PG": "#3B82F6",
          "SG": "#8B5CF6",
          "SF": "#10B981",
          "PF": "#F59E0B",
          "C": "#EF4444"
        };

        const getTeamRosterHtml = (team) => {
          if (!team || !team.members || team.members.length === 0) {
            return `<div class="flex-1 flex flex-col gap-4">
                      <div class="flex items-center gap-3 border-b border-gray-100 pb-2 mb-2">
                        <span class="text-2xl">${escapeHtml(team?.icon) || '🛡️'}</span>
                        <span class="font-black text-lg uppercase text-gray-900">${escapeHtml(team?.label) || '팀'} 명단</span>
                      </div>
                      <div class="text-gray-400 text-sm italic">명단 없음</div>
                    </div>`;
          }

          const sortedMembers = [...team.members].sort((a, b) => (a.back_number || 999) - (b.back_number || 999));

          return `
              <div class="flex-1 flex flex-col gap-3 min-w-[200px]">
                 <div class="flex items-center gap-2 border-b-2 border-gray-100 pb-2 mb-1">
                    <span class="text-2xl">${escapeHtml(team.icon) || '🛡️'}</span>
                    <span class="font-black text-lg uppercase text-gray-900 truncate">${escapeHtml(team.label)}</span>
                 </div>
                 <div class="grid grid-cols-2 gap-2">
                    ${sortedMembers.map(m => `
                      <div class="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-2 py-2 shadow-sm">
                        <span class="font-bold text-gray-800 text-xs truncate mr-1">${escapeHtml(m.name)}</span>
                        <span class="px-2 py-0.5 rounded-full text-[8px] font-black text-white shadow-sm flex-shrink-0 border border-white/20"
                              style="background-color: ${positionColors[m.position] || '#6B7280'}">
                          ${escapeHtml(m.position) || '?'}
                        </span>
                      </div>
                    `).join('')}
                 </div>
              </div>
            `;
        };

        rosterEl.innerHTML = `
            <div class="flex flex-wrap lg:flex-nowrap gap-8 w-full">
              ${state.teams.map(t => getTeamRosterHtml(t)).join('')}
            </div>
         `;
      };

      // Call Roster Render
      renderRoster();

      const renderQuarterTable = () => {
        const tableContainer = scoreboardRoot.querySelector("[data-quarter-table]");
        if (!tableContainer) return;

        if (state.teams.length < 2) {
          tableContainer.innerHTML = "<p class='text-center text-gray-500'>점수표를 표시하려면 최소 2팀이 필요합니다.</p>";
          return;
        }

        const pairs = matchupPairs();
        const orderedMatchupIds = normalizeMatchupOrder(state.matchup_order);

        let html = `
           <table class="w-full text-center text-base border-collapse">
             <thead>
               <tr class="bg-gray-100 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-sm">
                 <th class="p-4 text-left">경기 (Matchup)</th>
                 <th class="p-4 w-20">1Q</th>
                 <th class="p-4 w-20">2Q</th>
                 <th class="p-4 w-20">3Q</th>
                 <th class="p-4 w-20">4Q</th>
                 <th class="p-4 w-24">최종</th>
               </tr>
             </thead>
             <tbody class="divide-y divide-gray-200" data-matchup-tbody>
         `;

        const activeMatchupIdx = currentMatchupId();
        const currentQ = Number.isFinite(Number(state.quarter)) ? Number(state.quarter) : currentQuarter();

        orderedMatchupIds.forEach((pairIdx) => {
          const pair = pairs[pairIdx];
          const t1 = state.teams[pair[0]];
          const t2 = state.teams[pair[1]];
          if (!t1 || !t2) return;

          const scores = state.quarter_history[pairIdx] || {};
          const finalScore = state.matchup_scores[pairIdx] || { team1: 0, team2: 0 };
          const isActiveRow = pairIdx === activeMatchupIdx;

          const getScoreCell = (q) => {
            if (scores[q]) {
              return `<div class="flex flex-col leading-none gap-1">
                             <span class="font-bold text-gray-900 text-lg">${scores[q].team1}</span>
                             <span class="font-bold text-gray-500 text-lg">${scores[q].team2}</span>
                           </div>`;
            }
            return `<span class="text-gray-300 text-lg">-</span>`;
          };

          const getCellClass = (q) => {
            let base = "p-4 ";
            if (isActiveRow && currentQ === q) {
              return base + "bg-blue-50 border-x-2 border-blue-200 ring-2 ring-blue-500/20 z-10 relative";
            }
            return base + (q % 2 === 0 ? "bg-gray-50/50" : "bg-white/50");
          };

          const formatTeamLabel = (label) => {
            const raw = String(label || "").trim();
            if (!raw) return "Team";
            return /^team\s+/i.test(raw) ? raw : `Team ${raw}`;
          };

          const getTeamNameStyle = (team, fallbackColor = "#111827") => {
            const rawColor = String(team?.color || "").trim();
            const color = rawColor || fallbackColor;
            const isExplicitWhite = /^(white|#fff|#ffffff)$/i.test(color);

            if (isExplicitWhite || isLightColor(color)) {
              return "color:#111827; text-shadow:0 0 1px #9ca3af;";
            }

            return `color:${color};`;
          };

          const getTeamDotStyle = (team, fallbackColor = "#111827") => {
            const rawColor = String(team?.color || "").trim();
            const color = rawColor || fallbackColor;
            const isExplicitWhite = /^(white|#fff|#ffffff)$/i.test(color);
            const borderColor = (isExplicitWhite || isLightColor(color)) ? "#111827" : color;
            return `background-color:${color}; border-color:${borderColor}; box-shadow:0 1px 3px rgba(15, 23, 42, 0.15);`;
          };

          const getMemberChips = (team) => {
            if (!team || !Array.isArray(team.members) || team.members.length === 0) {
              return `<span class="text-xs text-gray-400 italic">명단 없음</span>`;
            }

            const sortedMembers = [ ...team.members ].sort((a, b) => (a.back_number || 999) - (b.back_number || 999));
            const names = sortedMembers.map((member) => escapeHtml(member?.name || "이름없음"));
            return `
              <div class="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1">
                ${names.map((name) => `<span class="text-sm font-semibold text-gray-700 shrink-0">${name}</span>`).join('<span class="text-gray-300 shrink-0">·</span>')}
              </div>
            `;
          };

          html += `
               <tr data-matchup-id="${pairIdx}" class="${isActiveRow ? 'bg-gray-100/80 shadow-inner' : 'hover:bg-gray-50'} transition-all duration-300 cursor-move">
                 <td class="p-4 text-left border-l-4 ${isActiveRow ? 'border-blue-500' : 'border-transparent'}">
                   <div class="flex flex-col gap-3">
                     <div class="flex items-center gap-10">
                       <div class="flex items-center gap-3 min-w-[172px]">
                         <span class="inline-flex w-6 h-6 rounded-full border-2 shrink-0" style="${getTeamDotStyle(t1, "#111827")}"></span>
                         <span class="font-black text-base uppercase tracking-tight" style="${getTeamNameStyle(t1, "#111827")}">${escapeHtml(formatTeamLabel(t1.label))}</span>
                       </div>
                       <div class="min-w-0 flex-1">
                         ${getMemberChips(t1)}
                       </div>
                     </div>
                     <div class="flex items-center gap-10">
                       <div class="flex items-center gap-3 min-w-[172px]">
                         <span class="inline-flex w-6 h-6 rounded-full border-2 shrink-0" style="${getTeamDotStyle(t2, "#6B7280")}"></span>
                         <span class="font-black text-base uppercase tracking-tight" style="${getTeamNameStyle(t2, "#6B7280")}">${escapeHtml(formatTeamLabel(t2.label))}</span>
                       </div>
                       <div class="min-w-0 flex-1">
                         ${getMemberChips(t2)}
                       </div>
                     </div>
                   </div>
                 </td>
                 <td class="${getCellClass(1)}">${getScoreCell(1)}</td>
                 <td class="${getCellClass(2)}">${getScoreCell(2)}</td>
                 <td class="${getCellClass(3)}">${getScoreCell(3)}</td>
                 <td class="${getCellClass(4)}">${getScoreCell(4)}</td>
                 <td class="p-4 font-bold">
                   <div class="flex flex-col leading-none gap-1">
                     <span class="text-gray-900 text-lg">${finalScore.team1}</span>
                     <span class="text-gray-500 text-lg">${finalScore.team2}</span>
                   </div>
                 </td>
               </tr>
             `;
        });

        html += `</tbody></table>`;
        tableContainer.innerHTML = html;

        if (role !== "control" || typeof Sortable === "undefined") return;

        const tbody = tableContainer.querySelector("[data-matchup-tbody]");
        if (!tbody) return;

        const rows = tbody.querySelectorAll("tr[data-matchup-id]");
        if (rows.length < 2) return;

        if (matchupSortInstance) {
          matchupSortInstance.destroy();
          matchupSortInstance = null;
        }

        matchupSortInstance = new Sortable(tbody, {
          animation: 150,
          draggable: "tr[data-matchup-id]",
          ghostClass: "opacity-60",
          chosenClass: "ring-2",
          dragClass: "cursor-grabbing",
          onStart: () => {
            isMatchupDragging = true;
          },
          onEnd: () => {
            isMatchupDragging = false;
            const previousMatchupId = currentMatchupId();
            const [prevTeam1Idx, prevTeam2Idx] = matchupPairById(previousMatchupId);
            if (state.teams[prevTeam1Idx] && state.teams[prevTeam2Idx]) {
              state.matchup_scores[previousMatchupId] = {
                team1: state.teams[prevTeam1Idx].score,
                team2: state.teams[prevTeam2Idx].score
              };
            }

            const newOrder = Array.from(tbody.querySelectorAll("tr[data-matchup-id]"))
              .map((row) => Number.parseInt(row.dataset.matchupId, 10))
              .filter((index) => Number.isInteger(index));

            state.matchup_order = normalizeMatchupOrder(newOrder);
            syncScoresForActiveMatchup();
            render();
            syncTimers();
            broadcast();
          }
        });
      };

      if (!isMatchupDragging) {
        renderQuarterTable();
      }

      // --- Team Foul Visuals (Control Page) ---
      const updateFoulVisuals = (team, count) => {
        const countEl = scoreboardRoot.querySelector(`[data-${team}-fouls]`);
        const indicatorEl = scoreboardRoot.querySelector(`[data-${team}-team-foul-indicator]`);

        if (countEl) {
          if (count >= 5) {
            countEl.classList.add("text-red-500");
            countEl.classList.remove("text-gray-900");
          } else {
            countEl.classList.remove("text-red-500");
            countEl.classList.add("text-gray-900");
          }
        }


      };

      updateFoulVisuals("home", state.home_fouls || 0);
      updateFoulVisuals("away", state.away_fouls || 0);

      // Display page specific updates
      setText("[data-home-score]", home.score);
      setText("[data-away-score]", away.score);
      setText("[data-home-fouls-display]", state.home_fouls || 0);
      setText("[data-away-fouls-display]", state.away_fouls || 0);
      setText("[data-scoreboard-quarter-num]", state.quarter);
      setText("[data-home-total]", home.score);
      setText("[data-away-total]", away.score);

      // renderTeamsControl();
      // renderDisplayScores();
      // Update Main Timer Button Text/Style
      const mainToggleBtn = scoreboardRoot.querySelector('[data-action="toggle-main"]');
      if (mainToggleBtn) {
        const span = mainToggleBtn.querySelector('span');
        if (state.running) {
          if (span) span.textContent = "STOP";
          mainToggleBtn.classList.remove("bg-[#22C55E]", "hover:bg-[#15803d]");
          mainToggleBtn.classList.add("bg-[#ef4444]", "hover:bg-[#b91c1c]"); // Red for Stop
        } else {
          if (span) span.textContent = "START";
          mainToggleBtn.classList.remove("bg-[#ef4444]", "hover:bg-[#b91c1c]");
          mainToggleBtn.classList.add("bg-[#22C55E]", "hover:bg-[#15803d]"); // Green for Start
        }
      }

      // Update Shot Clock Toggle Icon/Text (optional, but requested implicitly)
      const shotToggleBtn = scoreboardRoot.querySelector('[data-action="toggle-shot"]');
      if (shotToggleBtn) {
        if (state.shot_running) {
          shotToggleBtn.classList.add("btn-active");
          shotToggleBtn.textContent = "멈춤";
        } else {
          shotToggleBtn.classList.remove("btn-active");
          shotToggleBtn.textContent = "시작";
        }
      }

      const soundToggleBtn = scoreboardRoot.querySelector('[data-action="toggle-sound"]');
      if (soundToggleBtn) {
        const enabled = isSoundEnabled();
        soundToggleBtn.textContent = enabled ? "🔊 사운드 ON" : "🔇 사운드 OFF";
        soundToggleBtn.classList.toggle("bg-green-50", enabled);
        soundToggleBtn.classList.toggle("text-green-700", enabled);
        soundToggleBtn.classList.toggle("border-green-200", enabled);
        soundToggleBtn.classList.toggle("bg-gray-100", !enabled);
        soundToggleBtn.classList.toggle("text-gray-500", !enabled);
        soundToggleBtn.classList.toggle("border-gray-300", !enabled);
      }

      const voiceToggleBtn = scoreboardRoot.querySelector('[data-action="toggle-voice"]');
      if (voiceToggleBtn) {
        const enabled = isVoiceEnabled();
        voiceToggleBtn.textContent = enabled ? "🗣️ 음성 ON" : "🤫 음성 OFF";
        voiceToggleBtn.classList.toggle("bg-green-50", enabled);
        voiceToggleBtn.classList.toggle("text-green-700", enabled);
        voiceToggleBtn.classList.toggle("border-green-200", enabled);
        voiceToggleBtn.classList.toggle("bg-gray-100", !enabled);
        voiceToggleBtn.classList.toggle("text-gray-500", !enabled);
        voiceToggleBtn.classList.toggle("border-gray-300", !enabled);
      }

      renderPreview();

      // Allow page-specific scripts (e.g. display theme widgets) to react to latest scoreboard state
      document.dispatchEvent(new CustomEvent("scoreboard:updated", {
        detail: { matchId, role, state }
      }));
    };

    const stopMainTimer = () => {
      if (mainTimer) clearInterval(mainTimer);
      mainTimer = null;
    };

    const stopShotTimer = () => {
      if (shotTimer) clearInterval(shotTimer);
      shotTimer = null;
    };

    // Global AudioContext for buzzer (initialized on first user interaction)
    let globalAudioContext = null;

    const initAudioContext = () => {
      if (globalAudioContext) return;

      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        globalAudioContext = new AudioContext();

        // Resume if suspended
        if (globalAudioContext.state === 'suspended') {
          globalAudioContext.resume().then(() => {
          });
        }
      } catch (e) {
        console.error("Failed to init AudioContext:", e);
      }
    };

    const playBuzzer = () => {
      if (!isSoundEnabled()) return;

      // Initialize on first call
      if (!globalAudioContext) {
        initAudioContext();
      }

      try {

        if (!globalAudioContext || globalAudioContext.state === 'closed') {
          console.error("❌ AudioContext not available");
          return;
        }

        // Resume if needed (for Safari)
        if (globalAudioContext.state === 'suspended') {
          globalAudioContext.resume();
        }

        const oscillator = globalAudioContext.createOscillator();
        const gain = globalAudioContext.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = 440;
        gain.gain.value = 0.15;
        oscillator.connect(gain);
        gain.connect(globalAudioContext.destination);
        oscillator.start();
        setTimeout(() => {
          oscillator.stop();
        }, 1500);
      } catch (error) {
        console.error("❌ Buzzer error:", error);
      }
    };

    const startMainTimer = () => {
      if (mainTimer) return;
      mainTimer = setInterval(() => {
        if (state.period_seconds > 0) {
          state.period_seconds -= 1;
          if (state.period_seconds <= 5 && state.period_seconds > 0) {
            speak(state.period_seconds);
          }
        } else {
          state.running = false;
          state.shot_running = false;
          stopMainTimer();
          playBuzzer();
        }
        render();
        broadcast();
      }, 1000);
    };

    const startShotTimer = () => {
      if (shotTimer) return;
      shotTimer = setInterval(() => {
        if (state.shot_seconds > 0) {
          state.shot_seconds -= 1; // Decrement FIRST


          // Then speak if <= 5
          if (state.shot_seconds <= 5 && state.shot_seconds > 0) {
            speak(state.shot_seconds);
          }

          // Buzzer when reaching 0
          if (state.shot_seconds === 0) {
            state.shot_running = false;
            stopShotTimer();
            playBuzzer();
          }
        }
        render();
        broadcast();
      }, 1000);
    };

    const speak = (text) => {
      if (!isVoiceEnabled() || !("speechSynthesis" in window)) return;

      // Cancel any previous speech to prevent duplicates
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ko-KR";
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    };


    const syncTimers = () => {
      if (role !== "control") return;
      if (state.running) {
        startMainTimer();
      } else if (mainTimer) {
        stopMainTimer();
      }

      if (state.shot_running) {
        startShotTimer();
      } else if (shotTimer) {
        stopShotTimer();
      }
    };

    const broadcast = () => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const payload = JSON.stringify({ action: "update", payload: state });
      socket.send(JSON.stringify({ command: "message", identifier, data: payload }));
    };

    // Voice initialization flag to bypass browser autoplay policy
    let voiceInitialized = false;

    const initializeVoice = () => {
      if (!isVoiceEnabled() || !("speechSynthesis" in window)) return;
      if (voiceInitialized) return;

      // Play a silent utterance to activate speech synthesis
      const silent = new SpeechSynthesisUtterance("");
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
      voiceInitialized = true;
    };

    const speakScore = () => {
      if (!isVoiceEnabled()) return;

      // Only speak if speech synthesis is supported and acting as control
      if (!window.speechSynthesis) {
        return;
      }

      if (role !== "control") {
        return;
      }

      // Reset speech synthesis to prevent stuck state
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      // Initialize voice on first call (browser autoplay policy workaround)
      initializeVoice();

      const [visualHome, visualAway] = currentMatchup();

      // visualHome and visualAway already have the score values from currentMatchup
      const homeScore = visualHome.score;
      const awayScore = visualAway.score;


      // Format: "75 to 72" (Korean style: 75 대 72)
      const text = `${homeScore} 대 ${awayScore}`;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.0;
      utterance.volume = 1.0;
      utterance.pitch = 1.0;

      // Get available voices and select Korean voice if available
      const voices = window.speechSynthesis.getVoices();

      const koreanVoice = voices.find(voice => voice.lang.startsWith('ko'));
      if (koreanVoice) {
        utterance.voice = koreanVoice;
      } else {
      }

      utterance.onstart = () => {
      };

      utterance.onerror = (event) => {
        console.error("❌ Speech error:", event.error, event);
      };

      utterance.onend = () => {
      };

      window.speechSynthesis.speak(utterance);
    };

    const handleTeamAction = (action) => {
      // "Home" action targets the Visually Left team
      // "Away" action targets the Visually Right team
      const [visualHome, visualAway] = currentMatchup();

      // We need to find the real index of these teams in state.teams
      // visualHome might be Team A (index 0) or Team B (index 1) depending on swap
      const homeIdx = state.teams.findIndex(t => t.id === visualHome.id);
      const awayIdx = state.teams.findIndex(t => t.id === visualAway.id);
      if (homeIdx < 0 || awayIdx < 0) return;

      if (action === "add-home") state.teams[homeIdx].score += 1;
      else if (action === "sub-home") state.teams[homeIdx].score = Math.max(0, state.teams[homeIdx].score - 1);
      else if (action === "add-home-1") state.teams[homeIdx].score += 1;
      else if (action === "add-home-2") state.teams[homeIdx].score += 2;
      else if (action === "add-home-3") state.teams[homeIdx].score += 3;
      else if (action === "reset-home-score") state.teams[homeIdx].score = 0;
      else if (action === "add-away") state.teams[awayIdx].score += 1;
      else if (action === "sub-away") state.teams[awayIdx].score = Math.max(0, state.teams[awayIdx].score - 1);
      else if (action === "add-away-1") state.teams[awayIdx].score += 1;
      else if (action === "add-away-2") state.teams[awayIdx].score += 2;
      else if (action === "add-away-3") state.teams[awayIdx].score += 3;
      else if (action === "reset-away-score") state.teams[awayIdx].score = 0;
    };

    const attachControlHandlers = () => {
      if (role !== "control") return;
      scoreboardRoot.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          // Initialize AudioContext on first user interaction
          initAudioContext();

          const action = btn.dataset.action;
          if (["add-home", "add-home-1", "add-home-2", "add-home-3",
            "sub-home", "reset-home-score",
            "add-away", "add-away-1", "add-away-2", "add-away-3",
            "sub-away", "reset-away-score"].includes(action)) {
            handleTeamAction(action);
            render();
            broadcast();
            // Speak after render to ensure scores are updated
            speakScore();
          } else {
            switch (action) {
              case "toggle-main":
                state.running = !state.running;
                state.shot_running = state.running && state.shot_seconds > 0;
                break;
              case "pause-main":
                state.running = false;
                state.shot_running = false;
                break;
              case "reset-main":
                state.period_seconds = defaultPeriodSeconds;
                state.running = false;
                state.shot_running = false;
                break;
              case "reset-all":
                if (confirm("정말로 모든 점수와 시간을 초기화하시겠습니까?")) {
                  state.period_seconds = defaultPeriodSeconds;
                  state.shot_seconds = 24;
                  state.running = false;
                  state.shot_running = false;
                  state.home_fouls = 0;
                  state.away_fouls = 0;
                  state.teams.forEach(t => t.score = 0);
                }
                break;
              // ... existing cases ...
              case "minus-minute":
                state.period_seconds = Math.max(0, state.period_seconds - 60);
                break;
              case "plus-minute":
                state.period_seconds += 60;
                break;
              case "toggle-shot":
                state.shot_running = !state.shot_running;
                break;
              case "reset-shot-24":
                state.shot_seconds = 24;
                state.shot_running = false;
                break;
              case "reset-shot-14":
                state.shot_seconds = 14;
                state.shot_running = false;
                break;
              case "next-quarter": {
                const finishedPairIdx = currentMatchupId();
                const [p1, p2] = matchupPairById(finishedPairIdx);
                if (p1 === undefined || p2 === undefined || !state.teams[p1] || !state.teams[p2]) break;

                state.matchup_scores[finishedPairIdx] = {
                  team1: state.teams[p1].score,
                  team2: state.teams[p2].score
                };

                const finishedQuarter = currentQuarter();
                if (!state.quarter_history[finishedPairIdx]) {
                  state.quarter_history[finishedPairIdx] = {};
                }
                state.quarter_history[finishedPairIdx][finishedQuarter] = {
                  team1: state.teams[p1].score,
                  team2: state.teams[p2].score
                };

                const saveQuarterScore = async () => {
                  const matchId = scoreboardRoot.dataset.matchId;
                  const clubMatch = window.location.pathname.match(/\/clubs\/(\d+)/);
                  const clubId = clubMatch ? clubMatch[1] : null;
                  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
                  if (!clubId) return;

                  try {
                    await fetch(`/clubs/${clubId}/matches/${matchId}/save_quarter_scores`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                      },
                      body: JSON.stringify({
                        home_team_id: state.teams[p1].id,
                        away_team_id: state.teams[p2].id,
                        quarter: finishedQuarter,
                        home_score: state.teams[p1].score,
                        away_score: state.teams[p2].score
                      })
                    });
                  } catch (error) {
                    console.error('쿼터 점수 저장 중 오류:', error);
                  }
                };

                saveQuarterScore();

                if (state.rotation_step === maxRotationStep()) {
                  const nextQuarterBtn = scoreboardRoot.querySelector('[data-action="next-quarter"]');
                  if (nextQuarterBtn) {
                    nextQuarterBtn.textContent = "저장 완료";
                    nextQuarterBtn.disabled = true;
                    nextQuarterBtn.classList.add("opacity-50", "cursor-not-allowed");
                  }
                  return;
                }

                state.rotation_step += 1;

                const nextPairIdx = currentMatchupId();
                const [n1, n2] = matchupPairById(nextPairIdx);
                if (n1 === undefined || n2 === undefined || !state.teams[n1] || !state.teams[n2]) break;

                const nextScores = state.matchup_scores[nextPairIdx] || { team1: 0, team2: 0 };
                state.teams[n1].score = nextScores.team1;
                state.teams[n2].score = nextScores.team2;

                if (teamsCount === 3) {
                  const allIdx = [0, 1, 2];
                  const thirdIdx = allIdx.find(i => i !== n1 && i !== n2);
                  if (thirdIdx !== undefined && state.teams[thirdIdx]) {
                    state.teams[thirdIdx].score = 0;
                  }
                }

                state.quarter = currentQuarter();
                state.period_seconds = defaultPeriodSeconds;
                state.shot_seconds = 24;
                state.home_fouls = 0;
                state.away_fouls = 0;
                applyQuarterPossession(state.quarter);
                state.running = false;
                state.shot_running = false;
                break;
              }
              case "prev-quarter": {
                // Previous quarter logic (Simplified reverse of next-quarter or just decrement quarter?)
                // For now, let's just decrement logic carefully if needed, or simple decrement quarter
                // Use simple decrement for now as full reverse logic is complex and rarely used perfectly
                state.quarter = Math.max(1, state.quarter - 1);
                // Ideally we should reverse rotation_step too, but user didn't explicitly ask for full undo support
                // Let's implement basic undo for rotation_step
                if (state.rotation_step > 0) {
                  // SAVE current (which matches nextPairIdx logic above)
                  const curPairIdx = currentMatchupId();
                  const [c1, c2] = matchupPairById(curPairIdx);
                  if (c1 !== undefined && c2 !== undefined && state.teams[c1] && state.teams[c2]) {
                    state.matchup_scores[curPairIdx] = { team1: state.teams[c1].score, team2: state.teams[c2].score };
                  }

                  state.rotation_step -= 1;

                  // LOAD prev
                  const prevPairIdx = currentMatchupId();
                  const [pr1, pr2] = matchupPairById(prevPairIdx);
                  if (pr1 !== undefined && pr2 !== undefined && state.teams[pr1] && state.teams[pr2]) {
                    const prevScores = state.matchup_scores[prevPairIdx] || { team1: 0, team2: 0 };
                    state.teams[pr1].score = prevScores.team1;
                    state.teams[pr2].score = prevScores.team2;
                  }

                  state.quarter = currentQuarter();
                  state.period_seconds = defaultPeriodSeconds;
                  applyQuarterPossession(state.quarter);
                }
                break;
              }
              case "next-matchup":
                state.matchup_index += 1;
                break;
              case "prev-matchup":
                state.matchup_index = Math.max(0, state.matchup_index - 1);
                break;
              case "toggle-sound":
                state.sound_enabled = !isSoundEnabled();
                break;
              case "toggle-voice":
                state.voice_enabled = !isVoiceEnabled();
                break;
              case "increment-home-fouls":
                state.home_fouls = (state.home_fouls || 0) + 1;
                break;
              case "decrement-home-fouls":
                state.home_fouls = Math.max(0, (state.home_fouls || 0) - 1);
                break;
              case "reset-home-fouls":
                state.home_fouls = 0;
                break;
              case "increment-away-fouls":
                state.away_fouls = (state.away_fouls || 0) + 1;
                break;
              case "decrement-away-fouls":
                state.away_fouls = Math.max(0, (state.away_fouls || 0) - 1);
                break;
              case "reset-away-fouls":
                state.away_fouls = 0;
                break;
              case "buzzer":
                playBuzzer();
                break;
              case "possession-home":
                state.base_possession = basePossessionForSelectedQuarterDirection(
                  currentQuarter(),
                  "home",
                  state.possession_switch_pattern
                );
                state.possession = "home";
                break;
              case "possession-away":
                state.base_possession = basePossessionForSelectedQuarterDirection(
                  currentQuarter(),
                  "away",
                  state.possession_switch_pattern
                );
                state.possession = "away";
                break;
              case "finish-game":
                // 경기 종료 - 현재 점수를 서버로 전송
                const saveGameScore = async () => {
                  const [home, away] = currentMatchup();
                  const matchId = scoreboardRoot.dataset.matchId;
                  const clubMatch = window.location.pathname.match(/\/clubs\/(\d+)/);
                  const clubId = clubMatch ? clubMatch[1] : null;
                  if (!clubId) {
                    alert("클럽 정보를 찾을 수 없습니다.");
                    return;
                  }

                  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

                  try {
                    const response = await fetch(`/clubs/${clubId}/matches/${matchId}/save_game_scores`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                      },
                      body: JSON.stringify({
                        home_team_id: home.id,
                        away_team_id: away.id,
                        home_score: home.score,
                        away_score: away.score
                      })
                    });

                    const data = await response.json();

                    if (data.success) {
                      alert(`경기 종료!\n최종 점수: ${home.label} ${home.score} : ${away.score} ${away.label}\n결과: ${data.result}`);
                      window.location.href = `/clubs/${clubId}/matches/${matchId}`;
                    } else {
                      alert('점수 저장 실패: ' + (data.error || '알 수 없는 오류'));
                    }
                  } catch (error) {
                    console.error('점수 저장 중 오류:', error);
                    alert('점수 저장 중 오류가 발생했습니다.');
                  }
                };

                if (confirm('경기를 종료하고 현재 점수를 저장하시겠습니까?')) {
                  saveGameScore();
                }
                break;
              case "toggle-shortcuts":
                const panel = document.querySelector("[data-shortcuts-panel]");
                if (panel) {
                  const btn = scoreboardRoot.querySelector('[data-action="toggle-shortcuts"]');
                  if (panel.classList.contains("hidden")) {
                    panel.classList.remove("hidden");
                    if (btn) btn.textContent = "⌨️ 상세 숨기기";
                  } else {
                    panel.classList.add("hidden");
                    if (btn) btn.textContent = "⌨️ 상세 보기";
                  }
                }
                break;
              case "swap-sides":
                state.manual_swap = !state.manual_swap;
                break;
              case "new-game":
                if (confirm("모든 경기 점수 데이터가 초기화 됩니다. 진행 하시겠습니까?")) {
                  // SAVE CURRENT QUARTER BEFORE RESET
                  const currentPairIdx = currentMatchupId();
                  const [p1, p2] = matchupPairById(currentPairIdx);
                  const currentQuarterNum = currentQuarter();

                  if (p1 !== undefined && p2 !== undefined && state.teams[p1] && state.teams[p2]) {
                    if (!state.quarter_history[currentPairIdx]) {
                      state.quarter_history[currentPairIdx] = {};
                    }
                    state.quarter_history[currentPairIdx][currentQuarterNum] = {
                      team1: state.teams[p1].score,
                      team2: state.teams[p2].score
                    };
                  }

                  // IMPORTANT: Call render() to update the table with saved scores
                  render();
                  broadcast();

                  // Wait a moment for user to see final scores, then reset
                  setTimeout(() => {
                    state = defaultState();
                    render();
                    broadcast();
                  }, 1500);
                }
                break;
              case "overtime":
                state.quarter = 5;
                state.period_seconds = 300;
                applyQuarterPossession(state.quarter);
                break;
              default:
                break;
            }
          }
          render();
          syncTimers();
          broadcast();
        });
      });

      // Keyboard Shortcuts
      document.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

        // Helper to click button by action
        const clickAction = (action) => {
          const btn = scoreboardRoot.querySelector(`[data-action="${action}"]`);
          if (btn) {
            btn.click();

            // Add visual feedback
            btn.classList.add('active:scale-95', 'transform', 'transition-all');
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => {
              btn.style.transform = '';
            }, 100);
          }
        };

        switch (e.code) {
          case "Space":
            e.preventDefault();
            clickAction("toggle-main");
            break;
          case "Digit1":
          case "Numpad1":
            clickAction("add-home-1");
            break;
          case "Digit2":
          case "Numpad2":
            clickAction("add-home-2");
            break;
          case "Digit3":
          case "Numpad3":
            clickAction("add-home-3");
            break;
          case "Digit8":
          case "Numpad8":
            clickAction("add-away-1");
            break;
          case "Digit9":
          case "Numpad9":
            clickAction("add-away-2");
            break;
          case "Digit0":
          case "Numpad0":
            clickAction("add-away-3");
            break;
          case "KeyZ":
            clickAction("reset-shot-14");
            break;
          case "KeyX":
            clickAction("reset-shot-24");
            break;
          case "KeyC":
            clickAction("toggle-shot");
            break;
        }
      });
    };

    const initDetailPanelSort = () => {
      if (role !== "control" || typeof Sortable === "undefined") return;

      try {
        const panel = scoreboardRoot.querySelector("[data-detail-sort-container]");
        if (!panel || panel.dataset.sortableInitialized === "true") return;

        const cards = Array.from(panel.querySelectorAll("[data-detail-sort-item]"));
        if (cards.length < 2) return;

        const storageKey = `scoreboard:detail-order:${matchId}`;
        const readSavedOrder = () => {
          try {
            const raw = window.localStorage.getItem(storageKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch (error) {
            console.warn("상세 패널 순서 복원 실패:", error);
            return [];
          }
        };

        const saveCurrentOrder = () => {
          try {
            const order = Array.from(panel.querySelectorAll("[data-detail-sort-item]"))
              .map((item) => item.dataset.detailSortKey)
              .filter(Boolean);
            window.localStorage.setItem(storageKey, JSON.stringify(order));
          } catch (error) {
            console.warn("상세 패널 순서 저장 실패:", error);
          }
        };

        const savedOrder = readSavedOrder();
        if (savedOrder.length > 0) {
          const cardMap = new Map(cards.map((card) => [card.dataset.detailSortKey, card]));
          savedOrder.forEach((key) => {
            const card = cardMap.get(key);
            if (card) panel.appendChild(card);
          });
        }

        new Sortable(panel, {
          animation: 180,
          draggable: "[data-detail-sort-item]",
          handle: "[data-detail-drag-handle]",
          ghostClass: "opacity-60",
          chosenClass: "ring-2",
          dragClass: "cursor-grabbing",
          onEnd: saveCurrentOrder
        });

        panel.dataset.sortableInitialized = "true";
      } catch (error) {
        console.warn("상세 패널 드래그 초기화 실패:", error);
      }
    };


    const ensureState = () => {
      if (!state) {
        state = defaultState();
      } else {
        state = normalizeState(state);
      }
      render();
      syncTimers();
    };

    ensureState();
    attachControlHandlers();

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ command: "subscribe", identifier }));
    });

    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "ping" || data.type === "welcome") return;
      if (data.type === "confirm_subscription") {
        if (role === "control") {
          state = normalizeState(state || defaultState());
          render();
          broadcast();
        }
        return;
      }
      if (data.message?.type === "state") {
        state = normalizeState(data.message.payload);
        render();
        syncTimers();
      }
    });

    socket.addEventListener("close", () => {
      ensureState();
    });
    const fullscreenBtn = document.getElementById("fullscreen-toggle");
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener("click", () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch((e) => {
            console.error(`Error attempting to enable fullscreen mode: ${e.message} (${e.name})`);
          });
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          }
        }
      });
    }

    // 상세 패널 정렬 기능은 실패해도 점수판 실시간 동기화에 영향 주지 않도록 마지막에 초기화
    initDetailPanelSort();
  }
});

// ==========================================
// 팀 멤버 드래그 앤 드롭 (SortableJS)
// ==========================================
const initDragAndDrop = () => {

  // SortableJS가 로드되었는지 확인
  if (typeof Sortable === 'undefined') {
    // 혹시 CDN 로드가 늦어질 수 있으므로 0.5초 뒤 한 번 더 시도
    setTimeout(() => {
      if (typeof Sortable !== 'undefined') {
        initDragAndDrop();
      } else {
        console.error("Sortable failed to load");
      }
    }, 500);
    return;
  }

  const dragContainers = document.querySelectorAll('[data-team-id]');

  if (dragContainers.length === 0) return;

  // 이미 Sortable이 적용된 경우 중복 적용 방지 (Sortable 객체가 expando 속성으로 저장되지만 명시적으로 체크)
  // 간단히는 기존 인스턴스 파괴 후 재생성하거나, 클래스로 마킹
  dragContainers.forEach(container => {
    if (container.classList.contains('sortable-initialized')) {
      return;
    }

    new Sortable(container, {
      group: 'shared', // 팀 간 이동 허용
      animation: 150,
      cursor: 'move',
      delay: 0,
      touchStartThreshold: 0,
      onEnd: async function (evt) {
        const { item, to, from } = evt;

        // 이동하지 않았거나 같은 팀 내 이동인 경우 무시
        if (to === from) return;

        const memberId = item.dataset.id;
        const targetTeamId = to.dataset.teamId;


        // 매치 ID 찾기
        const matchContainer = document.querySelector('[data-match-drag-match-id-value]');
        const matchId = matchContainer ? matchContainer.dataset.matchDragMatchIdValue : null;

        if (!matchId) {
          console.error("Match ID not found");
          alert("오류: Match ID를 찾을 수 없습니다.");
          return;
        }

        const clubId = window.location.pathname.match(/\/clubs\/(\d+)/)[1];
        const url = `/clubs/${clubId}/matches/${matchId}/move_member`;
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

        try {
          const response = await fetch(url, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({
              member_id: memberId,
              target_team_id: targetTeamId
            })
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || `Server Error: ${response.status}`);
          }

          if (data.success) {
;
            // 통계 갱신을 위해 리로드
            window.location.reload();
          } else {
            throw new Error(data.error || "Unknown error");
          }
        } catch (error) {
          console.error("Move failed:", error);
          alert(`멤버 이동 실패: ${error.message}\n페이지를 새로고침합니다.`);
          window.location.reload();
        }
      }
    });

    container.classList.add('sortable-initialized');
  });
};

document.addEventListener("turbo:load", initDragAndDrop);
document.addEventListener("DOMContentLoaded", initDragAndDrop);

// Sidebar Toggle Logic
(function () {
  function initSidebar() {
    const toggleBtn = document.getElementById("sidebar-toggle");
    const drawer = document.querySelector(".drawer.lg\\:drawer-open") || document.querySelector(".drawer");

    if (!toggleBtn || !drawer) return;

    // Prevent duplicate listeners
    if (toggleBtn.dataset.listenerAttached === "true") return;
    toggleBtn.dataset.listenerAttached = "true";

    // 1. Restore State
    const savedState = localStorage.getItem("sidebarOpen");
    // Default is open (lg:drawer-open present)
    // If saved as 'false', remove class
    if (savedState === "false") {
      drawer.classList.remove("lg:drawer-open");
    } else {
      // If default HTML doesn't have it but we want it open, add it
      // But typically HTML has it by default
      if (!drawer.classList.contains("lg:drawer-open")) {
        drawer.classList.add("lg:drawer-open");
      }
    }

    // 2. Toggle Handler
    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault(); // Prevent form submission if inside form (though it's type button ideally)
      drawer.classList.toggle("lg:drawer-open");

      const isOpen = drawer.classList.contains("lg:drawer-open");
      localStorage.setItem("sidebarOpen", isOpen);
    });
  }

  document.addEventListener("turbo:load", initSidebar);
  document.addEventListener("DOMContentLoaded", initSidebar);
})();
