const flash = document.getElementById("flashMessage");
const closeBtn = document.getElementById("flashClose");

if (flash) {
  // show animation
  setTimeout(() => {
    flash.classList.add("show");
  }, 100);

  // auto remove after 5s
  setTimeout(() => {
    hideFlash();
  }, 5000);

  // close button
  closeBtn.addEventListener("click", hideFlash);
}

function hideFlash() {
  flash.classList.remove("show");

  setTimeout(() => {
    flash.remove();
  }, 400);
}
