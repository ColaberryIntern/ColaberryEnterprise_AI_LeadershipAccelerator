jest.mock('../../../config/database', () => {
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize('postgres://mock:mock@localhost:5432/mock', {
    dialect: 'postgres',
    logging: false,
  });
  return { sequelize, connectDatabase: jest.fn() };
});

jest.mock('../../../config/env', () => ({
  env: {
    databaseUrl: 'postgres://mock:mock@localhost:5432/mock',
    nodeEnv: 'test',
    jwtSecret: 'test-secret',
    port: 3000,
  },
}));

import * as Models from '../../../models';
import { computeRelatedWorkClusters } from '../../../services/outcomes/relatedWorkClusteringService';

const { Ticket, TicketActionLink, WorkLedgerEvent } = Models as any;

describe('computeRelatedWorkClusters', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('happy path: 3 open tickets, 2 sharing (entity_type, entity_id), produce one entity cluster with exactly those 2 (3rd excluded)', async () => {
    jest.spyOn(Ticket, 'findAll').mockResolvedValue([
      { id: 'ticket-1', entity_type: 'curriculum_card', entity_id: 'card-42' },
      { id: 'ticket-2', entity_type: 'curriculum_card', entity_id: 'card-42' },
      { id: 'ticket-3', entity_type: 'campaign', entity_id: 'camp-1' },
    ] as any);
    jest.spyOn(TicketActionLink, 'findAll').mockResolvedValue([] as any);

    const result = await computeRelatedWorkClusters();

    expect(result.entity_clusters).toHaveLength(1);
    expect(result.entity_clusters[0]).toMatchObject({
      entity_type: 'curriculum_card',
      entity_id: 'card-42',
    });
    expect(result.entity_clusters[0].ticket_ids.sort()).toEqual(['ticket-1', 'ticket-2']);
    expect(result.resource_clusters).toEqual([]);
  });

  test('happy path: 2 open tickets whose linked work_ledger_events share a target_id produce one resource cluster', async () => {
    jest.spyOn(Ticket, 'findAll').mockResolvedValue([
      { id: 'ticket-a', entity_type: null, entity_id: null },
      { id: 'ticket-b', entity_type: null, entity_id: null },
    ] as any);
    jest.spyOn(TicketActionLink, 'findAll').mockResolvedValue([
      { ticket_id: 'ticket-a', event_id: 'evt-1' },
      { ticket_id: 'ticket-b', event_id: 'evt-2' },
    ] as any);
    jest.spyOn(WorkLedgerEvent, 'findAll').mockResolvedValue([
      { event_id: 'evt-1', target_id: 'backend/src/services/ticketService.ts' },
      { event_id: 'evt-2', target_id: 'backend/src/services/ticketService.ts' },
    ] as any);

    const result = await computeRelatedWorkClusters();

    expect(result.entity_clusters).toEqual([]);
    expect(result.resource_clusters).toHaveLength(1);
    expect(result.resource_clusters[0].target_id).toBe('backend/src/services/ticketService.ts');
    expect(result.resource_clusters[0].ticket_ids.sort()).toEqual(['ticket-a', 'ticket-b']);
  });

  test('boundary: no open tickets share anything -> both arrays empty, no crash', async () => {
    jest.spyOn(Ticket, 'findAll').mockResolvedValue([
      { id: 'ticket-x', entity_type: 'curriculum_card', entity_id: 'card-1' },
      { id: 'ticket-y', entity_type: 'curriculum_card', entity_id: 'card-2' }, // different entity_id
    ] as any);
    jest.spyOn(TicketActionLink, 'findAll').mockResolvedValue([
      { ticket_id: 'ticket-x', event_id: 'evt-x' },
      { ticket_id: 'ticket-y', event_id: 'evt-y' },
    ] as any);
    jest.spyOn(WorkLedgerEvent, 'findAll').mockResolvedValue([
      { event_id: 'evt-x', target_id: 'fileA.ts' },
      { event_id: 'evt-y', target_id: 'fileB.ts' }, // different target
    ] as any);

    const result = await computeRelatedWorkClusters();

    expect(result.entity_clusters).toEqual([]);
    expect(result.resource_clusters).toEqual([]);
  });

  test('boundary: zero open tickets -> both arrays empty, no crash, and no downstream queries fired', async () => {
    jest.spyOn(Ticket, 'findAll').mockResolvedValue([] as any);
    const linkSpy = jest.spyOn(TicketActionLink, 'findAll').mockResolvedValue([] as any);

    const result = await computeRelatedWorkClusters();

    expect(result).toEqual({ entity_clusters: [], resource_clusters: [] });
    expect(linkSpy).not.toHaveBeenCalled();
  });
});
