const wholesaleModal = document.getElementById("wholesaleModal");
const openWholesaleButtons = document.querySelectorAll("[data-open-wholesale]");
const closeWholesaleButtons = document.querySelectorAll(
  "[data-close-wholesale]",
);

function openWholesaleModal() {
  wholesaleModal?.classList.add("is-open");
  wholesaleModal?.setAttribute("aria-hidden", "false");
  document.body.classList.add("wholesale-modal-open");
}

function closeWholesaleModal() {
  wholesaleModal?.classList.remove("is-open");
  wholesaleModal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("wholesale-modal-open");
}

openWholesaleButtons.forEach((button) => {
  button.addEventListener("click", openWholesaleModal);
});

closeWholesaleButtons.forEach((button) => {
  button.addEventListener("click", closeWholesaleModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeWholesaleModal();
  }
});
