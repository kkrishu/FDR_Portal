'use client';

/**
 * Sidebar — the shadcn/ui sidebar block.
 *
 * Persistent rail with a cookie-backed open state, ⌘/Ctrl+B toggle, a mobile
 * Sheet drawer, collapsible groups, and tooltips when collapsed. Application
 * code composes `SidebarHeader` / `SidebarContent` / `SidebarGroup` /
 * `SidebarMenu` from here rather than re-implementing an `<aside>`.
 */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';

const SIDEBAR_COOKIE_NAME = 'sidebar:state';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = '16.5rem';
const SIDEBAR_WIDTH_MOBILE = '18rem';
const SIDEBAR_WIDTH_ICON = '4.25rem';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

type SidebarContextValue = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }
  return context;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return isMobile;
}

export interface SidebarProviderProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const SidebarProvider = React.forwardRef<HTMLDivElement, SidebarProviderProps>(
  ({ defaultOpen = true, open: openProp, onOpenChange, className, children, ...props }, ref) => {
    const isMobile = useIsMobile();
    const [openMobile, setOpenMobile] = React.useState(false);
    const [openState, setOpenState] = React.useState(defaultOpen);
    const open = openProp ?? openState;

    const setOpen = React.useCallback(
      (value: boolean) => {
        if (onOpenChange) onOpenChange(value);
        else setOpenState(value);
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
      },
      [onOpenChange]
    );

    const toggleSidebar = React.useCallback(
      () => (isMobile ? setOpenMobile((value) => !value) : setOpen(!open)),
      [isMobile, setOpen, open]
    );

    // ⌘B / Ctrl+B, matching every other editor and dashboard the user knows.
    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          toggleSidebar();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleSidebar]);

    const context = React.useMemo<SidebarContextValue>(
      () => ({
        state: open ? 'expanded' : 'collapsed',
        open,
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile,
        toggleSidebar,
      }),
      [open, setOpen, openMobile, isMobile, toggleSidebar]
    );

    return (
      <SidebarContext.Provider value={context}>
        <TooltipProvider delayDuration={120}>
          <div
            ref={ref}
            style={
              {
                '--sidebar-width': SIDEBAR_WIDTH,
                '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
              } as React.CSSProperties
            }
            className={cn('group/sidebar-wrapper flex min-h-svh w-full', className)}
            {...props}
          >
            {children}
          </div>
        </TooltipProvider>
      </SidebarContext.Provider>
    );
  }
);
SidebarProvider.displayName = 'SidebarProvider';

export interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'left' | 'right';
  variant?: 'sidebar' | 'floating' | 'inset';
  collapsible?: 'offcanvas' | 'icon' | 'none';
}

export const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(
  (
    { side = 'left', variant = 'sidebar', collapsible = 'icon', className, children, ...props },
    ref
  ) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

    if (collapsible === 'none') {
      return (
        <div
          ref={ref}
          className={cn(
            'bg-sidebar text-sidebar-foreground flex h-full w-[--sidebar-width] flex-col',
            className
          )}
          {...props}
        >
          {children}
        </div>
      );
    }

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
          <SheetContent
            data-sidebar="sidebar"
            data-mobile="true"
            className="bg-sidebar text-sidebar-foreground w-[--sidebar-width] p-0 [&>button]:hidden"
            style={{ '--sidebar-width': SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}
            side={side}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription>Portal sections for your role</SheetDescription>
            </SheetHeader>
            <div className="flex h-full w-full flex-col">{children}</div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <div
        ref={ref}
        className="text-sidebar-foreground group peer hidden lg:block"
        data-state={state}
        data-collapsible={state === 'collapsed' ? collapsible : ''}
        data-variant={variant}
        data-side={side}
      >
        {/* Reserves layout width so content does not shift while the rail animates. */}
        <div
          className={cn(
            'relative w-[--sidebar-width] bg-transparent transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
            'group-data-[collapsible=offcanvas]:w-0',
            'group-data-[side=right]:rotate-180',
            variant === 'floating' || variant === 'inset'
              ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]'
              : 'group-data-[collapsible=icon]:w-[--sidebar-width-icon]'
          )}
        />
        <div
          className={cn(
            'fixed inset-y-0 z-30 hidden h-svh w-[--sidebar-width] transition-[left,right,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:flex',
            side === 'left'
              ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
              : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
            variant === 'floating' || variant === 'inset'
              ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)]'
              : 'group-data-[collapsible=icon]:w-[--sidebar-width-icon] group-data-[side=left]:border-r group-data-[side=right]:border-l',
            className
          )}
          {...props}
        >
          <div
            data-sidebar="sidebar"
            className="bg-sidebar flex h-full w-full flex-col group-data-[variant=floating]:rounded-xl group-data-[variant=floating]:border group-data-[variant=floating]:shadow-lg"
          >
            {children}
          </div>
        </div>
      </div>
    );
  }
);
Sidebar.displayName = 'Sidebar';

