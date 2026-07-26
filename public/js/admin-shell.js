(function () {
  const shell = document.getElementById("shell");
  const toggleBtn = document.getElementById("toggleBtn");
  const content = document.getElementById("content");
  const crumb = document.getElementById("crumb");

  toggleBtn?.addEventListener("click", () => {
    shell?.classList.toggle("slim");
  });

  function setActiveNav(pathname) {
    let matched = null;

    document.querySelectorAll(".nav-link[href]").forEach((link) => {
      const href = link.getAttribute("href");
      const isActive =
        href === pathname ||
        (href !== "/admin/dashboard" && href.length > 1 && pathname.startsWith(href));
      link.classList.toggle("active", isActive);
      if (isActive) matched = link;
    });

    if (crumb && matched) {
      const label = matched.querySelector("span")?.textContent?.trim();
      if (label) crumb.textContent = label;
    }
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
        headers: { "X-Admin-Spa": "1" },
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
    if (!url.pathname.startsWith("/admin")) return;
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
    if (actionUrl.origin !== window.location.origin || !actionUrl.pathname.startsWith("/admin")) return;

    const method = (form.getAttribute("method") || "GET").toUpperCase();

    if (method === "GET") {
      event.preventDefault();
      const params = new URLSearchParams(new FormData(form));
      loadPage(actionUrl.pathname + "?" + params.toString(), true);
      return;
    }

    event.preventDefault();

    const isMultipart = (form.getAttribute("enctype") || "").includes("multipart/form-data");
    const body = isMultipart ? new FormData(form) : new URLSearchParams(new FormData(form));
    const submitBtns = form.querySelectorAll("button[type='submit'], input[type='submit']");
    submitBtns.forEach((btn) => (btn.disabled = true));

    fetch(actionUrl.pathname + actionUrl.search, {
      method: "POST",
      headers: { "X-Admin-Spa": "1" },
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
    const closeBtn = event.target.closest(".flash-x");
    if (closeBtn) closeBtn.closest(".flash")?.classList.add("dismissed");
  });

  // ---- Per-page interactive behaviour, re-bound after every SPA swap ----

  function initInventoryBulkSelect() {
    const selectAll = document.getElementById("inventorySelectAll");
    const checkboxes = Array.from(document.querySelectorAll(".inventory-product-checkbox"));
    const countEl = document.getElementById("inventorySelectedCount");
    const clearBtn = document.getElementById("inventoryClearSelection");
    const bulkButtons = Array.from(document.querySelectorAll(".admin-inventory-bulk-actions button[name='bulkAction']"));

    if (!checkboxes.length && !selectAll) return;

    function update() {
      const selected = checkboxes.filter((c) => c.checked).length;
      if (countEl) countEl.textContent = String(selected);
      bulkButtons.forEach((btn) => (btn.disabled = selected === 0));
      checkboxes.forEach((c) => c.closest("tr, .inv-row")?.classList.toggle("is-selected", c.checked));
      if (selectAll) {
        selectAll.checked = checkboxes.length > 0 && selected === checkboxes.length;
        selectAll.indeterminate = selected > 0 && selected < checkboxes.length;
      }
    }

    selectAll?.addEventListener("change", () => {
      checkboxes.forEach((c) => (c.checked = selectAll.checked));
      update();
    });
    checkboxes.forEach((c) => c.addEventListener("change", update));
    clearBtn?.addEventListener("click", () => {
      checkboxes.forEach((c) => (c.checked = false));
      update();
    });
    document.querySelector(".admin-bulk-button--danger")?.addEventListener("click", (event) => {
      const selected = checkboxes.filter((c) => c.checked).length;
      if (selected > 0 && !window.confirm(`Mark ${selected} selected product${selected === 1 ? "" : "s"} as out of stock?`)) {
        event.preventDefault();
      }
    });

    update();
  }

  function initProductsBulkSelect() {
    const checkboxes = Array.from(document.querySelectorAll("#prod-grid .p-sel"));
    const bulkBar = document.getElementById("bulk-act");
    const countEl = document.getElementById("bulk-ct");
    if (!checkboxes.length) return;

    function update() {
      const selected = checkboxes.filter((c) => c.checked).length;
      bulkBar?.classList.toggle("on", selected > 0);
      if (countEl) countEl.textContent = `${selected} selected`;
    }

    checkboxes.forEach((c) => c.addEventListener("change", update));
    update();
  }

  function initImageUploadPreview() {
    document.querySelectorAll("[data-image-drop-input]").forEach((input) => {
      const thumbWrap = document.querySelector(input.dataset.imageDropInput);
      if (!thumbWrap) return;

      input.addEventListener("change", () => {
        thumbWrap.querySelectorAll("[data-new-thumb]").forEach((el) => el.remove());

        Array.from(input.files || []).forEach((file) => {
          const reader = new FileReader();
          reader.onload = () => {
            const div = document.createElement("div");
            div.className = "img-th";
            div.dataset.newThumb = "1";
            const img = document.createElement("img");
            img.src = reader.result;
            div.appendChild(img);
            thumbWrap.appendChild(div);
          };
          reader.readAsDataURL(file);
        });
      });
    });
  }

  function initHeroProductPicker() {
    document.querySelectorAll(".hero-product-filter").forEach((filterInput) => {
      const select = filterInput.parentElement.querySelector(".hero-product-select");
      if (!select) return;

      const options = Array.from(select.options).filter((opt) => opt.value);

      filterInput.addEventListener("input", () => {
        const term = filterInput.value.trim().toLowerCase();

        options.forEach((opt) => {
          opt.hidden = term.length > 0 && !opt.dataset.search.includes(term);
        });

        const selected = select.selectedOptions[0];
        if (term && selected && selected.hidden) {
          const firstVisible = options.find((opt) => !opt.hidden);
          if (firstVisible) select.value = firstVisible.value;
        }
      });
    });
  }

  function initSettingsTabs() {
    const tabs = Array.from(document.querySelectorAll(".stg-nav-item[data-target]"));
    if (!tabs.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".stg-panel").forEach((panel) => {
          panel.hidden = panel.dataset.panel !== tab.dataset.target;
        });
      });
    });
  }

  function initMessageReplyBox() {
    const replyForm = document.querySelector("[data-message-reply-form]");
    replyForm?.querySelector("textarea")?.focus();
  }

  window.initPageScripts = function initPageScripts() {
    initInventoryBulkSelect();
    initProductsBulkSelect();
    initImageUploadPreview();
    initHeroProductPicker();
    initSettingsTabs();
    initMessageReplyBox();
  };

  setActiveNav(window.location.pathname);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.initPageScripts());
  } else {
    window.initPageScripts();
  }
})();
