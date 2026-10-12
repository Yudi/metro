const ADMIN_ACCOUNT_FIELDS = `
  uid
  email
  displayName
  bootstrap
`;

const ADMIN_MEDIA_RESOURCE_FIELDS = `
  kind
  identity
  name
  scopes {
    id
    label
  }
`;

const ADMIN_IMAGE_FIELDS = `
  key
  stationIdentity
  position
  copyrightId
  stopIds
  isDefault
  title
  label
  sourceUrl
  author
  license
  licenseUrl
  lineIds
  service
`;

const ADMIN_IMAGE_LICENSE_FIELDS = `
  id
  license
  licenseUrl
`;

export const ADMIN_ACCOUNTS_QUERY = `
  query AdminAccounts {
    adminAccounts {
      ${ADMIN_ACCOUNT_FIELDS}
    }
  }
`;

export const GRANT_ADMIN_MUTATION = `
  mutation GrantAdmin($email: String!) {
    grantAdmin(email: $email) {
      ${ADMIN_ACCOUNT_FIELDS}
    }
  }
`;

export const REVOKE_ADMIN_MUTATION = `
  mutation RevokeAdmin($uid: String!) {
    revokeAdmin(uid: $uid)
  }
`;

export const ADMIN_MEDIA_RESOURCES_QUERY = `
  query AdminMediaResources($query: String!) {
    adminMediaResources(query: $query) {
      ${ADMIN_MEDIA_RESOURCE_FIELDS}
    }
  }
`;

export const ADMIN_IMAGES_QUERY = `
  query AdminImages($identity: String!) {
    adminImages(identity: $identity) {
      ${ADMIN_IMAGE_FIELDS}
    }
  }
`;

export const UPLOAD_ADMIN_IMAGE_MUTATION = `
  mutation UploadAdminImage($file: File!, $metadata: AdminImageInput!) {
    uploadAdminImage(file: $file, metadata: $metadata) {
      ${ADMIN_IMAGE_FIELDS}
    }
  }
`;

export const UPDATE_ADMIN_IMAGE_MUTATION = `
  mutation UpdateAdminImage($key: String!, $metadata: AdminImageInput!) {
    updateAdminImage(key: $key, metadata: $metadata) {
      ${ADMIN_IMAGE_FIELDS}
    }
  }
`;

export const DELETE_ADMIN_IMAGE_MUTATION = `
  mutation DeleteAdminImage($key: String!) {
    deleteAdminImage(key: $key)
  }
`;

export const ADMIN_IMAGE_LICENSES_QUERY = `
  query AdminImageLicenses {
    adminImageLicenses {
      ${ADMIN_IMAGE_LICENSE_FIELDS}
    }
  }
`;

export const CREATE_ADMIN_IMAGE_LICENSE_MUTATION = `
  mutation CreateAdminImageLicense($input: AdminImageLicenseInput!) {
    createAdminImageLicense(input: $input) {
      ${ADMIN_IMAGE_LICENSE_FIELDS}
    }
  }
`;

export const UPDATE_ADMIN_IMAGE_LICENSE_MUTATION = `
  mutation UpdateAdminImageLicense($id: String!, $input: AdminImageLicenseInput!) {
    updateAdminImageLicense(id: $id, input: $input) {
      ${ADMIN_IMAGE_LICENSE_FIELDS}
    }
  }
`;

export const DELETE_ADMIN_IMAGE_LICENSE_MUTATION = `
  mutation DeleteAdminImageLicense($id: String!) {
    deleteAdminImageLicense(id: $id)
  }
`;
