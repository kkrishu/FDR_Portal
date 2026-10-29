// Jest setup file for frontend
import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfills for jsdom
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-auth/react
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: null,
    status: 'unauthenticated',
  }),
  signIn: jest.fn(),
  signOut: jest.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock zustand
jest.mock('zustand', () => ({
  create: (fn: any) => fn(set => ({
    ...fn(set),
    set: jest.fn(),
  })),
}));

// Mock @tanstack/react-query
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  QueryClient: jest.fn().mockImplementation(() => ({
    getQueryCache: jest.fn(),
    getMutationCache: jest.fn(),
  })),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock sonner
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    loading: jest.fn(),
    dismiss: jest.fn(),
  },
  Toaster: () => null,
}));

// Mock lucide-react icons (exported as React components)
jest.mock('lucide-react', () => {
  const iconNames = [
    'Shield', 'Building2', 'Users', 'Lock', 'ArrowRight', 'CheckCircle',
    'Plus', 'FileText', 'Clock', 'AlertTriangle', 'TrendingUp', 'Eye',
    'EyeOff', 'Loader2', 'Menu', 'X', 'ChevronLeft', 'ChevronRight',
    'Bell', 'Settings', 'User', 'LogOut', 'BarChart3', 'RefreshCw',
  ];

  const mockIcons: Record<string, unknown> = {};
  for (const name of iconNames) {
    mockIcons[name] = ({ className }: { className?: string }) => (
      <svg className={className} data-testid={`icon-${name.toLowerCase()}`} />
    );
  }

  return mockIcons;
});

// Suppress console errors in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});