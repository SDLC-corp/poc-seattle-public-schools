import { Router } from 'express';
import schoolsRoutes from './schools.js';
import buildingsRoutes from './buildings.js';
import floorsRoutes from './floors.js';
import integrationsRoutes from './integrations.js';
import settingsRoutes from './settings.js';
import usersRoutes from './users.js';
import rolesRoutes from './roles.js';
import auditRoutes from './audit.js';
import documentsRoutes from './documents.js';
import notificationsRoutes from './notifications.js';
import complianceRoutes from './compliance.js';
import airMonitoringRoutes from './airMonitoring.js';
import personnelRoutes from './personnel.js';

const router = Router();

router.use('/schools', schoolsRoutes);
router.use('/buildings', buildingsRoutes);
router.use('/floors', floorsRoutes);
router.use('/integrations', integrationsRoutes);
router.use('/settings', settingsRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);
router.use('/audit', auditRoutes);
router.use('/documents', documentsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/compliance', complianceRoutes);
router.use('/air-monitoring', airMonitoringRoutes);
router.use('/personnel', personnelRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
