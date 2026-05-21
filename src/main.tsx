import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const hash = window.location.hash;

const isSupabaseErrorReturn =
    hash.startsWith("#error=") ||
    hash.includes("error_code=") ||
    hash.includes("access_denied") ||
    hash.includes("otp_expired");

if (isSupabaseErrorReturn) {
    sessionStorage.setItem("supabaseRecoveryHash", hash);

    window.history.replaceState(
        null,
        "",
        `${window.location.pathname}#/reset-password`
    );
}

createRoot(document.getElementById("root")!).render(<App />);