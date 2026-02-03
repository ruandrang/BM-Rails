// Global JS entry (vanilla) for lightweight interactions.
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
  if (!list) return;

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
});
