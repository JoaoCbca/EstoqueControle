// Estado global da aplicação (Sincronizado com o Servidor)
let state = {
    currentUser: JSON.parse(sessionStorage.getItem('estoque_current_user')) || null,
    products: [],
    movements: []
};

// Elementos do DOM
const userModal = document.getElementById('user-modal');
const userNameInput = document.getElementById('user-name-input');
const saveUserBtn = document.getElementById('save-user-btn');
const currentUserSpan = document.getElementById('current-user');
const changeUserBtn = document.getElementById('change-user-btn');

const productModal = document.getElementById('product-modal');
const productForm = document.getElementById('product-form');
const modalTitle = document.getElementById('modal-title');
const productIdInput = document.getElementById('product-id');
const cancelProductBtn = document.getElementById('cancel-product-btn');
const newProductBtn = document.getElementById('new-product-btn');

const movementModal = document.getElementById('movement-modal');
const movementForm = document.getElementById('movement-form');
const movementTitle = document.getElementById('movement-title');
const movementProductId = document.getElementById('movement-product-id');
const movementType = document.getElementById('movement-type');
const movementQuantity = document.getElementById('movement-quantity');
const movementReason = document.getElementById('movement-reason');
const cancelMovementBtn = document.getElementById('cancel-movement-btn');

const searchInput = document.getElementById('search-input');
const categoryFilter = document.getElementById('category-filter');
const productsTableBody = document.getElementById('products-table-body');
const movementsTableBody = document.getElementById('movements-table-body');

const totalItemsEl = document.getElementById('total-items');
const totalValueEl = document.getElementById('total-value');
const lowStockCountEl = document.getElementById('low-stock-count');
const todayMovementsEl = document.getElementById('today-movements');

const exportDataBtn = document.getElementById('export-data');
const importDataBtn = document.getElementById('import-data');
const importFileInput = document.getElementById('import-file');

// Inicialização e Sincronização em Tempo Real (Polling a cada 4 segundos)
document.addEventListener('DOMContentLoaded', () => {
    checkUser();
    loadDataFromServer();
    setupEventListeners();

    // Atualiza os dados automaticamente para refletir alterações de outros usuários
    setInterval(loadDataFromServer, 4000);
});

// Buscar dados atualizados do servidor
async function loadDataFromServer() {
    try {
        const response = await fetch('/api/data');
        if (!response.ok) return;
        const data = await response.json();
        
        state.products = data.products || [];
        state.movements = data.movements || [];
        
        renderAll();
    } catch (error) {
        console.error("Erro ao carregar dados do servidor:", error);
    }
}

// Salvar/Sincronizar dados no servidor
async function saveState() {
    try {
        const response = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                products: state.products,
                movements: state.movements
            })
        });
        if (!response.ok) {
            console.error("Erro ao sincronizar com o servidor.");
        }
    } catch (error) {
        console.error("Erro de conexão ao salvar:", error);
    }
}

// Verificação de Usuário
function checkUser() {
    if (!state.currentUser || state.currentUser.trim() === '') {
        userModal.classList.remove('hidden');
        userModal.classList.add('flex');
    } else {
        currentUserSpan.textContent = state.currentUser;
        userModal.classList.add('hidden');
        userModal.classList.remove('flex');
    }
}

