const cartContainer = document.querySelector(".cart-items");
const subtotalEl = document.getElementById("subtotal");
const cartCount = document.getElementById("cart-count");
const cart = document.querySelector(".cart");
const overlay = document.querySelector(".cart-overlay");
const checkoutBtn = document.querySelector(".checkout-btn");
const cartClearBtn = document.getElementById("cartClearBtn");
const cartNavbar = document.querySelector(".cart-navbar");

function getFinalPrice(p) {
  return p.discountPrice && p.discountPrice > 0 ? p.discountPrice : p.price;
}

function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || "";
}

// ========================
// LOAD CART (uses JSON endpoint, not the HTML page)
// ========================
async function loadCart() {
  try {
    const res = await fetch("/cart/items");
    const data = await res.json();
    renderCart(data.items || []);
  } catch (err) {
    console.error("loadCart error:", err);
  }
}

// ========================
// ADD TO CART — product ID goes in the URL path
// ========================
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".add-cart");
  if (!btn) return;

  const id = btn.dataset.id;
  if (!id) {
    console.error("Missing product ID on .add-cart button");
    return;
  }

  let quantity = 1;
  if (btn.dataset.quantityInput) {
    const quantityEl = document.querySelector(btn.dataset.quantityInput);
    if (quantityEl) quantity = Math.max(1, parseInt(quantityEl.value, 10) || 1);
  }

  try {
    btn.disabled = true;
    await fetch(`/cart/add/${id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-Token": getCsrfToken(),
      },
      body: JSON.stringify({ quantity }),
    });

    cart?.classList.add("active");
    overlay?.classList.add("active");
    loadCart();
  } catch (err) {
    console.error("Add to cart error:", err);
  } finally {
    btn.disabled = false;
  }
});

// ========================
// NAVBAR CART BUTTON
// ========================
cartNavbar?.addEventListener("click", () => {
  cart?.classList.add("active");
  overlay?.classList.add("active");
});

// ========================
// RENDER CART
// ========================
function renderCart(items) {
  if (!cartContainer || !subtotalEl || !cartCount) return;

  cartContainer.innerHTML = "";

  if (!items.length) {
    cartContainer.innerHTML = `<h3 style="text-align:center;margin-top:50px;color:#6b7a99;">YOUR BAG IS EMPTY</h3>`;
    subtotalEl.textContent = "£0.00";
    cartCount.textContent = "0";
    if (checkoutBtn) checkoutBtn.style.display = "none";
    if (cartClearBtn) cartClearBtn.style.display = "none";
    return;
  }

  let subtotal = 0;

  items.forEach((item) => {
    const p = item.product;
    subtotal += getFinalPrice(p) * item.quantity;

    cartContainer.innerHTML += `
      <div class="cart-item">
        <img src="${p.images?.[0] || ""}" alt="${p.name}" />
        <div class="cart-info">
          <h4>${p.name}</h4>
          <span class="cart-price">£${getFinalPrice(p).toFixed(2)}</span>
        </div>
        <div class="cart-actions">
          <i class="fa-solid fa-trash remove" data-id="${p._id}" title="Remove"></i>
          <div class="qty">
            <button class="minus" data-id="${p._id}">−</button>
            <span>${item.quantity}</span>
            <button class="plus" data-id="${p._id}">+</button>
          </div>
        </div>
      </div>
    `;
  });

  subtotalEl.textContent = "£" + subtotal.toFixed(2);
  cartCount.textContent = items.reduce((sum, i) => sum + i.quantity, 0);

  if (checkoutBtn) checkoutBtn.style.display = "block";
  if (cartClearBtn) cartClearBtn.style.display = "block";

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
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-Token": getCsrfToken(),
      },
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
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-Token": getCsrfToken(),
      },
      body: JSON.stringify({ productId: id }),
    });
    loadCart();
  } catch (err) {
    console.error("Remove error:", err);
  }
}

// ========================
// CLEAR CART
// ========================
async function clearCart() {
  try {
    await fetch("/cart/clear", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-Token": getCsrfToken(),
      },
    });
    loadCart();
  } catch (err) {
    console.error("Clear cart error:", err);
  }
}

// ========================
// CLOSE CART + INIT
// ========================
document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.querySelector(".close-cart");

  closeBtn?.addEventListener("click", () => {
    cart?.classList.remove("active");
    overlay?.classList.remove("active");
  });

  overlay?.addEventListener("click", () => {
    cart?.classList.remove("active");
    overlay?.classList.remove("active");
  });

  cartClearBtn?.addEventListener("click", clearCart);
});

loadCart();
