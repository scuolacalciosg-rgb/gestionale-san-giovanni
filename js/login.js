import { auth, signInWithEmailAndPassword, onAuthStateChanged } from "./firebase-config.js";

const btnLogin = document.getElementById("btnLogin");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMsg = document.getElementById("errorMsg");

// Se l'utente è già loggato, lo mando direttamente alla dashboard
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "dashboard.html";
  }
});

function traduciErrore(codice) {
  const errori = {
    "auth/invalid-email": "Email non valida.",
    "auth/user-not-found": "Utente non trovato.",
    "auth/wrong-password": "Password errata.",
    "auth/invalid-credential": "Email o password errati.",
    "auth/too-many-requests": "Troppi tentativi. Riprova più tardi."
  };
  return errori[codice] || "Errore durante l'accesso. Riprova.";
}

async function login() {
  errorMsg.textContent = "";
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    errorMsg.textContent = "Inserisci email e password.";
    return;
  }

  btnLogin.disabled = true;
  btnLogin.textContent = "Accesso in corso...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged gestirà il reindirizzamento
  } catch (err) {
    errorMsg.textContent = traduciErrore(err.code);
    btnLogin.disabled = false;
    btnLogin.textContent = "Accedi";
  }
}

btnLogin.addEventListener("click", login);

// Permette di premere Invio per accedere
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
