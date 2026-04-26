const hexItems = document.querySelectorAll(".hex");

function revealOnScroll() {
  const triggerBottom = window.innerHeight * 0.85;

  hexItems.forEach((item, index) => {
    const boxTop = item.getBoundingClientRect().top;

    if (boxTop < triggerBottom) {
      item.style.transitionDelay = `${index * 0.05}s`;
      item.classList.add("show");
    }
  });
}

window.addEventListener("scroll", revealOnScroll);
window.addEventListener("load", revealOnScroll);
