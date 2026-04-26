// REVEAL
const reveals = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("active");
      animateCounters(entry.target);
    }
  });
});

reveals.forEach((el) => observer.observe(el));

// COUNTERS
function animateCounters(el) {
  const counters = el.querySelectorAll(".counter");

  counters.forEach((counter) => {
    const target = +counter.dataset.target;
    let count = 0;

    const update = () => {
      count += target / 40;
      counter.innerText = Math.ceil(count);

      if (count < target) {
        requestAnimationFrame(update);
      } else {
        counter.innerText = target;
      }
    };

    update();
  });
}
