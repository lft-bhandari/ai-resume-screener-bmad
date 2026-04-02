import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ResumeUploadModal } from '@/components/analysis/ResumeUploadModal';
import { StreamingAnalysisView } from '@/components/analysis/StreamingAnalysisView';
import { useAuth } from '@/hooks/useAuth';

interface ActiveAnalysis {
  id: number;
  candidateName: string;
}

export function AnalysisPage() {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState<ActiveAnalysis | null>(
    null,
  );

  const handleSuccess = (analysisId: number, candidateName: string) => {
    setModalOpen(false);
    setActiveAnalysis({ id: analysisId, candidateName });
  };

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-text-primary">Analysis</h1>

      {!activeAnalysis ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-text-secondary">
            Upload a resume against a job description to begin a new AI
            analysis.
          </p>
          <Button
            className="border-transparent bg-[#038E43] text-white hover:bg-[#2AA764]"
            onClick={() => setModalOpen(true)}
          >
            Analyse Resume
          </Button>
        </div>
      ) : (
        <>
          <Button
            variant="ghost"
            className="mb-4 text-text-secondary"
            onClick={() => setActiveAnalysis(null)}
          >
            ← New Analysis
          </Button>
          <StreamingAnalysisView
            analysisId={activeAnalysis.id}
            candidateName={activeAnalysis.candidateName}
            token={user?.token ?? ''}
          />
        </>
      )}

      <ResumeUploadModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
