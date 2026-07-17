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

const mobileToggle = document.getElementById("mobileToggle") || document.getElementById("nav-icon4");
const navLinks = document.getElementById("navLinks");

if (mobileToggle && mobileToggle.id === "nav-icon4" && mobileToggle.children.length === 0) {
  mobileToggle.innerHTML = "<span></span><span></span><span></span>";
}

mobileToggle?.addEventListener("click", () => {
  navLinks?.classList.toggle("is-open");
  navLinks?.classList.toggle("active");
  mobileToggle.classList.toggle("open");
  document.body.classList.toggle("mobile-nav-open", navLinks?.classList.contains("active"));
});

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

document.querySelectorAll("#navLinks a").forEach((link) => {
  link.addEventListener("click", () => {
    if (window.innerWidth <= 900 && link.parentElement?.classList.contains("nav-mega-item")) {
      return;
    }

    navLinks?.classList.remove("is-open");
    navLinks?.classList.remove("active");
    mobileToggle?.classList.remove("open");
    document.body.classList.remove("mobile-nav-open");
  });
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


function runNonCriticalHomepageScripts() {

  // ===== SNUS VILLAGE SOCIAL IPHONE START =====
  (function () {
    const reel = document.getElementById("svSocialReel");
    if (!reel) return;

    const slides = Array.from(reel.querySelectorAll(".sv-social-slide"));
    const dots = Array.from(document.querySelectorAll(".sv-social-dots button"));
    const prevBtn = document.querySelector(".sv-social-prev");
    const nextBtn = document.querySelector(".sv-social-next");

    let current = 0;
    let autoRotate;

    function pauseAllVideos() {
      slides.forEach((slide) => {
        const video = slide.querySelector("video");
        if (video) {
          video.pause();
          video.currentTime = 0;
        }
      });
    }

    function playCurrentVideo() {
      const activeVideo = slides[current]?.querySelector("video");
      if (activeVideo) {
        activeVideo.play().catch(() => {});
      }
    }

    function showSlide(index) {
      current = (index + slides.length) % slides.length;

      slides.forEach((slide, i) => {
        slide.classList.toggle("is-active", i === current);
      });

      dots.forEach((dot, i) => {
        dot.classList.toggle("is-active", i === current);
      });

      pauseAllVideos();
      playCurrentVideo();
    }

    function nextSlide() {
      showSlide(current + 1);
    }

    function prevSlide() {
      showSlide(current - 1);
    }

    function startAutoRotate() {
      clearInterval(autoRotate);
      autoRotate = setInterval(nextSlide, 5000);
    }

    prevBtn?.addEventListener("click", () => {
      prevSlide();
      startAutoRotate();
    });

    nextBtn?.addEventListener("click", () => {
      nextSlide();
      startAutoRotate();
    });

    dots.forEach((dot, index) => {
      dot.addEventListener("click", () => {
        showSlide(index);
        startAutoRotate();
      });
    });

    showSlide(0);
    startAutoRotate();
  })();
  // ===== SNUS VILLAGE SOCIAL IPHONE END =====
}

if ("requestIdleCallback" in window) {
  requestIdleCallback(runNonCriticalHomepageScripts, { timeout: 2500 });
} else {
  window.setTimeout(runNonCriticalHomepageScripts, 1200);
}
