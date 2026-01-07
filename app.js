/* =========================================================
   Phone Store (Google Sheet) — Frontend
   - Reads data from Apps Script Web App (JSON)
   - Brands allowed: apple, samsung, google, motorola
   - Theme: Dark/Light
   - Cart + WhatsApp Checkout (number from Settings sheet)
   ========================================================= */

/** ✅ ضع رابط الـ /exec هنا (أنت أعطيته لنا وهو موجود بالفعل) */
const API_URL = "https://script.google.com/macros/s/AKfycby2Obsz6zZcEaRevj4JCj5qFm3Tkqbf5hXbtRsooxFqzIVaRR5yIOuGzBTpzo9mSEGflQ/exec";

const ALLOWED_BRANDS = ["apple", "samsung", "google", "motorola"];
const PAGE_SIZE = 16; // عدد العناصر في الدفعة الواحدة (بدون عرض "عدد العرض")

// DOM
const productsGrid = document.getElementById("productsGrid");
const statusText = document.getElementById("statusText");
const productsCountEl = document.getElementById("productsCount");
const activeBrandLabel = document.getElementById("activeBrandLabel");
const searchInput = document.getElementById("searchInput");
const loadMoreBtn = document.getElementById("loadMoreBtn");

const openCartBtn = document.getElementById("openCartBtn");
const cartDrawer = document.getElementById("cartDrawer");
const closeCartBtn = document.getElementById("closeCartBtn");
const closeCartOverlay = document.getElementById("closeCartOverlay");
const cartItemsEl = document.getElementById("cartItems");
const cartTotalEl = document.getElementById("cartTotal");
const cartCountBadge = document.getElementById("cartCountBadge");
const checkoutBtn = document.getElementById("checkoutBtn");

const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeIcon = document.getElementById("themeIcon");
const themeLabel = document.getElementById("themeLabel");

document.getElementById("year").textContent = new Date().getFullYear();

// State
let settings = { whatsapp_number: "" };
let allProducts = [];
let filtered = [];
let activeBrand = "all";
let searchTerm = "";
let page = 1;

// Cart: { [id]: {id, name, brand, price, currency, qty} }
let cart = loadCart();

/* ------------------ Helpers ------------------ */
function normalizeBrand(x){
  return String(x || "").trim().toLowerCase();
}
function safeNumber(x){
  const n = Number(String(x).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function formatMoney(price, currency){
  const cur = currency || "ر.س";
  // العرض بالأرقام العربية يعتمد على المتصفح — نتركها بسيطة
  return `${price.toLocaleString("ar-YE")} ${cur}`;
}
function escapeHtml(str){
  return String(str || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function setStatus(msg){ statusText.textContent = msg; }

/* ------------------ Theme ------------------ */
function applyTheme(theme){
  document.body.classList.toggle("theme-dark", theme === "dark");
  document.body.classList.toggle("theme-light", theme === "light");
  if(theme === "dark"){
    themeIcon.textContent = "🌙";
    themeLabel.textContent = "مظهر ليلي";
  }else{
    themeIcon.textContent = "☀️";
    themeLabel.textContent = "مظهر عادي";
  }
  localStorage.setItem("theme", theme);
}

themeToggleBtn.addEventListener("click", () => {
  const current = localStorage.getItem("theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
});

/* ------------------ Drawer ------------------ */
function openCart(){
  cartDrawer.classList.add("is-open");
  cartDrawer.setAttribute("aria-hidden", "false");
}
function closeCart(){
  cartDrawer.classList.remove("is-open");
  cartDrawer.setAttribute("aria-hidden", "true");
}
openCartBtn.addEventListener("click", openCart);
closeCartBtn.addEventListener("click", closeCart);
closeCartOverlay.addEventListener("click", closeCart);

/* ------------------ Brands ------------------ */
document.querySelectorAll(".brandBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".brandBtn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    activeBrand = btn.dataset.brand;
    page = 1;
    updateActiveBrandLabel();
    applyFilters();
    render();
  });
});

function updateActiveBrandLabel(){
  const map = {
    all: "الكل",
    apple: "Apple",
    samsung: "Samsung",
    google: "Google",
    motorola: "Motorola"
  };
  activeBrandLabel.textContent = `عرض: ${map[activeBrand] || "الكل"}`;
}

/* ------------------ Search ------------------ */
searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value.trim().toLowerCase();
  page = 1;
  applyFilters();
  render();
});

