// ==========================================
// PREMIUMSELL STORE CONFIGURATION
// ==========================================
const CONFIG = {
  storeName: "Premiumsell",
  whatsappNumber: "916284854882",
  gatewayPublicKey: "lq_pk_9c7430850e533100ba189f9b",
  merchantUpi: "6284854882@okbizaxis",
  currency: "₹",
  // 👇 यहाँ अपना Google Apps Script Web App URL पेस्ट करें
  googleSheetWebhookUrl: "https://script.google.com/macros/s/AKfycbzp72rWt-is0CVe3OozKphez5FvQviQnuPLW__QWYdeZJKG1-jK7YZWKkyLlXLCIntKdw/exec"
};

let products = [];
let cart = JSON.parse(localStorage.getItem("premiumsell_cart") || "[]");
let activeCategory = "All";
let searchQuery = "";
let currentSlide = 0;
let slideInterval = null;

let selectedProduct = null;
let selectedVariantIndex = 0;
let showAllVariants = false;
let lastPaidWhatsAppUrl = "";
let isPaymentHandled = false;

document.addEventListener("DOMContentLoaded", () => {
  setupWhatsAppLinks();
  initHeroCarousel();
  updateCartUI();
  loadProducts();
  setupGatewayMessageListener();
  checkReturnUrlPaymentStatus();

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderProducts();
    });
  }
});

function setupWhatsAppLinks() {
  const defaultMsg = encodeURIComponent(`Hi ${CONFIG.storeName}, I need help with a subscription.`);
  const waUrl = `https://wa.me/${CONFIG.whatsappNumber}?text=${defaultMsg}`;

  const headerWa = document.getElementById("header-wa-link");
  const drawerWa = document.getElementById("drawer-wa-link");
  const footerWa = document.getElementById("footer-wa-link");
  if (headerWa) headerWa.href = waUrl;
  if (drawerWa) drawerWa.href = waUrl;
  if (footerWa) footerWa.href = waUrl;
}

async function loadProducts() {
  try {
    const res = await fetch(`products.json?v=${Date.now()}`);
    products = await res.json();
    await syncProductsFromGoogleSheet();
    populateCategories();
    renderProducts();
  } catch (err) {
    console.error("Error loading products:", err);
    const grid = document.getElementById("product-grid");
    if (grid) {
      grid.innerHTML = `<p class="col-span-full text-center text-sm text-slate-400 py-10">Unable to load products. Please check products.json formatting.</p>`;
    }
  }
}

