/**
 * Repository Index
 * 
 * Server-side data access layer exports.
 * All data access MUST go through these repositories.
 * 
 * @serverOnly
 */

// Tenant repository - explicit exports to avoid duplicate verifyUserTenant
export {
  getTenantById,
  getTenantBySubdomain,
  getAllTenants,
  createTenant,
  updateTenant,
  deleteTenant,
  verifyUserTenant,
} from './tenant-repository';

// Profile repository - explicit exports to avoid duplicate verifyUserTenant
export {
  getProfileById,
  getProfileByEmail,
  getProfilesByTenant,
  createProfile,
  updateProfile,
  deleteProfile,
} from './profile-repository';

// Client repository - re-export all
export * from './client-repository';

// Lead repository - re-export all
export * from './lead-repository';

// Pipeline repository - re-export all
export * from './pipeline-repository';
