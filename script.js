let suppliers = [];
let cart = {};
let activeSupplierId = null;

const supplierListEl = document.getElementById('supplier-list');
const productListEl = document.getElementById('product-list');
const cartContentEl = document.getElementById('cart-content');
const cartTotalEl = document.getElementById('cart-total');
const messagesOutputEl = document.getElementById('messages-output');
const generateBtn = document.getElementById('generate-messages');

const cartToggleBtn = document.getElementById('cart-toggle-btn');
const cartToggleCount = document.getElementById('cart-toggle-count');
const cartPanel = document.getElementById('cart-panel');
const cartCloseBtn = document.getElementById('cart-close-btn');

// Оверлей
let overlayDiv = document.createElement('div');
overlayDiv.className = 'overlay';
overlayDiv.style.display = 'none';
document.body.appendChild(overlayDiv);
overlayDiv.addEventListener('click', closeFullscreen);

// --- Загрузка данных и восстановление корзины ---
async function loadData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error('Не удалось загрузить data.json');
        suppliers = await response.json();
        renderSupplierList();
        restoreCartFromStorage();
    } catch (err) {
        alert('Ошибка загрузки данных: ' + err.message);
        console.error(err);
    }
}

function restoreCartFromStorage() {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
            // Проверка: могли измениться товары/поставщики, но пока оставляем как есть
            renderCart();
        } catch (e) {
            cart = {};
        }
    }
}

function saveCartToStorage() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function addToHistory() {
    if (Object.keys(cart).length === 0) return;
    const history = JSON.parse(localStorage.getItem('orderHistory') || '[]');
    // Глубокая копия текущей корзины с датой и уникальным id
    const orderCopy = {};
    for (const [supplierId, items] of Object.entries(cart)) {
        orderCopy[supplierId] = items.map(item => ({ ...item }));
    }
    history.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6), // уникальный id
        date: new Date().toISOString(),
        cart: orderCopy
    });
    localStorage.setItem('orderHistory', JSON.stringify(history));
}

// --- Отрисовка поставщиков ---
function renderSupplierList() {
    supplierListEl.innerHTML = '';
    suppliers.forEach(supplier => {
        const li = document.createElement('li');
        li.textContent = supplier.name;
        li.dataset.id = supplier.id;
        li.addEventListener('click', () => selectSupplier(supplier.id));
        if (supplier.id === activeSupplierId) li.classList.add('active');
        supplierListEl.appendChild(li);
    });
}

function selectSupplier(id) {
    activeSupplierId = id;
    document.querySelectorAll('#supplier-list li').forEach(li => {
        li.classList.toggle('active', li.dataset.id == id);
    });
    renderProducts(id);
}

function renderProducts(supplierId) {
    const supplier = suppliers.find(s => s.id == supplierId);
    if (!supplier) {
        productListEl.innerHTML = '<p>Поставщик не найден</p>';
        return;
    }
    if (!supplier.products || supplier.products.length === 0) {
        productListEl.innerHTML = '<p>Нет товаров</p>';
        return;
    }
    
    productListEl.classList.remove('welcome-message');

    let html = '';
    supplier.products.forEach(prod => {
        const imgSrc = prod.image ? escapeHtml(prod.image) : null;
        html += `
            <div class="product-card">
                <div class="product-image">
                    ${imgSrc 
                        ? `<img src="${imgSrc}" alt="${escapeHtml(prod.name)}" loading="lazy" onerror="this.style.display='none'">`
                        : `<div class="no-image">📷</div>`
                    }
                </div>
                <div class="info">
                    <div class="name">${escapeHtml(prod.name)}</div>
                    ${prod.article ? `<div class="article">Арт. ${escapeHtml(prod.article)}</div>` : ''}
                    ${prod.unit ? `<div class="unit">${escapeHtml(prod.unit)}</div>` : ''}
                    ${prod.price ? `<div class="price">${prod.price.toFixed(2)} руб.</div>` : ''}
                </div>
                <button onclick="addToCart(${supplierId}, ${prod.id})">В корзину</button>
            </div>
        `;
    });
    productListEl.innerHTML = html;
}

