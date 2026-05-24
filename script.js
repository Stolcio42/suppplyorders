// Глобальные переменные
let db, auth;
let currentUser = null;
let currentUserRole = 'сотрудник';
let suppliers = [];
let cart = {};
let activeSupplierId = null;
let cartUnsubscribe = null;

// DOM-элементы
const supplierListEl = document.getElementById('supplier-list');
const productListEl = document.getElementById('product-list');
const cartContentEl = document.getElementById('cart-content');
const cartTotalEl = document.getElementById('cart-total');
const messagesOutputEl = document.getElementById('messages-output');
const generateBtn = document.getElementById('generate-messages');
const submitOrderBtn = document.getElementById('submit-order-btn');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const cartToggleBtn = document.getElementById('cart-toggle-btn');
const cartToggleCount = document.getElementById('cart-toggle-count');
const cartPanel = document.getElementById('cart-panel');
const cartCloseBtn = document.getElementById('cart-close-btn');
const loadingIndicator = document.getElementById('loading-indicator');
const notification = document.getElementById('notification');
const themeToggle = document.getElementById('theme-toggle');
const logoutBtn = document.getElementById('logout-btn');
const clearCartBtn = document.getElementById('clear-cart-btn');

// Оверлей полноэкранного режима корзины
let overlayDiv = document.createElement('div');
overlayDiv.className = 'overlay';
overlayDiv.style.display = 'none';
document.body.appendChild(overlayDiv);
overlayDiv.addEventListener('click', closeFullscreen);

// --- Утилиты ---
function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text, query) {
    if (!query) return text;
    const escapedQuery = escapeRegex(query);
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function showNotification(message) {
    if (!notification) return;
    notification.textContent = message;
    notification.style.display = 'block';
    notification.style.animation = 'none';
    notification.offsetHeight; // reflow
    notification.style.animation = 'fadeInOut 3s ease forwards';
    setTimeout(() => { notification.style.display = 'none'; }, 3000);
}

function copyToClipboard(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Скопировано!';
        setTimeout(() => { btn.textContent = originalText; }, 2000);
    }).catch(err => {
        alert('Не удалось скопировать: ' + err);
    });
}

// --- Тёмная тема ---
function initTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && prefersDark.matches)) {
        document.documentElement.classList.add('dark-theme');
        themeToggle.textContent = '☀️';
    } else {
        themeToggle.textContent = '🌙';
    }
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark-theme');
        themeToggle.textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
}

// --- Service Worker ---
function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(reg => {
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        document.getElementById('update-notification').style.display = 'block';
                    }
                });
            });
        });
    }
}

// --- Загрузка каталога ---
async function loadData() {
    console.log('loadData начата');
    loadingIndicator.style.display = 'flex';
    try {
        const resp = await fetch('data.json');
        if (!resp.ok) throw new Error('Ошибка загрузки');
        suppliers = await resp.json();
        console.log('Каталог загружен');
        renderSupplierList();
    } catch (e) {
        console.error('Ошибка каталога:', e);
        alert('Ошибка загрузки каталога: ' + e.message);
    } finally {
        loadingIndicator.style.display = 'none';
        console.log('Индикатор загрузки скрыт');
    }
}

// --- Подписка на корзину в Firestore (compat) ---
function subscribeCart() {
    if (cartUnsubscribe) cartUnsubscribe();
    if (!db || !currentUser) return;
    const cartDocRef = db.collection('carts').doc(currentUser.uid);
    cartUnsubscribe = cartDocRef.onSnapshot((docSnap) => {
        if (docSnap.exists) {
            cart = docSnap.data().items || {};
        } else {
            cart = {};
        }
        renderCart();
        updateCartToggleCount();
    });
}

async function saveCart() {
    if (!db || !currentUser) return;
    const cartDocRef = db.collection('carts').doc(currentUser.uid);
    await cartDocRef.set({ items: cart }, { merge: true });
}

