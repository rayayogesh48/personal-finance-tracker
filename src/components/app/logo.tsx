import { cn } from '@/lib/utils'

export const APP_NAME = 'My Ullu'

/** The My Ullu owl. Decorative next to the name; pass `alt` when used on its own. */
export function Logo({ className, alt = '' }: { className?: string; alt?: string }) {
  return <img src="/brand/logo.png" width={256} height={256} alt={alt} draggable={false} className={cn('size-8 shrink-0 object-contain select-none', className)} />
}