// --- Корзина ---
function addToCart(supplierId, productId) {
    const supplier = suppliers.find(s => s.id == supplierId);
    if (!supplier) return;
    const product = supplier.products.find(p => p.id == productId);
    if (!product) return;

    if (!cart[supplierId]) {
        cart[supplierId] = [];
    }

    const existingItem = cart[supplierId].find(item => item.id === productId);
    if (existingItem) {
        if (existingItem.qty < 20) {
            existingItem.qty += 1;
        } else {
            alert('Достигнут лимит (20 шт.) для этого товара');
            return;
        }
    } else {
        cart[supplierId].push({
            ...product,
            supplierName: supplier.name,
            qty: 1
        });
    }
    renderCart();
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
    renderCart();
}

function removeFromCart(supplierId, productId) {
    if (cart[supplierId]) {
        cart[supplierId] = cart[supplierId].filter(item => item.id != productId);
        if (cart[supplierId].length === 0) delete cart[supplierId];
        renderCart();
    }
}

function calculateTotal() {
    let total = 0;
    for (const items of Object.values(cart)) {
        for (const item of items) {
            if (item.price && typeof item.price === 'number') {
                total += item.price * item.qty;
            }
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

// --- Полноэкранный режим ---
function openFullscreen() {
    cartPanel.classList.add('fullscreen');
    overlayDiv.style.display = 'block';
}

function closeFullscreen() {
    cartPanel.classList.remove('fullscreen');
    overlayDiv.style.display = 'none';
}

// --- Отрисовка корзины ---
function renderCart() {
    cartContentEl.innerHTML = '';
    if (Object.keys(cart).length === 0) {
        cartContentEl.innerHTML = '<p>Корзина пуста</p>';
        cartTotalEl.textContent = '';
        updateCartToggleCount();
        saveCartToStorage();
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

    // Обработчики +/-
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

    // Обработчики удаления
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
    saveCartToStorage(); // <-- сохраняем корзину после каждого изменения
}

// --- Генерация сообщений ---
function generateMessages() {
    if (Object.keys(cart).length === 0) {
        messagesOutputEl.innerHTML = '<p>Корзина пуста. Добавьте товары.</p>';
        return;
    }

    // Сохраняем текущую корзину в историю
    addToHistory();

    let outputHtml = '';
    for (const [supplierId, items] of Object.entries(cart)) {
        const supplierName = items[0]?.supplierName || 'Поставщик';
        let messageText = `Поставщик: ${supplierName}\nЗаказ:\n`;
        items.forEach((item, idx) => {
            messageText += `${idx+1}. ${item.name} x ${item.qty}`;
            if (item.article) messageText += ` (арт. ${item.article})`;
            if (item.unit) messageText += `, ${item.unit}`;
            if (item.price) messageText += ` - ${item.price.toFixed(2)} руб./шт.`;
            messageText += `\n`;
        });
        messageText += `\nС уважением, [Ваше имя / компания]`;
        outputHtml += `
            <div class="supplier-message">
                <button class="copy-btn" onclick="copyToClipboard(this, \`${escapeHtml(messageText)}\`)">Копировать</button>
                <pre>${escapeHtml(messageText)}</pre>
            </div>
        `;
    }
    messagesOutputEl.innerHTML = outputHtml;
    openFullscreen(); // раскрываем панель для удобного просмотра
}

function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

// --- Инициализация ---
window.addEventListener('DOMContentLoaded', () => {
    loadData();

    generateBtn.addEventListener('click', generateMessages);

    cartToggleBtn.addEventListener('click', () => {
        if (cartPanel.classList.contains('fullscreen')) {
            closeFullscreen();
        } else {
            openFullscreen();
        }
    });

    cartCloseBtn.addEventListener('click', closeFullscreen);
});