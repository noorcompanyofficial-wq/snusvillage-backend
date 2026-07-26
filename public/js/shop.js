document.addEventListener("DOMContentLoaded", () => {
  const brandSections = document.querySelectorAll(".shop-brand-section");

  brandSections.forEach((section) => {
    const carousel = section.querySelector("[data-brand-carousel]");
    const prev = section.querySelector(".shop-brand-arrow--prev");
    const next = section.querySelector(".shop-brand-arrow--next");

    if (!carousel) return;

    function updateArrowVisibility() {
      const canScroll = carousel.scrollWidth > carousel.clientWidth + 8;
      section.dataset.noScroll = canScroll ? "false" : "true";
    }

    function scrollCarousel(direction) {
      const firstCard = carousel.querySelector(".shop-product-card");
      const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : 230;
      const gap = 18;
      const amount = (cardWidth + gap) * 2;

      carousel.scrollBy({
        left: direction === "next" ? amount : -amount,
        behavior: "smooth",
      });
    }

    prev?.addEventListener("click", () => scrollCarousel("prev"));
    next?.addEventListener("click", () => scrollCarousel("next"));

    updateArrowVisibility();
    window.addEventListener("resize", updateArrowVisibility);
  });
});

// ===== SHOP PAGE V2 (sidebar filters + grid) =====
// Only runs on pages that render the new #prodGrid markup (the redesigned
// /shop page and the wishlist page); a no-op everywhere else, including the
// old brand-carousel /collections/vapes page handled above.
(function () {
  const grid = document.getElementById("prodGrid");
  if (!grid) return;

  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
  const prodCountEl = document.getElementById("prodCount");
  const emptyState = document.getElementById("emptyState");
  const activeFiltersEl = document.getElementById("activeFilters");
  const clearAllBtn = document.getElementById("clearAll");
  const priceSlider = document.getElementById("priceSlider");
  const priceVal = document.getElementById("priceVal");
  const loadMoreWrap = document.getElementById("loadMoreWrap");
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  const loadMoreInfo = document.getElementById("loadMoreInfo");
  const sortSelect = document.getElementById("sortSelect");

  const PAGE_SIZE = 12;
  let visibleCount = PAGE_SIZE;

  // ---- Toast ----
  let toastTimer = null;
  function showToast(message) {
    const toast = document.getElementById("shopToast");
    if (!toast) return;
    document.getElementById("shopToastMsg").textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
  }

  // ---- Filtering ----
  function activeValues(selector, attr) {
    return Array.from(document.querySelectorAll(selector))
      .map((el) => el.dataset[attr])
      .filter(Boolean);
  }

  function currentFilterState() {
    return {
      strengths: activeValues(".sp-item.active", "str"),
      brands: activeValues(".cb-item.checked[data-brand]", "brand"),
      flavours: activeValues(".fp.active", "flavour"),
      formats: activeValues(".cb-item.checked[data-format]", "format"),
      maxPrice: priceSlider ? Number(priceSlider.value) : null,
    };
  }

  function applyFilters() {
    const state = currentFilterState();
    const cards = Array.from(grid.querySelectorAll(".pc"));
    let visible = 0;

    cards.forEach((card) => {
      const strOk = state.strengths.length === 0 || state.strengths.includes(card.dataset.str);
      const brandOk = state.brands.length === 0 || state.brands.includes(card.dataset.brand);
      const flavourTags = (card.dataset.flavour || "").split(" ").filter(Boolean);
      const flavourOk = state.flavours.length === 0 || state.flavours.some((f) => flavourTags.includes(f));
      const formatOk = state.formats.length === 0 || state.formats.includes(card.dataset.format);
      const priceOk = state.maxPrice == null || Number(card.dataset.price) <= state.maxPrice;
      const show = strOk && brandOk && flavourOk && formatOk && priceOk;

      card.dataset.matches = show ? "1" : "0";
      if (show) visible++;
    });

    revealVisible();

    if (prodCountEl) prodCountEl.textContent = String(visible);
    if (emptyState) emptyState.classList.toggle("visible", visible === 0);

    updateChips();
  }

  function revealVisible() {
    const matching = Array.from(grid.querySelectorAll('.pc[data-matches="1"]'));
    matching.forEach((card, i) => {
      card.style.display = i < visibleCount ? "" : "none";
    });
    grid.querySelectorAll('.pc[data-matches="0"]').forEach((card) => {
      card.style.display = "none";
    });

    if (loadMoreWrap) {
      const hasMore = matching.length > visibleCount;
      loadMoreWrap.style.display = matching.length === 0 ? "none" : "block";
      if (loadMoreBtn) loadMoreBtn.style.display = hasMore ? "" : "none";
      if (loadMoreInfo) {
        loadMoreInfo.textContent = hasMore
          ? `Showing ${Math.min(visibleCount, matching.length)} of ${matching.length} products`
          : `Showing all ${matching.length} product${matching.length === 1 ? "" : "s"}`;
      }
    }
  }

  function labelFor(el) {
    if (el.dataset.str) return el.querySelector(".sp-name")?.textContent.trim() || el.dataset.str;
    if (el.dataset.brand) return el.childNodes[1]?.textContent.trim() || el.dataset.brand;
    if (el.dataset.flavour) return el.textContent.trim();
    if (el.dataset.format) return el.childNodes[1]?.textContent.trim() || el.dataset.format;
    return "";
  }

  function updateChips() {
    if (!activeFiltersEl) return;

    const activeEls = [
      ...document.querySelectorAll("#sidebarFilters .sp-item.active, #sidebarFilters .cb-item.checked, #sidebarFilters .fp.active"),
    ];

    activeFiltersEl.innerHTML = "";

    activeEls.forEach((el) => {
      const chip = document.createElement("div");
      chip.className = "af-chip";
      chip.innerHTML = `<i class="fa-solid fa-xmark"></i> ${labelFor(el)}`;
      chip.addEventListener("click", () => {
        deactivate(el);
        applyFilters();
      });
      activeFiltersEl.appendChild(chip);
    });

    if (activeEls.length > 0) {
      const clear = document.createElement("div");
      clear.className = "af-chip af-chip-clear";
      clear.innerHTML = `<i class="fa-solid fa-xmark"></i> Clear all`;
      clear.addEventListener("click", clearFilters);
      activeFiltersEl.appendChild(clear);
    }

    clearAllBtn?.classList.toggle("visible", activeEls.length > 0);
  }

  function deactivate(el) {
    const attr = el.dataset.str ? "str" : el.dataset.brand ? "brand" : el.dataset.flavour ? "flavour" : "format";
    const key = el.dataset[attr];
    document.querySelectorAll(`[data-${attr}="${CSS.escape(key)}"]`).forEach((twin) => twin.classList.remove("active", "checked"));
  }

  function clearFilters() {
    document.querySelectorAll(".sp-item.active, .cb-item.checked, .fp.active").forEach((el) => {
      el.classList.remove("active", "checked");
    });
    if (priceSlider) {
      priceSlider.value = priceSlider.max;
      if (priceVal) priceVal.textContent = "£" + priceSlider.max;
    }
    visibleCount = PAGE_SIZE;
    applyFilters();
  }

  clearAllBtn?.addEventListener("click", clearFilters);

  // Toggle handlers (delegated so mobile-panel clones work identically)
  document.addEventListener("click", (event) => {
    const spItem = event.target.closest(".sp-item");
    if (spItem) {
      const key = spItem.dataset.str;
      const nowActive = !spItem.classList.contains("active");
      document.querySelectorAll(`.sp-item[data-str="${CSS.escape(key)}"]`).forEach((el) => el.classList.toggle("active", nowActive));
      visibleCount = PAGE_SIZE;
      applyFilters();
      return;
    }

    const cbItem = event.target.closest(".cb-item");
    if (cbItem) {
      const key = cbItem.dataset.brand || cbItem.dataset.format;
      const attr = cbItem.dataset.brand ? "brand" : "format";
      const nowChecked = !cbItem.classList.contains("checked");
      document.querySelectorAll(`.cb-item[data-${attr}="${CSS.escape(key)}"]`).forEach((el) => el.classList.toggle("checked", nowChecked));
      visibleCount = PAGE_SIZE;
      applyFilters();
      return;
    }

    const fpItem = event.target.closest(".fp");
    if (fpItem) {
      const key = fpItem.dataset.flavour;
      const nowActive = !fpItem.classList.contains("active");
      document.querySelectorAll(`.fp[data-flavour="${CSS.escape(key)}"]`).forEach((el) => el.classList.toggle("active", nowActive));
      visibleCount = PAGE_SIZE;
      applyFilters();
      return;
    }
  });

  priceSlider?.addEventListener("input", () => {
    if (priceVal) priceVal.textContent = "£" + priceSlider.value;
    visibleCount = PAGE_SIZE;
    applyFilters();
  });

  // ---- Sort ----
  sortSelect?.addEventListener("change", () => {
    const cards = Array.from(grid.querySelectorAll(".pc"));
    const v = sortSelect.value;

    cards.sort((a, b) => {
      if (v === "price-asc") return Number(a.dataset.price) - Number(b.dataset.price);
      if (v === "price-desc") return Number(b.dataset.price) - Number(a.dataset.price);
      if (v === "name") return a.dataset.name.localeCompare(b.dataset.name);
      return 0; // "popular" = keep server (newest-first) order
    });

    cards.forEach((c) => grid.appendChild(c));
    revealVisible();
  });

  // ---- View toggle ----
  const vbGrid = document.getElementById("vbGrid");
  const vbList = document.getElementById("vbList");
  vbGrid?.addEventListener("click", () => {
    grid.classList.remove("list-view");
    vbGrid.classList.add("active");
    vbList?.classList.remove("active");
  });
  vbList?.addEventListener("click", () => {
    grid.classList.add("list-view");
    vbList.classList.add("active");
    vbGrid?.classList.remove("active");
  });

  // ---- Load more ----
  loadMoreBtn?.addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    revealVisible();
  });

  // ---- Mobile filter panel (clones the real sidebar so both stay in sync) ----
  const openBtn = document.getElementById("openFiltersBtn");
  const closeBtn = document.getElementById("closeFiltersBtn");
  const applyBtn = document.getElementById("applyFiltersBtn");
  const overlay = document.getElementById("filterOverlay");
  const panel = document.getElementById("filterPanel");
  const panelBody = document.getElementById("filterPanelBody");
  const sidebar = document.getElementById("sidebarFilters");

  function openFilters() {
    if (panelBody && sidebar && !panelBody.dataset.cloned) {
      const clone = sidebar.cloneNode(true);
      clone.removeAttribute("id");
      clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      panelBody.appendChild(clone);
      panelBody.dataset.cloned = "1";
    }
    overlay?.classList.add("open");
    panel?.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeFilters() {
    overlay?.classList.remove("open");
    panel?.classList.remove("open");
    document.body.style.overflow = "";
  }

  openBtn?.addEventListener("click", openFilters);
  closeBtn?.addEventListener("click", closeFilters);
  overlay?.addEventListener("click", closeFilters);
  applyBtn?.addEventListener("click", closeFilters);

  // ---- Quick add to cart ----
  document.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-quick-add]");
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding…';

    try {
      const res = await fetch(`/cart/add/${btn.dataset.productId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ quantity: 1 }),
      });
      const data = await res.json().catch(() => ({}));

      if (data.ok) {
        showToast(`Added ${btn.dataset.productName}!`);
        if (typeof window.loadCart === "function") window.loadCart();
      } else {
        showToast("Could not add to cart");
      }
    } catch (err) {
      showToast("Could not add to cart");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });

  // ---- Wishlist toggle ----
  document.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-wish-toggle]");
    if (!btn) return;

    try {
      const res = await fetch(`/wishlist/toggle/${btn.dataset.productId}`, {
        method: "POST",
        headers: { Accept: "application/json", "x-csrf-token": csrfToken },
      });

      if (res.status === 401) {
        window.location.href = "/auth/login";
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!data.ok) return;

      document.querySelectorAll(`[data-wish-toggle][data-product-id="${CSS.escape(btn.dataset.productId)}"]`).forEach((el) => {
        el.classList.toggle("on", data.wishlisted);
        const icon = el.querySelector("i");
        if (icon) icon.className = data.wishlisted ? "fa-solid fa-heart" : "fa-regular fa-heart";
      });

      showToast(data.wishlisted ? "Added to wishlist" : "Removed from wishlist");
    } catch (err) {
      showToast("Something went wrong");
    }
  });

  // Initial paint
  applyFilters();
})();
