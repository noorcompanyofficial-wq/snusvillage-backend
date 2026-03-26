// HAMBURGER TOGGLE
const hamburger = document.getElementById("hamburger");
const navLinks = document.getElementById("navLinks");

hamburger.addEventListener("click", () => {
  navLinks.classList.toggle("active");
});

// DROPDOWN SHOP MOBILE
const shopItem = document.querySelector(".shop-item");
const shopLink = shopItem.querySelector("a");
const megaMenu = shopItem.querySelector(".mega-menu");

shopLink.addEventListener("click", (e) => {
  if (window.innerWidth <= 900) {
    e.preventDefault();

    // CLOSE OTHER DROPDOWNS
    document.querySelectorAll(".shop-item").forEach((item) => {
      if (item !== shopItem) {
        item.classList.remove("active");
        const menu = item.querySelector(".mega-menu");
        menu.style.height = 0;
      }
    });

    // TOGGLE CURRENT DROPDOWN
    if (!shopItem.classList.contains("active")) {
      shopItem.classList.add("active");
      megaMenu.style.height = megaMenu.scrollHeight + "px"; // SET HEIGHT TO SCROLLHEIGHT
    } else {
      megaMenu.style.height = 0; // CLOSE DROPDOWN
      shopItem.classList.remove("active");
    }
  }
});

// CLOSE NAV ON LINK CLICK (EXCEPT SHOP)
document.querySelectorAll(".nav-links li a").forEach((link) => {
  const parent = link.parentElement;
  if (!parent.classList.contains("shop-item")) {
    link.addEventListener("click", () => {
      navLinks.classList.remove("active");
    });
  }
});

// SEARCH TOGGLE
const searchBtn = document.getElementById("searchBtn");
const searchBar = document.getElementById("searchBar");
searchBtn.addEventListener("click", () => {
  searchBar.classList.toggle("active");
});

var interleaveOffset = 0.5;

var swiperOptions = {
  loop: true,
  speed: 1000,
  grabCursor: true,
  watchSlidesProgress: true,
  mousewheel: true,
  keyboard: true,
  navigation: {
    nextEl: ".swiper-button-next",
    prevEl: ".swiper-button-prev",
  },
  pagination: {
    el: ".swiper-pagination",
    clickable: true,
  },
  on: {
    progress: function () {
      var swiper = this;
      for (var i = 0; i < swiper.slides.length; i++) {
        var slideProgress = swiper.slides[i].progress;
        var innerOffset = swiper.width * interleaveOffset;
        var innerTranslate = slideProgress * innerOffset;
        swiper.slides[i].querySelector(".slide-inner").style.transform =
          "translate3d(" + innerTranslate + "px, 0, 0)";
      }
    },
    touchStart: function () {
      var swiper = this;
      for (var i = 0; i < swiper.slides.length; i++) {
        swiper.slides[i].style.transition = "";
      }
    },
    setTransition: function (speed) {
      var swiper = this;
      for (var i = 0; i < swiper.slides.length; i++) {
        swiper.slides[i].style.transition = speed + "ms";
        swiper.slides[i].querySelector(".slide-inner").style.transition =
          speed + "ms";
      }
    },
  },
};

var swiper = new Swiper(".swiper-container", swiperOptions);

//Scroll Reveals
const reveals = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
      }
    });
  },
  { threshold: 0.2 },
);

reveals.forEach((el) => observer.observe(el));

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

// ===== MAP MODAL =====
// ===== MAP MODAL =====
const modal = document.getElementById("mapModal");
const frame = document.getElementById("mapFrame");
const closeBtn = document.getElementById("closeMap");

// Google Maps embed URLs
const maps = {
  camden:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1983.4846893471757!2d-0.14680558429294292!3d51.54042252508145!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x48761ae177baa471%3A0x5345d18739c2a60d!2s257%20Camden%20High%20St%2C%20London%20NW1%207BU!5e0!3m2!1sen!2suk!4v1699186141358!5m2!1sen!2suk",
  oxford:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1984.4760037737253!2d-0.14723688429292914!3d51.51447482508196!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x4876057c7dcbe261%3A0x8f88430bf18ab189!2sSnus%20Village%2C%20339%20Oxford%20St%2C%20London%20W1C%202JB!5e0!3m2!1sen!2suk!4v1699186230000!5m2!1sen!2suk",
  edgware:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1983.1152848293655!2d-0.16450648429290058!3d51.51609692508196!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x4876053b9db5b123%3A0xabcdef1234567890!2s89%20Edgware%20Rd%2C%20Tyburnia%2C%20London%20W2%202HX!5e0!3m2!1sen!2suk!4v1699186312345!5m2!1sen!2suk",
  southall:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1981.123456789!2d-0.3876!3d51.5112!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x48762f8f1234567%3A0xabcdef1234567890!2sUnit%20E%2F4%2C%20Middlesex%20Business%20Centre%2C%20Bridge%20Rd%2C%20Southall%20UB2%204AB!5e0!3m2!1sen!2suk!4v1699186400000!5m2!1sen!2suk",
};

document.querySelectorAll(".map-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const location = btn.getAttribute("data-map");
    if (!location || !maps[location]) return;

    frame.src = maps[location];
    modal.classList.add("active");
  });
});

closeBtn.addEventListener("click", () => {
  modal.classList.remove("active");
  frame.src = "";
});

// click outside closes modal
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.classList.remove("active");
    frame.src = "";
  }
});
window.addEventListener("scroll", revealOnScroll);

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
  const cardWidth = track.children[0].offsetWidth + 20;
  const move = cardWidth * cardsPerView() * index;

  track.style.transform = `translateX(-${move}px)`;
}

nextBtn.onclick = () => {
  const total = track.children.length;
  const maxIndex = Math.ceil(total / cardsPerView()) - 1;

  index = index >= maxIndex ? 0 : index + 1;
  updateSlider();
};

prevBtn.onclick = () => {
  const total = track.children.length;
  const maxIndex = Math.ceil(total / cardsPerView()) - 1;

  index = index <= 0 ? maxIndex : index - 1;
  updateSlider();
};

window.addEventListener("resize", () => {
  index = 0;
  updateSlider();
});

/* AUTO */
