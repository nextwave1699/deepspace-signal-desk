import React, { ReactNode, JSX } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader as DHeader,
  DialogTitle as DTitle,
  DialogDescription as DDescription,
  DialogFooter as DFooter,
} from './Dialog'
import { Button } from './Button'
import { cn } from '@/lib/utils'

interface ModalProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  open: boolean
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

// Give every Modal a <Modal.Title> or aria-label so it has an accessible name.
export function Modal({
  open,
  onClose,
  children,
  size = 'md',
  className,
  ...props
}: ModalProps): JSX.Element {
  const sizes = {
    sm: 'max-w-[calc(100vw-2rem)] sm:max-w-sm',
    md: 'max-w-[calc(100vw-2rem)] sm:max-w-lg',
    lg: 'max-w-[calc(100vw-2rem)] sm:max-w-2xl',
    xl: 'max-w-[calc(100vw-2rem)] sm:max-w-4xl',
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(sizes[size], 'flex flex-col max-h-[85vh]', className)}
        {...props}
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}

interface ModalHeaderProps {
  children: ReactNode
  className?: string
}

function ModalHeader({ children, className = '' }: ModalHeaderProps): JSX.Element {
  return (
    <DHeader className={className}>
      {children}
    </DHeader>
  )
}

interface ModalTitleProps {
  children: ReactNode
  className?: string
}

function ModalTitle({ children, className = '' }: ModalTitleProps): JSX.Element {
  return (
    <DTitle className={cn('min-w-0 truncate', className)}>
      {children}
    </DTitle>
  )
}

interface ModalDescriptionProps {
  children: ReactNode
  className?: string
}

function ModalDescription({ children, className = '' }: ModalDescriptionProps): JSX.Element {
  return (
    <DDescription className={className}>
      {children}
    </DDescription>
  )
}

interface ModalBodyProps {
  children: ReactNode
  className?: string
}

function ModalBody({ children, className = '' }: ModalBodyProps): JSX.Element {
  // px-1 -mx-1 leaves room for input focus rings without shifting alignment.
  return (
    <div className={cn('flex-1 overflow-y-auto -mx-1 px-1 py-4 break-words', className)}>
      {children}
    </div>
  )
}

interface ModalFooterProps {
  children: ReactNode
  className?: string
}

function ModalFooter({ children, className = '' }: ModalFooterProps): JSX.Element {
  return (
    <DFooter className={className}>
      {children}
    </DFooter>
  )
}

interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'destructive' | 'default'
  loading?: boolean
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'destructive',
  loading = false,
}: ConfirmModalProps): JSX.Element {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <Modal.Header>
        <Modal.Title>{title}</Modal.Title>
        {description && <Modal.Description>{description}</Modal.Description>}
      </Modal.Header>
      <Modal.Footer>
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          {cancelText}
        </Button>
        <Button variant={variant} onClick={onConfirm} loading={loading}>
          {confirmText}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

Modal.Header = ModalHeader
Modal.Title = ModalTitle
Modal.Description = ModalDescription
Modal.Body = ModalBody
Modal.Footer = ModalFooter

export default Modal
