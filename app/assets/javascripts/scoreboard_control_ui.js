// 스코어보드 컨트롤 화면 UI 상호작용
// scoreboards/control 뷰의 섹션 토글, 음성 토글, 다음 쿼터 버튼 상태, 드래그 정렬을 담당한다.

// 이전 MutationObserver 정리용 (turbo:load 재초기화 시 중복 방지)
let controlQuarterObserver = null;

const initScoreboardControlUI = function() {
  // 이전 observer 해제
  if (controlQuarterObserver) {
    controlQuarterObserver.disconnect();
    controlQuarterObserver = null;
  }
  // 스코어보드 컨트롤 페이지인지 확인
  if (!document.querySelector('[data-action="toggle-announcements-btn"]') &&
      !document.querySelector('[data-toggle-section="score-table"]') &&
      !document.getElementById('draggable-sections-container')) {
    return;
  }

  // 음성 안내 토글 UI 업데이트 헬퍼
  const updateVoiceToggleUI = (btn, enabled) => {
    const status = btn.querySelector('[data-voice-status]');
    const icon = btn.querySelector('[data-voice-icon]');
    const label = btn.querySelector('[data-voice-label]');
    const swap = (el, remove, add) => { if (el) { el.classList.remove(...remove); el.classList.add(...add); } };

    if (enabled) {
      swap(btn, ['border-gray-200', 'bg-gray-50', 'hover:bg-gray-100'], ['border-blue-200', 'bg-blue-50', 'hover:bg-blue-100']);
      swap(icon, ['text-gray-400'], ['text-blue-500']);
      swap(label, ['text-gray-500'], ['text-blue-700']);
      if (status) { status.textContent = 'ON'; swap(status, ['bg-gray-400'], ['bg-blue-500']); }
    } else {
      swap(btn, ['border-blue-200', 'bg-blue-50', 'hover:bg-blue-100'], ['border-gray-200', 'bg-gray-50', 'hover:bg-gray-100']);
      swap(icon, ['text-blue-500'], ['text-gray-400']);
      swap(label, ['text-blue-700'], ['text-gray-500']);
      if (status) { status.textContent = 'OFF'; swap(status, ['bg-blue-500'], ['bg-gray-400']); }
    }
  };

  // 음성 안내 토글 버튼
  const voiceToggleBtn = document.querySelector('[data-action="toggle-announcements-btn"]');
  if (voiceToggleBtn) {
    voiceToggleBtn.addEventListener('click', function() {
      const checkbox = this.querySelector('[data-action="toggle-announcements"]');
      const isEnabled = this.dataset.voiceEnabled === 'true';
      const newState = !isEnabled;
      this.dataset.voiceEnabled = String(newState);
      checkbox.checked = newState;
      updateVoiceToggleUI(this, newState);
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // 섹션 접기/펼치기 범용 함수
  const initSectionToggle = (sectionName, skipSelectors) => {
    const toggle = document.querySelector(`[data-toggle-section="${sectionName}"]`);
    if (!toggle) return;

    toggle.addEventListener('click', function(e) {
      if (skipSelectors && skipSelectors.some(sel => e.target.closest(sel))) return;

      const content = document.getElementById(`${sectionName}-content`);
      const icon = document.getElementById(`${sectionName}-toggle-icon`);
      if (content && icon) {
        const isHidden = content.classList.contains('hidden');
        content.classList.toggle('hidden');
        icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
      }
    });
  };

  initSectionToggle('score-table', [
    '[data-action="set-quarter-view-cumulative"]',
    '[data-action="set-quarter-view-per-quarter"]'
  ]);
  initSectionToggle('keyboard-shortcuts');

  // 다음 쿼터 버튼 상태 업데이트 (마지막 쿼터이면 "경기 종료"로 변경)
  const updateNextQuarterButton = function() {
    const quarterEl = document.querySelector('[data-scoreboard-quarter]');
    const nextQuarterBtn = document.querySelector('[data-next-quarter-btn]');
    const nextQuarterTitle = document.querySelector('[data-next-quarter-title]');
    const nextQuarterIcon = document.querySelector('[data-next-quarter-icon]');
    const regularQuarters = parseInt(document.querySelector('[data-scoreboard-root]')?.dataset?.regularQuarters || '4');

    if (quarterEl && nextQuarterBtn) {
      const currentQuarter = parseInt(quarterEl.textContent.replace(/\D/g, '')) || 1;
      const finishText = nextQuarterBtn.dataset.finishText || 'Finish';
      const nextText = nextQuarterBtn.dataset.nextText || 'Next';

      if (currentQuarter >= regularQuarters) {
        // 경기 종료: 녹색 그라데이션
        nextQuarterBtn.classList.remove('from-[#FF6B35]', 'to-[#E55A2B]', 'border-[#FF6B35]', 'hover:shadow-orange-500/25');
        nextQuarterBtn.classList.add('from-emerald-500', 'to-emerald-600', 'border-emerald-500', 'hover:shadow-emerald-500/25');
        if (nextQuarterTitle) {
          nextQuarterTitle.textContent = finishText;
        }
        if (nextQuarterIcon) {
          const path = nextQuarterIcon.querySelector('path');
          if (path) path.setAttribute('d', 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z');
        }
      } else {
        // 다음 쿼터: 오렌지 그라데이션
        nextQuarterBtn.classList.add('from-[#FF6B35]', 'to-[#E55A2B]', 'border-[#FF6B35]', 'hover:shadow-orange-500/25');
        nextQuarterBtn.classList.remove('from-emerald-500', 'to-emerald-600', 'border-emerald-500', 'hover:shadow-emerald-500/25');
        if (nextQuarterTitle) {
          nextQuarterTitle.textContent = nextText;
        }
        if (nextQuarterIcon) {
          const path = nextQuarterIcon.querySelector('path');
          if (path) path.setAttribute('d', 'M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6zM16 6h2v12h-2z');
        }
      }
    }
  };

  // 초기 업데이트
  updateNextQuarterButton();

  // 쿼터 변경 관찰 (모듈 변수로 관리하여 재초기화 시 disconnect 가능)
  controlQuarterObserver = new MutationObserver(updateNextQuarterButton);
  const quarterEl = document.querySelector('[data-scoreboard-quarter]');
  if (quarterEl) {
    controlQuarterObserver.observe(quarterEl, { childList: true, characterData: true, subtree: true });
  }

  // 컨트롤 화면 섹션 순서 변경용 드래그 (HTML5 Drag API)
  // drag_and_drop.js는 점수 테이블의 대진 순서 변경용으로 별도 목적
  const container = document.getElementById('draggable-sections-container');
  if (container) {
    const sections = container.querySelectorAll('.draggable-section');
    let draggedElement = null;

    // localStorage에서 저장된 순서 복원
    const matchId = document.querySelector('[data-scoreboard-root]')?.dataset?.matchId || 'default';
    const storageKey = `scoreboard-sections-order-${matchId}`;
    const savedOrder = localStorage.getItem(storageKey);

    if (savedOrder) {
      try {
        const order = JSON.parse(savedOrder);
        order.forEach(sectionId => {
          const section = container.querySelector(`[data-section-id="${sectionId}"]`);
          if (section) {
            container.appendChild(section);
          }
        });
      } catch (_e) {
        // 저장된 순서 복원 실패 시 기본 순서 유지
      }
    }

    sections.forEach(section => {
      // 드래그 시작
      section.addEventListener('dragstart', function(e) {
        draggedElement = this;
        this.style.opacity = '0.5';
        this.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.sectionId);
      });

      // 드래그 종료
      section.addEventListener('dragend', function(e) {
        this.style.opacity = '';
        this.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2');
        draggedElement = null;

        // 모든 드래그 오버 스타일 제거
        container.querySelectorAll('.draggable-section').forEach(s => {
          s.classList.remove('border-t-4', 'border-blue-400');
        });
      });

      // 드래그 오버
      section.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (draggedElement && draggedElement !== this) {
          this.classList.add('border-t-4', 'border-blue-400');
        }
      });

      // 드래그 떠남
      section.addEventListener('dragleave', function(e) {
        this.classList.remove('border-t-4', 'border-blue-400');
      });

      // 드롭
      section.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('border-t-4', 'border-blue-400');

        if (draggedElement && draggedElement !== this) {
          const allSections = [...container.querySelectorAll('.draggable-section')];
          const draggedIndex = allSections.indexOf(draggedElement);
          const targetIndex = allSections.indexOf(this);

          if (draggedIndex < targetIndex) {
            this.parentNode.insertBefore(draggedElement, this.nextSibling);
          } else {
            this.parentNode.insertBefore(draggedElement, this);
          }

          // localStorage에 새 순서 저장
          const newOrder = [...container.querySelectorAll('.draggable-section')].map(s => s.dataset.sectionId);
          localStorage.setItem(storageKey, JSON.stringify(newOrder));
        }
      });

      // 드래그 핸들 클릭 시 토글 방지
      const dragHandle = section.querySelector('.drag-handle');
      if (dragHandle) {
        dragHandle.addEventListener('mousedown', function(e) {
          e.stopPropagation();
        });
        dragHandle.addEventListener('click', function(e) {
          e.stopPropagation();
        });
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', initScoreboardControlUI);
document.addEventListener('turbo:load', initScoreboardControlUI);