// --- Отрисовка поставщиков ---
function renderSupplierList() {
    supplierListEl.innerHTML = '';
    suppliers.forEach(supplier => {
        const li = document.createElement('li');
        li.textContent = supplier.name;
        li.dataset.id = supplier.id;
        li.addEventListener('click', () => {
            if (activeSupplierId === supplier.id) {
                deselectSupplier();
            } else {
                selectSupplier(supplier.id);
            }
        });
        if (supplier.id === activeSupplierId) li.classList.add('active');
        supplierListEl.appendChild(li);
    });
}

function selectSupplier(id) {
    activeSupplierId = id;
    document.querySelectorAll('#supplier-list li').forEach(li => {
        li.classList.toggle('active', li.dataset.id == id);
    });
    searchInput.placeholder = '🔍 Поиск по товарам поставщика...';
    filterAndRenderProducts();
    searchInput.focus();
}

function deselectSupplier() {
    activeSupplierId = null;
    document.querySelectorAll('#supplier-list li').forEach(li => li.classList.remove('active'));
    searchInput.placeholder = '🔍 Поиск по всем товарам...';
    filterAndRenderProducts();
    searchInput.focus();
}

// --- Поиск и отрисовка товаров (без изменений) ---
function filterAndRenderProducts() {
    const query = searchInput.value.trim().toLowerCase();
    if (!activeSupplierId && !query) {
        showWelcomeMessage();
        return;
    }
    productListEl.classList.remove('welcome-message');

    if (!activeSupplierId) {
        const allResults = [];
        suppliers.forEach(supplier => {
            if (!supplier.products) return;
            const matching = supplier.products.filter(prod => {
                const nameMatch = prod.name.toLowerCase().includes(query);
                const articleMatch = prod.article && prod.article.toLowerCase().includes(query);
                return nameMatch || articleMatch;
            });
            if (matching.length > 0) {
                allResults.push({
                    supplierId: supplier.id,
                    supplierName: supplier.name,
                    products: matching
                });
            }
        });
        if (allResults.length === 0) {
            productListEl.innerHTML = '<p>Ничего не найдено</p>';
            return;
        }
        let html = '';
        allResults.forEach(group => {
            html += `<div class="search-supplier-header">${escapeHtml(group.supplierName)}</div>`;
            group.products.forEach(prod => html += buildProductCard(group.supplierId, prod, query));
        });
        productListEl.innerHTML = html;
        return;
    }

    const supplier = suppliers.find(s => s.id == activeSupplierId);
    if (!supplier) { productListEl.innerHTML = '<p>Поставщик не найден</p>'; return; }
    if (!supplier.products || supplier.products.length === 0) {
        productListEl.innerHTML = '<p>Нет товаров</p>';
        return;
    }
    let filtered = supplier.products;
    if (query) {
        filtered = supplier.products.filter(prod => {
            const nameMatch = prod.name.toLowerCase().includes(query);
            const articleMatch = prod.article && prod.article.toLowerCase().includes(query);
            return nameMatch || articleMatch;
        });
    }
    if (filtered.length === 0) {
        productListEl.innerHTML = '<p>Ничего не найдено</p>';
        return;
    }
    let html = '';
    filtered.forEach(prod => html += buildProductCard(supplier.id, prod, query));
    productListEl.innerHTML = html;
}

function buildProductCard(supplierId, prod, searchQuery = '') {
    const imgSrc = prod.image ? escapeHtml(prod.image) : null;
    const highlightedName = highlightText(escapeHtml(prod.name), searchQuery);
    const highlightedArticle = prod.article ? highlightText(escapeHtml(prod.article), searchQuery) : '';
    return `
        <div class="product-card">
            <div class="product-image">
                ${imgSrc
                    ? `<img src="${imgSrc}" alt="${escapeHtml(prod.name)}" loading="lazy">`
                    : `<div class="no-image">📷</div>`
                }
            </div>
            <div class="info">
                <div class="name">${highlightedName}</div>
                ${highlightedArticle ? `<div class="article">Арт. ${highlightedArticle}</div>` : ''}
                ${prod.unit ? `<div class="unit">${escapeHtml(prod.unit)}</div>` : ''}
                ${prod.price ? `<div class="price">${prod.price.toFixed(2)} руб.</div>` : ''}
            </div>
            <button onclick="addToCart(${supplierId}, ${prod.id})">В корзину</button>
        </div>
    `;
}

