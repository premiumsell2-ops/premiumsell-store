// ==========================================
// PREMIUMSELL STORE CONFIGURATION
// ==========================================
const CONFIG = {
  storeName: "Premiumsell",
  whatsappNumber: "916284854882",
  upiId: "6284854882@okbizaxis",
  merchantName: "Premiumsell",
  scriptUrl: "https://script.google.com/macros/s/AKfycbxRZp36M01uVbUJ3oQ_ZbOb17bfmlhUtFO070NAhTuWY2l3rKK0QzYDTTlYJdkY-nHb/exec",
  currency: "₹"
};

const PENDING_PAYMENT_KEY = "premiumsell_pending_payment";

let products = [];
let cart = JSON.parse(localStorage.getItem("premiumsell_cart") || "[]");
let activeCategory = "All";
let searchQuery = "";
let currentSlide = 0;
let slideInterval = null;

let selectedProduct = null;
let selectedVariantIndex = 0;
let showAllVariants = false;

let currentUniqueAmount = null;
let isPaymentVerified = false;
let verifyPollInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  setupWhatsAppLinks();
  initHeroCarousel();
  updateCartUI();
  loadProducts();
  restorePendingPaymentIfAny();

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderProducts();
    });
  }

  // Instant check when customer returns from GPay/PhonePe to browser
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && currentUniqueAmount && !isPaymentVerified) {
      checkPaymentStatus(true);
    }
  });

  window.addEventListener("focus", () => {
    if (currentUniqueAmount && !isPaymentVerified) {
      checkPaymentStatus(true);
    }
  });
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
      const baseVariant = product.variants && product.variants.length > 0 ? product.variants[0] : null;
      const displayPrice = baseVariant ? baseVariant.price : product.price;
      const displayMrp = baseVariant ? baseVariant.mrp : product.mrp;
      const discount = displayMrp > displayPrice ? Math.round(((displayMrp - displayPrice) / displayMrp) * 100) : 0;
      const outOfStock = product.inStock === false;

      return `
        <div onclick="openProductModal('${product.id}')" class="group bg-[#131A2A] border border-slate-800 hover:border-violet-500/60 rounded-xl overflow-hidden flex flex-col cursor-pointer transition shadow-md">
          <div class="relative aspect-square bg-[#0F1626] overflow-hidden">
            <img src="${product.image}" alt="${product.name}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-300 ${outOfStock ? "opacity-40" : ""}" />
            ${
              discount > 0
                ? `<span class="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">${discount}% OFF</span>`
                : ""
            }
            ${
              outOfStock
                ? `<span class="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs font-bold uppercase tracking-wider">Out of Stock</span>`
                : ""
            }
          </div>

          <div class="p-3 flex-1 flex flex-col justify-between">
            <div>
              <h4 class="text-xs sm:text-sm font-bold text-slate-100 line-clamp-2 leading-snug">${product.name}</h4>
              <div class="mt-2 flex items-baseline gap-1.5 flex-wrap">
                <span class="text-sm sm:text-base font-extrabold text-white">${CONFIG.currency}${displayPrice}</span>
                ${
                  displayMrp > displayPrice
                    ? `<span class="text-xs text-slate-400 line-through">${CONFIG.currency}${displayMrp}</span>`
                    : ""
                }
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
              ${outOfStock ? "Sold Out" : product.variants && product.variants.length > 1 ? "Select Plan" : "View Plan"}
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

// ==========================================
// PRODUCT DETAIL MODAL
// ==========================================
function openProductModal(productId) {
  const product = products.find((p) => p.id === productId);
  if (!product) return;

  selectedProduct = product;
  selectedVariantIndex = 0;
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
  selectedVariantIndex = index;
  renderProductModalContent();
}

function toggleVariantsExpand() {
  showAllVariants = !showAllVariants;
  renderProductModalContent();
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
  const outOfStock = selectedProduct.inStock === false;

  const visibleVariants = showAllVariants ? variants : variants.slice(0, 3);
  const hasMoreThanThree = variants.length > 3;

  const variantsHtml = hasVariants
    ? `
      <div class="py-4 border-y border-slate-800">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
          SELECT :: <span class="text-violet-400">${activeVariant.label}</span>
        </p>

        <div class="flex flex-col gap-2.5">
          ${visibleVariants
            .map((v, idx) => {
              const isSelected = idx === selectedVariantIndex;
              return `
                <button
                  type="button"
                  onclick="selectVariant(${idx})"
                  class="w-full text-left px-4 py-3.5 rounded-lg text-xs sm:text-sm transition flex items-center justify-between gap-3 focus:outline-none ${
                    isSelected
                      ? "bg-[#312E81]/60 border-2 border-white text-white font-bold shadow-[0_0_16px_rgba(139,92,246,0.35)]"
                      : "bg-[#131A2A] border border-slate-700 text-slate-200 font-medium hover:border-slate-500"
                  }"
                >
                  <span class="truncate uppercase">${v.label}</span>
                  <span class="flex-shrink-0 font-bold text-white">${CONFIG.currency}${v.price}</span>
                </button>
              `;
            })
            .join("")}
        </div>

        ${
          hasMoreThanThree
            ? `
              <button
                type="button"
                onclick="toggleVariantsExpand()"
                class="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-400 hover:text-violet-300 transition"
              >
                <span>${showAllVariants ? "− View less" : "+ View more"}</span>
              </button>
            `
            : ""
        }
      </div>
    `
    : "";

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10 items-start">
      
      <div class="bg-[#131A2A] border border-slate-800 rounded-2xl p-3 sm:p-5 flex items-center justify-center md:sticky md:top-24">
        <img src="${selectedProduct.image}" alt="${selectedProduct.name}" class="w-full h-auto max-h-[540px] object-contain rounded-xl" />
      </div>

      <div class="space-y-4">
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

        ${
          selectedProduct.shortRule
            ? `<div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs sm:text-sm leading-relaxed">${selectedProduct.shortRule}</div>`
            : ""
        }

        <div>
          <h3 class="text-sm sm:text-base font-bold text-white mb-2">Product Description</h3>
          <div class="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">${selectedProduct.description || ""}</div>
        </div>

        ${
          selectedProduct.moreDetails
            ? `<div class="pt-3 border-t border-slate-800 text-xs sm:text-sm text-slate-400">${selectedProduct.moreDetails}</div>`
            : ""
        }
      </div>

    </div>
  `;

  const addBtn = document.getElementById("modal-add-btn");
  const buyBtn = document.getElementById("modal-buy-btn");

  if (addBtn && buyBtn) {
    addBtn.disabled = outOfStock;
    buyBtn.disabled = outOfStock;

    addBtn.onclick = () => {
      addToCart(selectedProduct, activeVariant);
      closeProductModal();
      toggleCart(true);
    };

    buyBtn.onclick = () => {
      addToCart(selectedProduct, activeVariant);
      closeProductModal();
      toggleCart(true);
    };
  }
}

// ==========================================
// SHOPPING CART & UNIQUE PAISA AUTO-VERIFICATION
// ==========================================
function addToCart(product, variant) {
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

function proceedToUpiPayment() {
  const name = document.getElementById("cust-name")?.value.trim();
  const phone = document.getElementById("cust-phone")?.value.trim();

  if (!name || !phone) {
    alert("Please enter your Name and WhatsApp Number.");
    return;
  }

  const baseTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  // Generate unique paise (.11 to .89) to avoid cross-customer collision
  const randomPaise = (Math.floor(Math.random() * 79) + 11) / 100;
  currentUniqueAmount = (baseTotal + randomPaise).toFixed(2);
  isPaymentVerified = false;

  // Save pending order so mobile browser reload while switching to GPay never loses amount
  localStorage.setItem(
    PENDING_PAYMENT_KEY,
    JSON.stringify({
      amount: currentUniqueAmount,
      name,
      phone,
      cart,
      createdAt: Date.now()
    })
  );

  renderPaymentStep2UI();
}

function restorePendingPaymentIfAny() {
  try {
    const raw = localStorage.getItem(PENDING_PAYMENT_KEY);
    if (!raw) return;

    const pending = JSON.parse(raw);
    const maxAge = 25 * 60 * 1000; // 25 minutes
    if (!pending || !pending.amount || Date.now() - pending.createdAt > maxAge) {
      localStorage.removeItem(PENDING_PAYMENT_KEY);
      return;
    }

    currentUniqueAmount = pending.amount;
    isPaymentVerified = false;
    if (Array.isArray(pending.cart) && pending.cart.length > 0) {
      cart = pending.cart;
      updateCartUI();
    }

    const nameInput = document.getElementById("cust-name");
    const phoneInput = document.getElementById("cust-phone");
    if (nameInput && pending.name) nameInput.value = pending.name;
    if (phoneInput && pending.phone) phoneInput.value = pending.phone;

    const overlay = document.getElementById("cart-overlay");
    const drawer = document.getElementById("cart-drawer");
    if (overlay) overlay.classList.remove("hidden");
    if (drawer) drawer.classList.remove("translate-x-full");

    renderPaymentStep2UI();
    checkPaymentStatus(true);
  } catch (_) {
    localStorage.removeItem(PENDING_PAYMENT_KEY);
  }
}

function renderPaymentStep2UI() {
  const note = `Order ${currentUniqueAmount}`;
  const upiUrl = `upi://pay?pa=${encodeURIComponent(CONFIG.upiId)}&pn=${encodeURIComponent(CONFIG.merchantName)}&am=${currentUniqueAmount}&cu=INR&tn=${encodeURIComponent(note)}`;

  const amountEl = document.getElementById("upi-pay-amount");
  const directLinkEl = document.getElementById("upi-direct-link");
  const qrContainer = document.getElementById("upi-qrcode");
  const titleEl = document.getElementById("cart-drawer-title");

  if (amountEl) amountEl.textContent = `${CONFIG.currency}${currentUniqueAmount}`;
  if (titleEl) titleEl.textContent = "Complete Payment";

  // Replace risky upi:// deep-link with safe QR Download for GPay/PhonePe Gallery Scan
  if (directLinkEl) {
    directLinkEl.href = "#download-qr";
    directLinkEl.removeAttribute("target");
    directLinkEl.textContent = "📥 Download QR (Scan from GPay / PhonePe Gallery)";
    directLinkEl.onclick = (e) => {
      e.preventDefault();
      downloadPaymentQr(upiUrl);
    };
  }

  if (qrContainer) {
    qrContainer.innerHTML = "";
    if (typeof QRCode !== "undefined") {
      new QRCode(qrContainer, {
        text: upiUrl,
        width: 185,
        height: 185,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      qrContainer.innerHTML = `<img id="qr-fallback-img" crossorigin="anonymous" src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(upiUrl)}" alt="UPI QR" class="w-44 h-44" />`;
    }
  }

  const utrInput = document.getElementById("payment-utr");
  if (utrInput) utrInput.value = "";
  resetVerifyBoxUI();
  validateUtrInput();

  document.getElementById("cart-step-1")?.classList.add("hidden");
  document.getElementById("cart-step-2")?.classList.remove("hidden");

  startPaymentVerificationPolling();
}

function downloadPaymentQr(upiUrl) {
  const qrContainer = document.getElementById("upi-qrcode");
  const existingCanvas = qrContainer ? qrContainer.querySelector("canvas") : null;
  const existingImg = qrContainer ? qrContainer.querySelector("img") : null;

  const triggerDownload = (dataUrl) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `Premiumsell-Pay-${currentUniqueAmount}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    const desc = document.getElementById("verify-status-desc");
    if (desc && !isPaymentVerified) {
      desc.textContent = "QR Gallery mein save ho gaya! GPay/PhonePe mein 'Upload from Gallery' se pay karein.";
    }
  };

  if (existingCanvas) {
    // Add white margin around QR so gallery scanner reads it reliably
    const padded = document.createElement("canvas");
    const pad = 24;
    padded.width = existingCanvas.width + pad * 2;
    padded.height = existingCanvas.height + pad * 2;
    const ctx = padded.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, padded.width, padded.height);
    ctx.drawImage(existingCanvas, pad, pad);
    triggerDownload(padded.toDataURL("image/png"));
    return;
  }

  if (existingImg && existingImg.src.startsWith("data:")) {
    triggerDownload(existingImg.src);
    return;
  }

  // Fallback external QR download
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=12&data=${encodeURIComponent(upiUrl)}`;
  fetch(qrApiUrl)
    .then((r) => r.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      triggerDownload(url);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    })
    .catch(() => {
      window.open(qrApiUrl, "_blank");
    });
}

