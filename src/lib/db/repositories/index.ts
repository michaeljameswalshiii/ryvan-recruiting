/**
 * Repository Index
 * 
 * Server-side data access layer exports.
 * All data access MUST go through these repositories.
 * NOTE: Using explicit exports to avoid conflicting star exports:
 * - client-repository and contact-repository both export getPrimaryContact, setPrimaryContact
 * - job-repository and lead-repository both export updateCandidateStageInJob
 * 
 * @serverOnly
 */

// Tenant repository - explicit exports
export {
  getTenantById,
  getTenantBySubdomain,
  getAllTenants,
  createTenant,
  updateTenant,
  deleteTenant,
  verifyUserTenant,
} from './tenant-repository';

// Profile repository - explicit exports
export {
  getProfileById,
  getProfileByEmail,
  getProfilesByTenant,
  createProfile,
  updateProfile,
  deleteProfile,
} from './profile-repository';

// Client repository - explicit exports to avoid conflicts with contact-repository
export {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  addContactToClient,
  updateClientContact,
  removeClientContact,
  setPrimaryContact as setClientPrimaryContact,
  getPrimaryContact as getClientPrimaryContact,
} from './client-repository';

// Contact repository - explicit exports (has getPrimaryContact, setPrimaryContact)
export {
  getContactsForCompany,
  getContactById,
  getPrimaryContact as getCompanyPrimaryContact,
  addContact,
  updateContact,
  removeContact,
  setPrimaryContact as setCompanyPrimaryContact,
  addNoteToContact,
} from './contact-repository';

// Lead repository - explicit exports to avoid conflicts with job-repository
export {
  getAllLeads,
  getAllLeadsWithLinkedJobs,
  getLeadsByStatus,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  getLeadByEmail,
  getLeadByLinkedIn,
  updateCandidateStageInJob as updateLeadStageInJob,
  addJobSpecificNote,
  linkCandidateToJobForApplication,
  unlinkCandidateFromJobForApplication,
  getJobSpecificNotes,
  isCandidateLinkedToJob,
  getLinkedJobsForCandidate,
  updateLeadsToIdentification,
} from './lead-repository';

// Job repository - explicit exports (has updateCandidateStageInJob)
export {
  getAllJobs,
  getJobsByStatus,
  getOpenJobs,
  getJobById,
  getJobsForCompany,
  getJobsForCandidate,
  createJob,
  updateJob,
  linkCandidateToJob,
  unlinkCandidateFromJob,
  updateCandidateStageInJob,
  deleteJob,
  getCandidateCountByStage,
  getJobStats,
} from './job-repository';

// Pipeline repository - export what's actually available
export {
  getAllPipeline as getAllPipelines,
  getPipelineById,
  createPipelineItem as createPipeline,
  updatePipelineItem as updatePipeline,
  deletePipelineItem as deletePipeline,
} from './pipeline-repository';

// Event repository - export what's actually available
export {
  createEvent,
  getEventsForContact,
  getRecentEvents,
  updateEvent,
  deleteEvent,
} from './event-repository';

// Skills / talent graph repository
export {
  getSkillsGraph,
  saveSkillsGraph,
  rebuildSkillsGraph,
  getSkillsGraphFresh,
  isSkillsGraphStale,
} from './skills-graph-repository';
