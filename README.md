# 🫀 Assistente Cardiologia Clínica - Biocardio

Sistema web com integração de IA para auxiliar o Dr. Salomão Alcolumbre na documentação de consultas cardiológicas, transformando anotações rápidas em evoluções médicas formais prontas para o ProDoctor.

## 🎯 Funcionalidades

- **Formalização de Evoluções**: Transforma anotações informais em texto médico estruturado
- **Suporte à Decisão Clínica**: Sugere hipóteses diagnósticas e identifica red flags
- **Terapêutica Baseada em Guidelines**: Recomendações conforme SBC/ESC/AHA
- **Interface Profissional**: Design limpo e responsivo para uso clínico
- **Auto-save**: Salva rascunhos automaticamente
- **Copy-to-clipboard**: Facilita cópia para o prontuário

## 🚀 Deploy no Netlify

### 1. Pré-requisitos

- Conta no [Netlify](https://netlify.com)
- Conta no [OpenAI](https://platform.openai.com/) para obter API Key do GPT-4
- Git instalado

### 2. Configuração Inicial

```bash
# Instalar dependências
npm install

# Criar arquivo de variáveis de ambiente
cp .env.example .env

# Editar .env e adicionar sua chave da API
# ANTHROPIC_API_KEY=sua-chave-aqui
```

### 3. Deploy via Netlify CLI

```bash
# Instalar Netlify CLI (caso não tenha)
npm install -g netlify-cli

# Login no Netlify
netlify login

# Inicializar projeto
netlify init

# Deploy
netlify deploy --prod
```

### 4. Deploy via GitHub

1. Crie um repositório no GitHub e faça push do código:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/seu-usuario/seu-repo.git
git push -u origin main
```

2. No Netlify Dashboard:
   - Clique em "Add new site" → "Import an existing project"
   - Conecte sua conta GitHub
   - Selecione o repositório
   - Configure as variáveis de ambiente em "Site settings" → "Environment variables":
     - `OPENAI_API_KEY`: sua chave da API do OpenAI

3. O deploy será feito automaticamente!

### 5. Configurar Variável de Ambiente no Netlify

No dashboard do Netlify:
1. Vá em **Site settings**
2. Clique em **Environment variables**
3. Adicione:
   - **Key**: `OPENAI_API_KEY`
   - **Value**: sua chave da API OpenAI (começa com `sk-proj-` ou `sk-`)

## 🧪 Testar Localmente

```bash
# Iniciar servidor de desenvolvimento
netlify dev

# O site estará disponível em http://localhost:8888
```

## 📋 Estrutura do Projeto

```
├── index.html              # Interface principal
├── style.css              # Estilos
├── script.js              # Lógica do frontend
├── netlify/
│   └── functions/
│       └── process-medical-notes.js  # Function serverless para IA
├── netlify.toml           # Configuração do Netlify
├── package.json           # Dependências
├── .env.example           # Exemplo de variáveis de ambiente
└── README.md              # Este arquivo
```

## 🔐 Segurança

- A chave da API nunca é exposta no frontend
- Todas as chamadas à IA (GPT-4) são feitas via Netlify Functions (backend serverless)
- Ambiente de produção isolado
- CORS configurado adequadamente

## 💡 Uso

1. Acesse o site pelo URL fornecido pelo Netlify
2. Digite suas anotações de consulta (pode ser informal)
3. Clique em "Processar com IA"
4. Copie o texto formatado e cole no ProDoctor

### Exemplo de Entrada:

```
Paciente 65a, M, hipertenso, diabético
QP: dor precordial há 2h, em aperto, irradiando para MSE
PA: 160x100 FC: 95 Tax: 36.5
ECG: sem alterações agudas
Troponina: pendente
```

## 🛠️ Tecnologias

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Netlify Functions (Node.js)
- **IA**: GPT-4o (OpenAI)
- **Deploy**: Netlify
- **Versionamento**: Git

## 📞 Suporte

Para dúvidas ou problemas:
- Verifique os logs no Netlify Dashboard
- Confirme que a variável `OPENAI_API_KEY` está configurada
- Teste localmente com `netlify dev`

## ⚠️ Disclaimer

Este sistema é uma ferramenta de apoio à documentação médica. Todas as decisões clínicas são de responsabilidade exclusiva do médico assistente. O sistema não substitui o julgamento clínico profissional.

## 📄 Licença

Uso privado e exclusivo - Biocardio © 2026