function showWelcomeMessage() {
    productListEl.innerHTML = `
        <div class="welcome-content">
            <h2>👋 Добро пожаловать в систему заявок</h2>
            <ol>
                <li><strong>Выберите поставщика</strong> в левой панели</li>
                <li><strong>Добавьте товары</strong> в корзину, нажимая кнопку «В корзину»</li>
                <li>В корзине <strong>измените количество</strong> или удалите позиции</li>
                <li>Когда всё готово — нажмите <strong>«Отправить заказ»</strong></li>
                <li>После отправки заказ попадёт в историю и статистику</li>
            </ol>
            <p class="welcome-hint">Корзина сохраняется автоматически. История доступна по кнопке в шапке.</p>
        </div>
    `;
    productListEl.classList.add('welcome-message');
}

// --- Корзина (без изменений, кроме вызовов saveCart) ---
function addToCart(supplierId, productId) {
    const supplier = suppliers.find(s => s.id == supplierId);
    if (!supplier) return;
    const product = supplier.products.find(p => p.id == productId);
    if (!product) return;
    if (!cart[supplierId]) cart[supplierId] = [];
    const existing = cart[supplierId].find(i => i.id === productId);
    if (existing) {
        if (existing.qty < 20) {
            existing.qty += 1;
        } else {
            alert('Достигнут лимит (20 шт.) для этого товара');
            return;
        }
    } else {
        cart[supplierId].push({ ...product, supplierName: supplier.name, qty: 1 });
    }
    saveCart();
}

function changeQty(supplierId, productId, delta) {
    if (!cart[supplierId]) return;
    const item = cart[supplierId].find(i => i.id == productId);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
        cart[supplierId] = cart[supplierId].filter(i => i.id !== productId);
        if (cart[supplierId].length === 0) delete cart[supplierId];
    } else if (item.qty > 20) {
        item.qty = 20;
        alert('Максимальное количество — 20');
    }
    saveCart();
}

function removeFromCart(supplierId, productId) {
    if (cart[supplierId]) {
        cart[supplierId] = cart[supplierId].filter(i => i.id != productId);
        if (cart[supplierId].length === 0) delete cart[supplierId];
        saveCart();
    }
}

function clearCart() {
    if (Object.keys(cart).length === 0) return;
    if (!confirm('Очистить корзину?')) return;
    cart = {};
    saveCart();
}

function calculateTotal() {
    let total = 0;
    for (const items of Object.values(cart)) {
        for (const item of items) {
            if (item.price && typeof item.price === 'number') total += item.price * item.qty;
        }
    }
    return total;
}

function updateCartToggleCount() {
    let totalItems = 0;
    for (const items of Object.values(cart)) {
        totalItems += items.reduce((sum, item) => sum + item.qty, 0);
    }
    cartToggleCount.textContent = totalItems;
}

