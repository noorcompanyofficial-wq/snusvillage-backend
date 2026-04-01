// ===== SELECTORS =====
const cart = document.querySelector(".cart");
const overlay = document.querySelector(".cart-overlay");
const closeBtn = document.querySelector(".close-cart");
const addToCartBtns = document.querySelectorAll(".add-cart,.cart-navbar");

// ===== OPEN CART =====
addToCartBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    cart.classList.add("active");
    overlay.classList.add("active");
  });
});

// ===== CLOSE CART =====
closeBtn.addEventListener("click", () => {
  cart.classList.remove("active");
  overlay.classList.remove("active");
});

overlay.addEventListener("click", () => {
  cart.classList.remove("active");
  overlay.classList.remove("active");
});

// ===== REMOVE ITEM =====
document.querySelectorAll(".remove").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const item = e.target.closest(".cart-item");
    item.remove();
  });
});

// ===== QTY CONTROL =====
document.querySelectorAll(".cart-item").forEach((item) => {
  const minus = item.querySelector(".minus");
  const plus = item.querySelector(".plus");
  const qty = item.querySelector(".qty span");

  minus.onclick = () => {
    let val = parseInt(qty.textContent);
    if (val > 1) qty.textContent = val - 1;
  };

  plus.onclick = () => {
    let val = parseInt(qty.textContent);
    qty.textContent = val + 1;
  };
});
