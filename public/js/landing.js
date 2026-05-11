const landingAgeModal = document.getElementById("landingAgeModal");
const landingEnterSite = document.getElementById("landingEnterSite");
const landingExitSite = document.getElementById("landingExitSite");

if (new URLSearchParams(window.location.search).get("age") === "reset") {
  localStorage.removeItem("ageVerified");
}

if (localStorage.getItem("ageVerified") === "true") {
  landingAgeModal?.remove();
}

landingEnterSite?.addEventListener("click", () => {
  localStorage.setItem("ageVerified", "true");
  landingAgeModal?.remove();
});

landingExitSite?.addEventListener("click", () => {
  window.location.href = "https://www.google.com";
});

const slides = Array.from(document.querySelectorAll(".hero__slide"));
let currentSlide = 0;
let timer = null;

function showSlide(index) {
  slides.forEach((slide, i) => {
    slide.classList.toggle("is-active", i === index);
    if (i !== index) {
      slide.style.transform = "";
    }
  });
  currentSlide = index;
}

function nextSlide() {
  if (slides.length === 0) return;
  showSlide((currentSlide + 1) % slides.length);
}

function startSlider() {
  if (slides.length < 2) return;
  timer = setInterval(nextSlide, 5000);
}

function resetSlider() {
  clearInterval(timer);
  startSlider();
}

slides.forEach((slide, index) => {
  slide.addEventListener("click", () => {
    showSlide(index);
    resetSlider();
  });

  slide.addEventListener("mousemove", (event) => {
    if (!slide.classList.contains("is-active")) return;
    const rect = slide.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 8;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 8;
    slide.style.transform = `scale(1) translate(${x}px, ${y}px)`;
  });

  slide.addEventListener("mouseleave", () => {
    if (slide.classList.contains("is-active")) {
      slide.style.transform = "scale(1)";
    }
  });
});

showSlide(0);
startSlider();

const mobileToggle = document.getElementById("mobileToggle");
const navLinks = document.getElementById("navLinks");

mobileToggle?.addEventListener("click", () => {
  navLinks?.classList.toggle("is-open");
});

document.querySelectorAll("#navLinks a").forEach((link) => {
  link.addEventListener("click", () => navLinks?.classList.remove("is-open"));
});











// ===== SNUS VILLAGE AB STYLE HERO START =====
(function () {
  const hero = document.getElementById("svAbHero");
  if (!hero) return;

  const cards = hero.querySelectorAll(".sv-ab-product-card, .sv-ab-feature-card");

  hero.addEventListener("mousemove", (event) => {
    const rect = hero.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;

    cards.forEach((card, index) => {
      const strength = (index + 1) * 3;
      card.style.transform = `translate3d(${x * strength}px, ${y * strength}px, 0)`;
    });
  });

  hero.addEventListener("mouseleave", () => {
    cards.forEach((card) => {
      card.style.transform = "";
    });
  });
})();
// ===== SNUS VILLAGE AB STYLE HERO END =====


// ===== SNUS VILLAGE DISTRO CAROUSEL START =====
(function () {
  const carousel = document.getElementById("svgDistroCarousel");
  if (!carousel) return;

  const slides = Array.from(carousel.querySelectorAll(".sv-distro-track img"));
  const dots = Array.from(carousel.querySelectorAll(".sv-distro-dots button"));
  const prev = carousel.querySelector(".sv-distro-prev");
  const next = carousel.querySelector(".sv-distro-next");

  if (!slides.length) return;

  let index = 0;

  function showSlide(nextIndex) {
    index = (nextIndex + slides.length) % slides.length;

    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle("is-active", slideIndex === index);
    });

    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === index);
    });
  }

  prev?.addEventListener("click", () => showSlide(index - 1));
  next?.addEventListener("click", () => showSlide(index + 1));

  dots.forEach((dot, dotIndex) => {
    dot.addEventListener("click", () => showSlide(dotIndex));
  });

  window.setInterval(() => {
    showSlide(index + 1);
  }, 4500);
})();
// ===== SNUS VILLAGE DISTRO CAROUSEL END =====
