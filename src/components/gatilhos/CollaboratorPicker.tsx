import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { ColaboradorCadastrado } from '@/types/comissionamento';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

interface CollaboratorPickerProps {
  colaboradores: ColaboradorCadastrado[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  ariaLabel: string;
  excludeIds?: string[];
}

export function CollaboratorPicker({
  colaboradores,
  value,
  onChange,
  placeholder,
  ariaLabel,
  excludeIds = [],
}: CollaboratorPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = colaboradores.find((colaborador) => colaborador.id === value);
  const options = useMemo(
    () => colaboradores.filter((colaborador) => colaborador.id === value || !excludeIds.includes(colaborador.id)),
    [colaboradores, excludeIds, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          className="h-10 w-full justify-between px-3 font-normal"
        >
          <span className={cn('truncate text-left', !selected && 'text-muted-foreground')}>
            {selected?.nome || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por nome, CPF ou setor..." />
          <CommandList>
            <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
            <CommandGroup>
              {options.map((colaborador) => (
                <CommandItem
                  key={colaborador.id}
                  value={`${colaborador.nome} ${colaborador.cpf} ${colaborador.setor}`}
                  onSelect={() => {
                    onChange(colaborador.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === colaborador.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{colaborador.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">{colaborador.setor}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

