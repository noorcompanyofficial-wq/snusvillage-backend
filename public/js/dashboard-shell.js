(function () {
  const content = document.getElementById("dshContent");
  const crumb = document.getElementById("dshCrumb");
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";

  const crumbTitles = {
    overview: "My Account",
    orders: "My Orders",
    wishlist: "Wishlist",
    addresses: "Addresses",
    profile: "Profile",
    preferences: "Preferences",
  };

  function keyForPath(pathname) {
    if (pathname.startsWith("/auth/dashboard/orders")) return "orders";
    if (pathname.startsWith("/auth/dashboard/wishlist")) return "wishlist";
    if (pathname.startsWith("/auth/dashboard/addresses")) return "addresses";
    if (pathname.startsWith("/auth/dashboard/profile")) return "profile";
    if (pathname.startsWith("/auth/dashboard/preferences")) return "preferences";
    return "overview";
  }

  function setActiveNav(pathname) {
    const key = keyForPath(pathname);
    document.querySelectorAll(".dsh-sb-link[data-key], .dsh-mn-item[data-key]").forEach((link) => {
      link.classList.toggle("active", link.dataset.key === key);
    });
    if (crumb) crumb.textContent = crumbTitles[key] || "My Account";
  }

  function runInlineScripts(container) {
    container.querySelectorAll("script").forEach((oldScript) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) => newScript.setAttribute(attr.name, attr.value));
      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    });
  }

  async function loadPage(url, push) {
    if (!content) {
      window.location.href = url;
      return;
    }

    content.style.opacity = "0.45";

    try {
      const res = await fetch(url, {
        headers: { "X-Dashboard-Spa": "1" },
        credentials: "same-origin",
      });

      if (!res.ok && res.status !== 403) throw new Error("Bad response");

      const html = await res.text();
      content.innerHTML = html;

      const finalUrl = new URL(res.url);
      if (push) history.pushState({ spa: true }, "", finalUrl.pathname + finalUrl.search);
      setActiveNav(finalUrl.pathname);
      content.scrollTop = 0;
      window.scrollTo(0, 0);
      runInlineScripts(content);
      initPageScripts();
    } catch (err) {
      window.location.href = url;
    } finally {
      content.style.opacity = "1";
    }
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest("a");
    if (!link || !link.href) return;
    if (link.target === "_blank" || link.hasAttribute("download") || link.dataset.noSpa !== undefined) return;

    let url;
    try {
      url = new URL(link.href, window.location.origin);
    } catch (err) {
      return;
    }

    if (url.origin !== window.location.origin) return;
    if (!url.pathname.startsWith("/auth/dashboard")) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search && !url.hash) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    loadPage(link.href, true);
  });

  document.addEventListener("submit", (event) => {
    if (event.defaultPrevented) return;

    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.noSpa !== undefined) return;

    const action = form.getAttribute("action") || window.location.pathname;
    let actionUrl;
    try {
      actionUrl = new URL(action, window.location.origin);
    } catch (err) {
      return;
    }
    if (actionUrl.origin !== window.location.origin || !actionUrl.pathname.startsWith("/auth/dashboard")) return;

    const method = (form.getAttribute("method") || "GET").toUpperCase();

    if (method === "GET") {
      event.preventDefault();
      const params = new URLSearchParams(new FormData(form));
      loadPage(actionUrl.pathname + "?" + params.toString(), true);
      return;
    }

    event.preventDefault();

    const body = new URLSearchParams(new FormData(form));
    const submitBtns = form.querySelectorAll("button[type='submit'], input[type='submit']");
    submitBtns.forEach((btn) => (btn.disabled = true));

    fetch(actionUrl.pathname + actionUrl.search, {
      method: "POST",
      headers: { "X-Dashboard-Spa": "1" },
      body,
      credentials: "same-origin",
    })
      .then((res) => {
        if (!res.ok && res.status !== 403) throw new Error("Bad response");
        return res.text().then((html) => ({ res, html }));
      })
      .then(({ res, html }) => {
        if (!content) return;
        content.innerHTML = html;
        const finalUrl = new URL(res.url);
        history.pushState({ spa: true }, "", finalUrl.pathname + finalUrl.search);
        setActiveNav(finalUrl.pathname);
        content.scrollTop = 0;
        window.scrollTo(0, 0);
        runInlineScripts(content);
        initPageScripts();
      })
      .catch(() => {
        form.submit();
      })
      .finally(() => {
        submitBtns.forEach((btn) => (btn.disabled = false));
      });
  });

  window.addEventListener("popstate", () => {
    loadPage(window.location.href, false);
  });

  document.addEventListener("click", (event) => {
    const closeBtn = event.target.closest(".dsh-flash");
    if (closeBtn) closeBtn.classList.add("dismissed");
  });

  // ---- Per-page interactive behaviour, re-bound after every SPA swap ----

  function initOrderCards() {
    document.querySelectorAll(".dsh-oc-head").forEach((head) => {
      head.addEventListener("click", () => {
        const expand = head.nextElementSibling;
        const chevron = head.querySelector(".dsh-oc-chevron");
        const open = expand.classList.toggle("open");
        if (chevron) chevron.style.transform = open ? "rotate(180deg)" : "";
      });
    });

    document.querySelectorAll(".dsh-tab[data-status]").forEach((tab) => {
      tab.addEventListener("click", () => {
        tab.closest(".dsh-tabs")?.querySelectorAll(".dsh-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const status = tab.dataset.status;
        document.querySelectorAll(".dsh-order-card").forEach((card) => {
          card.style.display = status === "all" || card.dataset.status === status ? "" : "none";
        });
      });
    });
  }

  function initWishlistActions() {
    document.querySelectorAll("[data-wishlist-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const productId = btn.dataset.wishlistRemove;
        const card = btn.closest(".dsh-wish-card");
        try {
          const res = await fetch(`/wishlist/toggle/${productId}`, {
            method: "POST",
            headers: { Accept: "application/json", "X-CSRF-Token": csrfToken },
            credentials: "same-origin",
          });
          if (res.ok) card?.remove();
        } catch (err) {
          /* leave card in place on network failure */
        }
      });
    });

    async function addToCart(productId, btn) {
      try {
        const res = await fetch(`/cart/add/${productId}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "X-CSRF-Token": csrfToken,
          },
          body: "quantity=1",
          credentials: "same-origin",
        });
        if (res.ok && btn) btn.innerHTML = '<i class="fa-solid fa-check"></i> Added';
        return res.ok;
      } catch (err) {
        return false;
      }
    }

    document.querySelectorAll("[data-wishlist-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.disabled = true;
        addToCart(btn.dataset.wishlistAdd, btn);
      });
    });

    document.getElementById("dshAddAllToCart")?.addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      btn.disabled = true;
      const addButtons = Array.from(document.querySelectorAll("[data-wishlist-add]"));
      for (const addBtn of addButtons) {
        await addToCart(addBtn.dataset.wishlistAdd, addBtn);
      }
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Added all to cart';
    });
  }

  function initAddressForms() {
    const newBtn = document.getElementById("dshAddAddressBtn");
    const prompt = document.getElementById("dshNewAddressPrompt");
    const formWrap = document.getElementById("dshNewAddressFormWrap");

    function openNewAddressForm() {
      prompt?.classList.add("dsh-hidden");
      formWrap?.classList.remove("dsh-hidden");
    }

    newBtn?.addEventListener("click", openNewAddressForm);
    prompt?.addEventListener("click", openNewAddressForm);

    document.querySelectorAll("[data-address-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.addressEdit;
        document.getElementById(`dsh-addr-view-${id}`)?.classList.add("dsh-hidden");
        document.getElementById(`dsh-addr-edit-${id}`)?.classList.remove("dsh-hidden");
      });
    });

    document.querySelectorAll("[data-address-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.addressCancel;
        document.getElementById(`dsh-addr-view-${id}`)?.classList.remove("dsh-hidden");
        document.getElementById(`dsh-addr-edit-${id}`)?.classList.add("dsh-hidden");
      });
    });

    document.querySelectorAll("[data-address-delete-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        if (!window.confirm("Remove this address?")) event.preventDefault();
      });
    });
  }

  function initDeleteAccount() {
    document.querySelectorAll("[data-delete-account-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        if (!window.confirm("Request account deletion? Our team will review and action this request.")) {
          event.preventDefault();
        }
      });
    });
  }

  window.initPageScripts = function initPageScripts() {
    initOrderCards();
    initWishlistActions();
    initAddressForms();
    initDeleteAccount();
  };

  setActiveNav(window.location.pathname);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.initPageScripts());
  } else {
    window.initPageScripts();
  }
})();
