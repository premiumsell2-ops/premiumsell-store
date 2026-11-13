// ==========================================
// 1. STORE CONFIGURATION
// ==========================================
const CONFIG = {
  storeName: "Premiumsell",
  whatsappNumber: "916284854882", // Apna 10-digit number '91' ke saath dalein
  currency: "₹"
};

let allProducts = [];
let selectedCategory = "All";
let cart = JSON.parse(localStorage.getItem("premiumsell_cart")) || [];
let currentSlide = 0;
let activeModalProduct = null;
let activeVariantIndex = 0;

// ==========================================
// 2. INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  const waDirect = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent("Hi Premiumsell, I want to enquire about a subscription.")}`;
  document.getElementById("header-wa-link").href = waDirect;
  document.getElementById("drawer-wa-link").href = waDirect;

  try {
    const res = await fetch("products.json");
    if (!res.ok) throw new Error("Failed to fetch products.json");
    allProducts = await res.json();
  } catch (err) {
    console.error("Run using Live Server or Cloudflare Pages to load products.json:", err);
  }

  initCarousel();
  renderCategoryLists();
  renderProducts();
  updateCartUI();

  document.getElementById("search-input").addEventListener("input", renderProducts);
});

// ==========================================
// 3. HERO CAROUSEL LOGIC
// ==========================================
function initCarousel() {
  const slides = document.getElementById("hero-slides");
  const total = slides.children.length;
  const dotsContainer = document.getElementById("hero-dots");

  dotsContainer.innerHTML = Array.from({ length: total }).map((_, i) => `
    <button onclick="goToSlide(${i})" class="w-2 h-2 rounded-full transition ${i === 0 ? "bg-white w-4" : "bg-white/50"}"></button>
  `).join("");

  setInterval(() => {
    nextSlide();
  }, 4500);
}

function goToSlide(index) {
  const slides = document.getElementById("hero-slides");
  const total = slides.children.length;
  currentSlide = (index + total) % total;
  slides.style.transform = `translateX(-${currentSlide * 100}%)`;

  const dots = document.getElementById("hero-dots").children;
  Array.from(dots).forEach((dot, i) => {
    dot.className = `h-2 rounded-full transition-all ${i === currentSlide ? "bg-white w-5" : "bg-white/60 w-2"}`;
  });
}

function nextSlide() { goToSlide(currentSlide + 1); }
function prevSlide() { goToSlide(currentSlide - 1); }

// ==========================================
// 4. CATEGORIES & 2-COLUMN PRODUCT GRID
// ==========================================
function getCategories() {
  return ["All", ...new Set(allProducts.map(p => p.category))];
}

function renderCategoryLists() {
  const categories = getCategories();

  // Floating "All Categories" Modal List
  document.getElementById("category-modal-list").innerHTML = categories.map(cat => {
    const count = cat === "All" ? allProducts.length : allProducts.filter(p => p.category === cat).length;
    const isActive = selectedCategory === cat;
    return `
      <button 
        onclick="selectCategory('${cat}'); toggleCategoryModal(false);"
        class="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition ${
          isActive ? "bg-purple-50 text-[#5B21B6] font-bold" : "text-gray-700 hover:bg-gray-50"
        }"
      >
        <span>${cat === "All" ? "All Subscriptions" : cat}</span>
        <span class="text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full">${count}</span>
      </button>
    `;
  }).join("");

  // Hamburger Drawer Categories
  document.getElementById("drawer-categories").innerHTML = categories.filter(c => c !== "All").map(cat => `
    <button onclick="selectCategory('${cat}'); toggleMenu(false);" class="w-full text-left px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50">
      ${cat}
    </button>
  `).join("");
}

function selectCategory(cat) {
  selectedCategory = cat;
  document.getElementById("active-category-title").textContent = cat === "All" ? "ALL SUBSCRIPTIONS" : cat.toUpperCase();
  renderCategoryLists();
  renderProducts();
}

