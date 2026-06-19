/**
 * Data Sanitization Utilities
 * Ensures all data passed to client components is serializable (no Date objects, etc.)
 */

export function sanitizeActivity(activity: any) {
  return {
    id: activity.id,
    type: activity.type || '',
    title: activity.title || '',
    description: activity.description || '',
    date: activity.date
      ? typeof activity.date === 'string'
        ? activity.date.split('T')[0]
        : new Date(activity.date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    createdAt: activity.createdAt
      ? typeof activity.createdAt === 'string'
        ? activity.createdAt
        : new Date(activity.createdAt).toISOString()
      : undefined,
  };
}

export function sanitizeActivities(activities: any[]) {
  return activities.map(sanitizeActivity);
}

export function sanitizeJob(job: any) {
  return {
    id: job.id,
    title: job.title || '',
    company: job.company || '',
    location: job.location || '',
    description: job.description || '',
    salaryRange: job.salaryRange || '',
    employmentType: job.employmentType || 'Full-time',
    status: job.status || 'Open',
    companyId: job.companyId || undefined,
    createdAt: job.createdAt
      ? typeof job.createdAt === 'string'
        ? job.createdAt
        : new Date(job.createdAt).toISOString()
      : undefined,
  };
}

export function sanitizeJobs(jobs: any[]) {
  return jobs.map(sanitizeJob);
}
