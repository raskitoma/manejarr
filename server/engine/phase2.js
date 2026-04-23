/**
 * Phase 2: Retention & Cleanup
 *
 * 1. Fetch all torrents labeled 'ignore' from Deluge
 * 2. Evaluate each against retention rules:
 *    - Has reached minimum seeding time, OR
 *    - Has reached minimum ratio
 * 3. If criteria met:
 *    - Relabel to 'fordeletion'
 *    - Pause the torrent (stop seeding)
 */

/**
 * Execute Phase 2.
 *
 * @param {Object} clients - { deluge }
 * @param {Object} settings - { minSeedingTime (seconds), minRatio (float) }
 * @param {Object} options - { dryRun: boolean }
 * @param {Function} log - Logging callback: (level, category, message, metadata)
 * @returns {Object} - Summary of actions taken
 */
export async function executePhase2(clients, settings, options = {}, log) {
  const { deluge } = clients;
  const { dryRun = false } = options;
  const { minSeedingTime = 259200, minRatio = 1.1 } = settings;

  const summary = {
    processed: 0,
    transitioned: 0,
    retained: 0,
    errors: 0,
    details: [],
  };

  log('info', 'engine', 'Phase 2: Starting Retention & Cleanup');
  log('info', 'engine', `Retention rules: minSeedingTime=${minSeedingTime}s (${(minSeedingTime / 86400).toFixed(1)} days), minRatio=${minRatio}`);

  // 1. Fetch all torrents labeled 'ignore'
  let torrents;
  try {
    await deluge.connect();
    torrents = await deluge.getTorrentsByLabel('ignore');
    log('info', 'deluge', `Found ${torrents.length} torrent(s) labeled 'ignore'`);
  } catch (err) {
    log('error', 'deluge', `Failed to fetch ignore torrents: ${err.message}`);
    summary.errors++;
    return summary;
  }

  if (torrents.length === 0) {
    log('info', 'engine', 'No torrents labeled ignore. Phase 2 complete.');
    return summary;
  }

  // 2. Evaluate each torrent
  for (const torrent of torrents) {
    summary.processed++;

    try {
      const seedingTimeMet = torrent.seedingTime >= minSeedingTime;
      const ratioMet = torrent.ratio >= minRatio;
      const shouldTransition = seedingTimeMet || ratioMet;

      const reason = [];
      if (seedingTimeMet) reason.push(`seeding_time=${torrent.seedingTime}s >= ${minSeedingTime}s`);
      if (ratioMet) reason.push(`ratio=${torrent.ratio.toFixed(2)} >= ${minRatio}`);

      if (shouldTransition) {
        // 3. Relabel to 'fordeletion'
        if (!dryRun) {
          await deluge.setTorrentLabel(torrent.hash, 'fordeletion');
        }

        // 4. Pause the torrent
        if (!dryRun) {
          await deluge.pauseTorrent(torrent.hash);
        }

        summary.transitioned++;
        log('info', 'deluge',
          `${dryRun ? '[DRY RUN] Would transition' : 'Transitioned'} "${torrent.name}" → fordeletion & paused (${reason.join(', ')})`
        );

        summary.details.push({
          hash: torrent.hash,
          name: torrent.name,
          action: dryRun ? 'would_transition' : 'transitioned',
          seedingTime: torrent.seedingTime,
          ratio: torrent.ratio,
          reason: reason.join(', '),
        });
      } else {
        // Still within retention period
        summary.retained++;
        log('info', 'engine',
          `"${torrent.name}" retained: seeding_time=${torrent.seedingTime}s, ratio=${torrent.ratio.toFixed(2)}`
        );

        summary.details.push({
          hash: torrent.hash,
          name: torrent.name,
          action: 'retained',
          seedingTime: torrent.seedingTime,
          ratio: torrent.ratio,
          reason: 'Criteria not met',
        });
      }
    } catch (err) {
      summary.errors++;
      log('error', 'engine', `Error processing torrent "${torrent.name}": ${err.message}`, {
        hash: torrent.hash,
        error: err.stack,
      });
      summary.details.push({
        hash: torrent.hash,
        name: torrent.name,
        action: 'error',
        reason: err.message,
      });
    }
  }

  log('info', 'engine',
    `Phase 2 complete: ${summary.transitioned} transitioned, ${summary.retained} retained, ${summary.errors} errors`
  );
  return summary;
}