export const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      className={cn('h-9 w-9', className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeft className="h-[18px] w-[18px]" />
      <span className="sr-only">Toggle navigation</span>
    </Button>
  );
});
SidebarTrigger.displayName = 'SidebarTrigger';

export const SidebarRail = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
  ({ className, ...props }, ref) => {
    const { toggleSidebar } = useSidebar();

    return (
      <button
        ref={ref}
        data-sidebar="rail"
        aria-label="Toggle navigation"
        tabIndex={-1}
        onClick={toggleSidebar}
        title="Toggle navigation"
        className={cn(
          'hover:after:bg-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex',
          '[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize',
          '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
          'group-data-[collapsible=offcanvas]:hover:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full',
          '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
          '[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
          className
        )}
        {...props}
      />
    );
  }
);
SidebarRail.displayName = 'SidebarRail';

export const SidebarInset = React.forwardRef<HTMLDivElement, React.ComponentProps<'main'>>(
  ({ className, ...props }, ref) => (
    <main
      ref={ref}
      // min-w-0 lets the inset shrink below its content's intrinsic width —
      // without it, any wide child (tabs, tables) drags the whole shell past
      // the viewport on phones.
      className={cn('bg-background relative flex min-h-svh min-w-0 flex-1 flex-col', className)}
      {...props}
    />
  )
);
SidebarInset.displayName = 'SidebarInset';

export const SidebarInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      data-sidebar="input"
      className={cn(
        'border-input bg-background focus-visible:ring-ring h-8 w-full rounded-md border px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2',
        className
      )}
      {...props}
    />
  )
);
SidebarInput.displayName = 'SidebarInput';

export const SidebarHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="header"
      className={cn('flex flex-col gap-2 p-3', className)}
      {...props}
    />
  )
);
SidebarHeader.displayName = 'SidebarHeader';

export const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="footer"
      className={cn('flex flex-col gap-2 p-3', className)}
      {...props}
    />
  )
);
SidebarFooter.displayName = 'SidebarFooter';

export const SidebarSeparator = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="separator"
      className={cn('bg-border mx-3 h-px', className)}
      {...props}
    />
  )
);
SidebarSeparator.displayName = 'SidebarSeparator';

export const SidebarContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="content"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden',
        'group-data-[collapsible=icon]:overflow-hidden',
        className
      )}
      {...props}
    />
  )
);
SidebarContent.displayName = 'SidebarContent';

export const SidebarGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="group"
      className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
      {...props}
    />
  )
);
SidebarGroup.displayName = 'SidebarGroup';

export const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="group-label"
      className={cn(
        'text-muted-foreground flex h-8 shrink-0 items-center rounded-md px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-[margin,opacity] duration-200 ease-linear',
        'group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
        className
      )}
      {...props}
    />
  )
);
SidebarGroupLabel.displayName = 'SidebarGroupLabel';

export const SidebarGroupAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    data-sidebar="group-action"
    className={cn(
      'text-foreground hover:bg-accent hover:text-accent-foreground absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 transition-transform focus-visible:outline-none focus-visible:ring-2',
      'after:absolute after:-inset-2 group-data-[collapsible=icon]:hidden',
      className
    )}
    {...props}
  />
));
SidebarGroupAction.displayName = 'SidebarGroupAction';

export const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="group-content"
      className={cn('w-full text-sm', className)}
      {...props}
    />
  )
);
SidebarGroupContent.displayName = 'SidebarGroupContent';

export const SidebarMenu = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      data-sidebar="menu"
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      {...props}
    />
  )
);
SidebarMenu.displayName = 'SidebarMenu';

