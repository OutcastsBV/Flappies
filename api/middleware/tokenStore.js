// services/tokenStore.js
const refreshTokens = new Map(); // key: auth sub

module.exports = {
  set(sub, refreshToken) {
    refreshTokens.set(sub, refreshToken);
  },
  get(sub) {
    return refreshTokens.get(sub);
  },
  delete(sub) {
    refreshTokens.delete(sub);
  },
};