// ==========================================
// GOOGLE SHEET LIVE PRODUCTS SYNC (PRICE & STOCK)
// ==========================================
async function syncProductsFromGoogleSheet() {
  if (!CONFIG.googleSheetWebhookUrl || CONFIG.googleSheetWebhookUrl.includes("YOUR_GOOGLE_APPS_SCRIPT")) {
    return;
  }

  try {
    const res = await fetch(`${CONFIG.googleSheetWebhookUrl}?v=${Date.now()}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !Array.isArray(data.products) || data.products.length === 0) return;

    const sheetRowsByProductId = {};
    data.products.forEach((row) => {
      const pid = String(row.id || "").trim();
      if (!pid) return;
      if (!sheetRowsByProductId[pid]) sheetRowsByProductId[pid] = [];
      sheetRowsByProductId[pid].push(row);
    });

    products.forEach((product) => {
      const rows = sheetRowsByProductId[product.id];
      if (!rows || rows.length === 0) return;

      if (product.variants && product.variants.length > 0) {
        product.variants.forEach((variant) => {
          const match = rows.find(
            (r) => String(r.variant || "").trim().toLowerCase() === String(variant.label || "").trim().toLowerCase()
          );
          if (match) {
            if (match.mrp > 0) variant.mrp = Number(match.mrp);
            if (match.price > 0) variant.price = Number(match.price);
            variant.inStock = Boolean(match.inStock);
          }
        });
        // Agar saare variants out of stock hain toh poora product out of stock mark ho jayega
        const anyVariantAvailable = product.variants.some((v) => v.inStock !== false);
        product.inStock = anyVariantAvailable;
      } else {
        const singleRow = rows[0];
        if (singleRow.mrp > 0) product.mrp = Number(singleRow.mrp);
        if (singleRow.price > 0) product.price = Number(singleRow.price);
        product.inStock = Boolean(singleRow.inStock);
      }
    });
  } catch (err) {
    console.warn("Google Sheet products sync skipped (using products.json fallback):", err);
  }
}

// ==========================================
// GOOGLE SHEET SYNC & DATE HELPER
// ==========================================
function formatDateOnly(dateObj) {
  const dd = String(dateObj.getDate()).padStart(2, "0");
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const yyyy = dateObj.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function estimateExpiryDate(items) {
  const now = new Date();
  let daysToAdd = 30; // डिफ़ॉल्ट 30 दिन (1 महीना)

  const combinedText = (items || [])
    .map((it) => `${it.name} ${it.variant}`.toLowerCase())
    .join(" ");

  if (/12\s*month|1\s*year|annual|yearly/i.test(combinedText)) {
    daysToAdd = 365;
  } else if (/6\s*month|half\s*year/i.test(combinedText)) {
    daysToAdd = 180;
  } else if (/3\s*month|quarter/i.test(combinedText)) {
    daysToAdd = 90;
  } else if (/2\s*month/i.test(combinedText)) {
    daysToAdd = 60;
  } else if (/15\s*day/i.test(combinedText)) {
    daysToAdd = 15;
  } else if (/7\s*day|1\s*week/i.test(combinedText)) {
    daysToAdd = 7;
  }

  const expiry = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  return formatDateOnly(expiry);
}

function syncOrderToGoogleSheet({ orderId, name, phone, items, amount, mode, status, refId }) {
  if (!CONFIG.googleSheetWebhookUrl || CONFIG.googleSheetWebhookUrl.includes("YOUR_GOOGLE_APPS_SCRIPT")) {
    return;
  }

  const planSummary = (items || [])
    .map((it) => `${it.name} (${it.variant}) x${it.qty}`)
    .join(", ");

  const payload = {
    orderId: orderId,
    orderDate: formatDateOnly(new Date()),
    expiryDate: estimateExpiryDate(items),
    name: name,
    phone: phone,
    plan: planSummary,
    amount: amount,
    mode: mode,
    status: status,
    refId: refId || "-"
  };

  fetch(CONFIG.googleSheetWebhookUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  }).catch((err) => console.error("Google Sheet sync error:", err));
}

// ==========================================
// HERO BANNER CAROUSEL
// ==========================================
function initHeroCarousel() {
  const slidesContainer = document.getElementById("hero-slides");
  const dotsContainer = document.getElementById("hero-dots");
  if (!slidesContainer || !dotsContainer) return;

  const totalSlides = slidesContainer.children.length;
  dotsContainer.innerHTML = "";

  for (let i = 0; i < totalSlides; i++) {
    const dot = document.createElement("button");
    dot.setAttribute("aria-label", `Slide ${i + 1}`);
    dot.className = `h-2 rounded-full transition-all ${i === 0 ? "w-6 bg-violet-500" : "w-2 bg-white/40"}`;
    dot.onclick = () => goToSlide(i);
    dotsContainer.appendChild(dot);
  }
  startSlideTimer();
}

function goToSlide(index) {
  const slidesContainer = document.getElementById("hero-slides");
  const dotsContainer = document.getElementById("hero-dots");
  if (!slidesContainer) return;

  const totalSlides = slidesContainer.children.length;
  currentSlide = (index + totalSlides) % totalSlides;
  slidesContainer.style.transform = `translateX(-${currentSlide * 100}%)`;

  if (dotsContainer) {
    Array.from(dotsContainer.children).forEach((dot, idx) => {
      dot.className = `h-2 rounded-full transition-all ${idx === currentSlide ? "w-6 bg-violet-500" : "w-2 bg-white/40"}`;
    });
  }
  startSlideTimer();
}

function nextSlide() { goToSlide(currentSlide + 1); }
function prevSlide() { goToSlide(currentSlide - 1); }

function startSlideTimer() {
  if (slideInterval) clearInterval(slideInterval);
  slideInterval = setInterval(() => { goToSlide(currentSlide + 1); }, 4500);
}

// ==========================================
// CATEGORIES & SEARCH
// ==========================================
function populateCategories() {
  const uniqueCats = [...new Set(products.map((p) => p.category).filter(Boolean))];
  const modalList = document.getElementById("category-modal-list");
  const drawerList = document.getElementById("drawer-categories");

  const allItemHtml = (isModal) => `
    <button onclick="selectCategory('All'); ${isModal ? "toggleCategoryModal(false)" : "toggleMenu(false)"}"
      class="w-full text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-between transition ${
        activeCategory === "All" ? "bg-violet-600/20 text-violet-300 border border-violet-500/40" : "hover:bg-slate-800 text-slate-200"
      }">
      <span>All Subscriptions</span>
      <span class="text-xs text-slate-400">${products.length}</span>
    </button>
  `;

  const catItemsHtml = (isModal) =>
    uniqueCats
      .map((cat) => {
        const count = products.filter((p) => p.category === cat).length;
        const active = activeCategory === cat;
        return `
          <button onclick="selectCategory('${cat.replace(/'/g, "\\'")}'); ${isModal ? "toggleCategoryModal(false)" : "toggleMenu(false)"}"
            class="w-full text-left px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center justify-between transition ${
              active ? "bg-violet-600/20 text-violet-300 border border-violet-500/40" : "hover:bg-slate-800 text-slate-200"
            }">
            <span>${cat}</span>
            <span class="text-xs text-slate-400">${count}</span>
          </button>
        `;
      })
      .join("");

  if (modalList) modalList.innerHTML = allItemHtml(true) + catItemsHtml(true);
  if (drawerList) drawerList.innerHTML = catItemsHtml(false);
}

function selectCategory(cat) {
  activeCategory = cat;
  const titleEl = document.getElementById("active-category-title");
  if (titleEl) {
    titleEl.textContent = cat === "All" ? "ALL SUBSCRIPTIONS" : cat.toUpperCase();
  }
  populateCategories();
  renderProducts();
}

function resetHome(e) {
  if (e) e.preventDefault();
  activeCategory = "All";
  searchQuery = "";
  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.value = "";
  selectCategory("All");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toggleSearchBar() {
  const box = document.getElementById("search-bar-box");
  const input = document.getElementById("search-input");
  if (!box) return;
  box.classList.toggle("hidden");
  if (!box.classList.contains("hidden") && input) input.focus();
}

function clearSearch() {
  searchQuery = "";
  const input = document.getElementById("search-input");
  if (input) input.value = "";
  renderProducts();
}

// ==========================================
// RENDER PRODUCT GRID
// ==========================================
function renderProducts() {
  const grid = document.getElementById("product-grid");
  const countLabel = document.getElementById("product-count-label");
  if (!grid) return;

  const filtered = products.filter((p) => {
    const matchesCat = activeCategory === "All" || p.category === activeCategory;
    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery) ||
      (p.category && p.category.toLowerCase().includes(searchQuery));
    return matchesCat && matchesSearch;
  });

  if (countLabel) {
    countLabel.textContent = `${filtered.length} ${filtered.length === 1 ? "item" : "items"}`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<p class="col-span-full text-center text-sm text-slate-400 py-12">No subscriptions found.</p>`;
    return;
  }

  grid.innerHTML = filtered
    .map((product) => {
      const variants = product.variants || [];
      const firstAvailableVariant = variants.find((v) => v.inStock !== false) || variants[0] || null;
      const displayPrice = firstAvailableVariant ? firstAvailableVariant.price : product.price;
      const displayMrp = firstAvailableVariant ? firstAvailableVariant.mrp : product.mrp;
      const discount = displayMrp > displayPrice ? Math.round(((displayMrp - displayPrice) / displayMrp) * 100) : 0;
      const outOfStock =
        product.inStock === false ||
        (variants.length > 0 && variants.every((v) => v.inStock === false));

      return `
        <div onclick="openProductModal('${product.id}')" class="group bg-[#131A2A] border border-slate-800 hover:border-violet-500/60 rounded-xl overflow-hidden flex flex-col cursor-pointer transition shadow-md">
          <div class="relative aspect-square bg-[#0F1626] overflow-hidden">
            <img src="${product.image}" alt="${product.name}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-300 ${outOfStock ? "opacity-40" : ""}" />
            ${discount > 0 ? `<span class="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">${discount}% OFF</span>` : ""}
            ${outOfStock ? `<span class="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs font-bold uppercase tracking-wider">Out of Stock</span>` : ""}
          </div>
          <div class="p-3 flex-1 flex flex-col justify-between">
            <div>
              <h4 class="text-xs sm:text-sm font-bold text-slate-100 line-clamp-2 leading-snug">${product.name}</h4>
              <div class="mt-2 flex items-baseline gap-1.5 flex-wrap">
                <span class="text-sm sm:text-base font-extrabold text-white">${CONFIG.currency}${displayPrice}</span>
                ${displayMrp > displayPrice ? `<span class="text-xs text-slate-400 line-through">${CONFIG.currency}${displayMrp}</span>` : ""}
              </div>
            </div>
            <button
              onclick="event.stopPropagation(); openProductModal('${product.id}')"
              ${outOfStock ? "disabled" : ""}
              class="mt-3 w-full py-2 rounded-lg text-xs font-bold transition ${
                outOfStock
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : "bg-violet-600/20 hover:bg-violet-600 text-violet-300 hover:text-white border border-violet-500/40"
              }"
            >
              ${outOfStock ? "Sold Out" : variants.length > 1 ? "Select Plan" : "View Plan"}
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

// ==========================================
// PRODUCT DETAIL MODAL (MOBILE STACKED + DESKTOP COMPACT)
// ==========================================
function openProductModal(productId) {
  const product = products.find((p) => p.id === productId);
  if (!product) return;

  selectedProduct = product;
  const variants = product.variants || [];
  const firstInStockIdx = variants.findIndex((v) => v.inStock !== false);
  selectedVariantIndex = firstInStockIdx >= 0 ? firstInStockIdx : 0;
  showAllVariants = false;
  renderProductModalContent();

  const modal = document.getElementById("product-modal");
  if (modal) {
    modal.classList.remove("hidden");
    modal.scrollTop = 0;
    document.body.style.overflow = "hidden";
  }
}

function closeProductModal() {
  const modal = document.getElementById("product-modal");
  if (modal) modal.classList.add("hidden");
  document.body.style.overflow = "";
}

function selectVariant(index) {
  const variants = selectedProduct?.variants || [];
  if (variants[index] && variants[index].inStock === false) return;
  selectedVariantIndex = index;
  renderProductModalContent();
}

function toggleVariantsExpand() {
  showAllVariants = !showAllVariants;
  renderProductModalContent();
}

function handleDesktopModalAdd() {
  if (!selectedProduct) return;
  const variants = selectedProduct.variants || [];
  const activeVariant = variants.length > 0 ? variants[selectedVariantIndex] : null;
  if (selectedProduct.inStock === false || (activeVariant && activeVariant.inStock === false)) return;
  addToCart(selectedProduct, activeVariant);
  closeProductModal();
  toggleCart(true);
}

function renderProductModalContent() {
  const container = document.getElementById("product-modal-content");
  if (!container || !selectedProduct) return;

  const variants = selectedProduct.variants || [];
  const hasVariants = variants.length > 0;
  const activeVariant = hasVariants ? variants[selectedVariantIndex] : null;

  const price = activeVariant ? activeVariant.price : selectedProduct.price;
  const mrp = activeVariant ? activeVariant.mrp : selectedProduct.mrp;
  const discount = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const isCurrentOutOfStock =
    selectedProduct.inStock === false ||
    (activeVariant && activeVariant.inStock === false);

  const visibleVariants = showAllVariants ? variants : variants.slice(0, 4);
  const hasMoreVariants = variants.length > 4;

  const variantsHtml = hasVariants
    ? `
      <div class="py-4 border-y border-slate-800">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
          SELECT :: <span class="text-violet-400">${activeVariant.label}</span>
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          ${visibleVariants
            .map((v, idx) => {
              const isSelected = idx === selectedVariantIndex;
              const isVarOut = v.inStock === false;
              return `
                <button
                  type="button"
                  ${isVarOut ? "disabled" : `onclick="selectVariant(${idx})"`}
                  class="w-full text-left px-3.5 py-3 rounded-lg text-xs sm:text-sm transition flex items-center justify-between gap-2 focus:outline-none ${
                    isVarOut
                      ? "bg-[#0F1626] border border-slate-800 text-slate-500 cursor-not-allowed opacity-65"
                      : isSelected
                      ? "bg-[#312E81]/60 border-2 border-white text-white font-bold shadow-[0_0_16px_rgba(139,92,246,0.35)]"
                      : "bg-[#131A2A] border border-slate-700 text-slate-200 font-medium hover:border-slate-500"
                  }"
                >
                  <span class="truncate uppercase ${isVarOut ? "line-through" : ""}">${v.label}</span>
                  ${
                    isVarOut
                      ? `<span class="flex-shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">Out of Stock</span>`
                      : `<span class="flex-shrink-0 font-bold text-white">${CONFIG.currency}${v.price}</span>`
                  }
                </button>
              `;
            })
            .join("")}
        </div>
        ${
          hasMoreVariants
            ? `<button type="button" onclick="toggleVariantsExpand()" class="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-400 hover:text-violet-300 transition">
                <span>${showAllVariants ? "− View less" : "+ View more"}</span>
              </button>`
            : ""
        }
      </div>
    `
    : "";

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-10 items-start">
      <!-- Image Box: Mobile Padded Card, Desktop Edge-to-Edge Square -->
      <div class="md:col-span-5 bg-[#131A2A] md:bg-transparent border border-slate-800 md:border-0 rounded-2xl p-3 sm:p-5 md:p-0 flex items-center justify-center md:sticky md:top-24">
        <img src="${selectedProduct.image}" alt="${selectedProduct.name}" class="w-full h-auto max-h-[540px] md:max-h-none md:aspect-square object-contain md:object-cover rounded-xl md:rounded-2xl md:border md:border-slate-800 shadow-lg" />
      </div>

      <!-- Product Details -->
      <div class="md:col-span-7 space-y-4">
        <div>
          <span class="text-xs font-semibold uppercase tracking-wider text-violet-400">${selectedProduct.category || "Subscription"}</span>
          <h1 class="text-2xl sm:text-3xl font-extrabold text-white mt-1">${selectedProduct.name}</h1>
          <div class="mt-2.5 flex items-center gap-3">
            <span class="text-2xl sm:text-3xl font-extrabold text-white">${CONFIG.currency}${price}</span>
            ${mrp > price ? `<span class="text-base text-slate-400 line-through">${CONFIG.currency}${mrp}</span>` : ""}
            ${discount > 0 ? `<span class="bg-emerald-600 text-white text-xs font-bold px-2.5 py-0.5 rounded">${discount}% OFF</span>` : ""}
          </div>
        </div>

        ${variantsHtml}

        <!-- Desktop Inline Action Buttons (Hidden on Mobile, Mobile uses sticky footer bar) -->
        <div class="hidden md:grid grid-cols-2 gap-3.5 pt-1">
          <button
            type="button"
            onclick="handleDesktopModalAdd()"
            ${isCurrentOutOfStock ? "disabled" : ""}
            class="w-full py-3.5 rounded-xl font-bold text-sm transition shadow-lg ${
              isCurrentOutOfStock
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-600/30"
            }"
          >
            ${isCurrentOutOfStock ? "Out of Stock" : "Buy Now"}
          </button>
          <button
            type="button"
            onclick="handleDesktopModalAdd()"
            ${isCurrentOutOfStock ? "disabled" : ""}
            class="w-full py-3.5 rounded-xl border border-slate-600 bg-[#131A2A] hover:bg-slate-800 text-white font-semibold text-sm transition ${
              isCurrentOutOfStock ? "opacity-50 cursor-not-allowed" : ""
            }"
          >
            Add to Cart
          </button>
        </div>

        ${selectedProduct.shortRule ? `<div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs sm:text-sm leading-relaxed">${selectedProduct.shortRule}</div>` : ""}

        <div>
          <h3 class="text-sm sm:text-base font-bold text-white mb-2">Product Description</h3>
          <div class="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">${selectedProduct.description || ""}</div>
        </div>

        ${selectedProduct.moreDetails ? `<div class="pt-3 border-t border-slate-800 text-xs sm:text-sm text-slate-400">${selectedProduct.moreDetails}</div>` : ""}
      </div>
    </div>
  `;

  // Mobile sticky footer buttons
  const addBtn = document.getElementById("modal-add-btn");
  const buyBtn = document.getElementById("modal-buy-btn");
  if (addBtn && buyBtn) {
    addBtn.disabled = isCurrentOutOfStock;
    buyBtn.disabled = isCurrentOutOfStock;
    buyBtn.textContent = isCurrentOutOfStock ? "Out of Stock" : "Buy Now";
    addBtn.onclick = () => { addToCart(selectedProduct, activeVariant); closeProductModal(); toggleCart(true); };
    buyBtn.onclick = () => { addToCart(selectedProduct, activeVariant); closeProductModal(); toggleCart(true); };
  }
}

// ==========================================
// SHOPPING CART & MULTI-LAYER PAYMENT VERIFICATION
// ==========================================
function addToCart(product, variant) {
  if (product.inStock === false || (variant && variant.inStock === false)) return;
  const variantLabel = variant ? variant.label : "Standard Plan";
  const price = variant ? variant.price : product.price;
  const cartKey = `${product.id}__${variantLabel}`;

  const existing = cart.find((item) => item.key === cartKey);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      key: cartKey,
      id: product.id,
      name: product.name,
      variant: variantLabel,
      price: price,
      image: product.image,
      qty: 1
    });
  }
  saveCart();
  updateCartUI();
}

function updateCartQty(key, delta) {
  const index = cart.findIndex((item) => item.key === key);
  if (index === -1) return;
  cart[index].qty += delta;
  if (cart[index].qty <= 0) cart.splice(index, 1);
  saveCart();
  updateCartUI();
}

function saveCart() {
  localStorage.setItem("premiumsell_cart", JSON.stringify(cart));
}

function updateCartUI() {
  const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const badge1 = document.getElementById("cart-count");
  const badge2 = document.getElementById("modal-cart-count");
  if (badge1) badge1.textContent = totalQty;
  if (badge2) badge2.textContent = totalQty;

  const itemsContainer = document.getElementById("cart-items");
  const footer = document.getElementById("cart-footer");
  const totalEl = document.getElementById("cart-total");
  if (!itemsContainer) return;

  if (cart.length === 0) {
    itemsContainer.innerHTML = `
      <div class="text-center py-16">
        <p class="text-slate-400 text-sm">Your cart is empty.</p>
        <button onclick="toggleCart(false)" class="mt-4 px-5 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold">Browse Plans</button>
      </div>
    `;
    if (footer) footer.classList.add("hidden");
    return;
  }

  if (footer) footer.classList.remove("hidden");
  if (totalEl) totalEl.textContent = `${CONFIG.currency}${totalAmount}`;

  itemsContainer.innerHTML = cart
    .map(
      (item) => `
      <div class="flex gap-3 bg-[#0F1626] border border-slate-800 p-3 rounded-xl">
        <img src="${item.image}" alt="${item.name}" class="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <h4 class="text-xs sm:text-sm font-bold text-white truncate">${item.name}</h4>
          <p class="text-[11px] text-violet-400 font-medium truncate mt-0.5">${item.variant}</p>
          <div class="mt-2 flex items-center justify-between">
            <span class="text-sm font-extrabold text-white">${CONFIG.currency}${item.price * item.qty}</span>
            <div class="flex items-center gap-2 bg-[#131A2A] border border-slate-700 rounded-lg px-2 py-0.5">
              <button onclick="updateCartQty('${item.key.replace(/'/g, "\\'")}', -1)" class="text-slate-300 hover:text-white font-bold px-1">−</button>
              <span class="text-xs font-bold text-white">${item.qty}</span>
              <button onclick="updateCartQty('${item.key.replace(/'/g, "\\'")}', 1)" class="text-slate-300 hover:text-white font-bold px-1">+</button>
            </div>
          </div>
        </div>
      </div>
    `
    )
    .join("");
}

function savePendingOrder(orderId, totalAmount, name, cleanPhone) {
  const pending = {
    orderId,
    totalAmount,
    name,
    cleanPhone,
    items: JSON.parse(JSON.stringify(cart)),
    createdAt: Date.now()
  };
  localStorage.setItem("premiumsell_pending_order", JSON.stringify(pending));
}

function getPendingOrder() {
  try {
    const raw = localStorage.getItem("premiumsell_pending_order");
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - (data.createdAt || 0) > 30 * 60 * 1000) {
      localStorage.removeItem("premiumsell_pending_order");
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function clearPendingOrder() {
  localStorage.removeItem("premiumsell_pending_order");
}

// Layer 2: Secure postMessage Listener (Domain Locked)
function setupGatewayMessageListener() {
  const allowedOrigins = [
    "https://pays.budgetdealz.in",
    "https://pay.learningque.in",
    "https://sdk.cashfree.com",
    "https://api.cashfree.com"
  ];

  window.addEventListener("message", (event) => {
    const isAllowedOrigin = allowedOrigins.some((origin) => event.origin && event.origin.startsWith(origin));
    if (!isAllowedOrigin) return;

    const raw = event.data;
    if (!raw) return;

    let payload = raw;
    if (typeof raw === "string") {
      try {
        payload = JSON.parse(raw);
      } catch {
        if (/paid|success|payment_success/i.test(raw)) {
          payload = { status: "SUCCESS" };
        } else {
          return;
        }
      }
    }

    const statusStr = String(
      payload.status ||
      payload.payment_status ||
      payload.txStatus ||
      payload.event ||
      payload.type ||
      (payload.data && (payload.data.status || payload.data.payment_status)) ||
      ""
    ).toUpperCase();

    if (
      statusStr.includes("SUCCESS") ||
      statusStr.includes("PAID") ||
      statusStr === "PAYMENT_COMPLETED"
    ) {
      const pending = getPendingOrder();
      if (pending && !isPaymentHandled) {
        const resObj = payload.data || payload;
        closeInPagePaymentModal();
        handleGatewayPaymentSuccess(
          resObj,
          pending.orderId,
          pending.totalAmount,
          pending.name,
          pending.cleanPhone,
          pending.items,
          "Website Gateway"
        );
      }
    }
  });
}

// Check if browser returned via URL parameters
function checkReturnUrlPaymentStatus() {
  const params = new URLSearchParams(window.location.search);
  const status = (params.get("status") || params.get("payment_status") || "").toUpperCase();
  const orderParam = params.get("order_id") || params.get("orderId") || "";

  if ((status === "SUCCESS" || status === "PAID") && !isPaymentHandled) {
    const pending = getPendingOrder();
    if (pending) {
      window.history.replaceState({}, document.title, window.location.pathname);
      handleGatewayPaymentSuccess(
        { order_id: orderParam || pending.orderId },
        pending.orderId,
        pending.totalAmount,
        pending.name,
        pending.cleanPhone,
        pending.items,
        "Website Gateway"
      );
    }
  }
}

function closeInPagePaymentModal() {
  const modal = document.getElementById("inpage-pay-modal");
  const body = document.getElementById("inpage-pay-body");
  if (modal) modal.classList.add("hidden");
  if (body) body.innerHTML = "";
}

function proceedToUpiPayment() {
  const name = document.getElementById("cust-name")?.value.trim();
  const rawPhone = document.getElementById("cust-phone")?.value.trim() || "";
  const cleanPhone = rawPhone.replace(/\D/g, "").slice(-10);

  if (!name) {
    alert("Please enter your Name.");
    return;
  }

  if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
    alert("Please enter a valid 10-digit WhatsApp Number (starting with 6-9).");
    return;
  }

  if (cart.length === 0) return;

  const baseTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const totalAmount = Number.isInteger(baseTotal) ? baseTotal : Number(baseTotal.toFixed(2));
  const orderId = "PS-" + Math.floor(100000 + Math.random() * 900000);
  const currentItemsSnapshot = JSON.parse(JSON.stringify(cart));

  isPaymentHandled = false;
  savePendingOrder(orderId, totalAmount, name, cleanPhone);

  // 1️⃣ कस्टमर के नाम-नंबर डालते ही Google Sheet में "Pending (Left Checkout)" सेव करें
  syncOrderToGoogleSheet({
    orderId: orderId,
    name: name,
    phone: cleanPhone,
    items: currentItemsSnapshot,
    amount: totalAmount,
    mode: "Website Gateway",
    status: "Pending (Left Checkout)",
    refId: "-"
  });

  if (typeof LearningQuePay !== "undefined") {
    const originalWindowOpen = window.open;

    window.open = function (url) {
      if (url && typeof url === "string" && /^https?:\/\//i.test(url)) {
        renderInPageIframeGateway(url, totalAmount, name, cleanPhone, orderId);
        return { closed: false, focus: function () {}, close: closeInPagePaymentModal };
      }
      return originalWindowOpen.apply(window, arguments);
    };

    try {
      LearningQuePay.checkout({
        key: CONFIG.gatewayPublicKey,
        amount: totalAmount,
        orderId: orderId,
        customer: {
          name: name,
          email: "orders@premiumsell.in",
          phone: cleanPhone
        },
        returnUrl: window.location.origin + window.location.pathname,
        mode: "modal",
        onSuccess: function (res) {
          closeInPagePaymentModal();
          handleGatewayPaymentSuccess(res, orderId, totalAmount, name, cleanPhone, currentItemsSnapshot, "Website Gateway");
        },
        onFailure: function (err) {
          closeInPagePaymentModal();
          const reason = (err && (err.message || err.reason)) || "Payment was declined or cancelled.";
          handleGatewayPaymentFailure(orderId, totalAmount, name, cleanPhone, currentItemsSnapshot, reason);
        },
        onClose: function () {
          closeInPagePaymentModal();
          setTimeout(() => {
            if (!isPaymentHandled) {
              verifyGatewayOrderStatusFallback(orderId, totalAmount, name, cleanPhone, currentItemsSnapshot);
            }
          }, 800);
        },
        onError: function () {
          openInPageUpiModal(totalAmount, name, cleanPhone, orderId);
        }
      });
    } catch (e) {
      openInPageUpiModal(totalAmount, name, cleanPhone, orderId);
    } finally {
      setTimeout(() => {
        window.open = originalWindowOpen;
      }, 1500);
    }
    return;
  }

  openInPageUpiModal(totalAmount, name, cleanPhone, orderId);
}

// Layer 3 Fallback: Query LearningQuePay status endpoint if modal closed after payment
async function verifyGatewayOrderStatusFallback(orderId, totalAmount, name, cleanPhone, savedItems) {
  const endpoints = [
    `https://pays.budgetdealz.in/api/order-status?order_id=${encodeURIComponent(orderId)}&key=${encodeURIComponent(CONFIG.gatewayPublicKey)}`,
    `https://pay.learningque.in/api/order-status?order_id=${encodeURIComponent(orderId)}&key=${encodeURIComponent(CONFIG.gatewayPublicKey)}`
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const st = String(data.status || data.payment_status || (data.data && data.data.status) || "").toUpperCase();
      if ((st === "PAID" || st === "SUCCESS") && !isPaymentHandled) {
        handleGatewayPaymentSuccess(data.data || data, orderId, totalAmount, name, cleanPhone, savedItems, "Website Gateway");
        return;
      } else if (st === "FAILED" || st === "CANCELLED") {
        handleGatewayPaymentFailure(orderId, totalAmount, name, cleanPhone, savedItems, "Payment failed on gateway.");
        return;
      }
    } catch {
      // Ignore network/CORS error and try next
    }
  }
}