function calcDiscount(mrp, price) {
  if (!mrp || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

function renderProducts() {
  const query = document.getElementById("search-input").value.toLowerCase().trim();
  const grid = document.getElementById("product-grid");

  const filtered = allProducts.filter(p => {
    const matchCat = selectedCategory === "All" || p.category === selectedCategory;
    const matchQuery = p.name.toLowerCase().includes(query) || p.category.toLowerCase().includes(query);
    return matchCat && matchQuery;
  });

  document.getElementById("product-count-label").textContent = `${filtered.length} items`;

  if (filtered.length === 0) {
    grid.innerHTML = `<p class="col-span-full text-center text-gray-500 py-12 text-sm">Koi subscription nahi mili.</p>`;
    return;
  }

  grid.innerHTML = filtered.map(product => {
    const discount = calcDiscount(product.mrp, product.price);
    const hasVariants = product.variants && product.variants.length > 1;

    return `
      <div class="flex flex-col bg-white">
        <!-- Square Product Image + Bottom-Left Green % OFF Badge -->
        <div onclick="openProductModal('${product.id}')" class="relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 cursor-pointer group">
          <img src="${product.image}" alt="${product.name}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
          ${discount > 0 ? `
            <span class="absolute bottom-2 left-2 bg-[#16A34A] text-white text-[11px] font-extrabold px-2 py-0.5 rounded shadow-sm">
              ${discount}% OFF
            </span>
          ` : ""}
        </div>

        <!-- Title & Pricing -->
        <div onclick="openProductModal('${product.id}')" class="mt-2.5 cursor-pointer">
          <h4 class="text-[13px] sm:text-sm font-medium text-gray-900 line-clamp-2 leading-snug min-h-[2.4rem]">
            ${product.name}
          </h4>
          <div class="flex items-baseline gap-1.5 mt-1">
            <span class="text-sm sm:text-base font-extrabold text-gray-900">${CONFIG.currency}${product.price}</span>
            ${product.mrp > product.price ? `
              <span class="text-xs text-gray-400 line-through">${CONFIG.currency}${product.mrp}</span>
            ` : ""}
          </div>
        </div>

        <!-- Outlined ADD Button (Exact Video Style) -->
        <button 
          onclick="${hasVariants ? `openProductModal('${product.id}')` : `quickAddToCart('${product.id}')`}"
          class="mt-2.5 w-full py-2 border border-gray-300 hover:border-[#5B21B6] hover:text-[#5B21B6] rounded-lg text-xs font-bold tracking-wide text-gray-800 transition"
        >
          ADD
        </button>

        <!-- Variant Count Indicator ("4 options") -->
        ${hasVariants ? `
          <button onclick="openProductModal('${product.id}')" class="mt-1.5 flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>${product.variants.length} options</span>
          </button>
        ` : ""}

        <!-- Short Rule Snippet -->
        ${product.shortRule ? `
          <p class="mt-1.5 text-[11px] text-gray-500 line-clamp-2 leading-tight">
            ${product.shortRule}
          </p>
        ` : ""}
      </div>
    `;
  }).join("");
}

// ==========================================
// 5. PRODUCT DETAIL MODAL (Matches 00:10-00:15)
// ==========================================
function openProductModal(productId, variantIdx = 0) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  activeModalProduct = product;
  activeVariantIndex = variantIdx;

  renderProductModal();
  document.getElementById("product-modal").classList.remove("hidden");
  document.getElementById("product-modal").scrollTop = 0;
}

function closeProductModal() {
  document.getElementById("product-modal").classList.add("hidden");
}

function selectVariant(idx) {
  activeVariantIndex = idx;
  renderProductModal();
}

function renderProductModal() {
  const p = activeModalProduct;
  const variants = p.variants && p.variants.length > 0
    ? p.variants
    : [{ label: "STANDARD PLAN", mrp: p.mrp, price: p.price, razorpayLink: p.razorpayLink || "" }];

  const currentVar = variants[activeVariantIndex] || variants[0];
  const discount = calcDiscount(currentVar.mrp, currentVar.price);

  // Related products in same category
  const related = allProducts.filter(item => item.category === p.category && item.id !== p.id).slice(0, 4);

  document.getElementById("product-modal-content").innerHTML = `
    <!-- Hero Image -->
    <div class="w-full aspect-square max-h-[380px] bg-gray-100 overflow-hidden">
      <img src="${p.image}" alt="${p.name}" class="w-full h-full object-cover" />
    </div>

    <div class="px-4 pt-4">
      <!-- Title -->
      <h1 class="text-lg sm:text-xl font-bold text-gray-900">${p.name}</h1>

      <!-- Price + Strikethrough MRP + Green % OFF Pill -->
      <div class="flex items-center gap-2.5 mt-2">
        <span class="text-xl font-extrabold text-gray-900">${CONFIG.currency}${currentVar.price}</span>
        ${currentVar.mrp > currentVar.price ? `
          <span class="text-sm text-gray-400 line-through">${CONFIG.currency}${currentVar.mrp}</span>
        ` : ""}
        ${discount > 0 ? `
          <span class="bg-[#16A34A] text-white text-xs font-bold px-2 py-0.5 rounded">${discount}% OFF</span>
        ` : ""}
      </div>

      <!-- Variant Pills Selector -->
      <div class="mt-5 pt-4 border-t border-gray-100">
        <p class="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2.5">
          SELECT : <span class="text-gray-900">${currentVar.label}</span>
        </p>
        <div class="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
          ${variants.map((v, idx) => `
            <button 
              onclick="selectVariant(${idx})"
              class="flex-shrink-0 px-3.5 py-2 rounded-lg text-xs font-bold border transition ${
                idx === activeVariantIndex
                  ? "border-[#5B21B6] text-[#5B21B6] bg-purple-50/60"
                  : "border-gray-300 text-gray-700 hover:border-gray-400"
              }"
            >
              ${v.label}
            </button>
          `).join("")}
        </div>
      </div>

      <!-- Product Description -->
      <div class="mt-6 pt-4 border-t border-gray-100">
        <h3 class="text-sm font-bold text-gray-900 mb-2">Product Description</h3>
        <div class="text-xs sm:text-sm text-gray-700 whitespace-pre-line leading-relaxed">
          ${p.description || p.shortRule || ""}
        </div>
      </div>

      <!-- More Details Accordion -->
      ${p.moreDetails ? `
        <details class="mt-5 pt-4 border-t border-gray-100 group" open>
          <summary class="text-sm font-bold text-gray-900 cursor-pointer list-none flex items-center justify-between">
            <span>More Details</span>
            <span class="text-gray-400 text-xs">▼</span>
          </summary>
          <p class="mt-2 text-xs sm:text-sm text-gray-600 leading-relaxed">${p.moreDetails}</p>
        </details>
      ` : ""}

      <!-- More in Category -->
      ${related.length > 0 ? `
        <div class="mt-7 pt-5 border-t border-gray-200">
          <h3 class="text-base font-bold text-gray-900 mb-3.5">More in category</h3>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            ${related.map(rel => {
              const relDisc = calcDiscount(rel.mrp, rel.price);
              return `
                <div onclick="openProductModal('${rel.id}')" class="cursor-pointer">
                  <div class="relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                    <img src="${rel.image}" alt="${rel.name}" class="w-full h-full object-cover" />
                    ${relDisc > 0 ? `<span class="absolute bottom-1.5 left-1.5 bg-[#16A34A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">${relDisc}% OFF</span>` : ""}
                  </div>
                  <p class="mt-1.5 text-xs font-medium text-gray-900 line-clamp-2">${rel.name}</p>
                  <div class="flex items-baseline gap-1 mt-0.5">
                    <span class="text-xs font-extrabold">${CONFIG.currency}${rel.price}</span>
                    <span class="text-[10px] text-gray-400 line-through">${CONFIG.currency}${rel.mrp}</span>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;

  // Wire up Sticky Bottom Buttons
  document.getElementById("modal-add-btn").onclick = () => {
    addItemToCart(p, currentVar);
    closeProductModal();
    toggleCart(true);
  };

  document.getElementById("modal-buy-btn").onclick = () => {
    if (currentVar.razorpayLink) {
      window.open(currentVar.razorpayLink, "_blank");
    } else {
      addItemToCart(p, currentVar);
      closeProductModal();
      toggleCart(true);
    }
  };
}

// ==========================================
// 6. SHOPPING CART & WHATSAPP CHECKOUT
// ==========================================
function quickAddToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;
  const variant = product.variants && product.variants[0]
    ? product.variants[0]
    : { label: "Standard", price: product.price };

  addItemToCart(product, variant);
  toggleCart(true);
}

function addItemToCart(product, variant) {
  const cartKey = `${product.id}_${variant.label}`;
  const existing = cart.find(item => item.key === cartKey);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      key: cartKey,
      name: product.name,
      plan: variant.label,
      price: variant.price,
      qty: 1
    });
  }

  saveCart();
  updateCartUI();
}

function updateQty(key, delta) {
  const item = cart.find(i => i.key === key);
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(i => i.key !== key);
  }

  saveCart();
  updateCartUI();
}

function saveCart() {
  localStorage.setItem("premiumsell_cart", JSON.stringify(cart));
}

function updateCartUI() {
  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);
  const totalPrice = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

  document.getElementById("cart-count").textContent = totalItems;
  document.getElementById("modal-cart-count").textContent = totalItems;

  const container = document.getElementById("cart-items");
  const footer = document.getElementById("cart-footer");

  if (cart.length === 0) {
    container.innerHTML = `<p class="text-center text-gray-500 text-sm py-12">Your cart is empty.</p>`;
    footer.classList.add("hidden");
    return;
  }

  footer.classList.remove("hidden");
  document.getElementById("cart-total").textContent = `${CONFIG.currency}${totalPrice}`;

  container.innerHTML = cart.map(item => `
    <div class="flex items-center justify-between border-b border-gray-100 pb-3">
      <div class="pr-2">
        <h4 class="text-sm font-bold text-gray-900">${item.name}</h4>
        <p class="text-[11px] font-semibold text-[#5B21B6]">${item.plan}</p>
        <p class="text-xs text-gray-500 mt-0.5">${CONFIG.currency}${item.price} x ${item.qty}</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="updateQty('${item.key}', -1)" class="w-7 h-7 rounded bg-gray-100 font-bold text-gray-700">-</button>
        <span class="text-sm font-bold w-4 text-center">${item.qty}</span>
        <button onclick="updateQty('${item.key}', 1)" class="w-7 h-7 rounded bg-gray-100 font-bold text-gray-700">+</button>
      </div>
    </div>
  `).join("");
}

function checkoutWhatsApp() {
  const name = document.getElementById("cust-name").value.trim();
  const phone = document.getElementById("cust-phone").value.trim();
  const activationId = document.getElementById("cust-activation-id").value.trim();

  if (!name || !phone) {
    alert("Kripya apna Name aur WhatsApp Number bharein.");
    return;
  }

  const lines = cart.map((item, idx) =>
    `${idx + 1}. *${item.name}* (${item.plan}) x${item.qty} = ${CONFIG.currency}${item.price * item.qty}`
  ).join("\n");

  const grandTotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

  const msg =
`*New Subscription Order - ${CONFIG.storeName}*

${lines}

*Total Amount:* ${CONFIG.currency}${grandTotal}

*Customer Details:*
Name: ${name}
WhatsApp: ${phone}${activationId ? `\nActivation ID/Email: ${activationId}` : ""}`;

  const url = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`;

  cart = [];
  saveCart();
  updateCartUI();
  toggleCart(false);

  window.open(url, "_blank");
}

// ==========================================
// 7. UI TOGGLES (Search, Menu, Cart, Modals)
// ==========================================
function toggleSearchBar() {
  const box = document.getElementById("search-bar-box");
  box.classList.toggle("hidden");
  if (!box.classList.contains("hidden")) {
    document.getElementById("search-input").focus();
  }
}

function clearSearch() {
  document.getElementById("search-input").value = "";
  renderProducts();
  toggleSearchBar();
}

function toggleCategoryModal(open) {
  document.getElementById("category-modal").classList.toggle("hidden", !open);
}

function toggleMenu(open) {
  document.getElementById("menu-drawer").classList.toggle("-translate-x-full", !open);
  document.getElementById("menu-overlay").classList.toggle("hidden", !open);
}

function toggleCart(open) {
  document.getElementById("cart-drawer").classList.toggle("translate-x-full", !open);
  document.getElementById("cart-overlay").classList.toggle("hidden", !open);
}

function resetHome(e) {
  if (e) e.preventDefault();
  selectCategory("All");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
