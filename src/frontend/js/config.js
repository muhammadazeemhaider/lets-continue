/* Where the API lives. Defaults to port 5000 on whatever host served this page, so it also
 * works from a phone via your computer's LAN IP. Override with ?api=http://host:port */
(function (global) {
  const fromQuery = new URLSearchParams(location.search).get('api');
  const apiBase = (fromQuery || `${location.protocol}//${location.hostname || 'localhost'}:5000`).replace(/\/$/, '');
  global.TTL_CONFIG = { apiBase };
})(window);
