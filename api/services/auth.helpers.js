function getRoles(auth) {
  if (!auth) return [];

  const zitadelRoles = auth["urn:zitadel:iam:org:project:roles"];
  if (zitadelRoles && typeof zitadelRoles === "object") {
    return Object.keys(zitadelRoles);
  }

  const keycloakRoles = auth.resource_access?.kassasysteem?.roles;
  if (Array.isArray(keycloakRoles)) {
    return keycloakRoles;
  }

  if (Array.isArray(auth.groups)) {
    return auth.groups;
  }

  return [];
}

function hasRole(auth, role) {
  return getRoles(auth).includes(role);
}

module.exports = { getRoles, hasRole };
