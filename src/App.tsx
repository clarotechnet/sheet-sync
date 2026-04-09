import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import ModuleSelection from "./pages/ModuleSelection";
import Comissionamento from "./pages/Comissionamento";
import NotFound from "./pages/NotFound";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        {/* mantém o basename pro GitHub Pages */}
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
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
        </HashRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
