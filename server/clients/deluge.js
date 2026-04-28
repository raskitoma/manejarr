/**
 * Deluge WebUI JSON-RPC Client
 *
 * Communicates with the Deluge WebUI via JSON-RPC at the /json endpoint.
 * Handles authentication, session cookies, and label plugin operations.
 */

let sessionCookie = null;
let requestId = 0;

/**
 * Create a configured Deluge client instance.
 */
export function createDelugeClient({ host, port, password }) {
  const baseUrl = `http://${host}:${port || 8112}`;

  /**
   * Send a JSON-RPC request to Deluge WebUI.
   */
  async function rpc(method, params = []) {
    requestId++;

    const headers = {
      'Content-Type': 'application/json',
    };

    if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }

    const response = await fetch(`${baseUrl}/json`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        method,
        params,
        id: requestId,
      }),
    });

    // Capture session cookie from response
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      sessionCookie = setCookie.split(';')[0];
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Deluge RPC error (${method}): ${data.error.message || JSON.stringify(data.error)}`);
    }

    return data.result;
  }

  /**
   * Authenticate with the Deluge WebUI.
   */
  async function connect() {
    sessionCookie = null;
    const result = await rpc('auth.login', [password]);
    if (!result) {
      throw new Error('Deluge authentication failed. Check password.');
    }

    // Ensure we're connected to a daemon
    const connected = await rpc('web.connected');
    if (!connected) {
      const hosts = await rpc('web.get_hosts');
      if (hosts && hosts.length > 0) {
        await rpc('web.connect', [hosts[0][0]]);
      } else {
        throw new Error('No Deluge daemon available to connect to.');
      }
    }

    // Check if Label plugin is enabled
    const plugins = await rpc('core.get_enabled_plugins');
    if (!plugins.includes('Label')) {
      console.warn('[DELUGE] Label plugin is not enabled. Labels will not work.');
    }

    return true;
  }

  /**
   * Test connectivity to Deluge.
   */
  async function testConnection() {
    await connect();
    return { connected: true, version: 'connected' };
  }

  /**
   * Get all torrents with a specific label.
   */
  async function getTorrentsByLabel(label) {
    const filterDict = label ? { label } : {};
    const fields = [
      'name', 'hash', 'label', 'ratio', 'seeding_time', 'time_added',
      'state', 'paused', 'total_size', 'progress', 'tracker_host',
      'download_payload_rate', 'upload_payload_rate', 'files'
    ];

    const result = await rpc('core.get_torrents_status', [filterDict, fields]);

    // Convert the hash-keyed object to an array
    const torrents = [];
    for (const [hash, data] of Object.entries(result || {})) {
      torrents.push({
        hash,
        name: data.name,
        label: data.label || '',
        ratio: data.ratio,
        seedingTime: data.seeding_time,
        timeAdded: data.time_added,
        state: data.state,
        paused: data.paused,
        totalSize: data.total_size,
        progress: data.progress,
        trackerHost: data.tracker_host,
        downloadSpeed: data.download_payload_rate,
        uploadSpeed: data.upload_payload_rate,
        files: data.files || [],
      });
    }

    return torrents;
  }

  /**
   * Get all torrents.
   */
  async function getAllTorrents() {
    return await getTorrentsByLabel(null);
  }

  /**
   * Get detailed status for a single torrent.
   */
  async function getTorrentDetails(hash) {
    const fields = [
      'name', 'hash', 'label', 'ratio', 'seeding_time', 'time_added',
      'state', 'paused', 'total_size', 'progress', 'tracker_host',
      'download_payload_rate', 'upload_payload_rate', 'files'
    ];

    const result = await rpc('core.get_torrent_status', [hash, fields]);
    if (!result) return null;

    return {
      hash,
      name: result.name,
      label: result.label || '',
      ratio: result.ratio,
      seedingTime: result.seeding_time,
      timeAdded: result.time_added,
      state: result.state,
      paused: result.paused,
      totalSize: result.total_size,
      progress: result.progress,
      trackerHost: result.tracker_host,
      downloadSpeed: result.download_payload_rate,
      uploadSpeed: result.upload_payload_rate,
      files: result.files || [],
    };
  }

  /**
   * Set the label for a torrent.
   */
  async function setTorrentLabel(hash, label) {
    await rpc('label.set_torrent', [hash, label]);
  }

  /**
   * Add a new label to Deluge.
   */
  async function addLabel(label) {
    try {
      await rpc('label.add', [label]);
    } catch (err) {
      // Ignore if label already exists
      if (!err.message.includes('already exists')) {
        throw err;
      }
    }
  }

  /**
   * Pause a torrent (stop seeding).
   */
  async function pauseTorrent(hash) {
    await rpc('core.pause_torrent', [[hash]]);
  }

  /**
   * Get all configured labels.
   */
  async function getLabels() {
    return await rpc('label.get_labels');
  }

  return {
    connect,
    testConnection,
    getTorrentsByLabel,
    getAllTorrents,
    getTorrentDetails,
    setTorrentLabel,
    addLabel,
    pauseTorrent,
    getLabels,
    rpc,
  };
}
