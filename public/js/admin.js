const sidebar = document.getElementById("sidebar");
const main = document.getElementById("main");
const toggleBtn = document.getElementById("toggleBtn");

toggleBtn?.addEventListener("click", () => {
  if (window.innerWidth <= 768) {
    sidebar?.classList.toggle("active");
  } else {
    sidebar?.classList.toggle("collapsed");
    main?.classList.toggle("expanded");
  }
});

const links = document.querySelectorAll(".admin-nav a, .admin-sidebar__bottom a");
const currentPath = window.location.pathname;

links.forEach((link) => {
  const linkPath = link.getAttribute("href");

  if (linkPath !== "/" && currentPath.startsWith(linkPath)) {
    links.forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
  }
});
