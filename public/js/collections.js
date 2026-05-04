const collectionButtons = document.querySelectorAll(".collections-tabs button");
const collectionCards = document.querySelectorAll(".collection-tile");
const collectionSearch = document.getElementById("collectionSearch");

function filterCollections() {
  const activeFilter =
    document.querySelector(".collections-tabs button.is-active")?.dataset.filter ||
    "all";
  const query = collectionSearch?.value.trim().toLowerCase() || "";

  collectionCards.forEach((card) => {
    const matchesType =
      activeFilter === "all" || card.dataset.type === activeFilter;
    const matchesQuery = !query || card.dataset.title.includes(query);
    card.classList.toggle("is-hidden", !(matchesType && matchesQuery));
  });
}

collectionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    collectionButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    filterCollections();
  });
});

collectionSearch?.addEventListener("input", filterCollections);
