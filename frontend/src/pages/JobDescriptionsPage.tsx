import { JobDescriptionList } from '@/components/jobs/JobDescriptionList';

export function JobDescriptionsPage() {
  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-text-primary">Job Descriptions</h1>
      <JobDescriptionList />
    </div>
  );
}
