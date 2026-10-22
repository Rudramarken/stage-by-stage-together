import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Opt = { value: string; label: string; hint?: string };

export function SearchSelect({ value, onChange, options, placeholder = "Choose…", onCreate, createLabel = "Create", disabled, allowClear = true }: {
  value: string | null | undefined; onChange: (v: string) => void; options: Opt[]; placeholder?: string;
  onCreate?: (text: string) => Promise<string | void> | void; createLabel?: string; disabled?: boolean; allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const sel = options.find((o) => o.value === value);
  const exact = options.some((o) => o.label.trim().toLowerCase() === text.trim().toLowerCase());
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" aria-label={placeholder} aria-expanded={open} disabled={disabled} className="w-full min-w-0 justify-between font-normal">
          <span className={cn("min-w-0 truncate", !sel && "text-muted-foreground")}>{sel?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0" align="start">
        <Command>
          <CommandInput aria-label={`Search ${placeholder}`} placeholder="Type to search…" value={text} onValueChange={setText} />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {allowClear && value && <CommandItem value="__clear" onSelect={() => { onChange(""); setOpen(false); }}>— None —</CommandItem>}
              {options.map((o) => (
                <CommandItem key={o.value} value={o.label + " " + (o.hint ?? "")} onSelect={() => { onChange(o.value); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  {o.label}{o.hint && <span className="ml-2 text-xs text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
            {onCreate && text.trim() && !exact && (
              <CommandGroup>
                <CommandItem value={"__create " + text} disabled={busy} onSelect={async () => {
                  setBusy(true);
                  try { const id = await onCreate(text.trim()); if (id) onChange(id); setOpen(false); setText(""); } finally { setBusy(false); }
                }}>
                  <Plus className="mr-2 h-4 w-4" />{createLabel} "{text.trim()}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
