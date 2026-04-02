import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createUserApi, deleteUserApi, listUsersApi } from '@/api/users';
import { useAuth } from '@/hooks/useAuth';
import type { User, UserCreate, UserListResponse } from '@/types/admin';

export function UserManagement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'recruiter' | 'interviewer'>('recruiter');
  const [formError, setFormError] = useState<string | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Fetch users
  const { data, isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsersApi(user!.token),
    enabled: !!user,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: UserCreate) => createUserApi(user!.token, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setDialogOpen(false);
      resetForm();
      showToast('User created', 'success');
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  // Delete mutation (optimistic)
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUserApi(user!.token, id),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ['users'] });
      const previousData = queryClient.getQueryData<UserListResponse>(['users']);
      queryClient.setQueryData<UserListResponse>(['users'], (old) => {
        if (!old) return old;
        const newItems = old.items.filter((u: User) => u.id !== id);
        return { items: newItems };
      });
      return { previousData };
    },
    onError: (_err, _id, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['users'], context.previousData);
      }
      showToast('Failed to delete user', 'error');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setRole('recruiter');
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    await createMutation.mutateAsync({ email, password, role });
  };

  const handleCancel = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!createMutation.isPending) {
      setDialogOpen(open);
      if (!open) resetForm();
    }
  };

  return (
    <div className="relative">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-[#333333]">
          {data ? `${data.items.length} user${data.items.length !== 1 ? 's' : ''}` : ''}
        </p>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-[#038E43] text-white hover:bg-[#038E43]/90"
        >
          <PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />
          Add User
        </Button>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div aria-label="Loading users" className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-14 animate-pulse rounded-md bg-[#D9D9D9]"
              aria-hidden="true"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <p className="text-sm text-amber-700">Failed to load users. Please refresh.</p>
      )}

      {/* Empty state */}
      {!isLoading && !isError && data?.items.length === 0 && (
        <p className="text-sm text-[#333333]">No users found.</p>
      )}

      {/* Users table */}
      {!isLoading && !isError && data && data.items.length > 0 && (
        <div className="overflow-hidden rounded-md border border-[#D9D9D9]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#D9D9D9] bg-[#D9D9D9]/30">
                <th className="px-4 py-3 text-left font-medium text-[#333333]">Email</th>
                <th className="px-4 py-3 text-left font-medium text-[#333333]">Role</th>
                <th className="px-4 py-3 text-left font-medium text-[#333333]">Created Date</th>
                <th className="px-4 py-3 text-right font-medium text-[#333333]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9D9D9]">
              {data.items.map((u: User) => (
                <tr key={u.id} className="bg-white hover:bg-[#D9D9D9]/10">
                  <td className="px-4 py-3 text-[#111111]">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        u.role === 'admin'
                          ? 'bg-[#038E43]/10 text-[#038E43]'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#333333]">
                    {new Date(u.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border border-gray-300 text-gray-500 hover:bg-gray-50"
                      onClick={() => deleteMutation.mutate(u.id)}
                      disabled={deleteMutation.isPending}
                      aria-label={`Delete user ${u.email}`}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add User dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-[560px]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 pt-2">
            <div>
              <label
                htmlFor="user-email"
                className="mb-1 block text-sm font-medium text-[#333333]"
              >
                Email
              </label>
              <input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-[#111111] outline-none focus-visible:ring-2 focus-visible:ring-[#038E43] focus-visible:border-[#038E43]"
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label
                htmlFor="user-password"
                className="mb-1 block text-sm font-medium text-[#333333]"
              >
                Password
              </label>
              <input
                id="user-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-[#111111] outline-none focus-visible:ring-2 focus-visible:ring-[#038E43] focus-visible:border-[#038E43]"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label
                htmlFor="user-role"
                className="mb-1 block text-sm font-medium text-[#333333]"
              >
                Role
              </label>
              <select
                id="user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'recruiter' | 'interviewer')}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-[#111111] outline-none focus-visible:ring-2 focus-visible:ring-[#038E43] focus-visible:border-[#038E43]"
              >
                <option value="recruiter">recruiter</option>
                <option value="interviewer">interviewer</option>
              </select>
            </div>
            {formError && (
              <p className="text-sm text-amber-700" role="alert">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-[#038E43] text-white hover:bg-[#038E43]/90"
              >
                {createMutation.isPending ? 'Creating…' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Toast notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-md text-sm font-medium shadow-md ${
            toast.type === 'success'
              ? 'bg-[#111111] text-white'
              : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
