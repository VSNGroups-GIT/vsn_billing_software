import * as React from 'react'

import { cn } from '@/lib/utils'

const getScrollableParent = (element: HTMLElement | null) => {
  let parent = element?.parentElement || null

  while (parent) {
    const style = window.getComputedStyle(parent)
    const canScrollY =
      (style.overflowY === 'auto' ||
        style.overflowY === 'scroll' ||
        style.overflowY === 'overlay') &&
      parent.scrollHeight > parent.clientHeight

    if (canScrollY) {
      return parent
    }

    parent = parent.parentElement
  }

  return null
}

function Input({ className, type, onWheel, ...props }: React.ComponentProps<'input'>) {
  const handleWheel = (event: React.WheelEvent<HTMLInputElement>) => {
    if (type === 'number' && document.activeElement === event.currentTarget) {
      event.preventDefault()
      event.currentTarget.blur()

      const scrollParent = getScrollableParent(event.currentTarget)
      if (scrollParent) {
        scrollParent.scrollBy({ top: event.deltaY, left: event.deltaX })
      } else {
        window.scrollBy({ top: event.deltaY, left: event.deltaX })
      }
    }

    onWheel?.(event)
  }

  return (
    <input
      type={type}
      data-slot="input"
      onWheel={handleWheel}
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
