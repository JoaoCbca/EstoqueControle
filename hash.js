const bcrypt = require('bcrypt');

async function gerarHash() {
    const senhaTemporaria = '123456'; // Senha padrão inicial
    const hash = await bcrypt.hash(senhaTemporaria, 10);
    console.log("Hash gerado:", hash);
}

gerarHash();