import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge must know the custom @theme scales in index.css; otherwise it
// reads `text-control` as a color and drops the real color class next to it.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['caption', 'body', 'control', 'heading'],
      radius: ['chip', 'control', 'card', 'pill', 'screen'],
    },
  },
})

// Joins class names and resolves Tailwind conflicts (the last one wins).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
