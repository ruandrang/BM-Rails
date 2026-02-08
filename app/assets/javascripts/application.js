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

  document.addEventListener("DOMContentLoaded", function() {
    const sortButtons = document.querySelectorAll("[data-sort]");
    const list = document.querySelector(listSelector);
    if (!list) return;

    const sortState = {};

    sortButtons.forEach(btn => {
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
            aVal = parseInt(aVal) || 0;
            bVal = parseInt(bVal) || 0;
          } else if (sortKey === "winrate") {
            aVal = parseFloat(aVal) || 0.0;
            bVal = parseFloat(bVal) || 0.0;
          }

          if (aVal === bVal) return 0;
          const modifier = sortState[sortKey] === "asc" ? 1 : -1;
          return aVal > bVal ? modifier : -modifier;
        });

        items.forEach(item => list.appendChild(item));

        sortButtons.forEach(b => {
          b.classList.remove("btn-active", "btn-primary", "text-primary-content");
          const text = b.textContent.trim().split(" ")[0];
          b.innerHTML = text;
        });

        this.classList.add("btn-active", "btn-primary", "text-primary-content");
        const arrow = sortState[sortKey] === "asc" ? "↑" : "↓";
        this.innerHTML += ` <span class="ml-1">${arrow}</span>`;
      });
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

    const cableUrl =
      (window.location.protocol === "https:" ? "wss://" : "ws://") +
      window.location.host +
      "/cable";
    const socket = new WebSocket(cableUrl);
    const identifier = JSON.stringify({ channel: "ScoreboardChannel", match_id: matchId });
    let state = null;
    let mainTimer = null;
    let shotTimer = null;
    let soundEnabled = true;

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

    const defaultState = () => ({
      quarter: 1,
      period_seconds: 480,
      shot_seconds: 24,
      running: false,
      shot_running: false,
      matchup_index: 0,
      rotation_step: 0, // 0-11 (3 matchups * 4 quarters)
      home_fouls: 0,
      away_fouls: 0,
      teams: defaultTeams().map((team) => ({ ...team, score: 0 })),
      // Store scores for the 3 pairings: [A-B, B-C, C-A]
      matchup_scores: [
        { team1: 0, team2: 0 },
        { team1: 0, team2: 0 },
        { team1: 0, team2: 0 }
      ],
      quarter_history: {}, // { pairIdx: { quarterNum: { team1: score, team2: score } } }
      possession: 'away', // 'home' or 'away'
      manual_swap: false
    });

    const formatTime = (seconds) => {
      const min = Math.floor(seconds / 60);
      const sec = Math.max(seconds % 60, 0);
      return `${min}:${sec.toString().padStart(2, "0")}`;
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

    const currentMatchupIndex = () => {
      return state.rotation_step % 3;
    };

    const currentQuarter = () => {
      return Math.floor(state.rotation_step / 3) + 1;
    };

    const isSidesSwapped = () => {
      // Automatic swap for Q3/Q4, or manual swap override
      const autoSwap = currentQuarter() >= 3;
      return state.manual_swap ? !autoSwap : autoSwap;
    };

    const currentMatchup = () => {
      // 3 Teams: [A, B, C]
      // Pairs: 0:[0,1] (A-B), 1:[1,2] (B-C), 2:[2,0] (C-A)
      const pairs = [
        [0, 1],
        [1, 2],
        [2, 0]
      ];

      const pairIdx = currentMatchupIndex();
      let [idx1, idx2] = pairs[pairIdx];

      // Logic:
      // Q1/Q2: idx1 vs idx2 (e.g., A vs B)
      // Q3/Q4: idx2 vs idx1 (e.g., B vs A) -> Swapped

      if (isSidesSwapped()) {
        return [state.teams[idx2], state.teams[idx1]]; // Visual Home is Team 2, Visual Away is Team 1
      }
      return [state.teams[idx1], state.teams[idx2]]; // Visual Home is Team 1, Visual Away is Team 2
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
          const pairs = matchupPairs();
          const [homeIdx, awayIdx] = pairs[state.matchup_index % pairs.length];

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

      if (state.possession === 'home') {
        showArrows(arrowsLeft, true);
        showArrows(arrowsRight, false);
      } else if (state.possession === 'away') {
        showArrows(arrowsLeft, false);
        showArrows(arrowsRight, true);
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
        homeIconEl.textContent = home.icon || "●";
        homeIconEl.style.color = home.color || "#333";
      }

      const awayIconEl = scoreboardRoot.querySelector("[data-away-icon]");
      if (awayIconEl) {
        awayIconEl.textContent = away.icon || "●";
        awayIconEl.style.color = away.color || "#333";
      }
      setText("[data-home-fouls]", state.home_fouls || 0);
      setText("[data-away-fouls]", state.away_fouls || 0);

      // 12쿼터 종료 시 NEXT QUARTER 버튼 숨기기 및 마지막 단계 텍스트 변경
      const nextQuarterBtn = scoreboardRoot.querySelector('[data-action="next-quarter"]');
      if (nextQuarterBtn) {
        if (state.rotation_step === 11) {
          nextQuarterBtn.textContent = "점수 확정";
          nextQuarterBtn.classList.add("bg-red-600", "hover:bg-red-700"); // 스타일 강조 (선택사항)
          nextQuarterBtn.style.display = '';
        } else if (state.rotation_step >= 12) {
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
        toggleShotBtn.textContent = state.shot_running ? "샷클락 멈춤" : "샷클락 시작";
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

        if (state.teams.length < 3) {
          tableContainer.innerHTML = "<p class='text-center text-gray-500'>로테이션 표를 위해 3팀이 필요합니다.</p>";
          return;
        }

        const pairs = [[0, 1], [1, 2], [2, 0]];
        const pairNames = ["Team A vs B", "Team B vs C", "Team C vs A"]; // Fallback or dynamic icons

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
             <tbody class="divide-y divide-gray-200">
         `;

        const activeMatchupIdx = state.rotation_step % 3;
        const currentQ = state.quarter;

        pairs.forEach((pair, pairIdx) => {
          const t1 = state.teams[pair[0]];
          const t2 = state.teams[pair[1]];
          const scores = state.quarter_history[pairIdx] || {};
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

          html += `
               <tr class="${isActiveRow ? 'bg-gray-100/80 shadow-inner' : 'hover:bg-gray-50'} transition-all duration-300">
                 <td class="p-4 text-left border-l-4 ${isActiveRow ? 'border-blue-500' : 'border-transparent'}">
                   <div class="flex flex-col gap-2">
                     <div class="flex items-center gap-2">
                       <span class="text-xl">${escapeHtml(t1.icon) || '🛡️'}</span>
                       <span class="font-bold text-gray-900 text-base">${escapeHtml(t1.label)}</span>
                     </div>
                     <div class="flex items-center gap-2">
                       <span class="text-xl">${escapeHtml(t2.icon) || '🛡️'}</span>
                       <span class="font-bold text-gray-500 text-base">${escapeHtml(t2.label)}</span>
                     </div>
                   </div>
                 </td>
                 <td class="${getCellClass(1)}">${getScoreCell(1)}</td>
                 <td class="${getCellClass(2)}">${getScoreCell(2)}</td>
                 <td class="${getCellClass(3)}">${getScoreCell(3)}</td>
                 <td class="${getCellClass(4)}">${getScoreCell(4)}</td>
                 <td class="p-4 text-gray-400 font-bold"></td> 
               </tr>
             `;
        });

        html += `</tbody></table>`;
        tableContainer.innerHTML = html;
      };

      renderQuarterTable();

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
          shotToggleBtn.textContent = "STOP";
        } else {
          shotToggleBtn.classList.remove("btn-active");
          shotToggleBtn.textContent = "ALIVE";
        }
      }

      renderPreview();
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
      if (!soundEnabled) return;

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
      if ('speechSynthesis' in window) {
        // Cancel any previous speech to prevent duplicates
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ko-KR';
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      }
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
      if (voiceInitialized) return;

      // Play a silent utterance to activate speech synthesis
      const silent = new SpeechSynthesisUtterance('');
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
      voiceInitialized = true;
    };

    const speakScore = () => {

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
                state.period_seconds = 480;
                state.running = false;
                state.shot_running = false;
                break;
              case "reset-all":
                if (confirm("정말로 모든 점수와 시간을 초기화하시겠습니까?")) {
                  state.period_seconds = 480;
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
              case "next-quarter":
                // 1. Save current scores to matchup_scores
                const currentPairIdx = currentMatchupIndex();
                const [team1, team2] = currentMatchup();
                // Ensure we save to the correct team slot based on who team1/team2 actually are
                // team1 is Visual Home, team2 is Visual Away

                // We need to map back to the 'matchup_scores' structure
                // matchup_scores[0] is A vs B
                // matchup_scores[1] is B vs C
                // matchup_scores[2] is C vs A

                // Let's rely on state.teams because that's what we modify in handleTeamAction
                // But wait, handleTeamAction modifies state.teams DIRECTLY based on ID.
                // So state.teams ALWAYS holds the latest scores for everyone.

                // The issue is: When we switch to B vs C, we want A's score to be "hidden" or "reset" contextually?
                // No, the user wants: "Save the score of A and B". "Then B and C start at 0:0 (or saved score)."
                // The `state.teams` array holds global state.
                // WE MUST NOT RESET state.teams scores globally if we want them to persist?
                // actually, the requirement is: "B and C start 0:0 in Q1".
                // This implies we DO need to reset `state.teams` scores when entering a new matchup, 
                // loading from `matchup_scores`.

                // SAVE:
                // We need to identify which pairing we just finished.
                const finishedPairIdx = state.rotation_step % 3;
                const pairs = [[0, 1], [1, 2], [2, 0]];
                const [p1, p2] = pairs[finishedPairIdx];

                state.matchup_scores[finishedPairIdx] = {
                  team1: state.teams[p1].score,
                  team2: state.teams[p2].score
                };

                // SAVE Quarter History
                // Calculate which quarter just finished (1-based)
                const finishedQuarter = Math.floor(state.rotation_step / 3) + 1;

                if (!state.quarter_history[finishedPairIdx]) {
                  state.quarter_history[finishedPairIdx] = {};
                }
                state.quarter_history[finishedPairIdx][finishedQuarter] = {
                  team1: state.teams[p1].score,
                  team2: state.teams[p2].score
                };

                // 서버로 쿼터 점수 전송
                const saveQuarterScore = async () => {
                  const matchId = scoreboardRoot.dataset.matchId;
                  const clubId = window.location.pathname.match(/\/clubs\/(\d+)/)[1];
                  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

                  try {
                    await fetch(`/clubs/${clubId}/matches/${matchId}/save_quarter_scores`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                      },
                      body: JSON.stringify({
                        home_team_id: teams[p1].id,
                        away_team_id: teams[p2].id,
                        quarter: finishedQuarter,
                        home_score: state.teams[p1].score,
                        away_score: state.teams[p2].score
                      })
                    });

                    if (state.rotation_step === 11) {
                      // alert("모든 경기 점수가 저장되었습니다.");
                      // window.location.reload(); 
                      // 점수 확정 후 자동 리로드를 하지 않고, 사용자가 하단의 '경기 종료' 버튼을 누를 수 있도록 대기합니다.
                      // 이미 render()를 막아두었으므로 화면 점수가 0으로 초기화되는 문제는 발생하지 않습니다.
                    }
                  } catch (error) {
                    console.error('쿼터 점수 저장 중 오류:', error);
                  }
                };

                saveQuarterScore();

                // ADVANCE:
                // 마지막 단계(11)였다면 12로 증가시키지 말고 멈춤 (화면 초기화 방지)
                if (state.rotation_step === 11) {
                  const nextQuarterBtn = scoreboardRoot.querySelector('[data-action="next-quarter"]');
                  if (nextQuarterBtn) {
                    nextQuarterBtn.textContent = "저장 완료";
                    nextQuarterBtn.disabled = true;
                    nextQuarterBtn.classList.add("opacity-50", "cursor-not-allowed");
                  }
                  // state.rotation_step을 증가시키지 않음 -> render() 호출 안 함 -> 점수 유지됨
                  return;
                }

                state.rotation_step += 1;

                // LOAD:
                const nextPairIdx = state.rotation_step % 3;
                const [n1, n2] = pairs[nextPairIdx];

                // Load saved scores (or 0 if first time)
                // We must update state.teams directly for the UI to reflect
                state.teams[n1].score = state.matchup_scores[nextPairIdx].team1;
                state.teams[n2].score = state.matchup_scores[nextPairIdx].team2;

                // Reset third team's score to 0 just to be clean? (Optional, but good for UI)
                // usage: pairs has 3 indices total. find the one not in [n1, n2]
                const allIdx = [0, 1, 2];
                const thirdIdx = allIdx.find(i => i !== n1 && i !== n2);
                state.teams[thirdIdx].score = 0;

                // Reset Timers
                state.quarter = currentQuarter();
                state.period_seconds = 480;
                state.shot_seconds = 24;
                state.running = false;
                state.shot_running = false;
                break;
              case "prev-quarter":
                // Previous quarter logic (Simplified reverse of next-quarter or just decrement quarter?)
                // For now, let's just decrement logic carefully if needed, or simple decrement quarter
                // Use simple decrement for now as full reverse logic is complex and rarely used perfectly
                state.quarter = Math.max(1, state.quarter - 1);
                // Ideally we should reverse rotation_step too, but user didn't explicitly ask for full undo support
                // Let's implement basic undo for rotation_step
                if (state.rotation_step > 0) {
                  // SAVE current (which matches nextPairIdx logic above)
                  const curPairIdx = state.rotation_step % 3;
                  const [c1, c2] = pairs[curPairIdx];
                  state.matchup_scores[curPairIdx] = { team1: state.teams[c1].score, team2: state.teams[c2].score };

                  state.rotation_step -= 1;

                  // LOAD prev
                  const prevPairIdx = state.rotation_step % 3;
                  const [pr1, pr2] = pairs[prevPairIdx];
                  state.teams[pr1].score = state.matchup_scores[prevPairIdx].team1;
                  state.teams[pr2].score = state.matchup_scores[prevPairIdx].team2;

                  state.quarter = currentQuarter();
                  state.period_seconds = 480;
                }
                break;
              case "next-matchup":
                state.matchup_index += 1;
                break;
              case "prev-matchup":
                state.matchup_index = Math.max(0, state.matchup_index - 1);
                break;
              case "toggle-sound":
                soundEnabled = !soundEnabled;
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
                state.possession = 'home';
                break;
              case "possession-away":
                state.possession = 'away';
                break;
              case "finish-game":
                // 경기 종료 - 현재 점수를 서버로 전송
                const saveGameScore = async () => {
                  const [home, away] = currentMatchup();
                  const pairs = matchupPairs();
                  const currentPairIdx = state.matchup_index % pairs.length;
                  const [homeIdx, awayIdx] = pairs[currentPairIdx];

                  // 현재 매치 ID
                  const matchId = scoreboardRoot.dataset.matchId;

                  // teams 정보를 기반으로 게임 찾기 (첫 번째 게임 사용)
                  // 실제로는 home_team과 away_team을 매칭해야 하지만, 
                  // 2팀 경기인 경우 게임이 하나뿐이므로 단순화
                  const clubId = window.location.pathname.match(/\/clubs\/(\d+)/)[1];

                  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

                  try {
                    const response = await fetch(`/clubs/${clubId}/matches/${matchId}/save_game_scores`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                      },
                      body: JSON.stringify({
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
                  const currentPairIdx = state.rotation_step % 3;
                  const pairs = [[0, 1], [1, 2], [2, 0]];
                  const [p1, p2] = pairs[currentPairIdx];
                  const currentQuarterNum = Math.floor(state.rotation_step / 3) + 1;

                  if (!state.quarter_history[currentPairIdx]) {
                    state.quarter_history[currentPairIdx] = {};
                  }
                  state.quarter_history[currentPairIdx][currentQuarterNum] = {
                    team1: state.teams[p1].score,
                    team2: state.teams[p2].score
                  };

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


    const ensureState = () => {
      if (!state) {
        state = defaultState();
        render();
        syncTimers();
      }
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
          state = state || defaultState();
          render();
          broadcast();
        }
        return;
      }
      if (data.message?.type === "state") {
        state = data.message.payload;
        if (!state.teams || state.teams.length === 0) {
          state = defaultState();
        }
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
