document.addEventListener("DOMContentLoaded", () => {
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

  const list = document.querySelector("[data-sortable-list]");
  if (list) {
    let dragging = null;

    const attachDragHandlers = () => {
      list.querySelectorAll(".member-item").forEach((item) => {
        item.addEventListener("dragstart", (event) => {
          dragging = item;
          item.classList.add("dragging");
          event.dataTransfer.effectAllowed = "move";
        });

        item.addEventListener("dragend", () => {
          if (dragging) {
            dragging.classList.remove("dragging");
            dragging = null;
            persistOrder();
          }
        });
      });
    };

    list.addEventListener("dragover", (event) => {
      event.preventDefault();
      const afterElement = getDragAfterElement(list, event.clientY);
      if (!dragging) return;

      if (afterElement == null) {
        list.appendChild(dragging);
      } else {
        list.insertBefore(dragging, afterElement);
      }
    });

    const getDragAfterElement = (container, y) => {
      const elements = [...container.querySelectorAll(".member-item:not(.dragging)")];
      return elements.reduce(
        (closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = y - box.top - box.height / 2;
          if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
          }
          return closest;
        },
        { offset: Number.NEGATIVE_INFINITY, element: null }
      ).element;
    };

    const persistOrder = () => {
      const url = list.dataset.reorderUrl;
      if (!url) return;

      const ids = Array.from(list.querySelectorAll("[data-member-id]")).map(
        (item) => item.dataset.memberId
      );
      const token = document.querySelector('meta[name="csrf-token"]')?.content;

      fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
          Accept: "application/json",
        },
        body: JSON.stringify({ member_ids: ids }),
      });
    };

    attachDragHandlers();
  }

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
      possession: 'home' // 'home' or 'away'
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
      return currentQuarter() >= 3;
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
            <span style="color: ${COLORS.text}; font-size: 14px; font-weight: 600; font-family: Inter, sans-serif;">TEAM ${home.label}</span>
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
            <span style="color: ${COLORS.text}; font-size: 14px; font-weight: 600; font-family: Inter, sans-serif;">TEAM ${away.label}</span>
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
            <span style="color: white; font-size: 22px; font-weight: 800; font-family: Inter, sans-serif;">${home.label}</span>
          </div>
          <span style="color: #999999; font-size: 11px; font-weight: 500; letter-spacing: 2px; font-family: Inter, sans-serif;">HOME TEAM</span>
          <span style="color: white; font-size: 18px; font-weight: 700; letter-spacing: 1px; font-family: Inter, sans-serif;">TEAM ${home.label}</span>
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
            <span style="color: white; font-size: 22px; font-weight: 800; font-family: Inter, sans-serif;">${away.label}</span>
          </div>
          <span style="color: #999999; font-size: 11px; font-weight: 500; letter-spacing: 2px; font-family: Inter, sans-serif;">AWAY TEAM</span>
          <span style="color: white; font-size: 18px; font-weight: 700; letter-spacing: 1px; font-family: Inter, sans-serif;">TEAM ${away.label}</span>
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
      setText("[data-preview-matchup]", `팀 ${home.label} vs 팀 ${away.label}`);
      setText("[data-preview-quarter]", `${state.quarter}Q`);
      setText("[data-preview-timer]", formatTime(state.period_seconds));
      setText("[data-preview-home]", home.score);
      setText("[data-preview-away]", away.score);
      setText("[data-preview-shot]", state.shot_seconds);
    };

    const render = () => {
      const [home, away] = currentMatchup();

      // Quarter and timers
      setText("[data-scoreboard-quarter]", state.quarter);
      setText("[data-scoreboard-timer]", formatTime(state.period_seconds));
      setText("[data-scoreboard-shot]", state.shot_seconds);

      // Team names (for new sports display)
      setText("[data-team-name-left]", `TEAM ${home.label}`);
      setText("[data-team-name-right]", `TEAM ${away.label}`);

      // Scores (new display)
      setText("[data-score-left]", home.score);
      setText("[data-score-right]", away.score);

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

        // Show/hide TEAM FOUL indicator based on foul count
        const isLeft = containerSelector.includes('left');
        const indicatorSelector = isLeft ? '[data-left-team-foul-indicator]' : '[data-right-team-foul-indicator]';
        const indicator = scoreboardRoot.querySelector(indicatorSelector);

        if (indicator) {
          if (foulCount >= 5) {
            indicator.classList.remove('hidden');
          } else {
            indicator.classList.add('hidden');
          }
        }
      };

      updateFoulCircles('[data-foul-indicators-left]', state.home_fouls || 0);
      updateFoulCircles('[data-foul-indicators-right]', state.away_fouls || 0);

      // Possession arrows (new display)
      const arrowLeft = scoreboardRoot.querySelector(".possession-arrow-left");
      const arrowRight = scoreboardRoot.querySelector(".possession-arrow-right");
      if (arrowLeft && arrowRight) {
        if (state.possession === 'home') {
          arrowLeft.classList.remove('hidden');
          arrowRight.classList.add('hidden');
        } else if (state.possession === 'away') {
          arrowLeft.classList.add('hidden');
          arrowRight.classList.remove('hidden');
        } else {
          arrowLeft.classList.add('hidden');
          arrowRight.classList.add('hidden');
        }
      }

      // Legacy display elements
      setText("[data-scoreboard-matchup]", `팀 ${home.label} vs 팀 ${away.label}`);
      setText("[data-home-name]", `TEAM ${home.label}`);
      setText("[data-away-name]", `TEAM ${away.label}`);
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

      const nextQuarterBtn = scoreboardRoot.querySelector('[data-action="next-quarter"]');
      if (nextQuarterBtn) {
        // Step 11 (Index 11) is the 12th game (Final game).
        if (state.rotation_step === 11) {
          nextQuarterBtn.textContent = "END GAME";
          nextQuarterBtn.classList.add("text-red-600", "font-bold");
        } else {
          nextQuarterBtn.textContent = "NEXT QUARTER";
          nextQuarterBtn.classList.remove("text-red-600", "font-bold");
        }
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

      const renderRoster = (homeParams, awayParams) => {
        const rosterEl = scoreboardRoot.querySelector("[data-roster-display]");
        if (!rosterEl) return;

        // Find actual team objects from state.teams using IDs to fetch members
        // We need to match by ID because homeParams/awayParams are derived objects
        const realHome = state.teams.find(t => t.id === homeParams.id);
        const realAway = state.teams.find(t => t.id === awayParams.id);

        const getMembersHtml = (team, isHome) => {
          if (!team || !team.members || team.members.length === 0) {
            return `<div class="text-gray-400 text-sm italic">No members</div>`;
          }
          // Sort by back_number if available, else name
          const sortedMembers = [...team.members].sort((a, b) => (a.back_number || 999) - (b.back_number || 999));

          return `
              <div class="flex flex-col gap-2 ${isHome ? 'items-start' : 'items-end'}">
                 <h4 class="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">${team.label} ROSTER</h4>
                 <div class="grid grid-cols-2 gap-x-4 gap-y-1">
                    ${sortedMembers.map(m => `
                      <div class="flex items-center gap-2 text-sm text-gray-700">
                        <span class="font-mono font-bold text-gray-400 w-6 text-right">${m.back_number || '-'}</span>
                        <span class="font-bold">${m.name}</span>
                      </div>
                    `).join('')}
                 </div>
              </div>
            `;
        };

        rosterEl.innerHTML = `
            ${getMembersHtml(realHome, true)}
            <div class="w-px bg-gray-200 self-stretch mx-4"></div>
            ${getMembersHtml(realAway, false)}
         `;
      };

      // Call Roster Render
      renderRoster(home, away);

      const renderQuarterTable = () => {
        const tableContainer = scoreboardRoot.querySelector("[data-quarter-table]");
        if (!tableContainer) return;

        if (state.teams.length < 3) {
          tableContainer.innerHTML = "<p class='text-center text-gray-500'>Need 3 teams for rotation table.</p>";
          return;
        }

        const pairs = [[0, 1], [1, 2], [2, 0]];
        const pairNames = ["Team A vs B", "Team B vs C", "Team C vs A"]; // Fallback or dynamic icons

        let html = `
           <table class="w-full text-center text-base border-collapse">
             <thead>
               <tr class="bg-gray-100 border-b border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-sm">
                 <th class="p-4 text-left">Matchup</th>
                 <th class="p-4 w-20">1Q</th>
                 <th class="p-4 w-20">2Q</th>
                 <th class="p-4 w-20">3Q</th>
                 <th class="p-4 w-20">4Q</th>
                 <th class="p-4 w-24">Final</th>
               </tr>
             </thead>
             <tbody class="divide-y divide-gray-200">
         `;

        pairs.forEach((pair, pairIdx) => {
          const t1 = state.teams[pair[0]];
          const t2 = state.teams[pair[1]];
          const scores = state.quarter_history[pairIdx] || {};

          // Check if this is the currently active matchup
          // Active if state.rotation_step % 3 === pairIdx
          // If active, maybe show current score in the "current quarter" slot?
          // The user asked for "update when quarter ends", but usually showing live progress is nice.
          // But strict reading: "update when quarter ends".
          // Let's stick to saved history.

          const getScoreCell = (q) => {
            if (scores[q]) {
              return `<div class="flex flex-col leading-none gap-1">
                             <span class="font-bold text-gray-900 text-lg">${scores[q].team1}</span>
                             <span class="font-bold text-gray-500 text-lg">${scores[q].team2}</span>
                           </div>`;
            }
            return `<span class="text-gray-300 text-lg">-</span>`;
          };

          // Final Result: Only if Q4 is done? Or latest?
          // Let's show empty for now unless game over? Or just show empty column as in image (it was empty).

          html += `
               <tr class="hover:bg-gray-50 transition-colors">
                 <td class="p-4 text-left">
                   <div class="flex flex-col gap-2">
                     <div class="flex items-center gap-2">
                       <span class="text-xl">${t1.icon || '🛡️'}</span>
                       <span class="font-bold text-gray-900 text-base">${t1.label}</span>
                     </div>
                     <div class="flex items-center gap-2">
                       <span class="text-xl">${t2.icon || '🛡️'}</span>
                       <span class="font-bold text-gray-500 text-base">${t2.label}</span>
                     </div>
                   </div>
                 </td>
                 <td class="p-4 bg-white/50">${getScoreCell(1)}</td>
                 <td class="p-4 bg-gray-50/50">${getScoreCell(2)}</td>
                 <td class="p-4 bg-white/50">${getScoreCell(3)}</td>
                 <td class="p-4 bg-gray-50/50">${getScoreCell(4)}</td>
                 <td class="p-4 text-gray-400"></td> 
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

        if (indicatorEl) {
          if (count >= 5) {
            indicatorEl.classList.remove("hidden");
          } else {
            indicatorEl.classList.add("hidden");
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
        console.log("🎵 Global AudioContext initialized:", globalAudioContext.state);

        // Resume if suspended
        if (globalAudioContext.state === 'suspended') {
          globalAudioContext.resume().then(() => {
            console.log("✅ AudioContext resumed on init");
          });
        }
      } catch (e) {
        console.error("Failed to init AudioContext:", e);
      }
    };

    const playBuzzer = () => {
      console.log("🔔 playBuzzer called! soundEnabled:", soundEnabled);
      if (!soundEnabled) return;

      // Initialize on first call
      if (!globalAudioContext) {
        initAudioContext();
      }

      try {
        console.log("AudioContext state:", globalAudioContext?.state);

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
        console.log("✅ Buzzer started!");
        setTimeout(() => {
          oscillator.stop();
          console.log("✅ Buzzer stopped!");
        }, 1500);
      } catch (error) {
        console.error("❌ Buzzer error:", error);
      }
    };

    const startMainTimer = () => {
      if (mainTimer) return;
      mainTimer = setInterval(() => {
        if (state.period_seconds > 0) {
          if (state.period_seconds <= 5) {
            speak(state.period_seconds);
          }
          state.period_seconds -= 1;
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

          console.log("⏱️ Shot clock:", state.shot_seconds);

          // Then speak if <= 5
          if (state.shot_seconds <= 5 && state.shot_seconds > 0) {
            speak(state.shot_seconds);
          }

          // Buzzer when reaching 0
          if (state.shot_seconds === 0) {
            console.log("🔔 Shot clock reached 0! Playing buzzer...");
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
      console.log("✅ Voice initialized!");
    };

    const speakScore = () => {
      console.log("🔊 speakScore called, role:", role);

      // Only speak if speech synthesis is supported and acting as control
      if (!window.speechSynthesis) {
        console.warn("Speech synthesis not supported");
        return;
      }

      if (role !== "control") {
        console.log("Not in control role, skipping speech");
        return;
      }

      // Reset speech synthesis to prevent stuck state
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      // Initialize voice on first call (browser autoplay policy workaround)
      initializeVoice();

      const [visualHome, visualAway] = currentMatchup();
      console.log("Current matchup:", visualHome.label, "vs", visualAway.label);

      // visualHome and visualAway already have the score values from currentMatchup
      const homeScore = visualHome.score;
      const awayScore = visualAway.score;

      console.log("Scores to announce:", homeScore, "vs", awayScore);

      // Format: "75 to 72" (Korean style: 75 대 72)
      const text = `${homeScore} 대 ${awayScore}`;
      console.log("Speaking:", text);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.0;
      utterance.volume = 1.0;
      utterance.pitch = 1.0;

      // Get available voices and select Korean voice if available
      const voices = window.speechSynthesis.getVoices();
      console.log("Available voices:", voices.length);

      const koreanVoice = voices.find(voice => voice.lang.startsWith('ko'));
      if (koreanVoice) {
        utterance.voice = koreanVoice;
        console.log("Using Korean voice:", koreanVoice.name);
      } else {
        console.warn("No Korean voice found, using default");
      }

      utterance.onstart = () => {
        console.log("✅ Speech STARTED!");
      };

      utterance.onerror = (event) => {
        console.error("❌ Speech error:", event.error, event);
      };

      utterance.onend = () => {
        console.log("✅ Speech ended successfully");
      };

      console.log("Calling speechSynthesis.speak()...");
      window.speechSynthesis.speak(utterance);
      console.log("speak() called, speaking state:", window.speechSynthesis.speaking);
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
                state.shot_running = state.running;
                break;
              case "reset-shot-14":
                state.shot_seconds = 14;
                state.shot_running = state.running;
                break;
              case "next-quarter":
                // Check if we are at the end of the game
                // Total steps = 12 (0 to 11). Step 11 is the last game.
                if (state.rotation_step >= 11) {
                  // Game Over logic
                  // Maybe show an alert or just stop?
                  // User asked to "Stop".
                  // We can just return or toggle a game over state.
                  // For now, let's just not advance.
                  alert("GAME OVER! All quarters completed.");
                  return;
                }

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
                // global rotation steps 0..11.
                // Step 0 = Q1 of Pair 0. Step 1 = Q1 of Pair 1. Step 2 = Q1 of Pair 2.
                // Step 3 = Q2 of Pair 0...
                const finishedQuarter = Math.floor(state.rotation_step / 3) + 1;

                if (!state.quarter_history[finishedPairIdx]) {
                  state.quarter_history[finishedPairIdx] = {};
                }
                state.quarter_history[finishedPairIdx][finishedQuarter] = {
                  team1: state.teams[p1].score,
                  team2: state.teams[p2].score
                };

                // ADVANCE:
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
              case "toggle-shortcuts":
                const panel = document.querySelector("[data-shortcuts-panel]");
                if (panel) {
                  if (panel.classList.contains("hidden")) {
                    panel.classList.remove("hidden");
                  } else {
                    panel.classList.add("hidden");
                  }
                }
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
          const btn = document.querySelector(`[data-action="${action}"]`);
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
