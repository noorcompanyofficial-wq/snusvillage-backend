document.addEventListener("DOMContentLoaded", () => {
  const brandSections = document.querySelectorAll(".shop-brand-section");

  brandSections.forEach((section) => {
    const carousel = section.querySelector("[data-brand-carousel]");
    const prev = section.querySelector(".shop-brand-arrow--prev");
    const next = section.querySelector(".shop-brand-arrow--next");

    if (!carousel) return;

    function updateArrowVisibility() {
      const canScroll = carousel.scrollWidth > carousel.clientWidth + 8;
      section.dataset.noScroll = canScroll ? "false" : "true";
    }

    function scrollCarousel(direction) {
      const firstCard = carousel.querySelector(".shop-product-card");
      const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : 230;
      const gap = 18;
      const amount = (cardWidth + gap) * 2;

      carousel.scrollBy({
        left: direction === "next" ? amount : -amount,
        behavior: "smooth",
      });
    }

    prev?.addEventListener("click", () => scrollCarousel("prev"));
    next?.addEventListener("click", () => scrollCarousel("next"));

    updateArrowVisibility();
    window.addEventListener("resize", updateArrowVisibility);
  });
});
