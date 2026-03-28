// HAMBURGER TOGGLE
const navbar = document.querySelector(".navbar");

const navLinks = document.getElementById("navLinks");

/* Age Verfication */
const ageModal = document.getElementById("ageModal");
const enterBtn = document.getElementById("enterSite");
const exitBtn = document.getElementById("exitSite");

// check if already accepted
if (localStorage.getItem("ageVerified") === "true") {
  ageModal.style.display = "none";
}

// ENTER
enterBtn.addEventListener("click", () => {
  localStorage.setItem("ageVerified", "true");
  ageModal.style.display = "none";
});

// EXIT
exitBtn.addEventListener("click", () => {
  window.location.href = "https://www.google.com"; //
});

/* Cookies Js */
const cookieBanner = document.getElementById("cookieBanner");
const acceptBtn = document.getElementById("acceptCookies");
const rejectBtn = document.getElementById("rejectCookies");

// check
if (localStorage.getItem("cookiesChoice")) {
  cookieBanner.style.display = "none";
}

// ACCEPT
acceptBtn.addEventListener("click", () => {
  localStorage.setItem("cookiesChoice", "accepted");
  cookieBanner.style.display = "none";
});

// REJECT
rejectBtn.addEventListener("click", () => {
  localStorage.setItem("cookiesChoice", "rejected");
  cookieBanner.style.display = "none";
});

// Hamburger //
const hamburger = document.getElementById("nav-icon4");

hamburger.innerHTML = `
  <span></span>
  <span></span>
  <span></span>
`;

hamburger.addEventListener("click", () => {
  hamburger.classList.toggle("open");
  navLinks.classList.toggle("active");
});

// User Dropdown
const userToggle = document.querySelector(".user-toggle");
const navUser = document.querySelector(".nav-user");

userToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  navUser.classList.toggle("active");
});

// CLOSE WHEN CLICK OUTSIDE
document.addEventListener("click", () => {
  navUser.classList.remove("active");
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

/* Navbar Scroll */
window.addEventListener("scroll", () => {
  if (window.scrollY > 0) {
    navbar.classList.add("navbar-shadow");
  } else {
    navbar.classList.remove("navbar-shadow");
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
setInterval(() => {
  nextBtn.click();
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
