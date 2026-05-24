// Глобальные переменные (будут установлены после инициализации Firebase)
let db, auth;
let currentUser = null;
let currentUserRole = 'сотрудник'; // по умолчанию
let suppliers = [];
let cart = {};           // локальное представление корзины (синхронизируется с Firestore)
let activeSupplierId = null;
let cartUnsubscribe = null; // отписка от изменений корзины

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

// Оверлей для полноэкранного режима
let overlayDiv = document.createElement('div');
overlayDiv.className = 'overlay';
overlayDiv.style.display = 'none';
document.body.appendChild(overlayDiv);
overlayDiv.addEventListener('click', closeFullscreen);

// --- Авторизация Firebase ---
window.addEventListener('DOMContentLoaded', () => {
    // Инициализация Firebase уже выполнена в index.html
    db = window.db;
    auth = window.auth;

    // UI авторизации
    const authOverlay = document.getElementById('auth-overlay');
    const loginBtn = document.getElementById('auth-login-btn');
    const registerBtn = document.getElementById('auth-register-btn');
    const showRegister = document.getElementById('show-register');
    const showLogin = document.getElementById('show-login');
    const authError = document.getElementById('auth-error');
    const regError = document.getElementById('reg-error');
    const loginEmail = document.getElementById('auth-email');
    const loginPass = document.getElementById('auth-password');
    const regName = document.getElementById('reg-name');
    const regEmail = document.getElementById('reg-email');
    const regPass = document.getElementById('reg-password');
    const registerBox = document.getElementById('register-box');
    const loginBox = authOverlay.querySelector('.auth-box:first-child');
    const appDiv = document.getElementById('app');

    // Переключение форм
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

    // Вход
    loginBtn.addEventListener('click', () => {
        const email = loginEmail.value.trim();
        const pass = loginPass.value;
        signInWithEmailAndPassword(auth, email, pass)
            .catch(err => authError.textContent = 'Ошибка входа: ' + err.message);
    });

    // Регистрация
    registerBtn.addEventListener('click', async () => {
        const name = regName.value.trim();
        const email = regEmail.value.trim();
        const pass = regPass.value;
        if (!name) { regError.textContent = 'Введите имя'; return; }
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            // Создаём профиль в Firestore
            await setDoc(doc(db, 'users', cred.user.uid), {
                name: name,
                role: 'сотрудник' // по умолчанию
            });
            // После регистрации сразу входим
        } catch (err) {
            regError.textContent = 'Ошибка регистрации: ' + err.message;
        }
    });

    // Отслеживание состояния авторизации
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            // Получаем роль и имя
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                currentUserRole = userDoc.data().role || 'сотрудник';
                window.currentUserRole = currentUserRole;
            }
            authOverlay.style.display = 'none';
            appDiv.style.display = 'block';
            initApp();
        } else {
            currentUser = null;
            authOverlay.style.display = 'flex';
            appDiv.style.display = 'none';
            if (cartUnsubscribe) cartUnsubscribe();
        }
    });

    // Выход
    document.getElementById('logout-btn').addEventListener('click', () => {
        signOut(auth);
    });
});

// Основная инициализация после авторизации
async function initApp() {
    await loadData();
    subscribeCart();
    // Переключатель темы
    initTheme();
    // Service Worker update notification
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
    loadingIndicator.style.display = 'flex';
    try {
        const resp = await fetch('data.json');
        suppliers = await resp.json();
        renderSupplierList();
    } catch(e) {
        alert('Ошибка загрузки каталога');
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

// --- Подписка на корзину в Firestore ---
function subscribeCart() {
    if (cartUnsubscribe) cartUnsubscribe();
    const cartDoc = doc(db, 'carts', currentUser.uid);
    cartUnsubscribe = onSnapshot(cartDoc, (docSnap) => {
        if (docSnap.exists()) {
            cart = docSnap.data().items || {};
        } else {
            cart = {};
        }
        renderCart();
        updateCartToggleCount();
    });
}

// Сохранение корзины (вызывается при каждом изменении)
async function saveCart() {
    if (!currentUser) return;
    const cartDoc = doc(db, 'carts', currentUser.uid);
    await setDoc(cartDoc, { items: cart }, { merge: true });
}

// --- Старые функции отрисовки (почти без изменений) ---
function renderSupplierList() { /* без изменений */ }
function selectSupplier(id) { /* без изменений */ }
function deselectSupplier() { /* без изменений */ }
function filterAndRenderProducts() { /* без изменений */ }
function buildProductCard(supplierId, prod, query) { /* без изменений */ }
function highlightText(text, query) { /* без изменений */ }
function escapeHtml(text) { /* без изменений */ }
function showWelcomeMessage() { /* без изменений */ }

// --- Корзина (изменения: вызов saveCart) ---
function addToCart(supplierId, productId) {
    // ... та же логика, но после изменения cart вызываем saveCart()
    const supplier = suppliers.find(s => s.id == supplierId);
    if (!supplier) return;
    const product = supplier.products.find(p => p.id == productId);
    if (!product) return;
    if (!cart[supplierId]) cart[supplierId] = [];
    const existing = cart[supplierId].find(i => i.id === productId);
    if (existing) {
        if (existing.qty < 20) existing.qty += 1;
        else { alert('Лимит 20'); return; }
    } else {
        cart[supplierId].push({...product, supplierName: supplier.name, qty: 1});
    }
    saveCart();
    // UI обновится через подписку
}

function changeQty(supplierId, productId, delta) { /* аналогично с saveCart */ }
function removeFromCart(supplierId, productId) { /* аналогично с saveCart */ }
function clearCart() { /* аналогично с saveCart */ }

// --- Отправка заказа ---
async function submitOrder() {
    if (Object.keys(cart).length === 0) {
        alert('Корзина пуста');
        return;
    }
    // Получаем имя пользователя
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    const userName = userDoc.exists() ? userDoc.data().name : 'Неизвестный';
    const orderData = {
        userId: currentUser.uid,
        userName: userName,
        date: new Date().toISOString(),
        cart: cart,
        total: calculateTotal()
    };
    await addDoc(collection(db, 'orders'), orderData);
    // Очищаем корзину
    cart = {};
    await setDoc(doc(db, 'carts', currentUser.uid), { items: {} });
    showNotification('✅ Заказ отправлен');
    // Генерируем сообщения
    generateMessagesFromCart(orderData.cart, userName);
    openFullscreen();
}

// Генерация сообщений (старая логика с подстановкой имени)
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

function calculateTotal() {
    let total = 0;
    for (const items of Object.values(cart)) {
        for (const item of items) {
            if (item.price) total += item.price * item.qty;
        }
    }
    return total;
}

// ... остальные функции (openFullscreen, closeFullscreen, updateCartToggleCount, showNotification, копирование)
// Добавьте их из предыдущего кода

// Обработчики кнопок
document.getElementById('generate-messages').addEventListener('click', generateMessages);
document.getElementById('submit-order-btn').addEventListener('click', submitOrder);