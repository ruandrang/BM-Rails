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
      period_seconds: 600,
      shot_seconds: 24,
      running: false,
      shot_running: false,
      matchup_index: 0,
      home_fouls: 0,
      away_fouls: 0,
      teams: defaultTeams().map((team) => ({ ...team, score: 0 })),
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

    const currentMatchup = () => {
      const pairs = matchupPairs();
      const [homeIdx, awayIdx] = pairs[state.matchup_index % pairs.length];
      return [state.teams[homeIdx], state.teams[awayIdx]];
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
      setText("[data-scoreboard-quarter]", `${state.quarter}Q`);
      setText("[data-scoreboard-timer]", formatTime(state.period_seconds));
      setText("[data-scoreboard-shot]", state.shot_seconds);
      setText("[data-scoreboard-matchup]", `팀 ${home.label} vs 팀 ${away.label}`);
      setText("[data-home-fouls]", state.home_fouls || 0);
      setText("[data-away-fouls]", state.away_fouls || 0);

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

    const playBuzzer = () => {
      if (!soundEnabled) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = 440;
        gain.gain.value = 0.15;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        setTimeout(() => {
          oscillator.stop();
          context.close();
        }, 350);
      } catch (error) {
        // ignore audio errors
      }
    };

    const startMainTimer = () => {
      if (mainTimer) return;
      mainTimer = setInterval(() => {
        if (state.period_seconds > 0) {
          state.period_seconds -= 1;
        } else {
          state.running = false;
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
          state.shot_seconds -= 1;
        } else {
          state.shot_running = false;
          stopShotTimer();
          playBuzzer();
        }
        render();
        broadcast();
      }, 1000);
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

    const attachControlHandlers = () => {
      if (role !== "control") return;
      scoreboardRoot.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const action = btn.dataset.action;
          if (["add-home", "add-home-1", "add-home-2", "add-home-3",
            "sub-home",
            "add-away", "add-away-1", "add-away-2", "add-away-3",
            "sub-away"].includes(action)) {
            handleTeamAction(action);
          } else {
            switch (action) {
              case "toggle-main":
                state.running = !state.running;
                break;
              case "pause-main":
                state.running = false;
                break;
              case "reset-main":
                state.period_seconds = 600;
                state.running = false;
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
                state.quarter = Math.min(4, state.quarter + 1);
                break;
              case "prev-quarter":
                state.quarter = Math.max(1, state.quarter - 1);
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
              case "new-game":
                state = defaultState();
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
  }
});
