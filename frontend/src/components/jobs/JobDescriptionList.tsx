import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  createJobDescriptionApi,
  deleteJobDescriptionApi,
  listJobDescriptionsApi,
  updateJobDescriptionApi,
} from '@/api/job_descriptions';
import { useAuth } from '@/hooks/useAuth';
import type {
  JobDescription,
  JobDescriptionCreate,
  JobDescriptionListResponse,
} from '@/types/job_description';
import { JobDescriptionForm } from './JobDescriptionForm';

export function JobDescriptionList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<JobDescription | null>(null);

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

  // Fetch JDs
  const { data, isLoading, isError } = useQuery({
    queryKey: ['job_descriptions'],
    queryFn: () => listJobDescriptionsApi(user!.token),
    enabled: !!user,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: JobDescriptionCreate) =>
      createJobDescriptionApi(user!.token, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['job_descriptions'] });
      setDialogOpen(false);
      showToast('Job description saved', 'success');
    },
    onError: () => {
      showToast('Failed to save job description', 'error');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; data: JobDescriptionCreate }) =>
      updateJobDescriptionApi(user!.token, payload.id, payload.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['job_descriptions'] });
      setDialogOpen(false);
      setEditTarget(null);
      showToast('Job description saved', 'success');
    },
    onError: () => {
      showToast('Failed to update job description', 'error');
    },
  });

  // Delete mutation (optimistic)
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteJobDescriptionApi(user!.token, id),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ['job_descriptions'] });
      const previousData = queryClient.getQueryData<JobDescriptionListResponse>([
        'job_descriptions',
      ]);
      queryClient.setQueryData<JobDescriptionListResponse>(['job_descriptions'], (old) => {
        if (!old) return old;
        const newItems = old.items.filter((jd) => jd.id !== id);
        return { items: newItems, total: newItems.length };
      });
      return { previousData };
    },
    onError: (_err, _id, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['job_descriptions'], context.previousData);
      }
      showToast('Failed to delete job description', 'error');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['job_descriptions'] });
    },
  });

  const handleSubmit = async (formData: JobDescriptionCreate) => {
    if (editTarget) {
      await updateMutation.mutateAsync({ id: editTarget.id, data: formData });
    } else {
      await createMutation.mutateAsync(formData);
    }
  };

  const handleEdit = (jd: JobDescription) => {
    setEditTarget(jd);
    setDialogOpen(true);
  };

  const handleNewClick = () => {
    setEditTarget(null);
    setDialogOpen(true);
  };

  const isFormLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="relative">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          {data ? `${data.total} saved` : ''}
        </p>
        <Button onClick={handleNewClick}>
          <PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />
          New Job Description
        </Button>
      </div>

      {/* Error state */}
      {isError && (
        <p className="text-sm text-red-600">
          Failed to load job descriptions. Please refresh the page.
        </p>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div aria-label="Loading job descriptions" className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-14 animate-pulse rounded-md bg-surface"
              aria-hidden="true"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && data?.items.length === 0 && (
        <p className="text-sm text-text-secondary">
          No job descriptions saved. Paste one during your next analysis to save it.
        </p>
      )}

      {/* JD list */}
      {!isLoading && data && data.items.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border" role="list">
          {data.items.map((jd) => (
            <li
              key={jd.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-text-primary">{jd.title}</p>
                <p className="text-xs text-text-secondary">
                  {new Date(jd.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${jd.title}`}
                  onClick={() => handleEdit(jd)}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${jd.title}`}
                  onClick={() => deleteMutation.mutate(jd.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Form dialog */}
      <JobDescriptionForm
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditTarget(null);
        }}
        initialValues={editTarget}
        onSubmit={handleSubmit}
        isLoading={isFormLoading}
      />

      {/* Toast notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-md text-sm font-medium shadow-md ${
            toast.type === 'success'
              ? 'bg-[#038E43]/10 text-[#038E43] border border-[#038E43]/30'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
