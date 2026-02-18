// 사이드바 토글 기능
// 모든 페이지의 DaisyUI drawer 사이드바 열기/닫기 상태를 localStorage에 저장하고 복원한다.

(function () {
  function initSidebar() {
    const toggleBtn = document.getElementById("sidebar-toggle");
    const drawer = document.querySelector(".drawer.lg\\:drawer-open") || document.querySelector(".drawer");

    if (!toggleBtn || !drawer) return;

    // Prevent duplicate listeners
    if (toggleBtn.dataset.listenerAttached === "true") return;
    toggleBtn.dataset.listenerAttached = "true";

    // 1. Restore State
    const savedState = localStorage.getItem("sidebarOpen");
    // Default is open (lg:drawer-open present)
    // If saved as 'false', remove class
    if (savedState === "false") {
      drawer.classList.remove("lg:drawer-open");
    } else {
      // If default HTML doesn't have it but we want it open, add it
      // But typically HTML has it by default
      if (!drawer.classList.contains("lg:drawer-open")) {
        drawer.classList.add("lg:drawer-open");
      }
    }

    // 2. Toggle Handler
    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault(); // Prevent form submission if inside form (though it's type button ideally)
      drawer.classList.toggle("lg:drawer-open");

      const isOpen = drawer.classList.contains("lg:drawer-open");
      localStorage.setItem("sidebarOpen", isOpen);
    });
  }

  document.addEventListener("turbo:load", initSidebar);
  document.addEventListener("DOMContentLoaded", initSidebar);
})();
