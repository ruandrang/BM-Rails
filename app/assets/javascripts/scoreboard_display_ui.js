// 스코어보드 전광판 디스플레이 UI
// scoreboards/display 뷰의 공격방향 화살표, 팀 색상, 파울 뱃지, 텍스트 크기 조절을 담당한다.

document.addEventListener('DOMContentLoaded', () => {
  const arrowLeft = document.querySelector('.possession-arrow-left');
  const arrowRight = document.querySelector('.possession-arrow-right');

  // 전광판 페이지인지 확인
  if (!arrowLeft && !arrowRight && !document.querySelector('[data-size-indicator]')) {
    return;
  }

  // 현재 공격방향 상태 추적
  let currentPossession = null;

  // === 팀 색상 매핑 (Team::COLORS → CSS 색상) ===
  const TEAM_COLOR_MAP = {
    'White': '#ffffff',
    'Black': '#1f2937',
    'Red': '#ef4444',
    'Blue': '#3b82f6',
    'Yellow': '#eab308',
    'Green': '#22c55e',
    'Pink': '#ec4899',
    'SkyBlue': '#38bdf8',
    'Brown': '#a16207',
    'Orange': '#f97316'
  };

  // 팀 색상 이름을 CSS 색상으로 변환
  const getTeamColor = (colorName) => {
    return TEAM_COLOR_MAP[colorName] || colorName || '#3b82f6';
  };

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
    console.log('[Display] Scale updated:', currentScale);
  };

  if (decreaseBtn) {
    decreaseBtn.addEventListener('click', () => updateScale(currentScale - SCALE_STEP));
  }
  if (increaseBtn) {
    increaseBtn.addEventListener('click', () => updateScale(currentScale + SCALE_STEP));
  }

  // 초기 스케일 적용
  updateScale(currentScale);

  // 화살표 스타일 적용
  const applyArrowStyles = (arrow, isActive) => {
    if (!arrow) return;
    const icon = arrow.querySelector('svg');

    if (isActive) {
      arrow.style.backgroundColor = '#ef4444';
      arrow.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.5)';
      if (icon) icon.style.color = 'white';
    } else {
      arrow.style.backgroundColor = '#374151';
      arrow.style.boxShadow = 'none';
      if (icon) icon.style.color = '#6B7280';
    }
  };

  // 공격방향 화살표 업데이트
  const updatePossessionArrows = (possession) => {
    console.log('[Display] Updating possession arrows:', possession);

    // Display 페이지는 Control 페이지와 좌우가 반대
    // Control: left=away, right=home
    // Display: left=home, right=away (reversed)
    if (possession === 'home') {
      applyArrowStyles(arrowLeft, true);
      applyArrowStyles(arrowRight, false);
    } else if (possession === 'away') {
      applyArrowStyles(arrowLeft, false);
      applyArrowStyles(arrowRight, true);
    } else {
      applyArrowStyles(arrowLeft, false);
      applyArrowStyles(arrowRight, false);
    }
  };

  // 스코어보드 업데이트 이벤트 리스너
  document.addEventListener('scoreboard:updated', (e) => {
    const { state } = e.detail;
    if (!state) return;

    console.log('[Display] scoreboard:updated received, possession:', state.possession);

    // 공격방향 화살표 업데이트
    currentPossession = state.possession;
    setTimeout(() => updatePossessionArrows(state.possession), 50);

    // 팀 파울 뱃지 업데이트 (5파울 이상 표시)
    // Display에서는: left = away_fouls, right = home_fouls
    const leftFouls = state.away_fouls || 0;
    const rightFouls = state.home_fouls || 0;

    const leftBadge = document.querySelector('[data-team-foul-badge-left]');
    const rightBadge = document.querySelector('[data-team-foul-badge-right]');

    if (leftBadge) {
      if (leftFouls >= 5) {
        leftBadge.classList.remove('hidden');
      } else {
        leftBadge.classList.add('hidden');
      }
    }

    if (rightBadge) {
      if (rightFouls >= 5) {
        rightBadge.classList.remove('hidden');
      } else {
        rightBadge.classList.add('hidden');
      }
    }
  });

  // 초기 상태 - 모두 비활성
  applyArrowStyles(arrowLeft, false);
  applyArrowStyles(arrowRight, false);

  console.log('[Display] Possession arrows initialized');
  console.log('[Display] Team color mapping enabled');
});
