// 팀 멤버 드래그 앤 드롭 (SortableJS)
// matches/show 뷰에서 팀 간 멤버 이동과 휴지통 삭제를 처리한다.
// SortableJS 라이브러리에 의존한다.

(function() {
  let retryCount = 0;
  const MAX_RETRIES = 3;

  const initDragAndDrop = () => {

    // SortableJS가 로드되었는지 확인
    if (typeof Sortable === 'undefined') {
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        const delay = 500 * retryCount;
        setTimeout(initDragAndDrop, delay);
      }
      return;
    }
    retryCount = 0;

    const matchContainer = document.querySelector('[data-match-drag-match-id-value]');
    const dragContainers = document.querySelectorAll('[data-team-id]');
    const trashZone = document.querySelector('[data-member-trash-zone]');

    if (dragContainers.length === 0) return;

    const matchId = matchContainer ? matchContainer.dataset.matchDragMatchIdValue : null;
    const clubId = matchContainer?.dataset.clubId || window.location.pathname.match(/\/clubs\/(\d+)/)?.[1];
    const moveUrl = matchContainer?.dataset.moveMemberUrl || (clubId && matchId ? `/clubs/${clubId}/matches/${matchId}/move_member` : null);
    const removeUrl = matchContainer?.dataset.removeMemberUrl || (clubId && matchId ? `/clubs/${clubId}/matches/${matchId}/remove_member` : null);
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const pageLocale = String(document.documentElement.lang || "ko").toLowerCase().split("-")[0];
    const dragMessages = {
      ko: {
        delete_failed: "멤버 삭제 실패: %{error}\n페이지를 새로고침합니다.",
        invalid_target: "오류: 이동 대상을 확인할 수 없습니다.",
        move_failed: "멤버 이동 실패: %{error}\n페이지를 새로고침합니다."
      },
      ja: {
        delete_failed: "メンバー削除失敗: %{error}\nページを再読み込みします。",
        invalid_target: "エラー: 移動先を確認できません。",
        move_failed: "メンバー移動失敗: %{error}\nページを再読み込みします。"
      },
      en: {
        delete_failed: "Failed to remove member: %{error}\nReloading the page.",
        invalid_target: "Error: Could not determine the move target.",
        move_failed: "Failed to move member: %{error}\nReloading the page."
      },
      zh: {
        delete_failed: "删除成员失败: %{error}\n正在刷新页面。",
        invalid_target: "错误：无法确认移动目标。",
        move_failed: "移动成员失败: %{error}\n正在刷新页面。"
      },
    };
    const dragT = (key, params = {}) => {
      const template = dragMessages[pageLocale]?.[key] || dragMessages.ko[key] || key;
      return String(template).replace(/%\{(\w+)\}/g, (_, token) => {
        const value = params[token];
        return value === undefined || value === null ? "" : String(value);
      });
    };

    const trashInnerEl = trashZone ? trashZone.querySelector('div') : null;

    const showTrashZone = () => {
      if (!trashInnerEl) return;
      trashInnerEl.style.backgroundColor = '#dc2626';
      trashInnerEl.style.color = '#ffffff';
      trashInnerEl.style.borderStyle = 'solid';
      trashInnerEl.style.borderColor = '#b91c1c';
      trashInnerEl.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
    };

    const hideTrashZone = () => {
      if (!trashInnerEl) return;
      trashInnerEl.style.backgroundColor = '';
      trashInnerEl.style.color = '';
      trashInnerEl.style.borderStyle = '';
      trashInnerEl.style.borderColor = '';
      trashInnerEl.style.boxShadow = '';
    };

    if (trashZone && !trashZone.dataset.sortableInitialized) {
      new Sortable(trashZone, {
        group: 'shared',
        animation: 150,
        sort: false,
        onAdd: async function(evt) {
          hideTrashZone();

          const memberId = evt.item?.dataset?.id;
          if (!memberId || !removeUrl) {
            window.location.reload();
            return;
          }

          try {
            const response = await fetch(removeUrl, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
              },
              body: JSON.stringify({ member_id: memberId })
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
              throw new Error(data.error || `Server Error: ${response.status}`);
            }

            window.location.reload();
          } catch (error) {
            // alert 사용 의도: 리로드 전 사용자에게 에러를 명확히 고지
            alert(dragT("delete_failed", { error: error.message }));
            window.location.reload();
          }
        }
      });

      // 멤버 카드가 휴지통 위에 올라왔을 때 시각적 피드백
      if (trashInnerEl) {
        const trashObserver = new MutationObserver(() => {
          const ghost = trashZone.querySelector('.sortable-ghost');
          if (ghost) {
            trashInnerEl.style.transform = 'scale(1.15)';
            trashInnerEl.style.backgroundColor = '#991b1b';
            trashInnerEl.style.boxShadow = '0 0 30px rgba(239, 68, 68, 0.6)';
            trashInnerEl.style.borderColor = '#ef4444';
          } else {
            trashInnerEl.style.transform = '';
          }
        });
        trashObserver.observe(trashZone, { childList: true });
      }

      trashZone.dataset.sortableInitialized = 'true';
    }

    // 이미 Sortable이 적용된 경우 중복 적용 방지
    dragContainers.forEach(container => {
      if (container.classList.contains('sortable-initialized')) {
        return;
      }

      new Sortable(container, {
        group: 'shared',
        animation: 150,
        cursor: 'move',
        delay: 0,
        touchStartThreshold: 0,
        onStart: function() {
          showTrashZone();
        },
        onEnd: async function (evt) {
          const { item, to, from } = evt;
          hideTrashZone();

          // 이동하지 않았거나 같은 팀 내 이동인 경우 무시
          if (to === from) return;

          // 휴지통으로 이동한 경우: 삭제 로직은 trashZone onAdd에서 처리
          if (to && to.hasAttribute('data-member-trash-zone')) return;

          const memberId = item.dataset.id;
          const targetTeamId = to.dataset.teamId;
          if (!memberId || !targetTeamId || !moveUrl) {
            console.error("Invalid drag target");
            alert(dragT("invalid_target"));
            return;
          }

          try {
            const response = await fetch(moveUrl, {
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
              // 통계 갱신을 위해 리로드
              window.location.reload();
            } else {
              throw new Error(data.error || "Unknown error");
            }
          } catch (error) {
            // alert 사용 의도: 리로드 전 사용자에게 에러를 명확히 고지
            alert(dragT("move_failed", { error: error.message }));
            window.location.reload();
          }
        }
      });

      container.classList.add('sortable-initialized');
    });
  };

  window.initDragAndDrop = initDragAndDrop;

  document.addEventListener("turbo:load", initDragAndDrop);
  document.addEventListener("DOMContentLoaded", initDragAndDrop);
})();
