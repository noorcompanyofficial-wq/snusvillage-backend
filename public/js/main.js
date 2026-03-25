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