function setupEventListeners() {
    saveUserBtn.addEventListener('click', () => {
        const name = userNameInput.value.trim();
        if (!name) {
            alert('Por favor, informe seu nome ou apelido.');
            return;
        }
        state.currentUser = name;
        sessionStorage.setItem('estoque_current_user', JSON.stringify(name));
        checkUser();
    });

    userNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveUserBtn.click();
    });

    changeUserBtn.addEventListener('click', () => {
        userNameInput.value = state.currentUser || '';
        userModal.classList.remove('hidden');
        userModal.classList.add('flex');
    });

    newProductBtn.addEventListener('click', () => {
        modalTitle.textContent = 'Novo Produto';
        productIdInput.value = '';
        productForm.reset();
        productModal.classList.remove('hidden');
        productModal.classList.add('flex');
    });

    cancelProductBtn.addEventListener('click', () => {
        productModal.classList.add('hidden');
        productModal.classList.remove('flex');
    });

    productForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = productIdInput.value;
        const name = document.getElementById('product-name').value.trim();
        const sku = document.getElementById('product-sku').value.trim();
        const category = document.getElementById('product-category').value.trim();
        const price = parseFloat(document.getElementById('product-price').value);
        const quantity = parseInt(document.getElementById('product-quantity').value);
        const minStock = parseInt(document.getElementById('product-min-stock').value);

        if (id) {
            const index = state.products.findIndex(p => p.id === id);
            if (index !== -1) {
                const oldQty = state.products[index].quantity;
                state.products[index] = {
                    ...state.products[index],
                    name, sku, category, price, quantity, minStock,
                    updatedAt: new Date().toISOString()
                };

                if (oldQty !== quantity) {
                    const diff = quantity - oldQty;
                    addMovementRecord(id, name, diff > 0 ? 'ENTRADA' : 'SAIDA', Math.abs(diff), `Ajuste manual de estoque (${state.currentUser})`);
                }
            }
        } else {
            const newProduct = {
                id: 'prod_' + Date.now(),
                name, sku, category, price, quantity, minStock,
                createdAt: new Date().toISOString()
            };
            state.products.push(newProduct);

            if (quantity > 0) {
                addMovementRecord(newProduct.id, name, 'ENTRADA', quantity, `Estoque inicial cadastrado por ${state.currentUser}`);
            }
        }

        saveState();
        productModal.classList.add('hidden');
        productModal.classList.remove('flex');
        renderAll();
    });

    cancelMovementBtn.addEventListener('click', () => {
        movementModal.classList.add('hidden');
        movementModal.classList.remove('flex');
    });

    movementForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const productId = movementProductId.value;
        const type = movementType.value;
        const qty = parseInt(movementQuantity.value);
        const reason = movementReason.value.trim();

        const product = state.products.find(p => p.id === productId);
        if (!product) return;

        if (type === 'SAIDA' && product.quantity < qty) {
            alert(`Quantidade insuficiente em estoque! Disponível: ${product.quantity}`);
            return;
        }

        if (type === 'ENTRADA') {
            product.quantity += qty;
        } else {
            product.quantity -= qty;
        }
        product.updatedAt = new Date().toISOString();

        addMovementRecord(product.id, product.name, type, qty, reason);

        saveState();
        movementModal.classList.add('hidden');
        movementModal.classList.remove('flex');
        renderAll();
    });

    searchInput.addEventListener('input', renderProductsTable);
    categoryFilter.addEventListener('change', renderProductsTable);

    exportDataBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `controle_estoque_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    });

    importDataBtn.addEventListener('click', () => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const imported = JSON.parse(event.target.result);
                if (imported.products && imported.movements) {
                    if (confirm('Deseja substituir os dados atuais pelos dados importados?')) {
                        state.products = imported.products;
                        state.movements = imported.movements;
                        saveState();
                        renderAll();
                        alert('Dados importados com sucesso!');
                    }
                } else {
                    alert('Arquivo inválido.');
                }
            } catch (err) {
                alert('Erro ao processar o arquivo JSON.');
            }
        };
        reader.readAsText(file);
    });
}

function addMovementRecord(productId, productName, type, quantity, reason) {
    const movement = {
        id: 'mov_' + Date.now() + Math.random().toString(36).substring(2, 7),
        productId,
        productName,
        type,
        quantity,
        reason,
        user: state.currentUser || 'Anônimo',
        date: new Date().toISOString()
    };
    state.movements.unshift(movement);
}

function renderAll() {
    renderDashboardCards();
    renderCategoryFilterOptions();
    renderProductsTable();
    renderMovementsTable();
}

function renderDashboardCards() {
    const totalItems = state.products.reduce((acc, p) => acc + p.quantity, 0);
    const totalValue = state.products.reduce((acc, p) => acc + (p.quantity * p.price), 0);
    const lowStockCount = state.products.filter(p => p.quantity <= p.minStock).length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayMovements = state.movements.filter(m => m.date && m.date.slice(0, 10) === todayStr).length;

    totalItemsEl.textContent = totalItems;
    totalValueEl.textContent = totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    lowStockCountEl.textContent = lowStockCount;
    todayMovementsEl.textContent = todayMovements;
}

function renderCategoryFilterOptions() {
    const categories = [...new Set(state.products.map(p => p.category))].filter(Boolean);
    const currentVal = categoryFilter.value;
    
    let html = '<option value="">Todas as Categorias</option>';
    categories.forEach(cat => {
        html += `<option value="${cat}">${cat}</option>`;
    });
    categoryFilter.innerHTML = html;
    categoryFilter.value = currentVal;
}

function renderProductsTable() {
    const search = searchInput.value.toLowerCase();
    const catFilter = categoryFilter.value;

    const filtered = state.products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search) || (p.sku && p.sku.toLowerCase().includes(search));
        const matchesCat = catFilter === '' || p.category === catFilter;
        return matchesSearch && matchesCat;
    });

    if (filtered.length === 0) {
        productsTableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">Nenhum produto encontrado.</td></tr>`;
        return;
    }

    productsTableBody.innerHTML = filtered.map(p => {
        const isLow = p.quantity <= p.minStock;
        const badgeClass = isLow 
            ? 'bg-red-100 text-red-800 border border-red-300' 
            : 'bg-green-100 text-green-800 border border-green-300';
        
        return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="font-medium text-gray-900">${escapeHtml(p.name)}</div>
                    <div class="text-xs text-gray-500">SKU: ${escapeHtml(p.sku || 'N/D')}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${escapeHtml(p.category || 'Geral')}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">${Number(p.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${badgeClass}">
                        ${p.quantity} un ${isLow ? '(Baixo)' : ''}
                    </span>
                    <div class="text-xs text-gray-400 mt-0.5">Mín: ${p.minStock}</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    ${(p.quantity * p.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button onclick="openMovementModal('${p.id}', 'ENTRADA')" class="text-green-600 hover:text-green-900 bg-green-50 hover:bg-green-100 px-2.5 py-1 rounded transition-colors" title="Adicionar Quantidade">
                        <i class="fa-solid fa-plus mr-1"></i>Entrada
                    </button>
                    <button onclick="openMovementModal('${p.id}', 'SAIDA')" class="text-amber-600 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded transition-colors" title="Dar Baixa">
                        <i class="fa-solid fa-minus mr-1"></i>Baixa
                    </button>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button onclick="editProduct('${p.id}')" class="text-indigo-600 hover:text-indigo-900" title="Editar Produto">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button onclick="deleteProduct('${p.id}')" class="text-red-600 hover:text-red-900" title="Excluir Produto">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderMovementsTable() {
    if (state.movements.length === 0) {
        movementsTableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Nenhuma movimentação registrada.</td></tr>`;
        return;
    }

    movementsTableBody.innerHTML = state.movements.slice(0, 50).map(m => {
        const isEntrada = m.type === 'ENTRADA';
        const typeBadge = isEntrada 
            ? '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">Entrada</span>'
            : '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">Baixa</span>';
        
        const dateFormatted = m.date ? new Date(m.date).toLocaleString('pt-BR') : '-';

        return `
            <tr class="hover:bg-gray-50 transition-colors text-sm">
                <td class="px-6 py-4 whitespace-nowrap text-gray-500">${dateFormatted}</td>
                <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">${escapeHtml(m.productName)}</td>
                <td class="px-6 py-4 whitespace-nowrap">${typeBadge} <span class="font-bold ml-1">${isEntrada ? '+' : '-'}${m.quantity}</span></td>
                <td class="px-6 py-4 whitespace-nowrap text-gray-700">${escapeHtml(m.reason || '-')}</td>
                <td class="px-6 py-4 whitespace-nowrap text-gray-600 font-semibold"><i class="fa-solid fa-user-tag text-gray-400 mr-1"></i>${escapeHtml(m.user)}</td>
            </tr>
        `;
    }).join('');
}

window.openMovementModal = function(productId, type) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    movementProductId.value = product.id;
    movementType.value = type;
    movementQuantity.value = 1;
    movementReason.value = '';

    if (type === 'ENTRADA') {
        movementTitle.textContent = `Adicionar Quantidade: ${product.name}`;
        movementQuantity.max = 999999;
    } else {
        movementTitle.textContent = `Dar Baixa (Saída): ${product.name}`;
        movementQuantity.max = product.quantity;
    }

    movementModal.classList.remove('hidden');
    movementModal.classList.add('flex');
}

window.editProduct = function(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    modalTitle.textContent = 'Editar Produto';
    productIdInput.value = product.id;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-sku').value = product.sku || '';
    document.getElementById('product-category').value = product.category || '';
    document.getElementById('product-price').value = product.price;
    document.getElementById('product-quantity').value = product.quantity;
    document.getElementById('product-min-stock').value = product.minStock;

    productModal.classList.remove('hidden');
    productModal.classList.add('flex');
}

window.deleteProduct = function(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    if (confirm(`Tem certeza que deseja excluir o produto "${product.name}"?`)) {
        state.products = state.products.filter(p => p.id !== productId);
        addMovementRecord(productId, product.name, 'SAIDA', product.quantity, `Produto excluído por ${state.currentUser}`);
        saveState();
        renderAll();
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
