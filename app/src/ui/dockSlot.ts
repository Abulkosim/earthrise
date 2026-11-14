// Written with AI assistance (Claude); see the README.
// The place in the dock's transport row where the ribbon shows its lane legend, or what is under
// the pointer while it hovers a row. The dock provides the element, the ribbon renders into it.
import { createContext } from 'react'

export const DockInfoSlot = createContext<HTMLElement | null>(null)
