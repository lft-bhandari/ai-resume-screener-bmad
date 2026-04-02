import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { JDSelector } from './JDSelector';
import { initiateAnalysisApi } from '@/api/analyses';
import { useAuth } from '@/hooks/useAuth';
import type { JDSelectorValue } from '@/types/analysis';

interface ResumeUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (analysisId: number, candidateName: string) => void;
}

export function ResumeUploadModal({
  open,
  onOpenChange,
  onSuccess,
}: ResumeUploadModalProps) {
  const { user } = useAuth();
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jdValue, setJdValue] = useState<JDSelectorValue | null>(null);
  const [candidateName, setCandidateName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid =
    !!resumeFile && !!jdValue && candidateName.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !user) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('resume', resumeFile!);
      formData.append('candidate_name', candidateName.trim());
      if (jdValue!.type === 'library') {
        formData.append('jd_id', String(jdValue!.jd_id));
      } else {
        formData.append('jd_content', jdValue!.jd_content);
        formData.append('save_jd', String(jdValue!.save_jd));
        if (jdValue!.jd_title) formData.append('jd_title', jdValue!.jd_title);
      }
      const response = await initiateAnalysisApi(user.token, formData);
      // Reset before calling onSuccess so modal state is clean
      resetForm();
      onSuccess(response.analysis_id, candidateName.trim());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Upload failed. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setResumeFile(null);
    setJdValue(null);
    setCandidateName('');
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return;
    if (!next) resetForm();
    onOpenChange(next);
  };

  return (
    // Guard in handleOpenChange prevents accidental close during upload (UX-DR12)
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent
        className="w-full max-w-[560px]"
        showCloseButton={!isSubmitting}
      >
        <DialogHeader>
          <DialogTitle>Analyse Resume</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-4 pt-2"
        >
          {/* Two-column: PDF upload + JD selector (UX-DR12) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* PDF file input */}
            <div>
              <label
                htmlFor="resume-file"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Resume (PDF or DOCX)
              </label>
              <input
                id="resume-file"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                required
                onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-primary outline-none focus:ring-2 focus:ring-[#038E43] file:mr-3 file:rounded file:border-0 file:bg-surface file:px-2 file:py-1 file:text-xs file:font-medium file:text-text-primary"
              />
            </div>
            {/* JD selector */}
            <JDSelector
              token={user?.token ?? ''}
              value={jdValue}
              onChange={setJdValue}
            />
          </div>
          {/* Candidate name — full width */}
          <div>
            <label
              htmlFor="candidate-name"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Candidate Name
            </label>
            <input
              id="candidate-name"
              type="text"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              required
              placeholder="e.g. Jane Smith"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-[#038E43] focus:border-[#038E43]"
            />
          </div>
          {/* Inline error */}
          {error && (
            <p className="text-sm text-[#b45309]" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="border-transparent bg-[#038E43] text-white hover:bg-[#2AA764]"
            >
              {isSubmitting ? 'Uploading…' : 'Analyse Resume →'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
