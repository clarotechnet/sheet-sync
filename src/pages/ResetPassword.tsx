import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, Lock, CheckCircle, KeyRound } from 'lucide-react';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Supabase automatically picks up the recovery token from the URL
    // and establishes a session. We just need to wait for it.
    const { data: { subscription } } = externalSupabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) {
          setSessionReady(true);
          setChecking(false);
        }
      }
    );

    // Fallback: check if there's already a session (e.g. token was already processed)
    const timeout = setTimeout(async () => {
      const { data: { session } } = await externalSupabase.auth.getSession();
      if (session) {
        setSessionReady(true);
      }
      setChecking(false);
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha a nova senha e a confirmação.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Senhas não conferem',
        description: 'A nova senha e a confirmação devem ser iguais.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await externalSupabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setSuccess(true);
      toast({
        title: 'Senha alterada!',
        description: 'Sua senha foi redefinida com sucesso.',
      });

      // Sign out and redirect to login after a short delay
      setTimeout(async () => {
        await externalSupabase.auth.signOut();
        navigate('/login', { replace: true });
      }, 2500);
    } catch (error: any) {
      console.error('Erro ao redefinir senha:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao redefinir a senha.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while waiting for session
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Verificando link de recuperação...</p>
        </div>
      </div>
    );
  }

  // No valid session / token
  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 shadow-glow">
          <CardHeader className="text-center">
            <KeyRound className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Link inválido ou expirado</CardTitle>
            <CardDescription>
              O link de recuperação de senha é inválido ou já expirou.
              Solicite um novo link na tela de login.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
              Voltar ao Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src={`${import.meta.env.BASE_URL}LogoNovo.png`}
              alt="Logo"
              className="h-20 w-20 object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-primary">TechNET</h1>
          <p className="text-muted-foreground mt-2">Redefinir senha</p>
        </div>

        <Card className="border-border/50 shadow-glow">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Nova Senha
            </CardTitle>
            <CardDescription>
              Digite sua nova senha abaixo.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {success ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <CheckCircle className="w-12 h-12 text-primary" />
                <p className="text-lg font-semibold text-foreground">
                  Senha redefinida com sucesso!
                </p>
                <p className="text-sm text-muted-foreground">
                  Redirecionando para o login...
                </p>
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nova Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pl-10"
                      disabled={isLoading}
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-new-password">Confirmar Nova Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirm-new-password"
                      type="password"
                      placeholder="Repita a nova senha"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10"
                      disabled={isLoading}
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Redefinir Senha
                    </>
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => navigate('/login', { replace: true })}
                  className="w-full text-sm text-muted-foreground hover:text-primary hover:underline cursor-pointer bg-transparent border-none mt-2"
                >
                  Voltar ao Login
                </button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
