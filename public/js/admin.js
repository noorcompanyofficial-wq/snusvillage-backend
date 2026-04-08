const sidebar = document.getElementById("sidebar");
const main = document.getElementById("main");
const toggleBtn = document.getElementById("toggleBtn");

// TOGGLE (FIXED)
toggleBtn.addEventListener("click", () => {
  if (window.innerWidth <= 768) {
    // MOBILE
    sidebar.classList.toggle("active");
  } else {
    // DESKTOP
    sidebar.classList.toggle("collapsed");
    main.classList.toggle("expanded");
  }
});

// ACTIVE LINK (FIXED)
const links = document.querySelectorAll(".menu a");
const currentPath = window.location.pathname;

links.forEach((link) => {
  const linkPath = link.getAttribute("href");

  if (currentPath.startsWith(linkPath)) {
    links.forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
  }
});
