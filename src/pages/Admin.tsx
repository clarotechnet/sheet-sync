import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Users,
  UserCheck,
  Clock,
  ArrowLeft,
  RefreshCw,
  Shield,
} from 'lucide-react';

interface PendingUser {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
}

interface AllUser {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  approved: boolean;
  approved_at: string | null;
  created_at: string;
}

export default function Admin() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading, user } = useAuth();

  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      // Buscar usuários pendentes
      const { data: pending, error: pendingError } = await externalSupabase
        .from('pending_users')
        .select('*')
        .order('created_at', { ascending: true });

      if (pendingError) throw pendingError;
      setPendingUsers(pending || []);

      // Buscar todos os usuários
      const { data: all, error: allError } = await externalSupabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (allError) throw allError;
      setAllUsers(all || []);
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar a lista de usuários.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/');
      return;
    }

    if (isAdmin) {
      fetchUsers();
    }
  }, [authLoading, isAdmin, navigate, fetchUsers]);

  const approveUser = async (userId: string) => {
    setApprovingId(userId);
    try {
      const { error } = await externalSupabase
        .from('profiles')
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: 'Usuário aprovado!',
        description: 'O usuário agora pode acessar o sistema.',
      });

      fetchUsers();
    } catch (error) {
      console.error('Erro ao aprovar usuário:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível aprovar o usuário.',
        variant: 'destructive',
      });
    } finally {
      setApprovingId(null);
    }
  };

  const revokeAccess = async (userId: string) => {
    if (userId === user?.id) {
      toast({
        title: 'Ação não permitida',
        description: 'Você não pode revogar seu próprio acesso.',
        variant: 'destructive',
      });
      return;
    }

    setApprovingId(userId);
    try {
      const { error } = await externalSupabase
        .from('profiles')
        .update({
          approved: false,
          approved_at: null,
        })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: 'Acesso revogado',
        description: 'O usuário não poderá mais acessar o sistema.',
      });

      fetchUsers();
    } catch (error) {
      console.error('Erro ao revogar acesso:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível revogar o acesso.',
        variant: 'destructive',
      });
    } finally {
      setApprovingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                Painel Administrativo
              </h1>
              <p className="text-muted-foreground">
                Gerencie usuários e aprovações
              </p>
            </div>
          </div>
          <Button onClick={fetchUsers} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Total de Usuários
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{allUsers.length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-success" />
                Usuários Aprovados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-success">
                {allUsers.filter((u) => u.approved).length}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                Pendentes de Aprovação
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-warning">
                {pendingUsers.length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Users */}
        {pendingUsers.length > 0 && (
          <Card className="border-warning/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-warning">
                <Clock className="h-5 w-5" />
                Usuários Pendentes ({pendingUsers.length})
              </CardTitle>
              <CardDescription>
                Usuários aguardando aprovação para acessar o sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cadastrado em</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingUsers.map((pendingUser) => (
                    <TableRow key={pendingUser.id}>
                      <TableCell className="font-medium">
                        {pendingUser.email || '-'}
                      </TableCell>
                      <TableCell>{pendingUser.display_name || '-'}</TableCell>
                      <TableCell>{formatDate(pendingUser.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => approveUser(pendingUser.id)}
                          disabled={approvingId === pendingUser.id}
                          className="gap-2"
                        >
                          {approvingId === pendingUser.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                          Aprovar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* All Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Todos os Usuários ({allUsers.length})
            </CardTitle>
            <CardDescription>
              Lista completa de usuários cadastrados no sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aprovado em</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.email || '-'}
                      {u.id === user?.id && (
                        <Badge variant="outline" className="ml-2">
                          Você
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{u.display_name || '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={u.role === 'admin' ? 'default' : 'secondary'}
                      >
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.approved ? (
                        <Badge className="bg-success text-success-foreground gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Aprovado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-warning gap-1">
                          <Clock className="h-3 w-3" />
                          Pendente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.approved_at ? formatDate(u.approved_at) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.id !== user?.id && (
                        <>
                          {u.approved ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => revokeAccess(u.id)}
                              disabled={approvingId === u.id}
                              className="gap-2"
                            >
                              {approvingId === u.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <XCircle className="h-4 w-4" />
                              )}
                              Revogar
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => approveUser(u.id)}
                              disabled={approvingId === u.id}
                              className="gap-2"
                            >
                              {approvingId === u.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4" />
                              )}
                              Aprovar
                            </Button>
                          )}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