function resetVerifyBoxUI() {
  const box = document.getElementById("auto-verify-box");
  const spinner = document.getElementById("verify-spinner");
  const title = document.getElementById("verify-status-title");
  const desc = document.getElementById("verify-status-desc");

  if (box) box.className = "p-3 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center gap-3";
  if (spinner) spinner.classList.remove("hidden");
  if (title) {
    title.textContent = "Waiting for Payment Confirmation...";
    title.className = "text-xs font-bold text-violet-300";
  }
  if (desc) {
    desc.innerHTML = `Pay karte hi 5–10 sec mein verify hoga. <button type="button" onclick="checkPaymentStatus(true)" class="underline font-bold text-violet-300 hover:text-white ml-1">Check Now</button>`;
  }
}

function startPaymentVerificationPolling() {
  stopPaymentVerificationPolling();
  verifyPollInterval = setInterval(() => checkPaymentStatus(false), 3000);
}

function stopPaymentVerificationPolling() {
  if (verifyPollInterval) {
    clearInterval(verifyPollInterval);
    verifyPollInterval = null;
  }
}

async function checkPaymentStatus(isManual = false) {
  if (!currentUniqueAmount || isPaymentVerified) return;

  const title = document.getElementById("verify-status-title");
  if (isManual && title && !isPaymentVerified) {
    title.textContent = "Checking Payment Status...";
  }

  try {
    const res = await fetch(
      `${CONFIG.scriptUrl}?amount=${encodeURIComponent(currentUniqueAmount)}&t=${Date.now()}`,
      { cache: "no-store" }
    );
    const rawText = await res.text();
    let data = null;
    try {
      data = JSON.parse(rawText);
    } catch (_) {}

    const verified =
      (data && (data.verified === true || data.status === "verified" || data.paid === true || data.found === true)) ||
      rawText.toLowerCase().includes('"verified":true') ||
      rawText.trim() === "true";

    if (verified) {
      isPaymentVerified = true;
      localStorage.removeItem(PENDING_PAYMENT_KEY);
      stopPaymentVerificationPolling();
      onPaymentAutoVerified();
    } else if (isManual && title && !isPaymentVerified) {
      title.textContent = "Waiting for Payment Confirmation...";
    }
  } catch (err) {
    if (isManual && title && !isPaymentVerified) {
      title.textContent = "Waiting for Payment Confirmation...";
    }
  }
}

