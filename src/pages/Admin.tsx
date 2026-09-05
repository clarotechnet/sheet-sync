import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ColaboradorCadastrado } from '@/types/comissionamento';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Users,
  UserCheck,
  Clock,
  RefreshCw,
  Shield,
  IdCard,
  Search,
  UserPlus,
  Wifi,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';

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
  const { isAdmin, isLoading: authLoading, onlineUserIds, isPresenceConnected, user } = useAuth();

  const [activeTab, setActiveTab] = useState('users');
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [onlyOnline, setOnlyOnline] = useState(false);
  const onlineIds = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);
  const onlineUsers = allUsers.filter((u) => u.approved && onlineIds.has(u.id)).length;
  const visibleUsers = useMemo(() => (
    allUsers.filter((u) => !onlyOnline || (isPresenceConnected && u.approved && onlineIds.has(u.id)))
      .sort((a, b) => Number(b.approved && onlineIds.has(b.id)) - Number(a.approved && onlineIds.has(a.id)))
  ), [allUsers, onlyOnline, onlineIds, isPresenceConnected]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<ColaboradorCadastrado[]>([]);
  const [collaboratorsLoaded, setCollaboratorsLoaded] = useState(false);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [collaboratorsError, setCollaboratorsError] = useState<string | null>(null);
  const [collaboratorSearch, setCollaboratorSearch] = useState('');
  const [addCollaboratorOpen, setAddCollaboratorOpen] = useState(false);
  const [savingCollaborator, setSavingCollaborator] = useState(false);
  const [newCollaborator, setNewCollaborator] = useState({ nome: '', cpf: '', setor: '' });
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data: all, error: allError } = await externalSupabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (allError) throw allError;
      const users = (all || []) as AllUser[];
      setAllUsers(users);
      setPendingUsers(users.filter((profile) => !profile.approved));
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      setLoadError('Não foi possível carregar a lista de usuários. Tente atualizar novamente.');
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar a lista de usuários.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchCollaborators = useCallback(async () => {
    setCollaboratorsLoading(true);
    setCollaboratorsError(null);
    try {
      const { data, error } = await externalSupabase
        .from('colaboradores_cadastrados')
        .select('id, nome, cpf, setor')
        .order('nome', { ascending: true });

      if (error) throw error;
      setCollaborators((data || []) as ColaboradorCadastrado[]);
    } catch (error) {
      console.error('Erro ao buscar colaboradores:', error);
      setCollaboratorsError('Não foi possível carregar os colaboradores cadastrados.');
    } finally {
      setCollaboratorsLoaded(true);
      setCollaboratorsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      fetchUsers();
    }
  }, [authLoading, isAdmin, fetchUsers]);

  useEffect(() => {
    if (activeTab === 'collaborators' && !collaboratorsLoaded && !collaboratorsLoading) {
      fetchCollaborators();
    }
  }, [activeTab, collaboratorsLoaded, collaboratorsLoading, fetchCollaborators]);

  const filteredCollaborators = useMemo(() => {
    const search = collaboratorSearch.trim().toLocaleLowerCase('pt-BR');
    const searchDigits = collaboratorSearch.replace(/\D/g, '');
    if (!search && !searchDigits) return collaborators;

    return collaborators.filter((collaborator) => (
      collaborator.nome.toLocaleLowerCase('pt-BR').includes(search)
      || collaborator.setor.toLocaleLowerCase('pt-BR').includes(search)
      || (searchDigits.length > 0 && collaborator.cpf.includes(searchDigits))
    ));
  }, [collaboratorSearch, collaborators]);

  const collaboratorSectors = useMemo(() => (
    [...new Set(collaborators.map((collaborator) => collaborator.setor.trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  ), [collaborators]);

  const createCollaborator = async () => {
    const nome = newCollaborator.nome.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
    const cpf = newCollaborator.cpf.replace(/\D/g, '');
    const setor = newCollaborator.setor.trim();

    if (!nome || cpf.length !== 11 || !setor) {
      toast({
        title: 'Dados incompletos',
        description: 'Informe o nome, um CPF com 11 números e o setor.',
        variant: 'destructive',
      });
      return;
    }

    setSavingCollaborator(true);
    try {
      const { data, error } = await externalSupabase
        .from('colaboradores_cadastrados')
        .insert({ nome, cpf, setor })
        .select('id, nome, cpf, setor')
        .single();

      if (error) throw error;

      setCollaborators((current) => (
        [...current, data as ColaboradorCadastrado]
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      ));
      setNewCollaborator({ nome: '', cpf: '', setor: '' });
      setAddCollaboratorOpen(false);
      toast({
        title: 'Colaborador cadastrado',
        description: 'O nome já está disponível no formulário de comissionamento.',
      });
    } catch (error: unknown) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
      toast({
        title: 'Não foi possível cadastrar',
        description: code === '23505'
          ? 'Já existe um colaborador com este CPF.'
          : 'Confira os dados e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSavingCollaborator(false);
    }
  };

  const approveUser = async (userId: string) => {
    setApprovingId(userId);
    try {
      const { error } = await externalSupabase
        .from('profiles')
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('id')
        .single();

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
        .eq('id', userId)
        .select('id')
        .single();

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
  const changeRole = async (userId: string, newRole: string) => {
    if (userId === user?.id) {
      toast({
        title: 'Ação não permitida',
        description: 'Você não pode alterar seu próprio tipo.',
        variant: 'destructive',
      });
      return;
    }

    setApprovingId(userId);
    try {
      const { error } = await externalSupabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId)
        .select('id')
        .single();

      if (error) throw error;

      toast({
        title: 'Tipo atualizado',
        description: `Usuário agora é ${newRole}.`,
      });

      fetchUsers();
    } catch (error) {
      console.error('Erro ao alterar tipo:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar o tipo do usuário.',
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

  const formatCpf = (cpf: string) => {
    const digits = cpf.replace(/\D/g, '').slice(0, 11);
    if (digits.length !== 11) return cpf;
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const currentTabLoading = activeTab === 'users' ? isLoading : collaboratorsLoading;
  const refreshCurrentTab = () => {
    if (activeTab === 'users') {
      void fetchUsers();
      return;
    }
    void fetchCollaborators();
  };

  if (authLoading) {
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
    <AppShell>
      <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-[1500px] space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#e31325]">
              <Shield className="h-4 w-4" />
              Administração
            </div>
            <h1 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">Configurações</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Gerencie usuários, permissões e colaboradores
            </p>
          </div>
          <Button onClick={refreshCurrentTab} variant="outline" className="gap-2" disabled={currentTabLoading}>
            <RefreshCw className={`h-4 w-4 ${currentTabLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 rounded-md border border-slate-200 bg-white p-1 sm:inline-flex sm:w-auto">
            <TabsTrigger value="users" className="w-full justify-start gap-2 rounded-md px-4 py-2.5 sm:w-auto">
              <Users className="h-4 w-4" />
              Usuários e acessos
            </TabsTrigger>
            <TabsTrigger value="collaborators" className="w-full justify-start gap-2 rounded-md px-4 py-2.5 sm:w-auto">
              <IdCard className="h-4 w-4" />
              Colaboradores cadastrados
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
        {loadError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {loadError}
          </div>
        )}

        {isLoading ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm">
            <Loader2 className="mb-3 h-7 w-7 animate-spin text-[#e31325]" />
            <p className="text-sm font-semibold">Carregando usuários...</p>
          </div>
        ) : (
          <>
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <Wifi className="h-4 w-4 text-sky-500" />
                ONLINE AGORA
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-sky-600">{isPresenceConnected ? onlineUsers : '-'}</p>
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
              Lista completa de usuários cadastrados no sistema. {isPresenceConnected ? `${onlineUsers} online agora.` : 'Verificando presença...'}
            </CardDescription>
            <div className="flex items-center gap-2 pt-2">
              <Checkbox id="only-online-users" checked={onlyOnline} onCheckedChange={(checked) => setOnlyOnline(checked === true)} />
              <Label htmlFor="only-online-users">Somente online</Label>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Presença</TableHead>
                  <TableHead>Aprovado em</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      {onlyOnline ? (isPresenceConnected ? 'Nenhum usuário online agora.' : 'Verificando presença...') : 'Nenhum usuário cadastrado.'}
                    </TableCell>
                  </TableRow>
                )}
                {visibleUsers.map((u) => (
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
                       {u.id !== user?.id ? (
                        <Select
                          value={u.role}
                          onValueChange={(v) => changeRole(u.id, v)}
                          disabled={approvingId === u.id}
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">admin</SelectItem>
                            <SelectItem value="user">user</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="default">{u.role}</Badge>
                      )}
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
                      <span className={`inline-flex items-center gap-2 whitespace-nowrap text-sm ${
                        isPresenceConnected && u.approved && onlineIds.has(u.id) ? 'font-semibold text-emerald-700' : 'text-slate-500'
                      }`}>
                        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${
                          isPresenceConnected && u.approved && onlineIds.has(u.id) ? 'bg-emerald-500' : 'bg-slate-300'
                        }`} />
                        {!isPresenceConnected ? 'Verificando...' : u.approved && onlineIds.has(u.id) ? 'Online' : 'Offline'}
                      </span>
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
          </>
        )}
          </TabsContent>

          <TabsContent value="collaborators" className="space-y-6">
            {collaboratorsError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {collaboratorsError}
              </div>
            )}

            {collaboratorsLoading ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm">
                <Loader2 className="mb-3 h-7 w-7 animate-spin text-[#e31325]" />
                <p className="text-sm font-semibold">Carregando colaboradores...</p>
              </div>
            ) : (
              <Card>
                <CardHeader className="gap-4 border-b border-slate-100 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <IdCard className="h-5 w-5" />
                      Colaboradores cadastrados ({collaborators.length})
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Cadastro interno com nome, CPF e setor.
                    </CardDescription>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <div className="relative w-full sm:w-80">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={collaboratorSearch}
                        onChange={(event) => setCollaboratorSearch(event.target.value)}
                        placeholder="Buscar por nome, CPF ou setor"
                        className="pl-9"
                        aria-label="Buscar colaboradores"
                      />
                    </div>
                    <Button onClick={() => setAddCollaboratorOpen(true)} className="gap-2 bg-[#e31325] hover:bg-[#bd1020]">
                      <UserPlus className="h-4 w-4" />
                      Adicionar colaborador
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <Table className="min-w-[680px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>CPF</TableHead>
                        <TableHead>Setor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCollaborators.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="h-32 text-center text-slate-500">
                            {collaborators.length === 0
                              ? 'Nenhum colaborador cadastrado.'
                              : 'Nenhum colaborador encontrado para esta busca.'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCollaborators.map((collaborator) => (
                          <TableRow key={collaborator.id}>
                            <TableCell className="font-semibold text-slate-900">{collaborator.nome}</TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-sm">{formatCpf(collaborator.cpf)}</TableCell>
                            <TableCell>{collaborator.setor}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <Dialog
          open={addCollaboratorOpen}
          onOpenChange={(open) => {
            setAddCollaboratorOpen(open);
            if (!open && !savingCollaborator) {
              setNewCollaborator({ nome: '', cpf: '', setor: '' });
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Adicionar colaborador</DialogTitle>
              <DialogDescription>
                O nome ficará disponível no formulário e nos relatórios de comissionamento.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="collaborator-name">Nome *</Label>
                <Input
                  id="collaborator-name"
                  value={newCollaborator.nome}
                  onChange={(event) => setNewCollaborator((current) => ({
                    ...current,
                    nome: event.target.value,
                  }))}
                  placeholder="Nome completo"
                  autoComplete="name"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="collaborator-cpf">CPF *</Label>
                <Input
                  id="collaborator-cpf"
                  value={newCollaborator.cpf}
                  onChange={(event) => setNewCollaborator((current) => ({
                    ...current,
                    cpf: event.target.value.replace(/\D/g, '').slice(0, 11),
                  }))}
                  placeholder="Somente números"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="collaborator-sector">Setor *</Label>
                <select
                  id="collaborator-sector"
                  value={newCollaborator.setor}
                  onChange={(event) => setNewCollaborator((current) => ({
                    ...current,
                    setor: event.target.value,
                  }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Selecione...</option>
                  {collaboratorSectors.map((setor) => (
                    <option key={setor} value={setor}>{setor}</option>
                  ))}
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddCollaboratorOpen(false)}
                disabled={savingCollaborator}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => void createCollaborator()}
                disabled={savingCollaborator}
                className="bg-[#e31325] hover:bg-[#bd1020]"
              >
                {savingCollaborator && <Loader2 className="h-4 w-4 animate-spin" />}
                Cadastrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </main>
    </AppShell>
  );
}