function renderCart() {
    cartContentEl.innerHTML = '';
    if (Object.keys(cart).length === 0) {
        cartContentEl.innerHTML = '<p>Корзина пуста</p>';
        cartTotalEl.textContent = '';
        return;
    }
    for (const [supplierId, items] of Object.entries(cart)) {
        const supplierName = items[0]?.supplierName || 'Неизвестный поставщик';
        const groupDiv = document.createElement('div');
        groupDiv.className = 'supplier-cart-group';
        groupDiv.innerHTML = `<h3>${supplierName}</h3>`;
        const itemsList = document.createElement('div');
        items.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'cart-item';
            itemDiv.innerHTML = `
                <div class="cart-item-row">
                    <div class="item-info">
                        <span class="item-name">${escapeHtml(item.name)}</span>
                        ${item.article ? `<span class="item-article">Арт. ${escapeHtml(item.article)}</span>` : ''}
                    </div>
                    <div class="qty-controls">
                        <button class="qty-minus" data-supplier="${supplierId}" data-product="${item.id}">−</button>
                        <span>${item.qty}</span>
                        <button class="qty-plus" data-supplier="${supplierId}" data-product="${item.id}">+</button>
                    </div>
                </div>
                <div class="cart-item-remove">
                    <button class="remove-btn" data-supplier="${supplierId}" data-product="${item.id}">Удалить</button>
                </div>
            `;
            itemsList.appendChild(itemDiv);
        });
        groupDiv.appendChild(itemsList);
        cartContentEl.appendChild(groupDiv);
    }
    document.querySelectorAll('.qty-minus').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sid = e.target.dataset.supplier;
            const pid = parseInt(e.target.dataset.product);
            changeQty(sid, pid, -1);
        });
    });
    document.querySelectorAll('.qty-plus').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sid = e.target.dataset.supplier;
            const pid = parseInt(e.target.dataset.product);
            changeQty(sid, pid, 1);
        });
    });
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sid = e.target.dataset.supplier;
            const pid = parseInt(e.target.dataset.product);
            removeFromCart(sid, pid);
        });
    });
    const total = calculateTotal();
    if (total > 0) {
        cartTotalEl.textContent = `Итого: ${total.toFixed(2)} руб.`;
    } else {
        cartTotalEl.textContent = '';
    }
    updateCartToggleCount();
}

// --- Полноэкранный режим корзины ---
function openFullscreen() {
    cartPanel.classList.add('fullscreen');
    overlayDiv.style.display = 'block';
}

function closeFullscreen() {
    cartPanel.classList.remove('fullscreen');
    overlayDiv.style.display = 'none';
}

// --- Отправка заказа (compat) ---
async function submitOrder() {
    if (Object.keys(cart).length === 0) {
        alert('Корзина пуста');
        return;
    }
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const userName = userDoc.exists ? userDoc.data().name : 'Неизвестный';
    const orderData = {
        userId: currentUser.uid,
        userName: userName,
        date: new Date().toISOString(),
        cart: cart,
        total: calculateTotal()
    };
    await db.collection('orders').add(orderData);
    generateMessagesFromCart(cart, userName);
    cart = {};
    await db.collection('carts').doc(currentUser.uid).set({ items: {} });
    showNotification('✅ Заказ отправлен');
    openFullscreen();
}

// --- Генерация сообщений ---
function generateMessages() {
    if (Object.keys(cart).length === 0) {
        messagesOutputEl.innerHTML = '<p>Корзина пуста</p>';
        return;
    }
    generateMessagesFromCart(cart, 'Черновик');
    openFullscreen();
}

function generateMessagesFromCart(cartObj, userName) {
    let outputHtml = '';
    for (const [supplierId, items] of Object.entries(cartObj)) {
        const supplierName = items[0]?.supplierName || 'Поставщик';
        let messageText = `Поставщик: ${supplierName}\nЗаказ:\n`;
        items.forEach((item, idx) => {
            messageText += `${idx+1}. ${item.name} x ${item.qty}`;
            if (item.article) messageText += ` (арт. ${item.article})`;
            if (item.price) messageText += ` - ${item.price.toFixed(2)} руб./шт.`;
            messageText += '\n';
        });
        messageText += `\nС уважением, ${userName}`;
        outputHtml += `
            <div class="supplier-message">
                <button class="copy-btn" onclick="copyToClipboard(this, \`${escapeHtml(messageText)}\`)">Копировать</button>
                <pre>${escapeHtml(messageText)}</pre>
            </div>
        `;
    }
    messagesOutputEl.innerHTML = outputHtml;
}