function onPaymentAutoVerified() {
  const box = document.getElementById("auto-verify-box");
  const spinner = document.getElementById("verify-spinner");
  const title = document.getElementById("verify-status-title");
  const desc = document.getElementById("verify-status-desc");
  const btn = document.getElementById("confirm-paid-btn");

  if (box) box.className = "p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center gap-3";
  if (spinner) spinner.classList.add("hidden");
  if (title) {
    title.textContent = "✅ Payment Verified Automatically!";
    title.className = "text-xs font-extrabold text-emerald-400";
  }
  if (desc) desc.textContent = `₹${currentUniqueAmount} received on Google Pay. Click below to send order!`;

  if (btn) {
    btn.disabled = false;
    btn.className = "w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white cursor-pointer font-bold py-3.5 rounded-xl text-sm transition shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2";
    btn.innerHTML = `<span>Send Verified Order on WhatsApp →</span>`;
  }
}

function isValidUtr(utr) {
  if (!/^\d{12}$/.test(utr)) return false;
  if (/^(\d)\1{11}$/.test(utr)) return false;
  if (utr === "123456789012" || utr === "987654321098") return false;
  return true;
}

function validateUtrInput() {
  if (isPaymentVerified) return;

  const utrInput = document.getElementById("payment-utr");
  const btn = document.getElementById("confirm-paid-btn");
  if (!utrInput || !btn) return;

  utrInput.value = utrInput.value.replace(/\D/g, "");
  const utr = utrInput.value;

  if (isValidUtr(utr)) {
    btn.disabled = false;
    btn.className = "w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white cursor-pointer font-bold py-3.5 rounded-xl text-sm transition shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2";
    btn.innerHTML = `<span>I Have Paid • Send Order on WhatsApp</span>`;
  } else {
    btn.disabled = true;
    btn.className = "w-full bg-slate-700 text-slate-400 cursor-not-allowed font-bold py-3.5 rounded-xl text-sm transition flex items-center justify-center gap-2";
    btn.innerHTML = `<span>Complete Payment or Enter 12-Digit UTR</span>`;
  }
}

