const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto'); // Módulo nativo do Node.js para criptografia

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Configuração do Banco de Dados SQLite local com better-sqlite3
const dbFile = path.join(__dirname, 'estoque.db');
const db = new Database(dbFile);

console.log('Conectado ao banco de dados SQLite.');

// Função para criptografar a senha com Salt (Segurança Avançada)
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

// Função para verificar se a senha digitada confere com o hash salvo
function verifyPassword(password, storedHash) {
    const [salt, key] = storedHash.split(':');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return key === hash;
}

// Criação das tabelas e usuário Admin padrão
function initDatabase() {
    // No better-sqlite3, executamos comandos diretamente de forma síncrona
    db.exec(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE,
        name TEXT,
        password TEXT,
        role TEXT
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT,
        sku TEXT,
        category TEXT,
        price REAL,
        quantity INTEGER,
        min_stock INTEGER,
        updated_at TEXT
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS movements (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        product_name TEXT,
        type TEXT,
        quantity INTEGER,
        reason TEXT,
        user_name TEXT,
        date TEXT
    )`);

    // Cria o Administrador padrão caso não exista (ID: 91004500)
    const admin = db.prepare(`SELECT * FROM users WHERE user_id = ?`).get('91004500');
    if (!admin) {
        const securePassword = hashPassword('Corinthians1910*');
        db.prepare(
            `INSERT INTO users (user_id, name, password, role) VALUES (?, ?, ?, ?)`
        ).run('91004500', 'Administrador', securePassword, 'admin');
        console.log('Usuário Administrador criado com senha criptografada (ID: 91004500)');
    }
}

// Inicializa o banco logo na partida
initDatabase();

// 1. Rota de Autenticação (Login com verificação de senha criptografada)
app.post('/api/auth', (req, res) => {
    const { userId, password } = req.body;

    if (!userId || !password) {
        return res.status(400).json({ error: 'Informe o ID e a senha.' });
    }

    try {
        const user = db.prepare(`SELECT * FROM users WHERE user_id = ?`).get(userId);

        if (!user || !verifyPassword(password, user.password)) {
            return res.status(401).json({ error: 'ID de acesso ou senha incorretos.' });
        }

        res.json({
            user: {
                id: user.user_id,
                name: user.name,
                role: user.role
            }
        });
    } catch (err) {
        return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
});

// 2. Rota para Cadastrar Novos Usuários (Com ID de 8 dígitos e criptografia)
app.post('/api/users', (req, res) => {
    const { userId, name, password, role } = req.body;

    // Validações básicas
    if (!userId || !/^\d{8}$/.test(userId)) {
        return res.status(400).json({ error: 'O ID de acesso deve conter exatamente 8 números.' });
    }
    if (!name || !password || !role) {
        return res.status(400).json({ error: 'Preencha todos os campos do usuário.' });
    }

    const securePassword = hashPassword(password);

    try {
        db.prepare(
            `INSERT INTO users (user_id, name, password, role) VALUES (?, ?, ?, ?)`
        ).run(userId, name, securePassword, role);

        res.json({ success: true, message: 'Usuário cadastrado com sucesso!' });
    } catch (err) {
        return res.status(400).json({ error: 'Este ID de 8 dígitos já está cadastrado.' });
    }
});

// 3. Nova Rota para Alteração de Senha de forma segura
app.put('/api/users/password', (req, res) => {
    const { userId, oldPassword, newPassword } = req.body;

    if (!userId || !oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Informe o ID, a senha antiga e a nova senha.' });
    }

    try {
        const user = db.prepare(`SELECT * FROM users WHERE user_id = ?`).get(userId);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        // Confere se a senha antiga está correta
        if (!verifyPassword(oldPassword, user.password)) {
            return res.status(401).json({ error: 'A senha atual está incorreta.' });
        }

        // Gera o hash seguro para a nova senha
        const secureNewPassword = hashPassword(newPassword);

        db.prepare(`UPDATE users SET password = ? WHERE user_id = ?`).run(secureNewPassword, userId);

        res.json({ success: true, message: 'Senha alterada com sucesso!' });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao atualizar a senha.' });
    }
});

// Rota para carregar dados do sistema
app.get('/api/data', (req, res) => {
    try {
        const products = db.prepare(`SELECT * FROM products`).all();
        const movements = db.prepare(`SELECT * FROM movements ORDER BY date DESC`).all();
        const users = db.prepare(`SELECT user_id as id, name, role FROM users`).all();

        res.json({ products, movements, users });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar dados do sistema.' });
    }
});

// Rota de Sincronização de Estoque
app.post('/api/sync', (req, res) => {
    const { products, movements } = req.body;

    try {
        // Transações no better-sqlite3 são muito rápidas e seguras
        const syncTransaction = db.transaction(() => {
            if (products && Array.isArray(products)) {
                const stmt = db.prepare(`INSERT OR REPLACE INTO products (id, name, sku, category, price, quantity, min_stock, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
                for (const p of products) {
                    stmt.run(p.id, p.name, p.sku, p.category, p.price, p.quantity, p.min_stock, p.updated_at);
                }
            }

            if (movements && Array.isArray(movements)) {
                const stmtMov = db.prepare(`INSERT OR IGNORE INTO movements (id, product_id, product_name, type, quantity, reason, user_name, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
                for (const m of movements) {
                    stmtMov.run(m.id, m.product_id, m.product_name, m.type, m.quantity, m.reason, m.user_name, m.date);
                }
            }
        });

        syncTransaction();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao sincronizar dados.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});