// --- Главная инициализация после готовности Firebase ---
async function startApp() {
    console.log('startApp вызвана');
    db = window.db;
    auth = window.auth;

    const authOverlay = document.getElementById('auth-overlay');
    const appDiv = document.getElementById('app');
    const loginBtn = document.getElementById('auth-login-btn');
    const registerBtn = document.getElementById('auth-register-btn');
    const showRegister = document.getElementById('show-register');
    const showLogin = document.getElementById('show-login');
    const loginEmail = document.getElementById('auth-email');
    const loginPass = document.getElementById('auth-password');
    const regName = document.getElementById('reg-name');
    const regEmail = document.getElementById('reg-email');
    const regPass = document.getElementById('reg-password');
    const authError = document.getElementById('auth-error');
    const regError = document.getElementById('reg-error');
    const registerBox = document.getElementById('register-box');
    const loginBox = authOverlay.querySelector('.auth-box:first-child');

    showRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginBox.style.display = 'none';
        registerBox.style.display = '';
    });
    showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerBox.style.display = 'none';
        loginBox.style.display = '';
    });

    loginBtn.addEventListener('click', async () => {
        try {
            await auth.signInWithEmailAndPassword(loginEmail.value.trim(), loginPass.value);
        } catch (err) {
            authError.textContent = 'Ошибка входа: ' + err.message;
        }
    });

    registerBtn.addEventListener('click', async () => {
        const name = regName.value.trim();
        const email = regEmail.value.trim();
        const pass = regPass.value;
        if (!name) { regError.textContent = 'Введите имя'; return; }
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, pass);
            await db.collection('users').doc(cred.user.uid).set({
                name: name,
                role: 'сотрудник'
            });
        } catch (err) {
            regError.textContent = 'Ошибка регистрации: ' + err.message;
        }
    });

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                currentUserRole = userDoc.data().role || 'сотрудник';
                window.currentUserRole = currentUserRole;
            }
            authOverlay.style.display = 'none';
            appDiv.style.display = 'block';
            await initApp();
        } else {
            currentUser = null;
            authOverlay.style.display = 'flex';
            appDiv.style.display = 'none';
            if (cartUnsubscribe) cartUnsubscribe();
        }
    });

    logoutBtn.addEventListener('click', () => {
        auth.signOut();
    });

    // Обработчики поиска
    searchInput.addEventListener('input', () => {
        searchClear.style.display = searchInput.value ? 'block' : 'none';
        filterAndRenderProducts();
    });
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.style.display = 'none';
        filterAndRenderProducts();
        searchInput.focus();
    });

    // Кнопки корзины
    generateBtn.addEventListener('click', generateMessages);
    submitOrderBtn.addEventListener('click', submitOrder);
    clearCartBtn.addEventListener('click', clearCart);
    cartToggleBtn.addEventListener('click', () => {
        if (cartPanel.classList.contains('fullscreen')) {
            closeFullscreen();
        } else {
            openFullscreen();
        }
    });
    cartCloseBtn.addEventListener('click', closeFullscreen);

    // Загружаем каталог сразу
    await loadData();
    console.log('startApp завершена');
}

async function initApp() {
    subscribeCart();
    initTheme();
    registerSW();
}

// --- Запуск ---
function onFirebaseReady() {
    console.log('onFirebaseReady вызвана');
    startApp().catch(err => {
        console.error('Ошибка в startApp:', err);
        loadingIndicator.style.display = 'none';
        alert('Произошла ошибка инициализации приложения');
    });
}

if (window.db && window.auth) {
    console.log('Firebase уже готов, запускаем onFirebaseReady');
    onFirebaseReady();
} else {
    console.log('Ожидаем событие firebase-ready');
    window.addEventListener('firebase-ready', () => {
        console.log('Получено событие firebase-ready');
        onFirebaseReady();
    });
}