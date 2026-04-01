// IMAGE SWITCH
const thumbs = document.querySelectorAll(".thumb");
const mainImg = document.getElementById("mainProductImg");

thumbs.forEach((thumb) => {
  thumb.addEventListener("click", () => {
    mainImg.src = thumb.src;

    thumbs.forEach((t) => t.classList.remove("active"));
    thumb.classList.add("active");
  });
});

// TABS WITH SLIDE
const tabs = document.querySelectorAll(".tab");
const contents = document.querySelectorAll(".tab-content");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;

    tabs.forEach((t) => t.classList.remove("active"));
    contents.forEach((c) => c.classList.remove("active"));

    tab.classList.add("active");
    document.getElementById(target).classList.add("active");
  });
});

// QTY BUTTON
const minus = document.querySelector(".qty button:first-child");
const plus = document.querySelector(".qty button:last-child");
const input = document.querySelector(".qty input");

minus.onclick = () => {
  if (input.value > 1) input.value--;
};

plus.onclick = () => {
  input.value++;
};
