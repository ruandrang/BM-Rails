// 리스트 정렬 기능
// members/index, matches/new, stats/index 뷰에서 [data-sort] 버튼으로 리스트를 정렬한다.
// 포지션(PG/SG/SF/PF/C), 숫자(키/등번호/경기수), 승률 정렬을 지원한다.

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
