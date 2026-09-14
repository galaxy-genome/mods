import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import * as React from 'react'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

export interface SwipeAction {
  label: string
  icon: React.ReactNode
  tone: 'cyan' | 'danger' | 'amber'
  onAction: () => void
}

const ACTION_W = 76

/** Swipe left to reveal actions. The same actions must also exist in the row's menu. */
export function SwipeRow({ actions, children, className, disabled }: { actions: SwipeAction[]; children: React.ReactNode; className?: string; disabled?: boolean }) {
  const x = useMotionValue(0)
  const width = actions.length * ACTION_W
  const reveal = useTransform(x, [-width, 0], [1, 0])
  const close = () => animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 })
  return (
    <div className={cn('relative overflow-hidden rounded-[4px]', className)}>
      <motion.div style={{ opacity: reveal }} className="absolute inset-y-0 right-0 flex" aria-hidden>
        {actions.map((a) => (
          <button
            key={a.label}
            tabIndex={-1}
            onClick={() => { close(); a.onAction() }}
            className={cn(
              'flex flex-col items-center justify-center gap-1 text-[11px] font-semibold [&_svg]:size-5',
              a.tone === 'danger' ? 'bg-danger/20 text-danger' : a.tone === 'amber' ? 'bg-amber/15 text-amber' : 'bg-cyan/15 text-cyan',
            )}
            style={{ width: ACTION_W }}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </motion.div>
      <motion.div
        drag={disabled ? false : 'x'}
        dragDirectionLock
        dragConstraints={{ left: -width, right: 0 }}
        dragElastic={{ left: 0.08, right: 0 }}
        style={{ x }}
        onDragEnd={(_, info) => {
          const open = info.offset.x < -width / 2 || info.velocity.x < -400
          animate(x, open ? -width : 0, { type: 'spring', stiffness: 500, damping: 40 })
        }}
        className="relative touch-pan-y bg-void"
      >
        {children}
      </motion.div>
    </div>
  )
}

/** Vertical drag-to-reorder. Long-press on touch, grab the handle with a mouse, arrows with the keyboard. */
export function SortableList<T extends { id: string }>({ items, onReorder, render, className }: {
  items: T[]
  onReorder: (items: T[]) => void
  render: (item: T, handle: React.ReactNode, index: number) => React.ReactNode
  className?: string
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = items.findIndex((i) => i.id === e.active.id)
    const to = items.findIndex((i) => i.id === e.over!.id)
    navigator.vibrate?.(10)
    onReorder(arrayMove(items, from, to))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item, i) => (
            <SortableItem key={item.id} id={item.id}>
              {(handle) => render(item, handle, i)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableItem({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const handle = (
    <button {...attributes} {...listeners} aria-label={t('ui.dragToReorder')} className="grid size-11 shrink-0 cursor-grab touch-none place-items-center text-dim active:cursor-grabbing">
      <GripVertical className="size-5" />
    </button>
  )
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-90 [&>*]:border-cyan')}
    >
      {children(handle)}
    </div>
  )
}
