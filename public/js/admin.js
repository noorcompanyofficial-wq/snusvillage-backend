const sidebar = document.getElementById("sidebar");
const main = document.getElementById("main");
const toggleBtn = document.getElementById("toggleBtn");

toggleBtn?.addEventListener("click", () => {
  if (window.innerWidth <= 768) {
    sidebar?.classList.toggle("active");
  } else {
    sidebar?.classList.toggle("collapsed");
    main?.classList.toggle("expanded");
  }
});

const links = document.querySelectorAll(".admin-nav a, .admin-sidebar__bottom a");
const currentPath = window.location.pathname;

links.forEach((link) => {
  const linkPath = link.getAttribute("href");

  if (linkPath !== "/" && currentPath.startsWith(linkPath)) {
    links.forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
  }
});

const inventorySelectAll = document.getElementById("inventorySelectAll");
const inventoryCheckboxes = Array.from(
  document.querySelectorAll(".inventory-product-checkbox")
);
const inventorySelectedCount = document.getElementById("inventorySelectedCount");
const inventoryClearSelection = document.getElementById("inventoryClearSelection");
const inventoryBulkButtons = Array.from(
  document.querySelectorAll(".admin-inventory-bulk-actions button[name='bulkAction']")
);

function updateInventorySelection() {
  const selectedCount = inventoryCheckboxes.filter((checkbox) => checkbox.checked).length;

  if (inventorySelectedCount) {
    inventorySelectedCount.textContent = String(selectedCount);
  }

  inventoryBulkButtons.forEach((button) => {
    button.disabled = selectedCount === 0;
  });

  inventoryCheckboxes.forEach((checkbox) => {
    checkbox.closest("tr")?.classList.toggle("is-selected", checkbox.checked);
  });

  if (inventorySelectAll) {
    inventorySelectAll.checked =
      inventoryCheckboxes.length > 0 && selectedCount === inventoryCheckboxes.length;
    inventorySelectAll.indeterminate =
      selectedCount > 0 && selectedCount < inventoryCheckboxes.length;
  }
}

inventorySelectAll?.addEventListener("change", () => {
  inventoryCheckboxes.forEach((checkbox) => {
    checkbox.checked = inventorySelectAll.checked;
  });
  updateInventorySelection();
});

inventoryCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener("change", updateInventorySelection);
});

inventoryClearSelection?.addEventListener("click", () => {
  inventoryCheckboxes.forEach((checkbox) => {
    checkbox.checked = false;
  });
  updateInventorySelection();
});

document
  .querySelector(".admin-bulk-button--danger")
  ?.addEventListener("click", (event) => {
    const selectedCount = inventoryCheckboxes.filter((checkbox) => checkbox.checked).length;
    if (
      selectedCount > 0 &&
      !window.confirm(
        `Mark ${selectedCount} selected product${selectedCount === 1 ? "" : "s"} as out of stock?`
      )
    ) {
      event.preventDefault();
    }
  });

updateInventorySelection();
