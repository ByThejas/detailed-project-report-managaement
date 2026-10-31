export interface CurrentUser {
  id: string;
  displayName: string;
  role: 'ADMIN' | 'CONSULTANT' | 'REVIEWER';
  organisation: string;
}

/** Placeholder session until authentication is added. */
const sampleUser: CurrentUser = {
  id: '803e19b1-0000-0000-0000-000000000000',
  displayName: 'Admin User',
  role: 'ADMIN',
  organisation: 'KPTCL',
};

export function useCurrentUser(): CurrentUser {
  return sampleUser;
}
