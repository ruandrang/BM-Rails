// 스코어보드 전광판 디스플레이 UI
// scoreboards/display 뷰의 공격방향 화살표, 파울 뱃지, 텍스트 크기 조절,
// 팀 색상 CSS 변수, 타임아웃 인디케이터, 연결 상태 오버레이를 담당한다.

// 이전 이벤트 리스너 정리용 (turbo:load 재초기화 시 중복 방지)
let displayAbortController = null;

// 팀 색상 → Display 점수 색상 매핑
const DISPLAY_SCORE_COLOR_MAP = {
  'White': '#E5E7EB',   // 흰색 팀은 밝은 회색 (배경과 구분)
  'Black': '#E5E7EB',   // 검은색 팀도 밝은 회색 (어두운 배경에서)
  'Red': '#EF4444',
  'Blue': '#3B82F6',
  'Yellow': '#FACC15',
  'Green': '#22C55E',
  'Pink': '#EC4899',
  'SkyBlue': '#38BDF8',
  'Brown': '#D97706',
  'Orange': '#F97316'
};

const getScoreColor = (colorName) => {
  return DISPLAY_SCORE_COLOR_MAP[colorName] || colorName || '#FF6B00';
};

const initScoreboardDisplayUI = () => {
  const arrowLeft = document.querySelector('.possession-arrow-left');
  const arrowRight = document.querySelector('.possession-arrow-right');

  // 전광판 페이지인지 확인
  if (!arrowLeft && !arrowRight && !document.querySelector('[data-size-indicator]')) {
    return;
  }

  // 이전 이벤트 리스너 해제
  if (displayAbortController) displayAbortController.abort();
  displayAbortController = new AbortController();

  // === 텍스트 사이즈 조절 ===
  const SCALE_MIN = 0.6;
  const SCALE_MAX = 1.4;
  const SCALE_STEP = 0.1;
  let currentScale = parseFloat(localStorage.getItem('scoreboard-display-scale') || '1');

  const sizeIndicator = document.querySelector('[data-size-indicator]');
  const decreaseBtn = document.getElementById('size-decrease-btn');
  const increaseBtn = document.getElementById('size-increase-btn');

  const updateScale = (newScale) => {
    currentScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, newScale));
    document.documentElement.style.setProperty('--display-scale', currentScale);
    if (sizeIndicator) {
      sizeIndicator.textContent = Math.round(currentScale * 100) + '%';
    }
    localStorage.setItem('scoreboard-display-scale', currentScale.toString());
  };

  if (decreaseBtn) {
    decreaseBtn.addEventListener('click', () => updateScale(currentScale - SCALE_STEP), { signal: displayAbortController.signal });
  }
  if (increaseBtn) {
    increaseBtn.addEventListener('click', () => updateScale(currentScale + SCALE_STEP), { signal: displayAbortController.signal });
  }

  // 초기 스케일 적용
  updateScale(currentScale);

  // === 공격방향 화살표 스타일 ===
  const ARROW_ACTIVE_CLASSES = ['bg-red-500', 'shadow-[0_0_20px_rgba(239,68,68,0.5)]'];
  const ARROW_INACTIVE_CLASSES = ['bg-gray-700'];
  const ICON_ACTIVE_CLASSES = ['text-white'];
  const ICON_INACTIVE_CLASSES = ['text-gray-500'];

  const applyArrowStyles = (arrow, isActive) => {
    if (!arrow) return;
    const icon = arrow.querySelector('svg');

    if (isActive) {
      arrow.classList.remove(...ARROW_INACTIVE_CLASSES);
      arrow.classList.add(...ARROW_ACTIVE_CLASSES, 'active');
      if (icon) { icon.classList.remove(...ICON_INACTIVE_CLASSES); icon.classList.add(...ICON_ACTIVE_CLASSES); }
    } else {
      arrow.classList.remove(...ARROW_ACTIVE_CLASSES, 'active');
      arrow.classList.add(...ARROW_INACTIVE_CLASSES);
      if (icon) { icon.classList.remove(...ICON_ACTIVE_CLASSES); icon.classList.add(...ICON_INACTIVE_CLASSES); }
    }
  };

  // 공격방향 화살표 업데이트
  const updatePossessionArrows = (possession) => {
    // Display 페이지는 Control 페이지와 좌우가 반대
    // Control: left=away, right=home
    // Display: left=home, right=away (reversed)
    const allArrowsLeft = document.querySelectorAll('.possession-arrow-left');
    const allArrowsRight = document.querySelectorAll('.possession-arrow-right');

    allArrowsLeft.forEach(arrow => {
      applyArrowStyles(arrow, possession === 'home');
    });
    allArrowsRight.forEach(arrow => {
      applyArrowStyles(arrow, possession === 'away');
    });
  };

  // === 팀 색상 CSS 변수 설정 ===
  const updateTeamColors = (state) => {
    const root = document.documentElement;
    const scoreboardRoot = document.querySelector('[data-scoreboard-root]');
    if (!scoreboardRoot) return;

    const teamsData = scoreboardRoot.getAttribute('data-teams');
    if (!teamsData) return;

    let teams;
    try { teams = JSON.parse(teamsData); } catch (e) { return; }

    // Display는 left=away, right=home
    const leftTeam = teams[1] || teams[0]; // away
    const rightTeam = teams[0]; // home

    // state에서 현재 매치업 팀 색상 가져오기
    const leftColor = getScoreColor(state?.teams?.[state?.matchup_index]?.[1]?.color || leftTeam?.color);
    const rightColor = getScoreColor(state?.teams?.[state?.matchup_index]?.[0]?.color || rightTeam?.color);

    root.style.setProperty('--team-left-color', leftColor);
    root.style.setProperty('--team-right-color', rightColor);
  };

  // === 파울 인디케이터 활성화 상태 업데이트 ===
  const updateFoulIndicators = (containerSelector, foulCount) => {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const circles = container.querySelectorAll('[data-foul-circle]');
    circles.forEach((circle, index) => {
      circle.setAttribute('data-foul-active', index < foulCount ? 'true' : 'false');
    });
  };

  // === 타임아웃 인디케이터 업데이트 ===
  const updateTimeoutIndicators = (containerSelector, usedTimeouts) => {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const indicators = container.querySelectorAll('[data-timeout]');
    indicators.forEach((indicator, index) => {
      indicator.setAttribute('data-timeout-active', index < usedTimeouts ? 'true' : 'false');
    });
  };

  // === 타이머 실행 상태 클래스 ===
  const updateTimerRunningClass = (running) => {
    const timers = document.querySelectorAll('[data-scoreboard-timer]');
    timers.forEach(timer => {
      timer.classList.toggle('timer-running', !!running);
    });
  };

  // === 연결 상태 오버레이 ===
  const connectionOverlay = document.querySelector('[data-connection-overlay]');
  let connectionLostTimeout = null;

  const showConnectionLost = () => {
    if (connectionOverlay) connectionOverlay.classList.remove('hidden');
  };
  const hideConnectionLost = () => {
    if (connectionOverlay) connectionOverlay.classList.add('hidden');
    if (connectionLostTimeout) {
      clearTimeout(connectionLostTimeout);
      connectionLostTimeout = null;
    }
  };

  // ActionCable 연결 이벤트 리스닝
  document.addEventListener('scoreboard:connected', () => {
    hideConnectionLost();
  }, { signal: displayAbortController.signal });

  document.addEventListener('scoreboard:disconnected', () => {
    // 3초 후에 오버레이 표시 (일시적 끊김 무시)
    connectionLostTimeout = setTimeout(showConnectionLost, 3000);
  }, { signal: displayAbortController.signal });

  // 스코어보드 업데이트 이벤트 리스너 (AbortController로 중복 방지)
  document.addEventListener('scoreboard:updated', (e) => {
    const { state } = e.detail;
    if (!state) return;

    // 연결 정상 - 오버레이 숨김
    hideConnectionLost();

    // 50ms 지연: ActionCable 수신 후 DOM이 render() 완료된 뒤 스타일 적용
    setTimeout(() => {
      // 공격방향 화살표
      updatePossessionArrows(state.possession);

      // 팀 색상 CSS 변수
      updateTeamColors(state);

      // 타이머 실행 상태
      updateTimerRunningClass(state.running);

      // 파울 인디케이터 (Display: left=away, right=home)
      updateFoulIndicators('[data-foul-indicators-left]', state.away_fouls || 0);
      updateFoulIndicators('[data-foul-indicators-right]', state.home_fouls || 0);

      // 팀 파울 뱃지 (5파울 이상)
      const leftBadge = document.querySelector('[data-team-foul-badge-left]');
      const rightBadge = document.querySelector('[data-team-foul-badge-right]');
      if (leftBadge) leftBadge.classList.toggle('hidden', (state.away_fouls || 0) < 5);
      if (rightBadge) rightBadge.classList.toggle('hidden', (state.home_fouls || 0) < 5);

      // 타임아웃 인디케이터
      updateTimeoutIndicators('[data-timeout-indicators-left]', state.away_timeouts || 0);
      updateTimeoutIndicators('[data-timeout-indicators-right]', state.home_timeouts || 0);
    }, 50);
  }, { signal: displayAbortController.signal });

  // 초기 상태
  const allArrows = document.querySelectorAll('.possession-arrow-left, .possession-arrow-right');
  allArrows.forEach(arrow => applyArrowStyles(arrow, false));
};

document.addEventListener('DOMContentLoaded', initScoreboardDisplayUI);
document.addEventListener('turbo:load', initScoreboardDisplayUI);
