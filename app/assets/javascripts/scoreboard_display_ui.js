// 스코어보드 전광판 디스플레이 UI
// scoreboards/display 뷰의 공격방향 화살표, 파울 뱃지, 텍스트 크기 조절을 담당한다.
// 팀 색상 매핑은 application.js의 render() 함수에서 처리한다.

// 이전 이벤트 리스너 정리용 (turbo:load 재초기화 시 중복 방지)
let displayAbortController = null;

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

  // 화살표 스타일 적용 (Tailwind 클래스 토글)
  const ARROW_ACTIVE_CLASSES = ['bg-red-500', 'shadow-[0_0_20px_rgba(239,68,68,0.5)]'];
  const ARROW_INACTIVE_CLASSES = ['bg-gray-700'];
  const ICON_ACTIVE_CLASSES = ['text-white'];
  const ICON_INACTIVE_CLASSES = ['text-gray-500'];

  const applyArrowStyles = (arrow, isActive) => {
    if (!arrow) return;
    const icon = arrow.querySelector('svg');

    if (isActive) {
      arrow.classList.remove(...ARROW_INACTIVE_CLASSES);
      arrow.classList.add(...ARROW_ACTIVE_CLASSES);
      if (icon) { icon.classList.remove(...ICON_INACTIVE_CLASSES); icon.classList.add(...ICON_ACTIVE_CLASSES); }
    } else {
      arrow.classList.remove(...ARROW_ACTIVE_CLASSES);
      arrow.classList.add(...ARROW_INACTIVE_CLASSES);
      if (icon) { icon.classList.remove(...ICON_ACTIVE_CLASSES); icon.classList.add(...ICON_INACTIVE_CLASSES); }
    }
  };

  // 공격방향 화살표 업데이트
  const updatePossessionArrows = (possession) => {
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

  // 스코어보드 업데이트 이벤트 리스너 (AbortController로 중복 방지)
  document.addEventListener('scoreboard:updated', (e) => {
    const { state } = e.detail;
    if (!state) return;

    // 공격방향 화살표 업데이트
    // 50ms 지연: ActionCable 수신 후 DOM이 render() 완료된 뒤 스타일 적용하기 위함
    setTimeout(() => updatePossessionArrows(state.possession), 50);

    // 팀 파울 뱃지 업데이트 (5파울 이상 표시)
    // Display에서는: left = away_fouls, right = home_fouls
    const leftFouls = state.away_fouls || 0;
    const rightFouls = state.home_fouls || 0;

    const leftBadge = document.querySelector('[data-team-foul-badge-left]');
    const rightBadge = document.querySelector('[data-team-foul-badge-right]');

    if (leftBadge) {
      leftBadge.classList.toggle('hidden', leftFouls < 5);
    }

    if (rightBadge) {
      rightBadge.classList.toggle('hidden', rightFouls < 5);
    }
  }, { signal: displayAbortController.signal });

  // 초기 상태 - 모두 비활성
  applyArrowStyles(arrowLeft, false);
  applyArrowStyles(arrowRight, false);
};

document.addEventListener('DOMContentLoaded', initScoreboardDisplayUI);
document.addEventListener('turbo:load', initScoreboardDisplayUI);
