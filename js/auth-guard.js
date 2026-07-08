import { auth, onAuthStateChanged, signOut } from "./firebase-config.js";

// Blocca l'accesso alla pagina finché non sappiamo se l'utente è loggato
export function proteggiPagina() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = "index.html";
      } else {
        resolve(user);
      }
    });
  });
}

// Collega il pulsante di logout, se presente nella pagina
export function collegaLogout() {
  const btn = document.getElementById("btnLogout");
  if (btn) {
    btn.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "index.html";
    });
  }
}
