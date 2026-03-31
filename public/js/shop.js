// ===== DROPDOWN FIX (MOBILE + DESKTOP PERFECT) =====
const allDropdowns = document.querySelectorAll(".dropdown");

allDropdowns.forEach((dropdown) => {
  const toggleBtn = dropdown.querySelector(".dropdown-toggle");

  if (!toggleBtn) return; // safety

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    // close other dropdowns
    allDropdowns.forEach((d) => {
      if (d !== dropdown) d.classList.remove("active");
    });

    // toggle current
    dropdown.classList.toggle("active");
  });
});

// close when clicking outside
document.addEventListener("click", () => {
  allDropdowns.forEach((d) => d.classList.remove("active"));
});

// ===== FILTER BUTTONS (WITHOUT BREAKING DROPDOWN) =====
const normalFilters = document.querySelectorAll(
  ".filter-btn:not(.dropdown-toggle)",
);

normalFilters.forEach((btn) => {
  btn.addEventListener("click", () => {
    normalFilters.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// ===== FADE-IN ON SCROLL (SMOOTH OPACITY ONLY) =====
const cardsObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("show");
      }
    });
  },
  { threshold: 0.2 },
);

document.querySelectorAll(".card").forEach((card) => {
  card.classList.add("hidden");
  cardsObserver.observe(card);
});
