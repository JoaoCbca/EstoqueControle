const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Configuração segura do Banco de Dados SQLite (compatível com Render e ambiente local)
const dbFolder = process.env.RENDER ? '/data' : __dirname;

if (process.env.RENDER && !fs.existsSync(dbFolder)) {
    try {
        fs.mkdirSync(dbFolder, { recursive: true });
    } catch (e) {
        console.log('Não foi possível usar /data, alternando para a pasta local.');
    }
}

const finalDbFolder = (process.env.RENDER && fs.existsSync(dbFolder)) ? dbFolder : __dirname;
const dbFile = path.join(finalDbFolder, 'estoque.db');
const db = new Database(dbFile);

console.log(`Conectado ao banco de dados SQLite em: ${dbFile}`);

// Função para criptografar a senha com Salt
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

// Função para verificar se a senha confere com o hash
function verifyPassword(password, storedHash) {
    const [salt, key] = storedHash.split(':');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return key === hash;
}

// Criação das tabelas e do usuário Administrador padrão
function initDatabase() {
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

    const admin = db.prepare(`SELECT * FROM users WHERE user_id = ?`).get('91004500');
    if (!admin) {
        const securePassword = hashPassword('Corinthians1910*');
        db.prepare(
            `INSERT INTO users (user_id, name, password, role) VALUES (?, ?, ?, ?)`
        ).run('91004500', 'Administrador', securePassword, 'admin');
        console.log('Usuário Administrador criado com sucesso (ID: 91004500)');
    }
}

initDatabase();

// Servir arquivos estáticos (caso seu front-end esteja na mesma pasta ou numa pasta pública)
app.use(express.static(path.join(__dirname, 'public')));

// 1. Rota de Autenticação (Login)
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

// 2. Rota para carregar dados do sistema
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

// 3. Rota de Sincronização de Estoque
app.post('/api/sync', (req, res) => {
    const { products, movements } = req.body;

    try {
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
