import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { externalSupabase } from "@/integrations/supabase/externalClient";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Admin from "./pages/Admin";
import ModuleSelection from "./pages/ModuleSelection";
import Comissionamento from "./pages/Comissionamento";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/**
 * Listens for Supabase PASSWORD_RECOVERY event and redirects to /reset-password.
 * Must be rendered INSIDE HashRouter so useNavigate works.
 */
function RecoveryRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = externalSupabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          navigate("/reset-password", { replace: true });
        }
      }
    );
    return () => subscription.unsubscribe();
  }, [navigate]);

  return null;
}

const App = () => {

  const [ready, setReady] = useState(() => {
    const hash = window.location.hash;

    if (
      hash.includes("error=") ||
      hash.includes("error_code=") ||
      hash.includes("access_denied") ||
      hash.includes("otp_expired") ||
      hash.includes("access_token") ||
      hash.includes("refresh_token") ||
      hash.includes("type=recovery")
    ) {
      return false;
    }

    return true;
  });

  useEffect(() => {
    if (ready) return;

    const hash = window.location.hash;

    // Case 1: Supabase returned an error (expired/invalid token)
    if (hash.includes("error=")) {
      // Redirect to reset-password — it will detect no session and show "link expired" UI
      window.location.hash = "#/reset-password";
      setReady(true);
      return;
    }

    // Case 2: Supabase returned tokens (successful recovery)
    if (hash.includes("access_token")) {
      const { data: { subscription } } = externalSupabase.auth.onAuthStateChange(
        (event) => {
          if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
            window.location.hash = "#/reset-password";
            setReady(true);
            subscription.unsubscribe();
          }
        }
      );
      // Fallback timeout in case event doesn't fire
      const timeout = setTimeout(() => {
        window.location.hash = "#/reset-password";
        setReady(true);
      }, 5000);

      return () => {
        subscription.unsubscribe();
        clearTimeout(timeout);
      };
    }

    // Fallback: unrecognized hash, just proceed
    setReady(true);
  }, [ready]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Processando recuperação de senha...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />

          <BrowserRouter>
            <RecoveryRedirect />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/selecao"
                element={
                  <ProtectedRoute>
                    <ModuleSelection />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard-atividades"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/comissionamento"
                element={
                  <ProtectedRoute requireAdmin>
                    <Comissionamento />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Navigate to="/selecao" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requireAdmin>
                    <Admin />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
