// 스코어보드 컨트롤 화면 UI 상호작용
// scoreboards/control 뷰의 섹션 토글, 음성 토글, 다음 쿼터 버튼 상태, 드래그 정렬을 담당한다.

document.addEventListener('DOMContentLoaded', function() {
  // 스코어보드 컨트롤 페이지인지 확인
  if (!document.querySelector('[data-action="toggle-announcements-btn"]') &&
      !document.querySelector('[data-toggle-section="score-table"]') &&
      !document.getElementById('draggable-sections-container')) {
    return;
  }

  // 음성 안내 토글 버튼
  const voiceToggleBtn = document.querySelector('[data-action="toggle-announcements-btn"]');
  if (voiceToggleBtn) {
    voiceToggleBtn.addEventListener('click', function(e) {
      const checkbox = this.querySelector('[data-action="toggle-announcements"]');
      const status = this.querySelector('[data-voice-status]');
      const isEnabled = this.dataset.voiceEnabled === 'true';

      // 상태 토글
      const newState = !isEnabled;
      this.dataset.voiceEnabled = String(newState);
      checkbox.checked = newState;

      // UI 업데이트
      if (newState) {
        this.classList.remove('border-gray-200', 'bg-gray-50', 'hover:bg-gray-100');
        this.classList.add('border-blue-200', 'bg-blue-50', 'hover:bg-blue-100');
        this.querySelector('[data-voice-icon]').classList.remove('text-gray-400');
        this.querySelector('[data-voice-icon]').classList.add('text-blue-500');
        this.querySelector('[data-voice-label]').classList.remove('text-gray-500');
        this.querySelector('[data-voice-label]').classList.add('text-blue-700');
        status.textContent = 'ON';
        status.classList.remove('bg-gray-400');
        status.classList.add('bg-blue-500');
      } else {
        this.classList.remove('border-blue-200', 'bg-blue-50', 'hover:bg-blue-100');
        this.classList.add('border-gray-200', 'bg-gray-50', 'hover:bg-gray-100');
        this.querySelector('[data-voice-icon]').classList.remove('text-blue-500');
        this.querySelector('[data-voice-icon]').classList.add('text-gray-400');
        this.querySelector('[data-voice-label]').classList.remove('text-blue-700');
        this.querySelector('[data-voice-label]').classList.add('text-gray-500');
        status.textContent = 'OFF';
        status.classList.remove('bg-blue-500');
        status.classList.add('bg-gray-400');
      }

      // 기존 핸들러를 위해 change 이벤트 발생
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  // 스코어 테이블 접기/펼치기
  const scoreTableToggle = document.querySelector('[data-toggle-section="score-table"]');
  if (scoreTableToggle) {
    scoreTableToggle.addEventListener('click', function(e) {
      // 누적/쿼터별 버튼 클릭 시 테이블 접힘 방지
      if (e.target.closest('[data-action="set-quarter-view-cumulative"]') ||
          e.target.closest('[data-action="set-quarter-view-per-quarter"]')) {
        return;
      }
      const content = document.getElementById('score-table-content');
      const icon = document.getElementById('score-table-toggle-icon');
      if (content && icon) {
        if (content.style.display === 'none') {
          content.style.display = '';
          icon.style.transform = 'rotate(0deg)';
        } else {
          content.style.display = 'none';
          icon.style.transform = 'rotate(180deg)';
        }
      }
    });
  }

  // 키보드 단축키 섹션 접기/펼치기
  const shortcutsToggle = document.querySelector('[data-toggle-section="keyboard-shortcuts"]');
  if (shortcutsToggle) {
    shortcutsToggle.addEventListener('click', function(e) {
      const content = document.getElementById('keyboard-shortcuts-content');
      const icon = document.getElementById('keyboard-shortcuts-toggle-icon');
      if (content && icon) {
        const isHidden = content.style.display === 'none' || content.classList.contains('hidden');
        if (isHidden) {
          content.style.display = '';
          content.classList.remove('hidden');
          icon.style.transform = 'rotate(0deg)';
        } else {
          content.style.display = 'none';
          content.classList.add('hidden');
          icon.style.transform = 'rotate(180deg)';
        }
      }
    });
  }

  // 다음 쿼터 버튼 상태 업데이트 (마지막 쿼터이면 "경기 종료"로 변경)
  const updateNextQuarterButton = function() {
    const quarterEl = document.querySelector('[data-scoreboard-quarter]');
    const nextQuarterBtn = document.querySelector('[data-next-quarter-btn]');
    const nextQuarterTitle = document.querySelector('[data-next-quarter-title]');
    const nextQuarterIcon = document.querySelector('[data-next-quarter-icon]');
    const regularQuarters = parseInt(document.querySelector('[data-scoreboard-root]')?.dataset?.regularQuarters || '4');

    if (quarterEl && nextQuarterBtn) {
      const currentQuarter = parseInt(quarterEl.textContent.replace(/\D/g, '')) || 1;

      if (currentQuarter >= regularQuarters) {
        // 경기 종료: 녹색 그라데이션
        nextQuarterBtn.classList.remove('from-[#FF6B35]', 'to-[#E55A2B]', 'border-[#FF6B35]', 'hover:shadow-orange-500/25');
        nextQuarterBtn.classList.add('from-emerald-500', 'to-emerald-600', 'border-emerald-500', 'hover:shadow-emerald-500/25');
        if (nextQuarterTitle) {
          nextQuarterTitle.textContent = '경기 종료';
        }
        if (nextQuarterIcon) {
          nextQuarterIcon.innerHTML = '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>';
        }
      } else {
        // 다음 쿼터: 오렌지 그라데이션
        nextQuarterBtn.classList.add('from-[#FF6B35]', 'to-[#E55A2B]', 'border-[#FF6B35]', 'hover:shadow-orange-500/25');
        nextQuarterBtn.classList.remove('from-emerald-500', 'to-emerald-600', 'border-emerald-500', 'hover:shadow-emerald-500/25');
        if (nextQuarterTitle) {
          nextQuarterTitle.textContent = '다음 쿼터';
        }
        if (nextQuarterIcon) {
          nextQuarterIcon.innerHTML = '<path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6zM16 6h2v12h-2z"/>';
        }
      }
    }
  };

  // 초기 업데이트
  updateNextQuarterButton();

  // 쿼터 변경 관찰
  const quarterObserver = new MutationObserver(updateNextQuarterButton);
  const quarterEl = document.querySelector('[data-scoreboard-quarter]');
  if (quarterEl) {
    quarterObserver.observe(quarterEl, { childList: true, characterData: true, subtree: true });
  }

  // 섹션 드래그 앤 드롭 정렬
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
      } catch (e) {
        console.warn('Failed to restore section order:', e);
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
});
