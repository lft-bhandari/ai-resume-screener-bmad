import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listJobDescriptionsApi } from '@/api/job_descriptions';
import type { JDSelectorValue } from '@/types/analysis';

interface JDSelectorProps {
  token: string;
  value: JDSelectorValue | null;
  onChange: (value: JDSelectorValue | null) => void;
}

export function JDSelector({ token, value, onChange }: JDSelectorProps) {
  const [tab, setTab] = useState<'library' | 'paste'>('library');
  const [pasteContent, setPasteContent] = useState('');
  const [saveJd, setSaveJd] = useState(false);
  const [jdTitle, setJdTitle] = useState('');

  const { data: jdList, isLoading: jdLoading } = useQuery({
    queryKey: ['job_descriptions'],
    queryFn: () => listJobDescriptionsApi(token),
    enabled: !!token && tab === 'library',
  });

  const handleTabChange = (newTab: 'library' | 'paste') => {
    setTab(newTab);
    onChange(null); // Reset value on tab change
  };

  const handleLibrarySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = parseInt(e.target.value, 10);
    if (isNaN(id)) {
      onChange(null);
      return;
    }
    onChange({ type: 'library', jd_id: id });
  };

  const handlePasteChange = (content: string) => {
    setPasteContent(content);
    if (content.trim()) {
      onChange({
        type: 'paste',
        jd_content: content,
        save_jd: saveJd,
        jd_title: saveJd ? jdTitle : undefined,
      });
    } else {
      onChange(null);
    }
  };

  const handleSaveJdChange = (checked: boolean) => {
    setSaveJd(checked);
    if (pasteContent.trim()) {
      onChange({
        type: 'paste',
        jd_content: pasteContent,
        save_jd: checked,
        jd_title: checked ? jdTitle : undefined,
      });
    }
  };

  // Suppress unused value warning — external state tracking
  void value;

  return (
    <div>
      <p className="mb-1 block text-sm font-medium text-text-primary">
        Job Description
      </p>
      {/* Tab bar */}
      <div className="mb-2 flex overflow-hidden rounded-md border border-border">
        {(['library', 'paste'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleTabChange(t)}
            className={[
              'flex-1 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#038E43]',
              tab === t
                ? 'bg-[#038E43] text-white'
                : 'text-text-secondary hover:bg-surface',
            ].join(' ')}
          >
            {t === 'library' ? 'Select from library' : 'Paste new JD'}
          </button>
        ))}
      </div>
      {/* Library tab */}
      {tab === 'library' && (
        <select
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-[#038E43] focus:border-[#038E43] disabled:opacity-50"
          onChange={handleLibrarySelect}
          defaultValue=""
          disabled={jdLoading}
          aria-label="Select a saved job description"
        >
          <option value="" disabled>
            {jdLoading ? 'Loading…' : 'Select a Job Description…'}
          </option>
          {jdList?.items.map((jd) => (
            <option key={jd.id} value={jd.id}>
              {jd.title}
            </option>
          ))}
        </select>
      )}
      {/* Paste tab */}
      {tab === 'paste' && (
        <div className="space-y-2">
          <textarea
            rows={4}
            value={pasteContent}
            onChange={(e) => handlePasteChange(e.target.value)}
            placeholder="Paste the full job description here..."
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-[#038E43] focus:border-[#038E43]"
            aria-label="Paste job description content"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={saveJd}
              onChange={(e) => handleSaveJdChange(e.target.checked)}
              className="rounded border-border accent-[#038E43]"
            />
            Save to library
          </label>
          {saveJd && (
            <input
              type="text"
              value={jdTitle}
              onChange={(e) => {
                setJdTitle(e.target.value);
                if (pasteContent.trim()) {
                  onChange({
                    type: 'paste',
                    jd_content: pasteContent,
                    save_jd: true,
                    jd_title: e.target.value,
                  });
                }
              }}
              placeholder="Job description title (e.g. Senior Backend Engineer)"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-[#038E43] focus:border-[#038E43]"
              aria-label="Job description title"
            />
          )}
        </div>
      )}
    </div>
  );
}
