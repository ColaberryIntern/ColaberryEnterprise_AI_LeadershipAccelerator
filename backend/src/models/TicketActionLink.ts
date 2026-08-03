import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// ProofDesk Work Ledger (Milestone 1 - Foundation). Many-to-many bridge between
// tickets and work_ledger_events. work_ledger_events.ticket_id already covers the
// common one-event-one-ticket case; this table exists for the case where a single
// event legitimately touches more than one ticket (e.g. a dispatch that also affects
// subtasks created via ticketService.createSubTasks) - link_role distinguishes the
// event's primary ticket from incidentally-linked related tickets.

export type TicketActionLinkRole = 'primary' | 'related';

interface TicketActionLinkAttributes {
  id?: string;
  ticket_id: string;
  event_id: string;
  link_role?: TicketActionLinkRole;
  created_at?: Date;
}

class TicketActionLink extends Model<TicketActionLinkAttributes> implements TicketActionLinkAttributes {
  declare id: string;
  declare ticket_id: string;
  declare event_id: string;
  declare link_role: TicketActionLinkRole;
  declare created_at: Date;
}

TicketActionLink.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ticket_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tickets', key: 'id' },
    },
    event_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'work_ledger_events', key: 'event_id' },
    },
    link_role: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'primary',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'ticket_action_links',
    timestamps: false,
    indexes: [
      { fields: ['ticket_id', 'event_id'], unique: true },
      { fields: ['ticket_id'] },
      { fields: ['event_id'] },
    ],
  }
);

export default TicketActionLink;