function renderInPageIframeGateway(gatewayUrl, totalAmount, name, cleanPhone, orderId) {
  const modal = document.getElementById("inpage-pay-modal");
  const body = document.getElementById("inpage-pay-body");
  if (!modal || !body) return;

  modal.classList.remove("hidden");
  body.innerHTML = `
    <div class="space-y-3">
      <div class="w-full h-[460px] rounded-xl overflow-hidden border border-slate-700 bg-white">
        <iframe src="${gatewayUrl}" class="w-full h-full border-0" allow="payment"></iframe>
      </div>
      <div class="text-center">
        <button type="button" onclick="openInPageUpiModal(${totalAmount}, '${name.replace(/'/g, "\\'")}', '${cleanPhone}', '${orderId}')" class="text-xs text-violet-400 hover:text-violet-300 underline">
          Having trouble loading? Pay via In-Page UPI QR instead
        </button>
      </div>
    </div>
  `;
}

function openInPageUpiModal(totalAmount, name, cleanPhone, orderId) {
  const modal = document.getElementById("inpage-pay-modal");
  const body = document.getElementById("inpage-pay-body");
  if (!modal || !body) return;

  const upiUrl = `upi://pay?pa=${encodeURIComponent(CONFIG.merchantUpi)}&pn=${encodeURIComponent(CONFIG.storeName)}&am=${totalAmount}&cu=INR&tn=${encodeURIComponent(orderId)}`;

  modal.classList.remove("hidden");
  body.innerHTML = `
    <div class="text-center space-y-3">
      <p class="text-xs uppercase tracking-wider text-violet-400 font-bold">Scan & Pay on Same Page</p>
      <p class="text-3xl font-extrabold text-white">${CONFIG.currency}${totalAmount}</p>

      <div class="bg-white p-3 rounded-xl inline-block mx-auto shadow-md">
        <div id="upi-qrcode"></div>
      </div>
      <p class="text-[11px] text-slate-400">Scan with GPay, PhonePe, Paytm or any UPI App</p>

      <a href="${upiUrl}" class="block sm:hidden w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold">
        Open UPI App to Pay →
      </a>

      <div class="flex items-center justify-between bg-[#0F1626] border border-slate-700 rounded-xl px-3 py-2 text-xs">
        <span class="font-mono text-slate-200 select-all">${CONFIG.merchantUpi}</span>
        <button type="button" onclick="navigator.clipboard?.writeText('${CONFIG.merchantUpi}'); this.textContent='Copied!';" class="text-violet-400 font-bold">
          Copy UPI
        </button>
      </div>

      <div class="pt-1 text-left space-y-1.5">
        <label class="text-[11px] text-slate-300 font-semibold block">Enter 12-Digit UTR / Ref No. after payment *</label>
        <input type="text" id="inpage-utr-input" maxlength="12" placeholder="e.g. 412345678901" class="w-full px-3 py-2.5 text-sm bg-[#0F1626] text-white placeholder-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500" />
      </div>

      <button
        type="button"
        onclick="verifyInPageUpi('${orderId}', ${totalAmount}, '${name.replace(/'/g, "\\'")}', '${cleanPhone}')"
        class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-emerald-600/25"
      >
        Submit UTR for Verification ✓
      </button>
    </div>
  `;

  const qrBox = document.getElementById("upi-qrcode");
  if (qrBox && typeof QRCode !== "undefined") {
    qrBox.innerHTML = "";
    new QRCode(qrBox, {
      text: upiUrl,
      width: 165,
      height: 165,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }
}

function verifyInPageUpi(orderId, totalAmount, name, cleanPhone) {
  const utr = document.getElementById("inpage-utr-input")?.value.trim() || "";
  if (!/^\d{12}$/.test(utr)) {
    alert("Please enter a valid 12-digit UPI UTR / Reference number.");
    return;
  }
  closeInPagePaymentModal();
  handleGatewayPaymentSuccess(
    { transaction_id: utr, isManualUpi: true },
    orderId,
    totalAmount,
    name,
    cleanPhone,
    null,
    "Manual UPI QR"
  );
}

// ==========================================
// PAYMENT FAILED RETRY SCREEN + SHEET SYNC
// ==========================================
function handleGatewayPaymentFailure(orderId, totalAmount, name, cleanPhone, savedItems, reasonText) {
  if (isPaymentHandled) return;

  syncOrderToGoogleSheet({
    orderId: orderId,
    name: name,
    phone: cleanPhone,
    items: savedItems || cart,
    amount: totalAmount,
    mode: "Website Gateway",
    status: "Failed",
    refId: reasonText
  });

  const overlay = document.getElementById("cart-overlay");
  const drawer = document.getElementById("cart-drawer");
  const titleEl = document.getElementById("cart-drawer-title");
  const step1 = document.getElementById("cart-step-1");
  const step2 = document.getElementById("cart-step-2");

  if (overlay) overlay.classList.remove("hidden");
  if (drawer) drawer.classList.remove("translate-x-full");
  if (titleEl) titleEl.textContent = "Payment Failed";
  if (step1) step1.classList.add("hidden");
  if (step2) {
    step2.classList.remove("hidden");
    step2.innerHTML = `
      <div class="bg-rose-500/10 border border-rose-500/35 rounded-2xl p-6 text-center space-y-3">
        <div class="w-14 h-14 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-3xl font-bold">✕</div>
        <h3 class="text-lg font-extrabold text-white">Payment Not Completed</h3>
        <p class="text-xs text-slate-300 leading-relaxed">${reasonText}</p>
        <div class="bg-[#0F1626] border border-slate-800 rounded-xl p-3 text-xs text-slate-300 space-y-1">
          <p><strong class="text-white">Order ID:</strong> <span class="font-mono text-rose-300">${orderId}</span></p>
          <p><strong class="text-white">Amount:</strong> ${CONFIG.currency}${totalAmount}</p>
        </div>
      </div>

      <button type="button" onclick="backToCartStep1(); proceedToUpiPayment();" class="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3.5 rounded-xl text-sm transition shadow-lg shadow-violet-600/30">
        Try Payment Again →
      </button>

      <button type="button" onclick="openInPageUpiModal(${totalAmount}, '${name.replace(/'/g, "\\'")}', '${cleanPhone}', '${orderId}')" class="w-full py-2.5 rounded-xl border border-slate-700 bg-[#0F1626] text-xs text-slate-200 hover:text-white font-semibold">
        Pay via Direct UPI QR Instead
      </button>
    `;
  }
}

// ==========================================
// PAYMENT SUCCESS / MANUAL VERIFICATION SCREEN + SHEET SYNC
// ==========================================
function handleGatewayPaymentSuccess(res, orderId, totalAmount, name, cleanPhone, savedItems = null, paymentMode = "Website Gateway") {
  if (isPaymentHandled) return;
  isPaymentHandled = true;
  clearPendingOrder();

  const orderItems = savedItems && savedItems.length > 0 ? savedItems : cart;
  const isManualUpi = Boolean(res && res.isManualUpi) || paymentMode === "Manual UPI QR";
  const gatewayRef =
    (res && (res.order_id || res.gateway_order_id || res.payment_id || res.transaction_id || res.id)) || orderId;

  syncOrderToGoogleSheet({
    orderId: orderId,
    name: name,
    phone: cleanPhone,
    items: orderItems,
    amount: totalAmount,
    mode: isManualUpi ? "Manual UPI QR" : "Website Gateway",
    status: isManualUpi ? "UTR Submitted (Verify Bank)" : "Paid Online",
    refId: isManualUpi ? `UTR: ${gatewayRef}` : gatewayRef
  });

  const itemsText = orderItems
    .map((item, i) => `${i + 1}. *${item.name}* (${item.variant}) x${item.qty} = ${CONFIG.currency}${item.price * item.qty}`)
    .join("\n");

  let message = isManualUpi
    ? `*MANUAL UPI ORDER (VERIFY UTR) - ${CONFIG.storeName.toUpperCase()}*\n\n`
    : `*PAID ORDER - ${CONFIG.storeName.toUpperCase()}*\n\n`;

  message += `*Customer:* ${name}\n`;
  message += `*WhatsApp:* ${cleanPhone}\n`;
  message += `\n*Order Details:*\n${itemsText}\n\n`;
  message += `*Amount:* ${CONFIG.currency}${totalAmount}\n`;
  message += isManualUpi
    ? `*UTR / Ref No:* ${gatewayRef}\n*Status:* ⏳ Pending UTR Verification\n\n`
    : `*Gateway Order ID:* ${gatewayRef}\n*Status:* ✅ Paid Online\n\n`;
  message += `Please activate my subscription!`;

  lastPaidWhatsAppUrl = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;

  cart = [];
  saveCart();
  updateCartUI();

  const overlay = document.getElementById("cart-overlay");
  const drawer = document.getElementById("cart-drawer");
  const titleEl = document.getElementById("cart-drawer-title");
  const step1 = document.getElementById("cart-step-1");
  const step2 = document.getElementById("cart-step-2");

  if (overlay) overlay.classList.remove("hidden");
  if (drawer) drawer.classList.remove("translate-x-full");
  if (titleEl) titleEl.textContent = isManualUpi ? "Verification Pending" : "Payment Successful";
  if (step1) step1.classList.add("hidden");
  if (step2) {
    step2.classList.remove("hidden");

    if (isManualUpi) {
      step2.innerHTML = `
        <div class="bg-amber-500/10 border border-amber-500/35 rounded-2xl p-6 text-center space-y-3">
          <div class="w-14 h-14 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-3xl font-bold">⏳</div>
          <h3 class="text-lg font-extrabold text-white">Payment Under Verification</h3>
          <p class="text-xs text-slate-300 leading-relaxed">
            We have received your UTR for <strong class="text-amber-300">${CONFIG.currency}${totalAmount}</strong>. Activation will start right after bank verification.
          </p>
          <div class="bg-[#0F1626] border border-slate-800 rounded-xl p-3 text-xs text-slate-300 space-y-1">
            <p><strong class="text-white">UTR Ref:</strong> <span class="font-mono text-amber-300">${gatewayRef}</span></p>
            <p><strong class="text-white">Customer:</strong> ${name} (${cleanPhone})</p>
          </div>
        </div>

        <a
          href="${lastPaidWhatsAppUrl}"
          target="_blank"
          rel="noopener noreferrer"
          class="w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold py-4 rounded-xl text-sm transition shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
        >
          <span>Send UTR on WhatsApp for Activation →</span>
        </a>

        <button type="button" onclick="finishAndClearCart()" class="w-full py-2.5 text-xs text-slate-400 hover:text-white font-medium">
          Done & Continue Shopping
        </button>
      `;
    } else {
      step2.innerHTML = `
        <div class="bg-emerald-500/10 border border-emerald-500/35 rounded-2xl p-6 text-center space-y-3">
          <div class="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-3xl font-bold">✓</div>
          <h3 class="text-lg font-extrabold text-white">Payment Confirmed!</h3>
          <p class="text-xs text-slate-300 leading-relaxed">
            Your payment of <strong class="text-emerald-400">${CONFIG.currency}${totalAmount}</strong> has been received.
          </p>
          <div class="bg-[#0F1626] border border-slate-800 rounded-xl p-3 text-xs text-slate-300 space-y-1">
            <p><strong class="text-white">Order ID:</strong> <span class="font-mono text-violet-300">${gatewayRef}</span></p>
            <p><strong class="text-white">Customer:</strong> ${name} (${cleanPhone})</p>
          </div>
        </div>

        <a
          href="${lastPaidWhatsAppUrl}"
          target="_blank"
          rel="noopener noreferrer"
          class="w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold py-4 rounded-xl text-sm transition shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
        >
          <span>Send Paid Order on WhatsApp →</span>
        </a>

        <button type="button" onclick="finishAndClearCart()" class="w-full py-2.5 text-xs text-slate-400 hover:text-white font-medium">
          Done & Continue Shopping
        </button>
      `;
    }
  }
}

function finishAndClearCart() {
  cart = [];
  saveCart();
  updateCartUI();
  backToCartStep1();
  toggleCart(false);
}

function backToCartStep1() {
  const titleEl = document.getElementById("cart-drawer-title");
  if (titleEl) titleEl.textContent = "Your Cart";
  document.getElementById("cart-step-2")?.classList.add("hidden");
  document.getElementById("cart-step-1")?.classList.remove("hidden");
}

// ==========================================
// DRAWERS & MODALS TOGGLES
// ==========================================
function toggleMenu(open) {
  const overlay = document.getElementById("menu-overlay");
  const drawer = document.getElementById("menu-drawer");
  if (!overlay || !drawer) return;
  if (open) {
    overlay.classList.remove("hidden");
    drawer.classList.remove("-translate-x-full");
  } else {
    overlay.classList.add("hidden");
    drawer.classList.add("-translate-x-full");
  }
}

function toggleCart(open) {
  const overlay = document.getElementById("cart-overlay");
  const drawer = document.getElementById("cart-drawer");
  if (!overlay || !drawer) return;
  if (open) {
    backToCartStep1();
    overlay.classList.remove("hidden");
    drawer.classList.remove("translate-x-full");
  } else {
    overlay.classList.add("hidden");
    drawer.classList.add("translate-x-full");
  }
}

function toggleCategoryModal(open) {
  const modal = document.getElementById("category-modal");
  if (!modal) return;
  if (open) modal.classList.remove("hidden");
  else modal.classList.add("hidden");
}

function togglePolicyModal(open) {
  const modal = document.getElementById("policy-modal");
  if (!modal) return;
  if (open) modal.classList.remove("hidden");
  else modal.classList.add("hidden");
}
// END OF APP.JS
