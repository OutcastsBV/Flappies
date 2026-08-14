function getRoles(auth) {
  if (!auth) return [];

  const zitadelRoles = auth["urn:zitadel:iam:org:project:roles"];
  if (zitadelRoles && typeof zitadelRoles === "object") {
    return Object.keys(zitadelRoles);
  }

  const keycloakRoles = auth.resource_access?.flappies?.roles;
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

/** JWT project roles, or the app DB role on req.user after requireUser. */
function requestHasRole(req, role) {
  return hasRole(req?.auth, role) || req?.user?.role === role;
}

function requestHasAnyRole(req, roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return allowed.some((role) => requestHasRole(req, role));
}

module.exports = { getRoles, hasRole, requestHasRole, requestHasAnyRole };
