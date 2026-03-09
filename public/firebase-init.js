// Firebase Configuration — single source of truth
const firebaseConfig = {
    apiKey: "AIzaSyBcOO73qBCsCR-rMEkJsx6Th3cx-SpSywc",
    authDomain: "echovoice-agentes.firebaseapp.com",
    projectId: "echovoice-agentes",
    storageBucket: "echovoice-agentes.firebasestorage.app",
    messagingSenderId: "208759689338",
    appId: "1:208759689338:web:cdefadf21c594a4e80abc3"
};

// Initialize Firebase (only once)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Email do administrador — single source of truth
window.EMAIL_ADMIN = 'salomaoalco@gmail.com';

// Authorized emails — single source of truth
window.EMAILS_AUTORIZADOS = [
    "salomaoalco@gmail.com",
    "contato@biocardio.com.br",
    "rodrigoalcolumbre@gmail.com",
    "fuinobosquebeberagua@gmail.com",
    "thiago.cdavid@gmail.com",
    "gokusensei26@gmail.com",
    "simplificalaudosvid@gmail.com"
];

// Authorized emails with names (for admin page migration)
window.EMAILS_HARDCODED = [
    { email: 'salomaoalco@gmail.com', nome: 'Dr. Salomão Alcolumbre (Admin)' },
    { email: 'contato@biocardio.com.br', nome: 'Biocardio' },
    { email: 'rodrigoalcolumbre@gmail.com', nome: 'Rodrigo Alcolumbre' },
    { email: 'fuinobosquebeberagua@gmail.com', nome: '' },
    { email: 'thiago.cdavid@gmail.com', nome: 'Thiago David' },
    { email: 'gokusensei26@gmail.com', nome: '' },
    { email: 'simplificalaudosvid@gmail.com', nome: 'Simplifica Laudos' }
];

// Helper function for email authorization (case-insensitive)
window.isEmailAutorizado = function(email) {
    return EMAILS_AUTORIZADOS.some(function(e) {
        return e.toLowerCase() === email.toLowerCase();
    });
};
