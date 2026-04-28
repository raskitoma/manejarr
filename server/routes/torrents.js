import { Router } from 'express';
import { updateTorrentMetadata } from '../db/database.js';

export const torrentsRouter = Router();

torrentsRouter.post('/:hash/match', async (req, res) => {
  try {
    const { hash } = req.params;
    const { manager, id } = req.body;
    
    if (!hash || !manager || !id) {
      return res.status(400).json({ error: 'Missing hash, manager, or id' });
    }
    
    if (manager !== 'radarr' && manager !== 'sonarr') {
      return res.status(400).json({ error: 'Invalid manager. Must be radarr or sonarr' });
    }
    
    updateTorrentMetadata(hash, {
      manager,
      title: `Manual Match (${manager} ID: ${id})`,
      metadata: {
        manualMatchId: parseInt(id, 10),
      }
    });
    
    res.json({ success: true, message: 'Torrent manually linked successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
