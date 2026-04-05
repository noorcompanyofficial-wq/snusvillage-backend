// auto remove after 5 seconds
document.querySelectorAll(".flash").forEach((flash) => {
  setTimeout(() => {
    removeFlash(flash);
  }, 5000);
});

function closeFlash(btn) {
  const flash = btn.parentElement;
  removeFlash(flash);
}

function removeFlash(flash) {
  flash.style.animation = "slideOut 0.4s ease forwards";

  setTimeout(() => {
    flash.remove();
  }, 900);
}
