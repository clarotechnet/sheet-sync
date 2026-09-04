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
import Gatilhos from "./pages/Gatilhos";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();


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
                path="/gatilhos"
                element={
                  <ProtectedRoute requireAdmin>
                    <Gatilhos />
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
