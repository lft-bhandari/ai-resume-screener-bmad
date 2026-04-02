import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { JobDescription, JobDescriptionCreate } from '@/types/job_description';

interface JobDescriptionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: JobDescription | null;
  onSubmit: (data: JobDescriptionCreate) => Promise<void>;
  isLoading: boolean;
}

export function JobDescriptionForm({
  open,
  onOpenChange,
  initialValues,
  onSubmit,
  isLoading,
}: JobDescriptionFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  // Reset or pre-populate when dialog opens or initialValues changes
  useEffect(() => {
    if (open) {
      setTitle(initialValues?.title ?? '');
      setContent(initialValues?.content ?? '');
    }
  }, [open, initialValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ title, content });
  };

  const handleCancel = () => {
    onOpenChange(false);
    setTitle('');
    setContent('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {initialValues ? 'Edit Job Description' : 'New Job Description'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 pt-2">
          {/* Title field — label above per UX-DR13 pattern */}
          <div>
            <label
              htmlFor="jd-title"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Title
            </label>
            <input
              id="jd-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-[#038E43] focus:border-[#038E43]"
              placeholder="e.g. Senior Backend Engineer"
            />
          </div>
          {/* Content textarea — min 3 rows, resize vertical */}
          <div>
            <label
              htmlFor="jd-content"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Content
            </label>
            <textarea
              id="jd-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={3}
              className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-[#038E43] focus:border-[#038E43]"
              placeholder="Paste the full job description here..."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !title.trim() || !content.trim()}>
              {isLoading ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
