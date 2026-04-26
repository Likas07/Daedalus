export type View = 'session' | 'settings' | 'empty' | 'diff'
export type ComposerMode = 'plan' | 'code' | 'agent'
export type EnvMode = 'local' | 'sandbox' | 'remote'
export type DiffMount = 'inline' | 'sheet' | 'sidebar'
export type PopoverKind = 'model' | 'effort' | 'mode' | 'access'

export type ProviderKind = 'anthropic' | 'openai' | 'google'
export type Effort = 'low' | 'medium' | 'high' | 'max' | 'ultrathink'
export type FastMode = 'on' | 'off'
export type AccessMode = 'supervised' | 'auto-accept' | 'full-access'

const LEFT_MIN = 200
const LEFT_MAX = 360
const RIGHT_MIN = 260
const RIGHT_MAX = 460

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

class UiState {
  view = $state<View>('session')
  paletteOpen = $state(false)
  terminalOpen = $state(false)

  leftOpen = $state(true)
  rightOpen = $state(true)
  leftWidth = $state(248)
  rightWidth = $state(328)

  // Composer state
  composerMode = $state<ComposerMode>('code')
  envMode = $state<EnvMode>('local')
  modelProvider = $state<ProviderKind>('anthropic')
  modelSlug = $state('opus-4-7')
  effort = $state<Effort>('high')
  fastMode = $state<FastMode>('off')
  contextWindow = $state<number>(200_000)
  access = $state<AccessMode>('supervised')
  favorites = $state<string[]>(['anthropic:opus-4-7', 'anthropic:sonnet-4-6'])

  // Popover (chip dropdown)
  popoverKind = $state<PopoverKind | null>(null)
  popoverAnchor = $state<{ left: number; right: number; top: number; bottom: number; width: number; height: number } | null>(null)

  diffPath = $state<string | null>(null)
  diffMount = $state<DiffMount>('inline')

  open(view: View) { this.view = view }
  togglePalette() { this.paletteOpen = !this.paletteOpen }
  toggleTerminal() { this.terminalOpen = !this.terminalOpen }
  toggleLeft() { this.leftOpen = !this.leftOpen }
  toggleRight() { this.rightOpen = !this.rightOpen }

  setLeftWidth(px: number) { this.leftWidth = clamp(px, LEFT_MIN, LEFT_MAX) }
  setRightWidth(px: number) { this.rightWidth = clamp(px, RIGHT_MIN, RIGHT_MAX) }

  togglePopover(kind: PopoverKind, rect: DOMRect) {
    if (this.popoverKind === kind) {
      this.closePopover()
      return
    }
    this.popoverKind = kind
    this.popoverAnchor = {
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      width: rect.width, height: rect.height,
    }
  }
  closePopover() {
    this.popoverKind = null
    this.popoverAnchor = null
  }

  toggleFavorite(key: string) {
    const i = this.favorites.indexOf(key)
    if (i >= 0) this.favorites = this.favorites.filter((_, j) => j !== i)
    else this.favorites = [...this.favorites, key]
  }

  openDiff(path: string, mount: DiffMount = 'inline') {
    this.diffPath = path
    this.diffMount = mount
  }
  closeDiff() { this.diffPath = null }
}

export const ui = new UiState()
