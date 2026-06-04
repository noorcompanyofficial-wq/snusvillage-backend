// HAMBURGER TOGGLE
const navbar = document.querySelector(".navbar");

const navLinks = document.getElementById("navLinks");

/* Age Verfication */
const ageModal = document.getElementById("ageModal");
const enterBtn = document.getElementById("enterSite");
const exitBtn = document.getElementById("exitSite");
const ageDob = document.getElementById("ageDob");
const ageError = document.getElementById("ageError");

function isAdultFromDob(value) {
  if (!value) return false;

  const dob = new Date(value + "T00:00:00");
  if (Number.isNaN(dob.getTime())) return false;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }

  return age >= 18;
}

if (new URLSearchParams(window.location.search).get("age") === "reset") {
  localStorage.removeItem("ageVerified");
  sessionStorage.removeItem("ageVerified");
}

function isInternalReferrer() {
  if (!document.referrer) return false;

  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch (error) {
    return false;
  }
}

function isReloadNavigation() {
  const navEntry = performance.getEntriesByType?.("navigation")?.[0];
  return navEntry?.type === "reload";
}

function resetAgeGateOnFreshArrival() {
  const forceAgeGate = ageModal?.dataset.forceAgeGate === "true";

  if (forceAgeGate || (!isInternalReferrer() && !isReloadNavigation())) {
    sessionStorage.removeItem("ageVerified");
  }
}

function showAgeGate() {
  if (!ageModal) return;

  const isAgeVerified = sessionStorage.getItem("ageVerified") === "true";
  ageModal.classList.toggle("is-visible", !isAgeVerified);
  ageModal.setAttribute("aria-hidden", isAgeVerified ? "true" : "false");
  document.body.classList.toggle("age-modal-open", !isAgeVerified);
}

resetAgeGateOnFreshArrival();

// check if already accepted during the current on-site visit
if (ageModal) {
  showAgeGate();
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted && !isInternalReferrer()) {
    sessionStorage.removeItem("ageVerified");
    showAgeGate();
  }
});

// ENTER
enterBtn?.addEventListener("click", () => {
  if (!isAdultFromDob(ageDob?.value)) {
    if (ageError) ageError.hidden = false;
    ageDob?.focus();
    return;
  }

  sessionStorage.setItem("ageVerified", "true");
  if (ageModal) {
    ageModal.classList.remove("is-visible");
    ageModal.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("age-modal-open");
});

ageDob?.addEventListener("input", () => {
  if (ageError) ageError.hidden = true;
});

const slides = document.querySelectorAll(".slide");
let current = 0;

function showSlide(index) {
  slides.forEach((slide) => slide.classList.remove("active"));
  slides[index]?.classList.add("active");
}

if (slides.length > 0) {
  setInterval(() => {
    current = (current + 1) % slides.length;
    showSlide(current);
  }, 5000);
}

// EXIT
exitBtn?.addEventListener("click", () => {
  window.location.href = "https://www.google.com"; //
});

/* Cookies Js */
const cookieBanner = document.getElementById("cookieBanner");
const acceptBtn = document.getElementById("acceptCookies");
const rejectBtn = document.getElementById("rejectCookies");

// check
if (cookieBanner && localStorage.getItem("cookiesChoice")) {
  cookieBanner.style.display = "none";
}

// ACCEPT
acceptBtn?.addEventListener("click", () => {
  localStorage.setItem("cookiesChoice", "accepted");
  if (cookieBanner) cookieBanner.style.display = "none";
});

// REJECT
rejectBtn?.addEventListener("click", () => {
  localStorage.setItem("cookiesChoice", "rejected");
  if (cookieBanner) cookieBanner.style.display = "none";
});

// Hamburger //
const hamburger = document.getElementById("nav-icon4");

if (hamburger && hamburger.children.length === 0) {
  hamburger.innerHTML = `
    <span></span>
    <span></span>
    <span></span>
  `;
}

hamburger?.addEventListener("click", () => {
  hamburger.classList.toggle("open");
  navLinks?.classList.toggle("active");
  document.body.classList.toggle("mobile-nav-open", navLinks?.classList.contains("active"));
});

// User Dropdown
const userToggle = document.querySelector(".user-toggle");
const navUser = document.querySelector(".nav-user");

userToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  navUser?.classList.toggle("active");
});

// CLOSE WHEN CLICK OUTSIDE
document.addEventListener("click", () => {
  navUser?.classList.remove("active");
});