function backToCartStep1() {
  stopPaymentVerificationPolling();
  localStorage.removeItem(PENDING_PAYMENT_KEY);
  currentUniqueAmount = null;
  const titleEl = document.getElementById("cart-drawer-title");
  if (titleEl) titleEl.textContent = "Your Cart";
  document.getElementById("cart-step-2")?.classList.add("hidden");
  document.getElementById("cart-step-1")?.classList.remove("hidden");
}

function copyMerchantUpi() {
  navigator.clipboard.writeText(CONFIG.upiId).then(() => {
    const btn = document.getElementById("copy-upi-btn");
    if (btn) {
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy ID"; }, 2000);
    }
  });
}

function confirmPaidWhatsApp() {
  const name = document.getElementById("cust-name")?.value.trim();
  const phone = document.getElementById("cust-phone")?.value.trim();
  const utr = document.getElementById("payment-utr")?.value.trim();

  if (!isPaymentVerified && !isValidUtr(utr)) {
    alert("Please complete the UPI payment or enter a valid 12-digit UTR Number.");
    return;
  }

  localStorage.removeItem(PENDING_PAYMENT_KEY);

  const itemsText = cart
    .map((item, i) => `${i + 1}. *${item.name}* (${item.variant}) x${item.qty} = ${CONFIG.currency}${item.price * item.qty}`)
    .join("\n");

  let message = `*PAID ORDER - ${CONFIG.storeName.toUpperCase()}*\n\n`;
  message += `*Customer:* ${name}\n`;
  message += `*WhatsApp:* ${phone}\n`;
  message += `\n*Order Details:*\n${itemsText}\n\n`;
  message += `*Unique Amount Paid:* ${CONFIG.currency}${currentUniqueAmount}\n`;
  message += `*Verification:* ${isPaymentVerified ? "✅ Auto-Verified via GPay" : "UTR Submitted"}\n`;
  if (utr) {
    message += `*UTR / Ref No.:* ${utr}\n`;
  }
  message += `\nPlease activate my subscription!`;

  const waUrl = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, "_blank");
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
    if (!currentUniqueAmount) {
      backToCartStep1();
    }
    overlay.classList.remove("hidden");
    drawer.classList.remove("translate-x-full");
  } else {
    stopPaymentVerificationPolling();
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