/* ------------------ Pagination ------------------ */
loadMoreBtn.addEventListener("click", () => {
  page += 1;
  render();
});

/* ------------------ Data Fetch ------------------ */
async function fetchData(){
  try{
    setStatus("جاري تحميل المنتجات...");
    const res = await fetch(API_URL, { method: "GET" });
    if(!res.ok) throw new Error("فشل الاتصال بالمصدر");
    const data = await res.json();

    if(!data || data.ok !== true) {
      throw new Error(data?.error || "بيانات غير صحيحة");
    }

    settings = data.settings || { whatsapp_number: "" };

    // Ensure products only allowed brands
    allProducts = (data.products || [])
      .map(p => ({
        id: String(p.id || "").trim(),
        brand: normalizeBrand(p.brand),
        name: String(p.name || "").trim(),
        price: safeNumber(p.price),
        currency: String(p.currency || "ر.س").trim(),
        img: String(p.img || "").trim(),
        description: String(p.description || "").trim(),
        available: String(p.available ?? "1").trim() !== "0",
        featured: String(p.featured ?? "0").trim() === "1",
      }))
      .filter(p => p.id && p.name && ALLOWED_BRANDS.includes(p.brand));

    applyFilters();
    setStatus(`تم تحميل المنتجات بنجاح`);
    render();
    renderCart();
  }catch(err){
    console.error(err);
    setStatus(`تعذر تحميل المنتجات. تأكد من رابط API ومن النشر. (${String(err.message || err)})`);
    // Render empty state
    allProducts = [];
    filtered = [];
    render();
  }
}

function applyFilters(){
  filtered = allProducts.filter(p => {
    const brandOk = (activeBrand === "all") ? true : (p.brand === activeBrand);
    const searchOk = !searchTerm
      ? true
      : (p.name.toLowerCase().includes(searchTerm) || p.description.toLowerCase().includes(searchTerm));
    return brandOk && searchOk;
  });

  // عدد المنتجات الحقيقي حسب Google Sheet بعد الفلترة الحالية
  productsCountEl.textContent = String(filtered.length);
}

/* ------------------ Render Products ------------------ */
function render(){
  const visibleCount = Math.min(filtered.length, page * PAGE_SIZE);
  const view = filtered.slice(0, visibleCount);

  productsGrid.innerHTML = view.map(productCardHtml).join("");

  // Show/Hide "Load More"
  loadMoreBtn.hidden = visibleCount >= filtered.length || filtered.length <= PAGE_SIZE;

  // Bind buttons
  productsGrid.querySelectorAll("[data-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-add");
      const p = allProducts.find(x => x.id === id);
      if(!p) return;
      if(!p.available) return;

      addToCart(p);
      openCart();
    });
  });
}

function productCardHtml(p){
  const imgHtml = p.img
    ? `<img src="${escapeHtml(p.img)}" alt="${escapeHtml(p.name)}" loading="lazy">`
    : `<div class="ph">لا توجد صورة حالياً</div>`;

  const tag = p.featured
    ? `<span class="tag">مميز</span>`
    : (!p.available ? `<span class="tag tag--out">غير متوفر</span>` : "");

  const btnDisabled = p.available ? "" : "disabled";
  const btnText = p.available ? "إضافة إلى السلة" : "غير متوفر";

  return `
    <article class="card">
      <div class="card__media">
        ${tag}
        ${imgHtml}
      </div>

      <div class="card__body">
        <h3 class="card__name">${escapeHtml(p.name)}</h3>

        <div class="card__meta">
          <span>${escapeHtml(p.brand.toUpperCase())}</span>
          <span class="price">${formatMoney(p.price, p.currency)}</span>
        </div>

        <p class="desc">${escapeHtml(p.description || "وصف غير متوفر حالياً.")}</p>

        <button class="btn btn--primary" data-add="${escapeHtml(p.id)}" ${btnDisabled} type="button">
          ${btnText}
        </button>
      </div>
    </article>
  `;
}

/* ------------------ Cart ------------------ */
function addToCart(p){
  if(!cart[p.id]){
    cart[p.id] = {
      id: p.id,
      name: p.name,
      brand: p.brand,
      price: p.price,
      currency: p.currency,
      qty: 1
    };
  }else{
    cart[p.id].qty += 1;
  }
  persistCart();
  renderCart();
}