// MOBILE MEGA MENUS
document.querySelectorAll(".nav-mega-item").forEach((item) => {
  const link = item.querySelector(":scope > a");

  link?.addEventListener("click", (event) => {
    if (window.innerWidth > 900) return;

    const isOpen = item.classList.contains("is-open");

    if (!isOpen) {
      event.preventDefault();
      document.querySelectorAll(".nav-mega-item.is-open").forEach((openItem) => {
        if (openItem !== item) openItem.classList.remove("is-open");
      });
      item.classList.add("is-open");
    }
  });
});

/* Navbar Scroll */
window.addEventListener("scroll", () => {
  if (window.scrollY > 0) {
    navbar.classList.add("navbar-shadow");
  } else {
    navbar.classList.remove("navbar-shadow");
  }
});

window.addEventListener("scroll", () => {
  if (window.scrollY > 50) {
    navbar.classList.add("scrolled");
  } else {
    navbar.classList.remove("scrolled");
  }
});

// CLOSE NAV ON LINK CLICK (EXCEPT SHOP)
document.querySelectorAll(".nav-links li a").forEach((link) => {
  const parent = link.parentElement;
  if (!parent.classList.contains("nav-mega-item")) {
    link.addEventListener("click", () => {
      navLinks?.classList.remove("active");
      hamburger?.classList.remove("open");
      document.body.classList.remove("mobile-nav-open");
    });
  }
});

// SEARCH TOGGLE
const searchBtn = document.getElementById("searchBtn");
const searchBar = document.getElementById("searchBar");
searchBtn?.addEventListener("click", () => {
  searchBar?.classList.toggle("active");
});

//Scroll Reveals
// ===== REVEAL ON SCROLL =====
// ===== REVEAL + COUNTER =====
const reveals = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
        animateCounter(entry.target);
      }
    });
  },
  { threshold: 0.2 }
);

reveals.forEach((el) => observer.observe(el));

function animateCounter(card) {
  const counters = card.querySelectorAll(".counter");

  counters.forEach((counter) => {
    if (counter.dataset.done) return;
    counter.dataset.done = "true";

    const target = +counter.getAttribute("data-target");
    let count = 0;
    const speed = target / 40;

    const update = () => {
      if (count < target) {
        count += speed;
        counter.innerText = Math.ceil(count);
        requestAnimationFrame(update);
      } else {
        counter.innerText = target;
      }
    };

    update();
  });
}
// ===== SCROLL ANIMATION (NO CONFLICT) =====
const branchElements = document.querySelectorAll(".branch-animate");

function branchReveal() {
  branchElements.forEach((el, i) => {
    if (el.getBoundingClientRect().top < window.innerHeight - 100) {
      setTimeout(() => {
        el.classList.add("active");
      }, i * 120);
    }
  });
}

window.addEventListener("scroll", branchReveal);

// Best Sellers js design
const track = document.getElementById("sliderTrack");
const nextBtn = document.getElementById("nextBtn");
const prevBtn = document.getElementById("prevBtn");

let index = 0;

function cardsPerView() {
  if (window.innerWidth < 500) return 1;
  if (window.innerWidth < 900) return 2;
  return 4;
}

function updateSlider() {
  if (!track?.children?.length) return;
  const cardWidth = track.children[0].offsetWidth + 20;
  const move = cardWidth * cardsPerView() * index;

  track.style.transform = `translateX(-${move}px)`;
}

if (nextBtn && track) {
  nextBtn.onclick = () => {
  const total = track.children.length;
  const maxIndex = Math.ceil(total / cardsPerView()) - 1;

  index = index >= maxIndex ? 0 : index + 1;
  updateSlider();
  };
}

if (prevBtn && track) {
  prevBtn.onclick = () => {
  const total = track.children.length;
  const maxIndex = Math.ceil(total / cardsPerView()) - 1;

  index = index <= 0 ? maxIndex : index - 1;
  updateSlider();
  };
}

window.addEventListener("resize", () => {
  index = 0;
  updateSlider();
});

/* AUTO */
setInterval(() => {
  nextBtn?.click();
}, 9000);

/* Delivery Js */
// DELIVERY SCROLL ANIMATION
const deliveryItems = document.querySelectorAll(".delivery-animate");

function deliveryReveal() {
  deliveryItems.forEach((el, i) => {
    if (el.getBoundingClientRect().top < window.innerHeight - 100) {
      setTimeout(() => {
        el.classList.add("active");
      }, i * 150);
    }
  });
}

window.addEventListener("scroll", deliveryReveal);

/* Social design js */
// SOCIAL SCROLL ANIMATION
const socialItems = document.querySelectorAll(".social-animate");

function socialReveal() {
  socialItems.forEach((el, i) => {
    if (el.getBoundingClientRect().top < window.innerHeight - 100) {
      setTimeout(() => {
        el.classList.add("active");
      }, i * 120);
    }
  });
}

window.addEventListener("scroll", socialReveal);

/* Shop js */
