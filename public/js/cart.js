const cartContainer = document.querySelector(".cart-items");
const subtotalEl = document.getElementById("subtotal");
const cartCount = document.getElementById("cart-count");
const cart = document.querySelector(".cart");
const overlay = document.querySelector(".cart-overlay");
const checkoutBtn = document.querySelector(".checkout-btn");
const cartNavbar = document.querySelector(".cart-navbar");
// ======== Final Price
function getFinalPrice(p) {
  return p.discountPrice && p.discountPrice > 0 ? p.discountPrice : p.price;
}

// ========================
// LOAD CART
// ========================
async function loadCart() {
  const res = await fetch("/cart");
  const data = await res.json();

  renderCart(data.items || []);

  // force UI update (important fix)
  const checkoutBtn = document.querySelector(".checkout-btn");
  if (checkoutBtn) {
    checkoutBtn.style.display =
      data.items && data.items.length ? "block" : "none";
  }
}
// ========================
// ADD TO CART (FIXED - EVENT DELEGATION)
// ========================
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".add-cart");
  if (!btn) return;

  const id = btn.dataset.id;

  if (!id) {
    console.error("❌ Missing product ID");
    return;
  }

  try {
    await fetch("/cart/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ productId: id }),
    });

    // open cart
    cart.classList.add("active");
    overlay.classList.add("active");

    loadCart();
  } catch (err) {
    console.error("Add to cart error:", err);
  }
});

// =====
// Navbar slider
// =====
cartNavbar.addEventListener("click", () => {
  cart.classList.add("active");
});

// ========================
// RENDER CART
// ========================
function renderCart(items) {
  cartContainer.innerHTML = "";

  if (!items.length) {
    cartContainer.innerHTML = `
      <h3 style="text-align:center;margin-top:50px;">
        YOUR BAG IS EMPTY
      </h3>
    `;

    subtotalEl.textContent = "£0.00";
    cartCount.textContent = "0";

    if (checkoutBtn)
      checkoutBtn.style.display = items.length ? "block" : "none";
    return;
  }

  let subtotal = 0;

  items.forEach((item) => {
    const p = item.product;

    subtotal += getFinalPrice(p) * item.quantity;

    cartContainer.innerHTML += `
      <div class="cart-item">
        <img src="${p.images?.[0] || ""}" />

        <div class="cart-info">
          <h4>${p.name}</h4>
         <span class="cart-price">£${getFinalPrice(p).toFixed(2)}</span>
        </div>

        <div class="cart-actions">
          <i class="fa-solid fa-trash remove" data-id="${p._id}"></i>

          <div class="qty">
            <button class="minus" data-id="${p._id}">-</button>
            <span>${item.quantity}</span>
            <button class="plus" data-id="${p._id}">+</button>
          </div>
        </div>
      </div>
    `;
  });

  subtotalEl.textContent = "£" + subtotal.toFixed(2);

  // FIX: total quantity not item count
  cartCount.textContent = items.reduce((sum, i) => sum + i.quantity, 0);

  attachEvents();
}

// ========================
// CART EVENTS
// ========================
function attachEvents() {
  document.querySelectorAll(".plus").forEach((btn) => {
    btn.onclick = () => updateQty(btn.dataset.id, "plus");
  });

  document.querySelectorAll(".minus").forEach((btn) => {
    btn.onclick = () => updateQty(btn.dataset.id, "minus");
  });

  document.querySelectorAll(".remove").forEach((btn) => {
    btn.onclick = () => removeItem(btn.dataset.id);
  });
}

// ========================
// UPDATE QTY
// ========================
async function updateQty(id, action) {
  try {
    await fetch("/cart/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: id, action }),
    });

    loadCart();
  } catch (err) {
    console.error("Update qty error:", err);
  }
}

// ========================
// REMOVE ITEM
// ========================
async function removeItem(id) {
  try {
    await fetch("/cart/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: id }),
    });

    loadCart();
  } catch (err) {
    console.error("Remove error:", err);
  }
}

// ========================
// CLOSE CART
// ========================
document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.querySelector(".close-cart");

  if (closeBtn) {
    closeBtn.onclick = () => {
      cart.classList.remove("active");
      overlay.classList.remove("active");
    };
  }

  if (overlay) {
    overlay.onclick = () => {
      cart.classList.remove("active");
      overlay.classList.remove("active");
    };
  }
});

// ========================
// INIT
// ========================
loadCart();
