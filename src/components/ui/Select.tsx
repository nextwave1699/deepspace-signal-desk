import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

const SelectGroup = SelectPrimitive.Group

/**
 * Builds Base UI's value→label map from inline <SelectItem> children so the
 * closed trigger shows labels. Items rendered by a wrapper component are not
 * visible here; pass `items` explicitly in that case. '' means no selection.
 */
function collectItems(node: React.ReactNode, acc: Record<string, React.ReactNode>): Record<string, React.ReactNode> {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement(child)) return
    const props = child.props as { value?: string; children?: React.ReactNode }
    if (child.type === SelectItem && props.value !== undefined) {
      acc[props.value] = props.children
    } else if (props.children) {
      collectItems(props.children, acc)
    }
  })
  return acc
}

function Select({
  value,
  defaultValue,
  onValueChange,
  children,
  items,
  ...props
}: Omit<SelectPrimitive.Root.Props<string, false>, 'value' | 'defaultValue' | 'onValueChange' | 'multiple'> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}) {
  const derivedItems = React.useMemo(() => items ?? collectItems(children, {}), [items, children])
  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      items={derivedItems}
      onValueChange={(next) => onValueChange?.((next as string | null) ?? '')}
      {...props}
    >
      {children}
    </SelectPrimitive.Root>
  )
}

function SelectValue({
  placeholder,
  className,
  ...props
}: SelectPrimitive.Value.Props & { placeholder?: React.ReactNode }) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      render={(_, { value }) =>
        value === null || value === undefined || value === '' ? (
          <span data-slot="select-value" className={cn('text-muted-foreground', className)}>
            {placeholder}
          </span>
        ) : (
          <SelectPrimitive.Value className={className} {...props} />
        )
      }
    />
  )
}

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "border-input data-[popup-open]:border-ring focus-visible:border-ring focus-visible:ring-ring/50 flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-sm transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:min-w-0 [&>span]:flex-1 [&>span]:text-left [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon className="size-4 shrink-0 opacity-50" />} />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = 'bottom',
  align = 'start',
  sideOffset = 6,
  ...props
}: SelectPrimitive.Popup.Props & {
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        data-slot="select-positioner"
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignItemWithTrigger={false}
        className="z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            'bg-popover text-popover-foreground relative z-50 max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-lg border border-border p-1 shadow-md',
            'data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
            className,
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="select-label"
      className={cn('text-muted-foreground px-2 py-1.5 text-xs font-semibold', className)}
      {...props}
    />
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default select-none items-center gap-2 rounded-md py-2 pl-2 pr-8 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('bg-border pointer-events-none -mx-1 my-1 h-px', className)}
      {...props}
    />
  )
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
}