export const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
  ({ className, ...props }, ref) => (
    <li
      ref={ref}
      data-sidebar="menu-item"
      className={cn('group/menu-item relative', className)}
      {...props}
    />
  )
);
SidebarMenuItem.displayName = 'SidebarMenuItem';

const sidebarMenuButtonVariants = cva(
  'peer/menu-button ring-ring flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-2.5 py-2 text-left text-[13px] font-medium outline-none transition-[width,height,padding,background-color,color] duration-200 focus-visible:ring-2 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-2 [&>span:last-child]:truncate [&>svg]:size-[18px] [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'hover:bg-accent hover:text-accent-foreground',
        outline: 'bg-background border hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9',
        sm: 'h-8 text-xs',
        lg: 'h-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface SidebarMenuButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof sidebarMenuButtonVariants> {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string;
}

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  (
    {
      asChild = false,
      isActive = false,
      variant = 'default',
      size = 'default',
      tooltip,
      className,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    const { isMobile, state } = useSidebar();

    const button = (
      <Comp
        ref={ref}
        data-sidebar="menu-button"
        data-size={size}
        data-active={isActive}
        className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
        {...props}
      />
    );

    if (!tooltip) return button;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" align="center" hidden={state !== 'collapsed' || isMobile}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  }
);
SidebarMenuButton.displayName = 'SidebarMenuButton';

export const SidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> & { showOnHover?: boolean }
>(({ className, showOnHover = false, ...props }, ref) => (
  <button
    ref={ref}
    data-sidebar="menu-action"
    className={cn(
      'text-foreground ring-ring hover:bg-accent hover:text-accent-foreground absolute right-1.5 top-1.5 flex aspect-square w-6 items-center justify-center rounded-md p-0 outline-none transition-transform focus-visible:ring-2',
      'after:absolute after:-inset-2 group-data-[collapsible=icon]:hidden',
      showOnHover &&
        'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0',
      className
    )}
    {...props}
  />
));
SidebarMenuAction.displayName = 'SidebarMenuAction';

export const SidebarMenuBadge = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="menu-badge"
      className={cn(
        'text-muted-foreground pointer-events-none absolute right-2 flex h-5 min-w-5 select-none items-center justify-center rounded-md px-1 text-[11px] font-semibold tabular-nums',
        'peer-data-[size=default]/menu-button:top-2 peer-data-[size=sm]/menu-button:top-1.5',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  )
);
SidebarMenuBadge.displayName = 'SidebarMenuBadge';

export const SidebarMenuSkeleton = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & { showIcon?: boolean }
>(({ className, showIcon = false, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="menu-skeleton"
    className={cn('flex h-9 items-center gap-2 rounded-lg px-2.5', className)}
    {...props}
  >
    {showIcon && <Skeleton className="size-[18px] rounded-md" />}
    <Skeleton className="h-3 flex-1" />
  </div>
));
SidebarMenuSkeleton.displayName = 'SidebarMenuSkeleton';

export const SidebarMenuSub = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(
  ({ className, ...props }, ref) => (
    <ul
      ref={ref}
      data-sidebar="menu-sub"
      className={cn(
        'border-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  )
);
SidebarMenuSub.displayName = 'SidebarMenuSub';

export const SidebarMenuSubItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
  ({ ...props }, ref) => <li ref={ref} {...props} />
);
SidebarMenuSubItem.displayName = 'SidebarMenuSubItem';

export const SidebarMenuSubButton = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<'a'> & { asChild?: boolean; size?: 'sm' | 'md'; isActive?: boolean }
>(({ asChild = false, size = 'md', isActive, className, ...props }, ref) => {
  const Comp = asChild ? Slot : 'a';

  return (
    <Comp
      ref={ref}
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        'text-foreground ring-ring hover:bg-accent hover:text-accent-foreground flex h-8 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
        'data-[active=true]:bg-accent data-[active=true]:font-medium',
        size === 'sm' && 'text-xs',
        size === 'md' && 'text-sm',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      {...props}
    />
  );
});
SidebarMenuSubButton.displayName = 'SidebarMenuSubButton';

export { SIDEBAR_COOKIE_NAME, SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON, SIDEBAR_KEYBOARD_SHORTCUT };