function decQty(id){
  if(!cart[id]) return;
  cart[id].qty -= 1;
  if(cart[id].qty <= 0) delete cart[id];
  persistCart();
  renderCart();
}
function incQty(id){
  if(!cart[id]) return;
  cart[id].qty += 1;
  persistCart();
  renderCart();
}
function removeItem(id){
  if(!cart[id]) return;
  delete cart[id];
  persistCart();
  renderCart();
}

function cartItemsArray(){
  return Object.values(cart);
}
function cartCount(){
  return cartItemsArray().reduce((a, x) => a + x.qty, 0);
}
function cartTotal(){
  return cartItemsArray().reduce((a, x) => a + (x.price * x.qty), 0);
}
function cartCurrency(){
  // نفترض نفس العملة (ر.س). إذا اختلفت العملات، نعرض العملة لأول عنصر.
  const first = cartItemsArray()[0];
  return first?.currency || "ر.س";
}

function renderCart(){
  const items = cartItemsArray();
  cartCountBadge.textContent = String(cartCount());

  if(items.length === 0){
    cartItemsEl.innerHTML = `<div class="muted">السلة فارغة حالياً.</div>`;
    cartTotalEl.textContent = formatMoney(0, "ر.س");
    checkoutBtn.disabled = true;
    return;
  }

  checkoutBtn.disabled = false;

  cartItemsEl.innerHTML = items.map(it => `
    <div class="cartItem">
      <div>
        <div class="cartItem__name">${escapeHtml(it.name)}</div>
        <div class="cartItem__sub">${formatMoney(it.price, it.currency)} • ${escapeHtml(it.brand.toUpperCase())}</div>
      </div>

      <div class="cartItem__actions">
        <div class="qty">
          <button type="button" data-dec="${escapeHtml(it.id)}">-</button>
          <span>${it.qty}</span>
          <button type="button" data-inc="${escapeHtml(it.id)}">+</button>
        </div>
        <button class="removeBtn" type="button" data-remove="${escapeHtml(it.id)}">حذف</button>
      </div>
    </div>
  `).join("");

  const total = cartTotal();
  cartTotalEl.textContent = formatMoney(total, cartCurrency());

  // Bind cart buttons
  cartItemsEl.querySelectorAll("[data-dec]").forEach(b => b.addEventListener("click", () => decQty(b.getAttribute("data-dec"))));
  cartItemsEl.querySelectorAll("[data-inc]").forEach(b => b.addEventListener("click", () => incQty(b.getAttribute("data-inc"))));
  cartItemsEl.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", () => removeItem(b.getAttribute("data-remove"))));
}

/* ------------------ WhatsApp Checkout ------------------ */
checkoutBtn.addEventListener("click", () => {
  const wa = String(settings.whatsapp_number || "").trim();
  if(!wa){
    alert("رقم واتساب غير متوفر حالياً. تأكد من Sheet: Settings وإضافة whatsapp_number.");
    return;
  }
  const items = cartItemsArray();
  if(items.length === 0) return;

  const total = cartTotal();
  const currency = cartCurrency();

  const lines = [];
  lines.push("مرحباً، أريد إتمام طلب الهواتف التالية:");
  lines.push("");

  items.forEach((it, idx) => {
    const line = `${idx+1}) ${it.name} — ${formatMoney(it.price, it.currency)} × ${it.qty} = ${formatMoney(it.price*it.qty, it.currency)}`;
    lines.push(line);
  });

  lines.push("");
  lines.push(`الإجمالي: ${formatMoney(total, currency)}`);
  lines.push("شكراً");

  const msg = encodeURIComponent(lines.join("\n"));

  // Use wa.me (works on mobile/desktop)
  const url = `https://wa.me/${encodeURIComponent(wa)}?text=${msg}`;
  window.open(url, "_blank");
});

/* ------------------ Persistence ------------------ */
function persistCart(){
  localStorage.setItem("cart", JSON.stringify(cart));
}
function loadCart(){
  try{
    const raw = localStorage.getItem("cart");
    return raw ? JSON.parse(raw) : {};
  }catch{
    return {};
  }
}

/* ------------------ Init ------------------ */
(function init(){
  // Theme
  const savedTheme = localStorage.getItem("theme") || "dark";
  applyTheme(savedTheme);

  updateActiveBrandLabel();
  renderCart();
  fetchData();
})();
