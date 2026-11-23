// Shared open/closed state for the vault dialogs. The layout owns the single
// instance of each dialog (so they exist on every page) while any page or card
// can ask for one to open.
import type { VaultEntry, VaultRecordType, VaultSpace } from '~/lib/vault/types'

export function useVaultDialogs() {
  const entryOpen = useState('vault:entry-open', () => false)
  const editingEntry = useState<VaultEntry | null>('vault:entry-editing', () => null)
  const importOpen = useState('vault:import-open', () => false)
  const tomlOpen = useState('vault:toml-open', () => false)
  const spaceOpen = useState('vault:space-open', () => false)
  const editingSpace = useState<VaultSpace | null>('vault:space-editing', () => null)
  const typesOpen = useState('vault:types-open', () => false)
  const typeOpen = useState('vault:type-open', () => false)
  const editingType = useState<VaultRecordType | null>('vault:type-editing', () => null)

  function openEntry(entry: VaultEntry | null = null) {
    editingEntry.value = entry
    entryOpen.value = true
  }

  function openSpace(space: VaultSpace | null = null) {
    editingSpace.value = space
    spaceOpen.value = true
  }

  function openTypes() {
    typesOpen.value = true
  }

  function openType(type: VaultRecordType | null = null) {
    editingType.value = type
    typeOpen.value = true
  }

  return {
    entryOpen,
    editingEntry,
    importOpen,
    tomlOpen,
    spaceOpen,
    editingSpace,
    typesOpen,
    typeOpen,
    editingType,
    openEntry,
    openSpace,
    openTypes,
    openType,
  }
}
