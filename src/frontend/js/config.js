/* Where the API lives. By default the same origin as the page: `npm start` (dev-server.js) proxies /api to
 * the Flask backend, which also makes HTTPS tunnels and phones work with a single address.
 * Override with ?api=http://host:port to talk to a backend directly (it must allow CORS). */
(function (global) {
  const fromQuery = new URLSearchParams(location.search).get('api');
  global.TTL_CONFIG = { apiBase: (fromQuery || '').replace(/\/$/, '') };
})(window);
